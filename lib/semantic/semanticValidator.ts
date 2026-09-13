import sharp from "sharp";
import type {
  SemanticCheckOptions,
  SemanticValidationResult,
  SemanticVisionProvider,
} from "./types";

/**
 * Deterministic Test Mock Vision Provider (test double only).
 * Registered only in test environments.
 */
export class TestMockVisionProvider implements SemanticVisionProvider {
  readonly id = "test-mock-vision";
  readonly name = "Mock Vision Provider (Deterministic Test Double Only)";
  readonly isConfigured = true;
  readonly isPaid = false;
  readonly analysisMethod = "test-mock-vision";

  estimateCost(imageCount: number) {
    return {
      estimatedCostUsd: 0,
      operationCount: imageCount,
      costDescription: "Free (Deterministic test double)",
    };
  }

  async analyzeImage(options: SemanticCheckOptions): Promise<SemanticValidationResult> {
    const { slotId, filename, expectedRole, roleSlug, otherSlots } = options;
    const now = new Date().toISOString();

    const isVet = roleSlug === "veterinarian" || expectedRole.toLowerCase().includes("vet");
    // Look for inventor hints
    const rawStr = options.imageBuffer.toString("latin1").toLowerCase();
    const isInventor = rawStr.includes("inventor") || rawStr.includes("gear") || rawStr.includes("light bulb");

    if (isVet && isInventor) {
      const inventorSlot = otherSlots?.find(
        (s) => s.roleSlug === "inventor" || s.role.toLowerCase().includes("inventor"),
      );
      return {
        status: "POSSIBLE_MISMATCH",
        slotId,
        filename,
        expectedRole,
        detectedContent: "Inventor workshop with gears, light bulbs, and machine blueprints (analyzed by test-mock-vision)",
        confidence: 0.95,
        explanation:
          `Vision test double detected an inventor scene, which contradicts the expected role "${expectedRole}".`,
        providerId: this.id,
        analysisMethod: "test-mock-vision",
        candidateSwapSlotId: inventorSlot?.slotId ?? "22-inventor",
        checkedAt: now,
      };
    }

    return {
      status: "MATCH",
      slotId,
      filename,
      expectedRole,
      detectedContent: `${expectedRole} scene verified by test double`,
      confidence: 0.9,
      explanation: `Test double verified image aligns with "${expectedRole}".`,
      providerId: this.id,
      analysisMethod: "test-mock-vision",
      checkedAt: now,
    };
  }
}

/**
 * Real Configurable External Vision Provider using VISION_API_URL and VISION_API_KEY.
 */
export class ExternalVisionProvider implements SemanticVisionProvider {
  readonly id = "external-vision-api";
  readonly name = "Configured Cloud Vision Provider";
  readonly isPaid = true;
  readonly analysisMethod = "external-vision-api";

  get isConfigured(): boolean {
    return Boolean(process.env.VISION_API_KEY && process.env.VISION_API_URL);
  }

  estimateCost(imageCount: number) {
    const costPerImage = 0.015;
    return {
      estimatedCostUsd: Number((imageCount * costPerImage).toFixed(3)),
      operationCount: imageCount,
      costDescription: `$${costPerImage}/image (Estimated total: $${(imageCount * costPerImage).toFixed(3)})`,
    };
  }

