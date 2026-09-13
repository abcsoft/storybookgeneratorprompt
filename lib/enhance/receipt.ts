import crypto from "node:crypto";
import type { EnhancementReceiptPayload, ProviderClass, SignedEnhancementReceipt } from "./types";
import { calculateSha256 } from "./provenance";

const TEST_SIGNING_SECRET = "storybook-test-signing-secret-entropy-32-chars-long";

/**
 * Returns the enhancement signing secret.
 * In production, fails closed if ENHANCEMENT_SIGNING_SECRET is missing or less than 32 chars.
 * In test mode, falls back to an explicit test secret.
 */
export function getSigningSecret(): string {
  const envSecret = process.env.ENHANCEMENT_SIGNING_SECRET;
  if (envSecret) {
    if (
      (envSecret.length < 32 ||
        envSecret === "storybook-server-enhancement-secret-default" ||
        envSecret.includes("storybook-server-enhancement-secret-default")) &&
      process.env.NODE_ENV !== "test"
    ) {
      throw new Error(
        "ENHANCEMENT_SIGNING_SECRET is missing or insecure. Public default or weak secrets are strictly prohibited in production.",
      );
    }
    return envSecret;
  }
  if (process.env.NODE_ENV === "test") {
    return TEST_SIGNING_SECRET;
  }
  throw new Error(
    "Missing ENHANCEMENT_SIGNING_SECRET in production. Production enhancement signing must fail closed.",
  );
}

/**
 * Creates a deterministic canonical representation of the receipt payload for signing.
 */
export function canonicalizeReceiptPayload(payload: EnhancementReceiptPayload): string {
  return JSON.stringify({
    receiptId: payload.receiptId,
    slotId: payload.slotId,
    bookId: payload.bookId || "",
    profileId: payload.profileId,
    layoutMode: payload.layoutMode,
    originalSha256: payload.originalSha256,
    originalWidth: payload.originalPixelDimensions.width,
    originalHeight: payload.originalPixelDimensions.height,
    enhancedSha256: payload.enhancedSha256,
    enhancedWidth: payload.enhancedPixelDimensions.width,
    enhancedHeight: payload.enhancedPixelDimensions.height,
    destinationWidth: payload.destinationDimensions?.width ?? payload.enhancedPixelDimensions.width,
    destinationHeight: payload.destinationDimensions?.height ?? payload.enhancedPixelDimensions.height,
    trustedProviderId: payload.trustedProviderId,
    providerClass: payload.providerClass,
    nativeEffectivePpi: payload.nativeEffectivePpi,
    enhancedEffectivePpi: payload.enhancedEffectivePpi,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
  });
}

/**
 * Computes an HMAC-SHA256 signature for a receipt payload using constant-time comparison.
 */
export function computeReceiptSignature(
  payload: EnhancementReceiptPayload,
  secret?: string,
): string {
  const sec = secret || getSigningSecret();
  const canonical = canonicalizeReceiptPayload(payload);
  return crypto.createHmac("sha256", sec).update(canonical).digest("hex");
}

/**
 * Issues a server-signed enhancement receipt.
 */
export function signEnhancementReceipt(
  payload: EnhancementReceiptPayload,
  secret?: string,
): SignedEnhancementReceipt {
  const signature = computeReceiptSignature(payload, secret);
  return { payload, signature };
}

export interface VerifyReceiptOptions {
  expectedSlotId?: string;
  expectedBookId?: string;
  expectedProfileId?: string;
  expectedLayoutMode?: string;
  expectedEnhancedBuffer?: Buffer;
  expectedEnhancedSha256?: string;
  expectedDimensions?: { width: number; height: number };
  expectedDestinationDimensions?: { width: number; height: number };
  requiredProviderClass?: ProviderClass;
  requireProductionTrusted?: boolean;
  secret?: string;
  now?: Date;
}

export interface ReceiptVerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a signed enhancement receipt against cryptographic signature, expiration,
 * file hash, slot, profile, layout mode, and dimensions using constant-time comparison.
 */
