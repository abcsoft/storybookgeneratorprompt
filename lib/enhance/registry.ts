import sharp from "sharp";
import type {
  EnhanceImageOptions,
  EnhanceImageResult,
  ResolutionEnhancementProvider,
} from "./types";
import {
  calculateSha256,
  computeEffectivePpi,
  requiresVisualApproval,
  type ImageProvenanceMetadata,
} from "./provenance";

/**
 * Plain resampling provider using Sharp with Lanczos3 filter.
 * Strictly labelled 'resampled' — NEVER 'ai-enhanced'.
 * Preserves the original native effective PPI and does not bypass low-PPI production gates.
 */
export class ResamplingEnhancementProvider implements ResolutionEnhancementProvider {
  readonly id = "resampled";
  readonly name = "Plain Resampling (Lanczos/Sharp)";
  readonly isConfigured = true;
  readonly isPaid = false;

  estimateCost(imageCount: number) {
    return {
      operationCount: imageCount,
      costDescription: "Free (local CPU resampling)",
      isPaid: false,
    };
  }

  async enhanceImage(options: EnhanceImageOptions): Promise<EnhanceImageResult> {
    const { inputBuffer, sourceDimensions, targetDimensions, physicalInches, filename } = options;

    const nativeEffectivePpi = computeEffectivePpi(sourceDimensions, physicalInches);
    const upscaleFactor = Number(
      (targetDimensions.width / Math.max(1, sourceDimensions.width)).toFixed(3),
    );

    // Resample strictly to destination dimensions preserving aspect ratio without stretch
    const enhancedBuffer = await sharp(inputBuffer)
      .resize(targetDimensions.width, targetDimensions.height, {
        fit: "cover",
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();

    const originalSha256 = calculateSha256(inputBuffer);
    const enhancedSha256 = calculateSha256(enhancedBuffer);

    const provenance: ImageProvenanceMetadata = {
      originalPixelDimensions: sourceDimensions,
      nativeEffectivePpi, // Unchanged native PPI provenance!
      enhancedPixelDimensions: targetDimensions,
      enhancedEffectivePpi: nativeEffectivePpi, // Plain resampling does not increase effective detail!
      outputGridPpi: 300,
      upscaleFactor,
      enhancementMethod: "resampled",
      enhancementStatus: "enhanced",
      originalSha256,
      enhancedSha256,
      approvalRequired: requiresVisualApproval(nativeEffectivePpi, upscaleFactor, "resampled"),
      approvedAt: null,
      originalFilename: filename,
    };

    return {
      enhancedBuffer,
      mimeType: "image/png",
      outputDimensions: targetDimensions,
      method: "resampled",
      upscaleFactor,
      provenance,
    };
  }
}

/**
 * Deterministic Mock AI Super-Resolution Provider.
 * Used for testing, proof generation, and demonstration without external paid APIs.
 * Clearly labelled as 'mocked-ai-super-res' — does not claim real visual detail recovery.
 * Upscales to exceed destination dimensions and proportionally downsamples to exact destination (e.g. 3375x2475).
 */
export class MockAiSuperResolutionProvider implements ResolutionEnhancementProvider {
  readonly id = "mocked-ai-super-res";
  readonly name = "Mock AI Super-Resolution (Deterministic No-API Proof Mode)";
  readonly isConfigured = true;
  readonly isPaid = false;

  estimateCost(imageCount: number) {
    return {
      operationCount: imageCount,
      costDescription: "Free (Deterministic local proof mode, no external API calls)",
      isPaid: false,
    };
  }

  async enhanceImage(options: EnhanceImageOptions): Promise<EnhanceImageResult> {
    const { inputBuffer, sourceDimensions, targetDimensions, physicalInches, filename } = options;

    const nativeEffectivePpi = computeEffectivePpi(sourceDimensions, physicalInches);
    const upscaleFactor = Number(
      (targetDimensions.width / Math.max(1, sourceDimensions.width)).toFixed(3),
    );

    // Step 1: Oversample large enough to exceed 3375x2475 (e.g. 1.25x target dimensions)
    const oversampleWidth = Math.round(targetDimensions.width * 1.25);
    const oversampleHeight = Math.round(targetDimensions.height * 1.25);

    const oversampled = await sharp(inputBuffer)
      .resize(oversampleWidth, oversampleHeight, {
        fit: "cover",
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
      .png()
      .toBuffer();

    // Step 2: Proportionally downsample to exact destination dimensions
    const enhancedBuffer = await sharp(oversampled)
      .resize(targetDimensions.width, targetDimensions.height, {
        fit: "cover",
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();

    const originalSha256 = calculateSha256(inputBuffer);
    const enhancedSha256 = calculateSha256(enhancedBuffer);

    const provenance: ImageProvenanceMetadata = {
      originalPixelDimensions: sourceDimensions,
      nativeEffectivePpi,
      enhancedPixelDimensions: targetDimensions,
      enhancedEffectivePpi: 300,
      outputGridPpi: 300,
      upscaleFactor,
      enhancementMethod: "mocked-ai-super-res",
      enhancementStatus: "pending", // Requires explicit user visual approval!
      originalSha256,
      enhancedSha256,
      approvalRequired: true,
      approvedAt: null,
      originalFilename: filename,
    };

    return {
      enhancedBuffer,
      mimeType: "image/png",
      outputDimensions: targetDimensions,
      method: "mocked-ai-super-res",
      upscaleFactor,
      provenance,
    };
  }
}

/**
 * Adapter for external AI super-resolution services.
 * Disabled by default unless ENHANCEMENT_API_KEY is configured.
 * Strictly requires explicit user confirmation before any paid call.
 */
export class ExternalAiEnhancementProviderAdapter implements ResolutionEnhancementProvider {
  readonly id = "external-ai-enhancer";
  readonly name = "Configured AI Super-Resolution Provider";

  get isConfigured(): boolean {
    return Boolean(process.env.ENHANCEMENT_API_KEY);
  }

  readonly isPaid = true;

  estimateCost(imageCount: number) {
    const costPerImage = 0.04;
    return {
      estimatedCostUsd: Number((imageCount * costPerImage).toFixed(2)),
      operationCount: imageCount,
      costDescription: `$${costPerImage}/image (Estimated total: $${(imageCount * costPerImage).toFixed(2)})`,
      isPaid: true,
    };
  }

  async enhanceImage(options: EnhanceImageOptions): Promise<EnhanceImageResult> {
    if (!this.isConfigured) {
      throw new Error(
        "No external AI resolution enhancement provider configured. " +
          "Configure ENHANCEMENT_API_KEY or use Replace / Regenerate image to provide higher-resolution artwork.",
      );
    }

    if (!options.userConfirmedPaid) {
      throw new Error(
        "Explicit user confirmation is required before making paid AI enhancement API calls.",
      );
    }

    // When an external service is configured and confirmed:
    // Future external HTTP call implementation goes here.
    throw new Error("External AI enhancement provider endpoint not reachable.");
  }
}

/**
 * Central registry for resolution enhancement providers.
 */
class ResolutionEnhancementRegistry {
  private providers = new Map<string, ResolutionEnhancementProvider>();

  constructor() {
    this.register(new ResamplingEnhancementProvider());
    this.register(new MockAiSuperResolutionProvider());
    this.register(new ExternalAiEnhancementProviderAdapter());
  }

  register(provider: ResolutionEnhancementProvider) {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ResolutionEnhancementProvider | undefined {
    return this.providers.get(id);
  }

  getProvider(id: string): ResolutionEnhancementProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Returns the best active enhancement provider.
   * If ENHANCEMENT_PROVIDER env var is set, uses that.
   * Defaults to mock provider if test/proof mode or no external key, otherwise external if configured.
   */
  getActiveProvider(preferredId?: string): ResolutionEnhancementProvider {
    if (preferredId && this.providers.has(preferredId)) {
      return this.providers.get(preferredId)!;
    }
    const envChoice = process.env.ENHANCEMENT_PROVIDER;
    if (envChoice && this.providers.has(envChoice)) {
      return this.providers.get(envChoice)!;
    }
    const external = this.get("external-ai-enhancer");
    if (external?.isConfigured) return external;
    return this.get("mocked-ai-super-res")!;
  }

  listProviders(): ResolutionEnhancementProvider[] {
    return Array.from(this.providers.values());
  }
}

export const enhancementRegistry = new ResolutionEnhancementRegistry();
