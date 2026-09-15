import sharp from "sharp";
import { ENHANCEMENT_PROVIDER_IDS } from "./constants";
import { LocalRealEsrganProvider } from "./localRealEsrganProvider";
import type {
  EnhanceImageOptions,
  EnhanceImageResult,
  ResolutionEnhancementProvider,
  ProviderClass,
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
  readonly id = ENHANCEMENT_PROVIDER_IDS.RESAMPLED;
  readonly name = "Plain Resampling (Lanczos/Sharp)";
  readonly providerClass: ProviderClass = "resampling";
  readonly isConfigured = true;
  readonly isPaid = false;

  estimateCost(imageCount: number) {
    return {
      estimatedCostUsd: 0,
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
      providerClass: "resampling",
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
      providerClass: "resampling",
      upscaleFactor,
      provenance,
    };
  }
}

/**
 * Deterministic Mock AI Super-Resolution Provider.
 * ONLY registered and available when NODE_ENV === 'test' or ALLOW_TEST_MOCK_PROVIDERS === 'true'.
 * Clearly labelled as 'mocked-ai-super-res' / 'test-mock' providerClass.
 * Does NOT set enhancedEffectivePpi to 300 (preserves native detail PPI).
 * Upscales to exceed destination dimensions and proportionally downsamples to exact destination.
 */
export class MockAiSuperResolutionProvider implements ResolutionEnhancementProvider {
  readonly id = ENHANCEMENT_PROVIDER_IDS.MOCK_AI;
  readonly name = "Mock AI Super-Resolution (Test & Proof Double Only)";
  readonly providerClass: ProviderClass = "test-mock";
  readonly isConfigured = true;
  readonly isPaid = false;

  estimateCost(imageCount: number) {
    return {
      estimatedCostUsd: 0,
      operationCount: imageCount,
      costDescription: "Free (Deterministic local test double, no external API calls)",
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
      // Retains original effective detail PPI — does not falsely claim 300 PPI
      enhancedEffectivePpi: nativeEffectivePpi,
      outputGridPpi: 300,
      upscaleFactor,
      enhancementMethod: "mocked-ai-super-res",
      providerClass: "test-mock",
      enhancementStatus: "pending",
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
      providerClass: "test-mock",
      upscaleFactor,
      provenance,
    };
  }
}

/**
 * Real configurable external AI super-resolution provider.
 * Uses server-only ENHANCEMENT_API_URL and ENHANCEMENT_API_KEY.
 * Credentials are never exposed to the client.
 */
export class ExternalAiSuperResolutionProvider implements ResolutionEnhancementProvider {
  readonly id = ENHANCEMENT_PROVIDER_IDS.EXTERNAL_AI;
  readonly name = "Configured AI Super-Resolution Provider";
  readonly providerClass: ProviderClass = "real-ai";
  readonly isPaid = true;

