import sharp from "sharp";
import crypto from "node:crypto";
import { z } from "zod";
import type {
  SemanticCheckOptions,
  SemanticValidationResult,
  SemanticVisionProvider,
} from "./types";

/**
 * Strict schema for what ANY vision provider (external or local) must return
 * before its output is trusted. Invalid or incomplete provider output must
 * become CHECK_FAILED, never MATCH — never trust an untyped `data.status ===
 * "MATCH"` string check alone.
 */
const ProtectedRegionSchema = z.object({
  kind: z.enum([
    "face",
    "child-body",
    "companion",
    "required-prop",
    "required-action",
    "qr-code",
    "secret-marker",
    "treasure-chest",
    "hands-on-chest",
    "shining-star",
  ]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
});

const VisionProviderOutputSchema = z.object({
  status: z.enum(["MATCH", "POSSIBLE_MISMATCH", "CHECK_FAILED"]),
  detectedContent: z.string().min(1),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  candidateSwapSlotId: z.string().optional(),
  detectedCharacters: z.array(z.string()).optional(),
  detectedLocation: z.string().optional(),
  detectedProps: z.array(z.string()).optional(),
  detectedAction: z.string().optional(),
  missingRequirements: z.array(z.string()).optional(),
  contradictions: z.array(z.string()).optional(),
  evidence: z.string().optional(),
  protectedRegions: z.array(ProtectedRegionSchema).optional(),
});

export type VisionProviderOutput = z.infer<typeof VisionProviderOutputSchema>;

/**
 * Validates raw provider JSON against the strict schema. Returns `null`
 * (never throws) on any schema violation — callers must treat `null` as
 * CHECK_FAILED, never fall back to trusting a partial/malformed payload.
 */
export function parseVisionProviderOutput(raw: unknown): VisionProviderOutput | null {
  const result = VisionProviderOutputSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** SHA-256 of the analyzed image bytes — every result is bound to this. */
export function computeImageSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Deterministic fingerprint over the scene's semantic-contract fields sent
 *  in the request — a result is only valid against the EXACT contract it
 *  was checked against; any change (required characters, action, location,
 *  props, continuity, forbidden substitutions) invalidates it. */
export function computeContractFingerprint(options: Pick<SemanticCheckOptions, "requiredCharacters" | "requiredAction" | "requiredLocation" | "requiredProps" | "continuityContract" | "forbiddenSubstitutions" | "identityStyleFingerprint" | "secretMarkerFingerprint">): string {
  const canonical = JSON.stringify({
    requiredCharacters: [...(options.requiredCharacters ?? [])].sort(),
    requiredAction: options.requiredAction ?? "",
    requiredLocation: options.requiredLocation ?? "",
    requiredProps: [...(options.requiredProps ?? [])].sort(),
    continuityContract: [...(options.continuityContract ?? [])].sort(),
    forbiddenSubstitutions: [...(options.forbiddenSubstitutions ?? [])].sort(),
    identityStyleFingerprint: options.identityStyleFingerprint ?? "",
    secretMarkerFingerprint: options.secretMarkerFingerprint ?? "",
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * A previously-computed semantic result is only valid for production when
 * it's bound to BOTH the exact current image bytes AND the exact current
 * contract fingerprint — replacing/reverting the image, or changing the
 * scene's required characters/action/location/props/continuity/forbidden
 * list, invalidates it and requires a fresh check (or a fresh manual
 * override).
 */
export function invalidateSemanticResultIfStale(
  result: SemanticValidationResult | null | undefined,
  currentImageSha256: string,
  currentContractFingerprint: string,
): { valid: boolean; reason?: string } {
  if (!result) return { valid: false, reason: "No semantic result recorded." };
  if (result.boundImageSha256 !== currentImageSha256) {
    return { valid: false, reason: "Semantic result is bound to a different image (image was replaced/reverted/reframed)." };
  }
  if (result.boundContractFingerprint !== currentContractFingerprint) {
    return { valid: false, reason: "Semantic result is bound to a different semantic-contract version (story contract changed)." };
  }
  return { valid: true };
}

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
      slot_id: options.slotId,
      expected_role: options.expectedRole,
      role_slug: options.roleSlug,
      story_text: options.storyText,
      prompt: options.prompt,
      other_slots: options.otherSlots,
      required_characters: options.requiredCharacters,
      required_action: options.requiredAction,
      required_location: options.requiredLocation,
      required_props: options.requiredProps,
      continuity_contract: options.continuityContract,
      forbidden_substitutions: options.forbiddenSubstitutions,
      identity_style_fingerprint: options.identityStyleFingerprint,
      secret_marker_fingerprint: options.secretMarkerFingerprint,
    };

    const now = new Date().toISOString();
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

    const rawData = await res.json().catch(() => null);
    const parsed = parseVisionProviderOutput(rawData);
    if (!parsed) {
      // Invalid/incomplete provider output must become CHECK_FAILED, never MATCH.
      return {
        status: "CHECK_FAILED",
        slotId: options.slotId,
        filename: options.filename,
        expectedRole: options.expectedRole,
        detectedContent: "Provider returned a response that failed schema validation.",
        confidence: 0,
        explanation: "External vision provider output did not conform to the required response schema — treated as a failed check, not a match.",
        providerId: this.id,
        analysisMethod: "external-vision-api",
        checkedAt: now,
      };
    }

    return {
      status: parsed.status,
      slotId: options.slotId,
      filename: options.filename,
      expectedRole: options.expectedRole,
      detectedContent: parsed.detectedContent,
      confidence: parsed.confidence,
      explanation: parsed.explanation,
      providerId: this.id,
      analysisMethod: "external-vision-api",
      candidateSwapSlotId: parsed.candidateSwapSlotId,
      checkedAt: now,
      detectedCharacters: parsed.detectedCharacters,
      detectedLocation: parsed.detectedLocation,
      detectedProps: parsed.detectedProps,
      detectedAction: parsed.detectedAction,
      missingRequirements: parsed.missingRequirements,
      contradictions: parsed.contradictions,
      evidence: parsed.evidence,
      protectedRegions: parsed.protectedRegions,
    };
  }
}

/**
 * Local Ollama (or any OpenAI-compatible local server exposing the same
 * `/api/tags` + `/api/generate` surface) vision provider. Free, private,
 * never sends images anywhere off the machine.
 *
 * Discovery is READ-ONLY: it lists already-installed models via `/api/tags`
 * and only offers itself as available if one of them is vision-capable. It
 * NEVER pulls/downloads a model — a multi-gigabyte silent download is
 * explicitly prohibited. If no vision-capable model is installed, this
 * provider reports itself unavailable with exact setup instructions instead
 * of silently fetching one.
 */
export class OllamaVisionProvider implements SemanticVisionProvider {
  readonly id = "ollama-vision";
  readonly name = "Local Ollama Vision Model";
  readonly isPaid = false;
  readonly analysisMethod = "ollama-vision";

  private cachedModel: string | null | undefined; // undefined = not yet probed

  get baseUrl(): string {
    return process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  }

  /** True only if Ollama is reachable AND a vision-capable model is already
   *  installed — never true merely because Ollama itself is running. */
  get isConfigured(): boolean {
    // Synchronous interface requirement: reflects the last successful probe.
    // Callers that need a fresh, awaited check should use `checkAvailability()`.
    return this.cachedModel !== undefined && this.cachedModel !== null;
  }

  estimateCost(imageCount: number) {
    return {
      estimatedCostUsd: 0,
      operationCount: imageCount,
      costDescription: "Free (local Ollama inference, no network calls)",
    };
  }

  /**
   * Probes Ollama's model list for a vision-capable model. Read-only — never
   * pulls a model. Returns the exact setup instructions when unavailable.
   */
  async checkAvailability(): Promise<{
    available: boolean;
    model?: string;
    reason?: string;
    setupInstructions?: string;
  }> {
    const explicitModel = process.env.OLLAMA_VISION_MODEL;
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        this.cachedModel = null;
        return {
          available: false,
          reason: `Ollama responded HTTP ${res.status} at ${this.baseUrl}/api/tags.`,
          setupInstructions: `Start Ollama (ollama serve) and pull a vision model, e.g.: ollama pull llava`,
        };
      }
      const data = await res.json();
      const models: Array<{ name: string; details?: { families?: string[] }; capabilities?: string[] }> = data?.models ?? [];

      if (explicitModel) {
        const found = models.find((m) => m.name === explicitModel);
        if (found) {
          this.cachedModel = explicitModel;
          return { available: true, model: explicitModel };
        }
        this.cachedModel = null;
        return {
          available: false,
          reason: `OLLAMA_VISION_MODEL="${explicitModel}" is not installed in Ollama.`,
          setupInstructions: `Pull it first: ollama pull ${explicitModel}`,
        };
      }

      // Auto-discover: a model is "vision-capable" if Ollama reports
      // "vision" in its capabilities array, or its family list includes a
      // known vision architecture. Text-only models (e.g. llama3.1, llama3.2)
      // never qualify.
      const visionModel = models.find(
        (m) =>
          m.capabilities?.includes("vision") ||
          m.details?.families?.some((f) => /clip|llava|vision|vl\b/i.test(f)),
      );
      if (visionModel) {
        this.cachedModel = visionModel.name;
        return { available: true, model: visionModel.name };
      }

      this.cachedModel = null;
      const installedList = models.map((m) => m.name).join(", ") || "(none)";
      return {
        available: false,
        reason: `Ollama is running at ${this.baseUrl}, but no vision-capable model is installed. Installed models: ${installedList}.`,
        setupInstructions:
          `Pull a vision model (NOT done automatically — this is a multi-gigabyte download): ` +
          `ollama pull llava   (or: ollama pull qwen2.5vl, ollama pull moondream for a smaller model). ` +
          `Then set OLLAMA_VISION_MODEL to that model name, or just re-check — auto-discovery will find it.`,
      };
    } catch (err: any) {
      this.cachedModel = null;
      return {
        available: false,
        reason: `Could not reach Ollama at ${this.baseUrl}: ${err?.message ?? String(err)}`,
        setupInstructions: `Install Ollama (https://ollama.com) and run "ollama serve", or set OLLAMA_BASE_URL to point at a running instance.`,
      };
    }
  }

  async analyzeImage(options: SemanticCheckOptions): Promise<SemanticValidationResult> {
    const avail = await this.checkAvailability();
    if (!avail.available || !avail.model) {
      throw new Error(avail.reason ?? "No vision-capable Ollama model is available.");
    }

    const contractLines = [
      options.requiredCharacters?.length ? `Required characters: ${options.requiredCharacters.join(", ")}` : "",
      options.requiredAction ? `Required action: ${options.requiredAction}` : "",
      options.requiredLocation ? `Required location: ${options.requiredLocation}` : "",
      options.requiredProps?.length ? `Required props: ${options.requiredProps.join(", ")}` : "",
      options.continuityContract?.length ? `Continuity references: ${options.continuityContract.join("; ")}` : "",
      options.forbiddenSubstitutions?.length ? `Forbidden: ${options.forbiddenSubstitutions.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const instruction =
      `You are verifying a children's storybook illustration against its required scene contract.\n` +
      `Expected role/scene: ${options.expectedRole}\n` +
      `Story text for this page: ${options.storyText ?? "(none)"}\n` +
      `${contractLines}\n\n` +
      `Respond with ONLY a single JSON object matching this exact shape (no prose, no markdown fences):\n` +
      `{"status":"MATCH"|"POSSIBLE_MISMATCH"|"CHECK_FAILED","detectedContent":string,"confidence":number(0-1),` +
      `"explanation":string,"detectedCharacters":string[],"detectedLocation":string,"detectedProps":string[],` +
      `"detectedAction":string,"missingRequirements":string[],"contradictions":string[],"evidence":string}`;

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: avail.model,
        prompt: instruction,
        images: [options.imageBuffer.toString("base64")],
        stream: false,
        format: "json",
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Ollama vision request failed: HTTP ${res.status} ${errText.slice(0, 150)}`);
    }

    const data = await res.json().catch(() => null);
    const now = new Date().toISOString();
    let rawModelJson: unknown = null;
    try {
      rawModelJson = typeof data?.response === "string" ? JSON.parse(data.response) : data?.response;
    } catch {
      rawModelJson = null;
    }

    const parsed = parseVisionProviderOutput(rawModelJson);
    if (!parsed) {
      return {
        status: "CHECK_FAILED",
        slotId: options.slotId,
        filename: options.filename,
        expectedRole: options.expectedRole,
        detectedContent: "Local vision model returned a response that failed schema validation.",
        confidence: 0,
        explanation: `Ollama model "${avail.model}" did not return a well-formed JSON result matching the required schema — treated as a failed check, not a match.`,
        providerId: this.id,
        analysisMethod: "ollama-vision",
        checkedAt: now,
      };
    }

    return {
      status: parsed.status,
      slotId: options.slotId,
      filename: options.filename,
      expectedRole: options.expectedRole,
      detectedContent: parsed.detectedContent,
      confidence: parsed.confidence,
      explanation: parsed.explanation,
      providerId: this.id,
      analysisMethod: "ollama-vision",
      candidateSwapSlotId: parsed.candidateSwapSlotId,
      checkedAt: now,
      detectedCharacters: parsed.detectedCharacters,
      detectedLocation: parsed.detectedLocation,
      detectedProps: parsed.detectedProps,
      detectedAction: parsed.detectedAction,
      missingRequirements: parsed.missingRequirements,
      contradictions: parsed.contradictions,
      evidence: parsed.evidence,
      protectedRegions: parsed.protectedRegions,
    };
  }
}

/**
 * Gets the active vision provider if configured. Synchronous by design (the
 * existing route/API surface calls this without awaiting) — Ollama's own
 * async availability probe happens lazily inside `analyzeImage`/
 * `checkAvailability`; `getActiveVisionProviderAsync` below does the full
 * awaited check for the health/capabilities endpoint.
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
 * Full awaited provider resolution, including a live Ollama availability
 * probe (read-only — never pulls a model). Used by the health/capabilities
 * endpoint and by validateStoryMatch so a locally-running, vision-capable
 * Ollama model is actually used when present, per VISION_PROVIDER=ollama or
 * auto-discovery when VISION_PROVIDER is unset.
 */
export async function getActiveVisionProviderAsync(): Promise<{
  provider: SemanticVisionProvider | null;
  ollamaProbe?: Awaited<ReturnType<OllamaVisionProvider["checkAvailability"]>>;
}> {
  const external = new ExternalVisionProvider();
  if (external.isConfigured) return { provider: external };

  const visionProviderEnv = process.env.VISION_PROVIDER;
  const isTest =
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_TEST_MOCK_PROVIDERS === "true";

  // In automated tests, skip the live Ollama network probe entirely (avoids
  // an unnecessary network round trip on every call) UNLESS a real Ollama
  // check was explicitly requested via VISION_PROVIDER=ollama — that's the
  // live-verification escape hatch for actually exercising a real local
  // model from a test/script.
  if (!isTest || visionProviderEnv === "ollama") {
    if (visionProviderEnv !== "disabled") {
      const ollama = new OllamaVisionProvider();
      const probe = await ollama.checkAvailability();
      if (probe.available) return { provider: ollama, ollamaProbe: probe };
      if (visionProviderEnv === "ollama") {
        // Explicitly requested but unavailable — surface the probe, no provider.
        return { provider: null, ollamaProbe: probe };
      }
    }
  }

  if (isTest) {
    return { provider: new TestMockVisionProvider() };
  }

  return { provider: null };
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
  const result = await validateStoryMatchInner(options);
  // Bind every result (whatever path produced it) to the exact image bytes
  // and exact contract version it was checked against, so a later image
  // swap or contract change is detectable (see
  // invalidateSemanticResultIfStale).
  const boundImageSha256 = options.imageSha256 ?? computeImageSha256(options.imageBuffer);
  const boundContractFingerprint = computeContractFingerprint(options);
  return { ...result, boundImageSha256, boundContractFingerprint };
}

async function validateStoryMatchInner(
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
    //    (explicit override wins; otherwise resolve async so a locally
    //    running, vision-capable Ollama model is discovered).
    const visionProvider =
      options.visionProvider !== undefined
        ? options.visionProvider
        : (await getActiveVisionProviderAsync()).provider;
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
