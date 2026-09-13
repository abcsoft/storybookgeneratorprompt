import type { ProviderClass, SignedEnhancementReceipt } from "./types";

export type EnhancementMethod =
  | "none"
  | "resampled"
  | "ai-enhanced"
  | "mocked-ai-super-res"
  | "external-ai-super-res"
  | "local-realesrgan";
export type EnhancementStatus = "none" | "pending" | "enhanced" | "approved" | "rejected" | "failed";

export interface ImageProvenanceMetadata {
  /** Original uploaded source dimensions in pixels */
  originalPixelDimensions: { width: number; height: number };
  /** Native effective PPI of the original artwork on the target physical trim/bleed canvas */
  nativeEffectivePpi: number;
  /** Dimensions of the enhanced asset in pixels (if enhanced) */
  enhancedPixelDimensions?: { width: number; height: number };
  /** Effective detail PPI after enhancement (stays native PPI for resampled/mock; 300 for verified real AI) */
  enhancedEffectivePpi?: number;
  /** Authoritative print output grid PPI (always 300 for production) */
  outputGridPpi: number;
  /** Factor by which the original was upscaled (e.g. 2.8125x for 1200 -> 3375) */
  upscaleFactor: number;
  /** Method used: 'none', 'resampled' (plain Sharp/Lanczos), 'ai-enhanced', or 'mocked-ai-super-res' */
  enhancementMethod: EnhancementMethod;
  /** Trusted provider class classification: 'real-ai' | 'resampling' | 'test-mock' */
  providerClass?: ProviderClass;
  /** Lifecycle status of the enhancement */
  enhancementStatus: EnhancementStatus;
  /** SHA-256 hash of the original input file */
  originalSha256: string;
  /** SHA-256 hash of the enhanced file */
  enhancedSha256?: string;
  /** True if explicit visual user approval is required before production export */
  approvalRequired: boolean;
  /** ISO timestamp when explicit user approval was recorded */
  approvedAt?: string | null;
  /** Original filename for provenance trace */
  originalFilename?: string;
  /** Cryptographically signed enhancement receipt issued by the server */
  receipt?: SignedEnhancementReceipt;
  /** True if image slot was reassigned via legacy content-remap recovery */
  legacyRecovered?: boolean;
}

/**
 * Calculates SHA-256 hash of a buffer.
 */
export function calculateSha256(buffer: Buffer | Uint8Array | ArrayBuffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = typeof window === "undefined" ? require("crypto") : null;
  if (nodeCrypto) {
    const buf = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer as ArrayBuffer);
    return nodeCrypto.createHash("sha256").update(buf).digest("hex");
  }
  return "";
}

/**
 * Authoritative physical placement dimensions in inches derived strictly from
 * destination canvas pixels and profile DPI.
 *
 * Example Classic Landscape:
 * - Single page: 3375 x 2475 / 300 = 11.25 x 8.25"
 * - Continuous spread: 6675 x 2475 / 300 = 22.25 x 8.25"
 */
export function computeAuthoritativePhysicalDimensionsIn(
  destinationDimensions: { width: number; height: number },
  dpi: number = 300,
): { width: number; height: number } {
  const safeDpi = dpi > 0 ? dpi : 300;
  return {
    width: Number((destinationDimensions.width / safeDpi).toFixed(4)),
    height: Number((destinationDimensions.height / safeDpi).toFixed(4)),
  };
}

/**
 * Compute native effective PPI for an image against physical destination dimensions.
 */
export function computeEffectivePpi(
  dimensions: { width: number; height: number },
  physicalInches: { width: number; height: number },
): number {
  if (!physicalInches.width || !physicalInches.height) return 300;
  const ppiX = dimensions.width / physicalInches.width;
  const ppiY = dimensions.height / physicalInches.height;
  return Number(Math.min(ppiX, ppiY).toFixed(1));
}

/**
 * Authoritative native effective PPI derived directly from source pixels, destination canvas, and profile DPI.
 */
export function computeNativeEffectivePpi(
  sourceDimensions: { width: number; height: number },
  destinationDimensions: { width: number; height: number },
  dpi: number = 300,
): number {
  const phys = computeAuthoritativePhysicalDimensionsIn(destinationDimensions, dpi);
  return computeEffectivePpi(sourceDimensions, phys);
}

/**
 * Evaluates whether an image requires explicit visual approval before export.
 * Policy rules:
 * - Native PPI was below 150
 * - Upscale factor exceeds 2x
 * - AI enhancement was used
 */
export function requiresVisualApproval(
  nativeEffectivePpi: number,
  upscaleFactor: number,
  enhancementMethod: EnhancementMethod,
): boolean {
  if (nativeEffectivePpi < 150) return true;
  if (upscaleFactor > 2.0) return true;
  if (enhancementMethod === "ai-enhanced" || enhancementMethod === "mocked-ai-super-res") return true;
  return false;
}

/**
 * Creates initial provenance metadata for an unenhanced source image.
 */
export function createSourceProvenance(options: {
  width: number;
  height: number;
  buffer: Buffer;
  destinationWidth: number;
  destinationHeight: number;
  physicalInches?: { width: number; height: number };
  dpi?: number;
  filename?: string;
}): ImageProvenanceMetadata {
  const { width, height, buffer, destinationWidth, destinationHeight, dpi = 300, filename } = options;
  const nativeEffectivePpi = computeNativeEffectivePpi(
    { width, height },
    { width: destinationWidth, height: destinationHeight },
    dpi,
  );
  const sha256 = calculateSha256(buffer);

  return {
    originalPixelDimensions: { width, height },
    nativeEffectivePpi,
    outputGridPpi: dpi,
    upscaleFactor: 1.0,
    enhancementMethod: "none",
    enhancementStatus: "none",
    originalSha256: sha256,
    approvalRequired: false,
    approvedAt: null,
    originalFilename: filename,
  };
}
