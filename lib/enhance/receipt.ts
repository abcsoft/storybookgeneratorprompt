import crypto from "node:crypto";
import type { EnhancementReceiptPayload, ProviderClass, SignedEnhancementReceipt } from "./types";
import { calculateSha256 } from "./provenance";

const DEFAULT_SIGNING_SECRET =
  process.env.ENHANCEMENT_SIGNING_SECRET || "storybook-server-enhancement-secret-default";

/**
 * Creates a deterministic canonical representation of the receipt payload for signing.
 */
export function canonicalizeReceiptPayload(payload: EnhancementReceiptPayload): string {
  return JSON.stringify({
    receiptId: payload.receiptId,
    slotId: payload.slotId,
    profileId: payload.profileId,
    layoutMode: payload.layoutMode,
    originalSha256: payload.originalSha256,
    originalWidth: payload.originalPixelDimensions.width,
    originalHeight: payload.originalPixelDimensions.height,
    enhancedSha256: payload.enhancedSha256,
    enhancedWidth: payload.enhancedPixelDimensions.width,
    enhancedHeight: payload.enhancedPixelDimensions.height,
    trustedProviderId: payload.trustedProviderId,
    providerClass: payload.providerClass,
    nativeEffectivePpi: payload.nativeEffectivePpi,
    enhancedEffectivePpi: payload.enhancedEffectivePpi,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
  });
}

/**
 * Computes an HMAC-SHA256 signature for a receipt payload using the server-only secret.
 */
export function computeReceiptSignature(
  payload: EnhancementReceiptPayload,
  secret: string = DEFAULT_SIGNING_SECRET,
): string {
  const canonical = canonicalizeReceiptPayload(payload);
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Issues a server-signed enhancement receipt.
 */
export function signEnhancementReceipt(
  payload: EnhancementReceiptPayload,
  secret: string = DEFAULT_SIGNING_SECRET,
): SignedEnhancementReceipt {
  const signature = computeReceiptSignature(payload, secret);
  return { payload, signature };
}

export interface VerifyReceiptOptions {
  expectedSlotId?: string;
  expectedProfileId?: string;
  expectedLayoutMode?: string;
  expectedEnhancedBuffer?: Buffer;
  expectedEnhancedSha256?: string;
  expectedDimensions?: { width: number; height: number };
  requiredProviderClass?: ProviderClass;
  secret?: string;
  now?: Date;
}

export interface ReceiptVerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a signed enhancement receipt against cryptographic signature, expiration,
 * file hash, slot, profile, and layout mode.
 */
export function verifyEnhancementReceipt(
  receipt: SignedEnhancementReceipt | null | undefined,
  options: VerifyReceiptOptions = {},
): ReceiptVerificationResult {
  if (!receipt || !receipt.payload || !receipt.signature) {
    return { valid: false, error: "Missing or malformed enhancement receipt." };
  }

  const { payload, signature } = receipt;
  const secret = options.secret || DEFAULT_SIGNING_SECRET;

  // 1. Verify cryptographic HMAC signature
  const expectedSig = computeReceiptSignature(payload, secret);
  if (signature !== expectedSig) {
    return { valid: false, error: "Forged or altered enhancement receipt: signature mismatch." };
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

  // 4. Verify profile binding
  if (options.expectedProfileId && payload.profileId !== options.expectedProfileId) {
    return {
      valid: false,
      error: `Receipt profile mismatch: issued for "${payload.profileId}", but presented for "${options.expectedProfileId}".`,
    };
  }

  // 5. Verify layout mode binding
  if (options.expectedLayoutMode && payload.layoutMode !== options.expectedLayoutMode) {
    return {
      valid: false,
      error: `Receipt layout mismatch: issued for "${payload.layoutMode}", but presented for "${options.expectedLayoutMode}".`,
    };
  }

  // 6. Verify enhanced file content hash matches receipt
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

  // 7. Verify enhanced dimensions match
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

  // 8. Verify provider class if required (e.g. real-ai)
  if (options.requiredProviderClass && payload.providerClass !== options.requiredProviderClass) {
    return {
      valid: false,
      error: `Provider class mismatch: required "${options.requiredProviderClass}", but receipt was generated by "${payload.providerClass}".`,
    };
  }

  return { valid: true };
}