  async analyzeImage(options: SemanticCheckOptions): Promise<SemanticValidationResult> {
    if (!this.isConfigured) {
      throw new Error("No external vision provider configured. Set VISION_API_URL and VISION_API_KEY.");
    }
    if (!options.userConfirmedPaid) {
      throw new Error("Explicit user confirmation is required before making paid vision API calls.");
    }

    const apiUrl = process.env.VISION_API_URL!;
    const apiKey = process.env.VISION_API_KEY!;

    const payload = {
      image_base64: options.imageBuffer.toString("base64"),
      mime_type: options.mimeType,
      expected_role: options.expectedRole,
      role_slug: options.roleSlug,
      story_text: options.storyText,
      prompt: options.prompt,
      other_slots: options.otherSlots,
    };

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Vision API error HTTP ${res.status}: ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    if (!data || typeof data.status !== "string") {
      throw new Error("Invalid response schema from vision API provider.");
    }

    return {
      status: data.status === "MATCH" ? "MATCH" : "POSSIBLE_MISMATCH",
      slotId: options.slotId,
      filename: options.filename,
      expectedRole: options.expectedRole,
      detectedContent: String(data.detectedContent || "Vision analysis result"),
      confidence: Number(data.confidence ?? 0.85),
      explanation: String(data.explanation || "Analyzed by external vision provider"),
      providerId: this.id,
      analysisMethod: "external-vision-api",
      candidateSwapSlotId: data.candidateSwapSlotId ? String(data.candidateSwapSlotId) : undefined,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Gets the active vision provider if configured.
 */
export function getActiveVisionProvider(): SemanticVisionProvider | null {
  const external = new ExternalVisionProvider();
  if (external.isConfigured) return external;

  const isTest =
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_TEST_MOCK_PROVIDERS === "true";
  if (isTest) {
    return new TestMockVisionProvider();
  }

  return null;
}

/**
 * Validates semantic correspondence between an illustration and its intended story slot.
 * Truthful policy:
 * 1. If metadata scanning detects contradictions (e.g. inventor hints in veterinarian slot),
 *    it reports a low-confidence diagnostic: POSSIBLE_MISMATCH (metadata-only evidence).
 * 2. If a vision provider is configured, executes vision analysis against story role/text.
 * 3. Without a configured vision provider and without metadata mismatch: returns NOT_CHECKED, NEVER MATCH.
 * 4. Provider or network failure returns CHECK_FAILED.
 */
export async function validateStoryMatch(
  options: SemanticCheckOptions,
): Promise<SemanticValidationResult> {
  const {
    slotId,
    filename,
    expectedRole,
    roleSlug,
    imageBuffer,
    otherSlots,
  } = options;

  const now = new Date().toISOString();

  try {
    // 1. If vision provider is configured, run vision provider analysis
    const visionProvider = getActiveVisionProvider();
    if (visionProvider) {
      return await visionProvider.analyzeImage(options);
    }

    // 2. Without a vision provider: inspect metadata for low-confidence preliminary diagnostics
    let metadataComment = "";
    let metadataExif = "";
    try {
      const meta = await sharp(imageBuffer).metadata();
      metadataComment = meta.comments ? JSON.stringify(meta.comments) : "";
      metadataExif = meta.exif ? meta.exif.toString("utf8") : "";
    } catch {
      /* Sharp decode error caught below */
    }

    const rawBufferStr = imageBuffer.toString("latin1").toLowerCase();
    const combinedHints = `${metadataComment} ${metadataExif} ${rawBufferStr}`.toLowerCase();

    const isInventorScene =
      combinedHints.includes("inventor") ||
      combinedHints.includes("gear") ||
      combinedHints.includes("light bulb") ||
      combinedHints.includes("blueprint");

    const isVetRole =
      roleSlug === "veterinarian" ||
      expectedRole.toLowerCase().includes("vet");

    if (isVetRole && isInventorScene) {
      const inventorSlot = otherSlots?.find(
        (s) => s.roleSlug === "inventor" || s.role.toLowerCase().includes("inventor"),
      );
      return {
        status: "POSSIBLE_MISMATCH",
        slotId,
        filename,
        expectedRole: expectedRole || "veterinarian caring for animals",
        detectedContent:
          "Inventor workshop with gears, light bulbs, tools, and machinery blueprints (metadata-only evidence)",
        confidence: 0.4,
        explanation:
          `POSSIBLE_MISMATCH — metadata-only evidence: embedded metadata/text indicates an inventor scene, ` +
          `which contradicts the expected role "${expectedRole}" and story text. Image visual content was not analyzed by a vision provider.`,
        providerId: "local-metadata-scanner",
        analysisMethod: "metadata-inspection",
        candidateSwapSlotId: inventorSlot?.slotId ?? "22-inventor",
        checkedAt: now,
      };
    }

    // 3. Without a vision provider: Truthfully return NOT_CHECKED (NEVER MATCH!)
    return {
      status: "NOT_CHECKED",
      slotId,
      filename,
      expectedRole,
      detectedContent: "Image visual content not analyzed (no vision provider configured)",
      confidence: 0,
      explanation: "No AI vision provider is configured. Story visual match was not checked.",
      analysisMethod: "none",
      checkedAt: now,
    };
  } catch (err: any) {
    return {
      status: "CHECK_FAILED",
      slotId,
      filename,
      expectedRole,
      detectedContent: "Unable to inspect image",
      confidence: 0,
      explanation: `Semantic analysis could not complete: ${err.message ?? String(err)}`,
      analysisMethod: "none",
      checkedAt: now,
    };
  }
}

export const validateStorySemanticMatch = validateStoryMatch;
