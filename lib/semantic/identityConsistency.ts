/**
 * Optional identity-consistency check: compares a generated illustration
 * against the approved anchor portrait (00-character.png) using a real,
 * configured vision provider.
 *
 * Truthful policy, mirroring semanticValidator.ts's validateStoryMatch():
 * - No configured vision provider (and not test mode) -> always NOT_CHECKED.
 *   NOT_CHECKED must never be reported or treated as a pass anywhere it's
 *   consumed — see identityConsistency.test.ts.
 * - Provider/network failure -> CHECK_FAILED.
 * - Only a real analysis (test-mode mock, or a configured external
 *   provider) may return IDENTITY_MATCH or POSSIBLE_IDENTITY_DRIFT.
 *
 * This module performs no image generation and makes no network call unless
 * a real provider is configured and `run()` is explicitly invoked with
 * `userConfirmedPaid: true` for a paid provider.
 */

export type IdentityCheckStatus =
  | "IDENTITY_MATCH"
  | "POSSIBLE_IDENTITY_DRIFT"
  | "NOT_CHECKED"
  | "CHECK_FAILED";

export interface IdentityCheckResult {
  status: IdentityCheckStatus;
  slotId: string;
  filename: string;
  confidence: number;
  explanation: string;
  providerId?: string;
  checkedAt: string;
}

export interface IdentityCheckOptions {
  slotId: string;
  filename: string;
  anchorImageBuffer: Buffer;
  candidateImageBuffer: Buffer;
  mimeType: string;
  userConfirmedPaid?: boolean;
  /** Injection point for tests; omit to use the real environment-based resolution. */
  provider?: IdentityVisionProvider | null;
}

export interface IdentityVisionProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  readonly isPaid: boolean;
  compareIdentity(options: IdentityCheckOptions): Promise<IdentityCheckResult>;
}

/**
 * Deterministic test double — registered only in test environments, exactly
 * like TestMockVisionProvider in semanticValidator.ts. Never active in
 * production, and never returned when no real provider is configured there.
 */
export class TestMockIdentityVisionProvider implements IdentityVisionProvider {
  readonly id = "test-mock-identity-vision";
  readonly isConfigured = true;
  readonly isPaid = false;

  async compareIdentity(options: IdentityCheckOptions): Promise<IdentityCheckResult> {
    const same = options.anchorImageBuffer.equals(options.candidateImageBuffer);
    const now = new Date().toISOString();
    return same
      ? {
          status: "IDENTITY_MATCH",
          slotId: options.slotId,
          filename: options.filename,
          confidence: 0.95,
          explanation: "Test double: candidate image is byte-identical to the anchor.",
          providerId: this.id,
          checkedAt: now,
        }
      : {
          status: "POSSIBLE_IDENTITY_DRIFT",
          slotId: options.slotId,
          filename: options.filename,
          confidence: 0.4,
          explanation: "Test double: candidate image differs from the anchor (deterministic byte comparison only).",
          providerId: this.id,
          checkedAt: now,
        };
  }
}

/**
 * Real configurable external identity-vision provider. Reuses the same
 * VISION_API_URL/VISION_API_KEY configuration as semanticValidator.ts's
 * role-match checker — one configured vision endpoint can serve both
 * purposes — but calls a distinct `mode: "identity-compare"` operation.
 */
export class ExternalIdentityVisionProvider implements IdentityVisionProvider {
  readonly id = "external-identity-vision-api";
  readonly isPaid = true;

  get isConfigured(): boolean {
    return Boolean(process.env.VISION_API_KEY && process.env.VISION_API_URL);
  }

  async compareIdentity(options: IdentityCheckOptions): Promise<IdentityCheckResult> {
    const now = new Date().toISOString();
    if (!this.isConfigured) {
      throw new Error("No external vision provider configured. Set VISION_API_URL and VISION_API_KEY.");
    }
    if (!options.userConfirmedPaid) {
      throw new Error("Explicit user confirmation is required before making paid vision API calls.");
    }

    const apiUrl = process.env.VISION_API_URL!;
    const apiKey = process.env.VISION_API_KEY!;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        mode: "identity-compare",
        anchor_image_base64: options.anchorImageBuffer.toString("base64"),
        candidate_image_base64: options.candidateImageBuffer.toString("base64"),
        mime_type: options.mimeType,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Identity vision API error HTTP ${res.status}: ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    if (!data || typeof data.status !== "string") {
      throw new Error("Invalid response schema from identity vision API provider.");
    }

    return {
      status: data.status === "IDENTITY_MATCH" ? "IDENTITY_MATCH" : "POSSIBLE_IDENTITY_DRIFT",
      slotId: options.slotId,
      filename: options.filename,
      confidence: Number(data.confidence ?? 0.7),
      explanation: String(data.explanation || "Analyzed by external identity vision provider"),
      providerId: this.id,
      checkedAt: now,
    };
  }
}

export function getActiveIdentityVisionProvider(): IdentityVisionProvider | null {
  const external = new ExternalIdentityVisionProvider();
  if (external.isConfigured) return external;

  const isTest = process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_MOCK_PROVIDERS === "true";
  if (isTest) return new TestMockIdentityVisionProvider();

  return null;
}

/**
 * Compares a generated illustration against the approved anchor portrait.
 * Truthfully returns NOT_CHECKED whenever no real vision provider is
 * configured — this function must never be modified to turn NOT_CHECKED
 * into a pass; callers must treat NOT_CHECKED as "unknown", not "ok".
 */
export async function checkIdentityConsistency(
  options: IdentityCheckOptions,
): Promise<IdentityCheckResult> {
  const now = new Date().toISOString();
  try {
    const provider = options.provider !== undefined ? options.provider : getActiveIdentityVisionProvider();
    if (provider) {
      return await provider.compareIdentity(options);
    }
    return {
      status: "NOT_CHECKED",
      slotId: options.slotId,
      filename: options.filename,
      confidence: 0,
      explanation: "No AI vision provider is configured. Visual identity consistency was not checked.",
      checkedAt: now,
    };
  } catch (err: any) {
    return {
      status: "CHECK_FAILED",
      slotId: options.slotId,
      filename: options.filename,
      confidence: 0,
      explanation: `Identity consistency check could not complete: ${err?.message ?? String(err)}`,
      checkedAt: now,
    };
  }
}