  get isConfigured(): boolean {
    return Boolean(process.env.ENHANCEMENT_API_KEY && process.env.ENHANCEMENT_API_URL);
  }

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
          "Configure ENHANCEMENT_API_URL and ENHANCEMENT_API_KEY or use Replace / Regenerate image.",
      );
    }

    if (!options.userConfirmedPaid) {
      throw new Error(
        "Explicit user confirmation is required before making paid AI enhancement API calls.",
      );
    }

    const apiUrl = process.env.ENHANCEMENT_API_URL!;
    const apiKey = process.env.ENHANCEMENT_API_KEY!;

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(options.inputBuffer)], { type: options.mimeType });
    formData.append("image", blob, options.filename || "input.png");
    formData.append("target_width", String(options.targetDimensions.width));
    formData.append("target_height", String(options.targetDimensions.height));

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `External AI enhancement API returned error HTTP ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    const responseMime = response.headers.get("content-type") || "image/png";
    if (!responseMime.startsWith("image/")) {
      throw new Error(`External AI enhancement API returned invalid non-image MIME: "${responseMime}".`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const enhancedBuffer = Buffer.from(arrayBuffer);

    // Validate returned image bytes using Sharp
    const meta = await sharp(enhancedBuffer).metadata();
    if (!meta.width || !meta.height) {
      throw new Error("External AI enhancement API returned undecodable image data.");
    }

    if (
      meta.width !== options.targetDimensions.width ||
      meta.height !== options.targetDimensions.height
    ) {
      throw new Error(
        `External AI enhancement API returned dimensions ${meta.width}×${meta.height}, expected exact destination ${options.targetDimensions.width}×${options.targetDimensions.height}.`,
      );
    }

    const nativeEffectivePpi = computeEffectivePpi(options.sourceDimensions, options.physicalInches);
    const upscaleFactor = Number(
      (options.targetDimensions.width / Math.max(1, options.sourceDimensions.width)).toFixed(3),
    );
    const originalSha256 = calculateSha256(options.inputBuffer);
    const enhancedSha256 = calculateSha256(enhancedBuffer);

    const provenance: ImageProvenanceMetadata = {
      originalPixelDimensions: options.sourceDimensions,
      nativeEffectivePpi,
      enhancedPixelDimensions: options.targetDimensions,
      enhancedEffectivePpi: 300, // Genuine real AI super-resolution restores 300 PPI detail
      outputGridPpi: 300,
      upscaleFactor,
      enhancementMethod: "ai-enhanced",
      providerClass: "real-ai",
      enhancementStatus: "pending", // Still requires user visual approval before production export
      originalSha256,
      enhancedSha256,
      approvalRequired: true,
      approvedAt: null,
      originalFilename: options.filename,
    };

    return {
      enhancedBuffer,
      mimeType: responseMime,
      outputDimensions: options.targetDimensions,
      method: "ai-enhanced",
      providerClass: "real-ai",
      upscaleFactor,
      provenance,
    };
  }
}

/**
 * Central registry for resolution enhancement providers.
 */
export class ResolutionEnhancementRegistry {
  private providers = new Map<string, ResolutionEnhancementProvider>();

  constructor() {
    this.reset();
  }

  reset() {
    this.providers.clear();
    this.register(new ResamplingEnhancementProvider());

    const isTest =
      process.env.NODE_ENV === "test" ||
      process.env.ALLOW_TEST_MOCK_PROVIDERS === "true";
    if (isTest) {
      this.register(new MockAiSuperResolutionProvider());
    }

    this.register(new LocalRealEsrganProvider());
    this.register(new ExternalAiSuperResolutionProvider());
  }

  register(provider: ResolutionEnhancementProvider) {
    this.providers.set(provider.id, provider);
  }

  private isTestMode(): boolean {
    return (
      process.env.NODE_ENV === "test" ||
      process.env.ALLOW_TEST_MOCK_PROVIDERS === "true"
    );
  }

  get(id: string): ResolutionEnhancementProvider | undefined {
    return this.getProvider(id);
  }

  getProvider(id: string): ResolutionEnhancementProvider | undefined {
    const provider = this.providers.get(id);
    if (!provider) return undefined;
    if (provider.providerClass === "test-mock" && !this.isTestMode()) {
      return undefined;
    }
    return provider;
  }

  /**
   * Returns the active enhancement provider.
   * NEVER defaults to mocked-ai-super-res in production.
   * Auto-discovery order:
   * 1. Local Real-ESRGAN (free, local AI)
   * 2. Configured external AI provider
   * 3. Mock provider ONLY in test mode
   * Otherwise returns null (fail closed).
   */
  getActiveProvider(preferredId?: string): ResolutionEnhancementProvider | null {
    if (preferredId) {
      const preferred = this.getProvider(preferredId);
      if (preferred && preferred.isConfigured) return preferred;
      return null;
    }
    const envChoice = process.env.ENHANCEMENT_PROVIDER;
    if (envChoice) {
      const envProv = this.getProvider(envChoice);
      if (envProv && envProv.isConfigured) return envProv;
      return null;
    }

    const local = this.getProvider(ENHANCEMENT_PROVIDER_IDS.LOCAL_REALESRGAN);
    if (local?.isConfigured) {
      return local;
    }

    const external = this.getProvider(ENHANCEMENT_PROVIDER_IDS.EXTERNAL_AI);
    if (external?.isConfigured) {
      return external;
    }

    if (this.isTestMode()) {
      const mock = this.getProvider(ENHANCEMENT_PROVIDER_IDS.MOCK_AI);
      if (mock && mock.isConfigured) {
        return mock;
      }
    }

    // In production without a configured AI provider, return null (unavailable)
    return null;
  }

  listProviders(): ResolutionEnhancementProvider[] {
    return Array.from(this.providers.values()).filter(
      (p) => p.providerClass !== "test-mock" || this.isTestMode(),
    );
  }
}

export const enhancementRegistry = new ResolutionEnhancementRegistry();