export function verifyEnhancementReceipt(
  receipt: SignedEnhancementReceipt | null | undefined,
  options: VerifyReceiptOptions = {},
): ReceiptVerificationResult {
  if (!receipt || !receipt.payload || !receipt.signature) {
    return { valid: false, error: "Missing or malformed enhancement receipt." };
  }

  const { payload, signature } = receipt;
  let secret: string;
  try {
    secret = options.secret || getSigningSecret();
  } catch (err: any) {
    return { valid: false, error: `Receipt verification secret error: ${err.message}` };
  }

  // 1. Verify cryptographic HMAC signature using constant-time timingSafeEqual
  const expectedSig = computeReceiptSignature(payload, secret);
  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (
      sigBuf.length !== expectedBuf.length ||
      sigBuf.length === 0 ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return { valid: false, error: "Forged or altered enhancement receipt: signature mismatch." };
    }
  } catch {
    return { valid: false, error: "Malformed signature format." };
  }

  // 2. Check expiration (default 24h lifespan)
  const nowTime = (options.now ?? new Date()).getTime();
  const expiresAtTime = new Date(payload.expiresAt).getTime();
  if (isNaN(expiresAtTime) || nowTime > expiresAtTime) {
    return { valid: false, error: "Enhancement receipt has expired." };
  }

  // 3. Verify slot binding (receipt cannot be reused across slots)
  if (options.expectedSlotId && payload.slotId !== options.expectedSlotId) {
    return {
      valid: false,
      error: `Receipt slot mismatch: issued for "${payload.slotId}", but presented for "${options.expectedSlotId}".`,
    };
  }

  // 4. Verify book ID binding
  if (options.expectedBookId && payload.bookId && payload.bookId !== options.expectedBookId) {
    return {
      valid: false,
      error: `Receipt book mismatch: issued for "${payload.bookId}", but presented for "${options.expectedBookId}".`,
    };
  }

  // 5. Verify profile binding
  if (options.expectedProfileId && payload.profileId !== options.expectedProfileId) {
    return {
      valid: false,
      error: `Receipt profile mismatch: issued for "${payload.profileId}", but presented for "${options.expectedProfileId}".`,
    };
  }

  // 6. Verify layout mode binding
  if (options.expectedLayoutMode && payload.layoutMode !== options.expectedLayoutMode) {
    return {
      valid: false,
      error: `Receipt layout mismatch: issued for "${payload.layoutMode}", but presented for "${options.expectedLayoutMode}".`,
    };
  }

  // 7. Verify enhanced file content hash matches receipt
  if (options.expectedEnhancedBuffer) {
    const actualSha = calculateSha256(options.expectedEnhancedBuffer);
    if (actualSha !== payload.enhancedSha256) {
      return {
        valid: false,
        error: `Enhanced artwork bytes have been altered: buffer SHA-256 (${actualSha}) does not match receipt (${payload.enhancedSha256}).`,
      };
    }
  } else if (options.expectedEnhancedSha256) {
    if (options.expectedEnhancedSha256 !== payload.enhancedSha256) {
      return {
        valid: false,
        error: `Enhanced SHA-256 mismatch: presented "${options.expectedEnhancedSha256}", expected "${payload.enhancedSha256}".`,
      };
    }
  }

  // 8. Verify enhanced dimensions match
  if (options.expectedDimensions) {
    if (
      payload.enhancedPixelDimensions.width !== options.expectedDimensions.width ||
      payload.enhancedPixelDimensions.height !== options.expectedDimensions.height
    ) {
      return {
        valid: false,
        error: `Enhanced dimensions mismatch: receipt has ${payload.enhancedPixelDimensions.width}×${payload.enhancedPixelDimensions.height}, expected ${options.expectedDimensions.width}×${options.expectedDimensions.height}.`,
      };
    }
  }

  // 9. Verify destination dimensions match
  if (options.expectedDestinationDimensions && payload.destinationDimensions) {
    if (
      payload.destinationDimensions.width !== options.expectedDestinationDimensions.width ||
      payload.destinationDimensions.height !== options.expectedDestinationDimensions.height
    ) {
      return {
        valid: false,
        error: `Destination dimensions mismatch: receipt destination is ${payload.destinationDimensions.width}×${payload.destinationDimensions.height}, expected ${options.expectedDestinationDimensions.width}×${options.expectedDestinationDimensions.height}.`,
      };
    }
  }

  // 10. Verify provider class if required (e.g. real-ai or local-ai)
  if (options.requiredProviderClass && payload.providerClass !== options.requiredProviderClass) {
    return {
      valid: false,
      error: `Provider class mismatch: required "${options.requiredProviderClass}", but receipt was generated by "${payload.providerClass}".`,
    };
  }

  // 11. Enforce trusted provider class for production (reject test-mock and resampling)
  if (options.requireProductionTrusted) {
    if (payload.providerClass !== "local-ai" && payload.providerClass !== "real-ai") {
      return {
        valid: false,
        error: `Provider class "${payload.providerClass}" is not trusted for production. Only local-ai and real-ai receipts can qualify for production export.`,
      };
    }
  }

  return { valid: true };
}
