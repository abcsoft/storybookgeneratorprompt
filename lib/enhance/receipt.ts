import crypto from "node:crypto";
import type {
  EnhancementReceiptPayload,
  ProviderClass,
  SignedEnhancementReceipt,
  EnhancementApprovalPayload,
  SignedEnhancementApprovalRecord,
} from "./types";
import { calculateSha256 } from "./provenance";
import { ENHANCEMENT_PROVIDER_IDS } from "./constants";

export const CANONICAL_REGISTERED_PROVIDERS: Record<string, ProviderClass> = {
  [ENHANCEMENT_PROVIDER_IDS.LOCAL_REALESRGAN]: "local-ai",
  [ENHANCEMENT_PROVIDER_IDS.EXTERNAL_AI]: "real-ai",
  [ENHANCEMENT_PROVIDER_IDS.MOCK_AI]: "test-mock",
  [ENHANCEMENT_PROVIDER_IDS.RESAMPLED]: "resampling",
};

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
    receiptVersion: payload.receiptVersion ?? "1.0",
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
    enhancementMethod: payload.enhancementMethod ?? payload.trustedProviderId,
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
  const normalizedPayload: EnhancementReceiptPayload = {
    ...payload,
    receiptVersion: payload.receiptVersion ?? "1.0",
    enhancementMethod: payload.enhancementMethod ?? payload.trustedProviderId,
    destinationDimensions: payload.destinationDimensions ?? payload.enhancedPixelDimensions,
  };
  const signature = computeReceiptSignature(normalizedPayload, secret);
  return { payload: normalizedPayload, signature };
}

export interface VerifyReceiptOptions {
  expectedReceiptVersion?: string;
  expectedProviderId?: string;
  expectedProviderClass?: ProviderClass;
  expectedBookId?: string;
  expectedSlotId?: string;
  expectedProfileId?: string;
  expectedLayoutMode?: string;
  expectedOriginalSha256?: string;
  expectedEnhancedSha256?: string;
  expectedEnhancedBuffer?: Buffer;
  expectedOriginalDimensions?: { width: number; height: number };
  expectedEnhancedDimensions?: { width: number; height: number };
  expectedDimensions?: { width: number; height: number };
  expectedDestinationDimensions?: { width: number; height: number };
  expectedEnhancementMethod?: string;
  expectedIssuedTimestamp?: string;
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
 * and all 14 mandatory bindings. Fails closed on any absent or mismatched binding.
 */
export function verifyEnhancementReceipt(
  receipt: SignedEnhancementReceipt | null | undefined,
  options: VerifyReceiptOptions = {},
): ReceiptVerificationResult {
  if (!receipt || !receipt.payload || !receipt.signature) {
    return { valid: false, error: "Missing or malformed enhancement receipt." };
  }

  const { payload, signature } = receipt;

  // Verify presence of all required fields in the payload (fail closed if absent)
  if (!payload.receiptVersion) {
    return { valid: false, error: "Receipt is missing required field: receiptVersion." };
  }
  if (!payload.trustedProviderId) {
    return { valid: false, error: "Receipt is missing required field: trustedProviderId." };
  }
  if (!payload.providerClass) {
    return { valid: false, error: "Receipt is missing required field: providerClass." };
  }
  if (!payload.slotId) {
    return { valid: false, error: "Receipt is missing required field: slotId." };
  }
  if (!payload.profileId) {
    return { valid: false, error: "Receipt is missing required field: profileId." };
  }
  if (!payload.layoutMode) {
    return { valid: false, error: "Receipt is missing required field: layoutMode." };
  }
  if (!payload.originalSha256) {
    return { valid: false, error: "Receipt is missing required field: originalSha256." };
  }
  if (!payload.enhancedSha256) {
    return { valid: false, error: "Receipt is missing required field: enhancedSha256." };
  }
  if (
    !payload.originalPixelDimensions ||
    typeof payload.originalPixelDimensions.width !== "number" ||
    typeof payload.originalPixelDimensions.height !== "number"
  ) {
    return { valid: false, error: "Receipt is missing required field: originalPixelDimensions." };
  }
  if (
    !payload.enhancedPixelDimensions ||
    typeof payload.enhancedPixelDimensions.width !== "number" ||
    typeof payload.enhancedPixelDimensions.height !== "number"
  ) {
    return { valid: false, error: "Receipt is missing required field: enhancedPixelDimensions." };
  }
  if (
    !payload.destinationDimensions ||
    typeof payload.destinationDimensions.width !== "number" ||
    typeof payload.destinationDimensions.height !== "number"
  ) {
    return { valid: false, error: "Receipt is missing required field: destinationDimensions." };
  }
  if (!payload.enhancementMethod) {
    return { valid: false, error: "Receipt is missing required field: enhancementMethod." };
  }
  if (!payload.createdAt) {
    return { valid: false, error: "Receipt is missing required field: createdAt." };
  }

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

  // 3. Receipt version binding
  if (options.expectedReceiptVersion && payload.receiptVersion !== options.expectedReceiptVersion) {
    return {
      valid: false,
      error: `Receipt version mismatch: issued for "${payload.receiptVersion}", expected "${options.expectedReceiptVersion}".`,
    };
  }

  // 4. Provider ID binding & canonical registration check
  const registeredClass = CANONICAL_REGISTERED_PROVIDERS[payload.trustedProviderId];
  if (!registeredClass || registeredClass !== payload.providerClass) {
    return {
      valid: false,
      error: `Unregistered or spoofed provider ID "${payload.trustedProviderId}" claiming provider class "${payload.providerClass}". Only canonical registered providers may receive trusted status.`,
    };
  }

  if (options.expectedProviderId && payload.trustedProviderId !== options.expectedProviderId) {
    return {
      valid: false,
      error: `Receipt provider ID mismatch: issued for "${payload.trustedProviderId}", expected "${options.expectedProviderId}".`,
    };
  }

  // 5. Registered provider class binding
  if (options.expectedProviderClass && payload.providerClass !== options.expectedProviderClass) {
    return {
      valid: false,
      error: `Receipt provider class mismatch: issued for "${payload.providerClass}", expected "${options.expectedProviderClass}".`,
    };
  }
  if (options.requiredProviderClass && payload.providerClass !== options.requiredProviderClass) {
    return {
      valid: false,
      error: `Provider class mismatch: required "${options.requiredProviderClass}", but receipt was generated by "${payload.providerClass}".`,
    };
  }

  // 6. Book ID binding
  if (options.expectedBookId !== undefined) {
    if (!payload.bookId || payload.bookId !== options.expectedBookId) {
      return {
        valid: false,
        error: `Receipt book mismatch: issued for "${payload.bookId || "(empty)"}", expected "${options.expectedBookId}".`,
      };
    }
  }

  // 7. Slot ID binding
  if (options.expectedSlotId && payload.slotId !== options.expectedSlotId) {
    return {
      valid: false,
      error: `Receipt slot mismatch: issued for "${payload.slotId}", but presented for "${options.expectedSlotId}".`,
    };
  }

  // 8. Profile ID binding
  if (options.expectedProfileId && payload.profileId !== options.expectedProfileId) {
    return {
      valid: false,
      error: `Receipt profile mismatch: issued for "${payload.profileId}", but presented for "${options.expectedProfileId}".`,
    };
  }

  // 9. Layout mode binding
  if (options.expectedLayoutMode && payload.layoutMode !== options.expectedLayoutMode) {
    return {
      valid: false,
      error: `Receipt layout mismatch: issued for "${payload.layoutMode}", but presented for "${options.expectedLayoutMode}".`,
    };
  }

  // 10. Source SHA-256 binding
  if (options.expectedOriginalSha256 && payload.originalSha256 !== options.expectedOriginalSha256) {
    return {
      valid: false,
      error: `Source SHA-256 mismatch: presented "${options.expectedOriginalSha256}", expected "${payload.originalSha256}".`,
    };
  }

  // 11. Enhanced SHA-256 binding
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

  // 12. Original dimensions binding
  if (options.expectedOriginalDimensions) {
    if (
      payload.originalPixelDimensions.width !== options.expectedOriginalDimensions.width ||
      payload.originalPixelDimensions.height !== options.expectedOriginalDimensions.height
    ) {
      return {
        valid: false,
        error: `Original dimensions mismatch: receipt has ${payload.originalPixelDimensions.width}×${payload.originalPixelDimensions.height}, expected ${options.expectedOriginalDimensions.width}×${options.expectedOriginalDimensions.height}.`,
      };
    }
  }

  // 13. Enhanced dimensions binding
  const expEnhanced = options.expectedEnhancedDimensions || options.expectedDimensions;
  if (expEnhanced) {
    if (
      payload.enhancedPixelDimensions.width !== expEnhanced.width ||
      payload.enhancedPixelDimensions.height !== expEnhanced.height
    ) {
      return {
        valid: false,
        error: `Enhanced dimensions mismatch: receipt has ${payload.enhancedPixelDimensions.width}×${payload.enhancedPixelDimensions.height}, expected ${expEnhanced.width}×${expEnhanced.height}.`,
      };
    }
  }

  // 14. Destination dimensions binding
  if (options.expectedDestinationDimensions) {
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

  // 15. Enhancement method binding
  if (options.expectedEnhancementMethod && payload.enhancementMethod !== options.expectedEnhancementMethod) {
    return {
      valid: false,
      error: `Enhancement method mismatch: receipt has "${payload.enhancementMethod}", expected "${options.expectedEnhancementMethod}".`,
    };
  }

  // 16. Issued timestamp binding
  if (options.expectedIssuedTimestamp && payload.createdAt !== options.expectedIssuedTimestamp) {
    return {
      valid: false,
      error: `Issued timestamp mismatch: receipt was created at "${payload.createdAt}", expected "${options.expectedIssuedTimestamp}".`,
    };
  }

  // 17. Enforce trusted provider class for production (reject test-mock and resampling)
  if (options.requireProductionTrusted) {
    if (payload.providerClass !== "local-ai" && payload.providerClass !== "real-ai") {
      return {
        valid: false,
        error: `Provider class "${payload.providerClass}" is not trusted for production. Only canonical local-ai and real-ai receipts can qualify for production export.`,
      };
    }
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────
// SERVER-SIGNED VISUAL APPROVAL RECORD
// ─────────────────────────────────────────────────────────────

/**
 * Creates a deterministic canonical representation of the visual approval record payload.
 */
export function canonicalizeApprovalPayload(payload: EnhancementApprovalPayload): string {
  return JSON.stringify({
    approvalId: payload.approvalId,
    bookId: payload.bookId,
    slotId: payload.slotId,
    profileId: payload.profileId,
    layoutMode: payload.layoutMode,
    enhancedSha256: payload.enhancedSha256,
    destinationWidth: payload.destinationDimensions.width,
    destinationHeight: payload.destinationDimensions.height,
    action: payload.action,
    approvedAt: payload.approvedAt,
  });
}

/**
 * Computes an HMAC-SHA256 signature for a visual approval record payload.
 */
export function computeApprovalSignature(
  payload: EnhancementApprovalPayload,
  secret?: string,
): string {
  const sec = secret || getSigningSecret();
  const canonical = canonicalizeApprovalPayload(payload);
  return crypto.createHmac("sha256", sec).update(canonical).digest("hex");
}

/**
 * Issues a server-signed visual approval record.
 */
export function signVisualApprovalRecord(
  payload: EnhancementApprovalPayload,
  secret?: string,
): SignedEnhancementApprovalRecord {
  const signature = computeApprovalSignature(payload, secret);
  return { payload, signature };
}

export interface VerifyApprovalOptions {
  expectedBookId?: string;
  expectedSlotId?: string;
  expectedProfileId?: string;
  expectedLayoutMode?: string;
  expectedEnhancedSha256?: string;
  expectedDestinationDimensions?: { width: number; height: number };
  secret?: string;
}

/**
 * Cryptographically verifies a server-signed visual approval record.
 * Fails closed if signature does not match or if any expected bindings differ.
 */
export function verifyVisualApprovalRecord(
  record: SignedEnhancementApprovalRecord | null | undefined,
  options: VerifyApprovalOptions = {},
): { valid: boolean; error?: string } {
  if (!record || !record.payload || !record.signature) {
    return { valid: false, error: "Missing or malformed visual approval record." };
  }
  const { payload, signature } = record;

  let secret: string;
  try {
    secret = options.secret || getSigningSecret();
  } catch (err: any) {
    return { valid: false, error: `Approval verification secret error: ${err.message}` };
  }

  // 1. Verify cryptographic HMAC signature using constant-time timingSafeEqual
  const expectedSig = computeApprovalSignature(payload, secret);
  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (
      sigBuf.length !== expectedBuf.length ||
      sigBuf.length === 0 ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return { valid: false, error: "Forged or altered visual approval record: signature mismatch." };
    }
  } catch {
    return { valid: false, error: "Malformed approval signature format." };
  }

  // 2. Validate payload bindings
  if (options.expectedBookId !== undefined && payload.bookId !== options.expectedBookId) {
    return {
      valid: false,
      error: `Approval record book mismatch: issued for "${payload.bookId}", expected "${options.expectedBookId}".`,
    };
  }
  if (options.expectedSlotId !== undefined && payload.slotId !== options.expectedSlotId) {
    return {
      valid: false,
      error: `Approval record slot mismatch: issued for "${payload.slotId}", expected "${options.expectedSlotId}".`,
    };
  }
  if (options.expectedProfileId !== undefined && payload.profileId !== options.expectedProfileId) {
    return {
      valid: false,
      error: `Approval record profile mismatch: issued for "${payload.profileId}", expected "${options.expectedProfileId}".`,
    };
  }
  if (options.expectedLayoutMode !== undefined && payload.layoutMode !== options.expectedLayoutMode) {
    return {
      valid: false,
      error: `Approval record layout mismatch: issued for "${payload.layoutMode}", expected "${options.expectedLayoutMode}".`,
    };
  }
  if (options.expectedEnhancedSha256 !== undefined && payload.enhancedSha256 !== options.expectedEnhancedSha256) {
    return {
      valid: false,
      error: `Approval record hash mismatch: issued for "${payload.enhancedSha256}", expected "${options.expectedEnhancedSha256}".`,
    };
  }
  if (options.expectedDestinationDimensions !== undefined) {
    if (
      !payload.destinationDimensions ||
      payload.destinationDimensions.width !== options.expectedDestinationDimensions.width ||
      payload.destinationDimensions.height !== options.expectedDestinationDimensions.height
    ) {
      return {
        valid: false,
        error: `Approval record destination dimensions mismatch: issued for ${payload.destinationDimensions?.width}×${payload.destinationDimensions?.height}, expected ${options.expectedDestinationDimensions.width}×${options.expectedDestinationDimensions.height}.`,
      };
    }
  }

  return { valid: true };
}
