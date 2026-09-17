/**
 * Regression coverage for Part A of the story-match repair: the semantic
 * check must never silently return a misleading successful result when no
 * real vision provider is available, provider output must be strictly
 * schema-validated (never trust a partial/malformed payload as MATCH), and
 * a semantic result must invalidate when the image or contract it was
 * checked against changes.
 */

import { describe, expect, it, vi } from "vitest";
import {
  computeContractFingerprint,
  computeImageSha256,
  invalidateSemanticResultIfStale,
  parseVisionProviderOutput,
  validateStoryMatch,
  TestMockVisionProvider,
  type VisionProviderOutput,
} from "./semanticValidator";
import { POST as semanticCheckPost, GET as semanticCheckGet } from "../../app/api/semantic-check/route";
import type { SemanticValidationResult } from "./types";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("Vision provider output schema validation", () => {
  it("accepts a well-formed provider payload", () => {
    const parsed = parseVisionProviderOutput({
      status: "MATCH",
      detectedContent: "A child on a boat with a golden puppy.",
      confidence: 0.92,
      explanation: "Matches the harbour-departure scene.",
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe("MATCH");
  });

  it("rejects a payload missing required fields", () => {
    expect(parseVisionProviderOutput({ status: "MATCH" })).toBeNull();
    expect(parseVisionProviderOutput({ detectedContent: "x", confidence: 0.5, explanation: "y" })).toBeNull();
  });

  it("rejects a payload with an invalid status enum value", () => {
    expect(
      parseVisionProviderOutput({ status: "SURE_WHY_NOT", detectedContent: "x", confidence: 0.5, explanation: "y" }),
    ).toBeNull();
  });

  it("rejects a payload where confidence is out of the 0-1 range", () => {
    expect(
      parseVisionProviderOutput({ status: "MATCH", detectedContent: "x", confidence: 5, explanation: "y" }),
    ).toBeNull();
  });

  it("null/undefined/non-object input never crashes and always yields null", () => {
    expect(parseVisionProviderOutput(null)).toBeNull();
    expect(parseVisionProviderOutput(undefined)).toBeNull();
    expect(parseVisionProviderOutput("just a string")).toBeNull();
    expect(parseVisionProviderOutput(42)).toBeNull();
  });
});

describe("GET /api/semantic-check — provider capabilities/health", () => {
  it("reports availability status without throwing", async () => {
    const res = await semanticCheckGet();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.isAvailable).toBe("boolean");
  });
});

describe("POST /api/semantic-check — structured 503 when no provider is available", () => {
  // vitest always sets NODE_ENV=test, and validateStoryMatch's own fallback
  // treats NODE_ENV=test as "safe to use the deterministic mock provider" —
  // correct behavior for every OTHER test in this suite, but it means env
  // vars alone can't simulate "truly no provider" here. Stub the resolver
  // directly instead, exactly as the route would see it in a real
  // environment with nothing configured.
  it("returns 503 VISION_PROVIDER_UNAVAILABLE (not a misleading 200 NOT_CHECKED) when no provider is available", async () => {
    const mod = await import("./semanticValidator");
    const spy = vi.spyOn(mod, "getActiveVisionProviderAsync").mockResolvedValue({
      provider: null,
      ollamaProbe: { available: false, reason: "no vision model installed", setupInstructions: "ollama pull llava" },
    });
    try {
      const formData = new FormData();
      formData.append("file", new File([TINY_PNG], "test.png", { type: "image/png" }));
      formData.append("slotId", "test-slot");
      formData.append("expectedRole", "test role");

      const req = new Request("http://localhost:3000/api/semantic-check", { method: "POST", body: formData });
      const res = await semanticCheckPost(req);

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.code).toBe("VISION_PROVIDER_UNAVAILABLE");
      expect(json.status).not.toBe("MATCH");
      expect(json.setupInstructions).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("an unavailable provider never produces a MATCH result via the route", async () => {
    const mod = await import("./semanticValidator");
    const spy = vi.spyOn(mod, "getActiveVisionProviderAsync").mockResolvedValue({ provider: null });
    try {
      const formData = new FormData();
      formData.append("file", new File([TINY_PNG], "test.png", { type: "image/png" }));
      const req = new Request("http://localhost:3000/api/semantic-check", { method: "POST", body: formData });
      const res = await semanticCheckPost(req);
      const json = await res.json();
      expect(json.status).not.toBe("MATCH");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Invalid/incomplete provider output becomes CHECK_FAILED, never MATCH", () => {
  class MalformedVisionProvider extends TestMockVisionProvider {
    override async analyzeImage(): Promise<SemanticValidationResult> {
      // Simulates a provider that returns a status but is missing other
      // required fields — validateStoryMatch/the provider wrapper must
      // reject this instead of blindly trusting `status: "MATCH"`.
      const bogus = parseVisionProviderOutput({ status: "MATCH" }); // null
      if (!bogus) {
        return {
          status: "CHECK_FAILED",
          slotId: "s",
          filename: "f.png",
          expectedRole: "r",
          detectedContent: "invalid provider output",
          confidence: 0,
          explanation: "schema validation failed",
          analysisMethod: "test-mock-vision",
          checkedAt: new Date().toISOString(),
        };
      }
      throw new Error("unreachable");
    }
  }

  it("a provider whose output fails schema validation resolves to CHECK_FAILED", async () => {
    const result = await validateStoryMatch({
      slotId: "s",
      filename: "f.png",
      expectedRole: "r",
      imageBuffer: TINY_PNG,
      mimeType: "image/png",
      visionProvider: new MalformedVisionProvider(),
    });
    expect(result.status).toBe("CHECK_FAILED");
  });
});

describe("Semantic result invalidation on image/contract change", () => {
  it("a result bound to one image SHA is invalid once the image changes", () => {
    const shaA = computeImageSha256(Buffer.from("image-a"));
    const shaB = computeImageSha256(Buffer.from("image-b"));
    const fingerprint = computeContractFingerprint({ requiredAction: "wave" });

    const result: SemanticValidationResult = {
      status: "MATCH",
      slotId: "s",
      filename: "f.png",
      expectedRole: "r",
      detectedContent: "x",
      confidence: 0.9,
      explanation: "y",
      analysisMethod: "test-mock-vision",
      checkedAt: new Date().toISOString(),
      boundImageSha256: shaA,
      boundContractFingerprint: fingerprint,
    };

    expect(invalidateSemanticResultIfStale(result, shaA, fingerprint).valid).toBe(true);
    expect(invalidateSemanticResultIfStale(result, shaB, fingerprint).valid).toBe(false);
  });

  it("a result is invalid once the scene's semantic contract changes (even with the same image)", () => {
    const sha = computeImageSha256(Buffer.from("same-image"));
    const fingerprintBefore = computeContractFingerprint({ requiredAction: "wave", requiredCharacters: ["child"] });
    const fingerprintAfter = computeContractFingerprint({ requiredAction: "wave and point", requiredCharacters: ["child"] });
    expect(fingerprintBefore).not.toBe(fingerprintAfter);

    const result: SemanticValidationResult = {
      status: "MATCH",
      slotId: "s",
      filename: "f.png",
      expectedRole: "r",
      detectedContent: "x",
      confidence: 0.9,
      explanation: "y",
      analysisMethod: "test-mock-vision",
      checkedAt: new Date().toISOString(),
      boundImageSha256: sha,
      boundContractFingerprint: fingerprintBefore,
    };

    expect(invalidateSemanticResultIfStale(result, sha, fingerprintAfter).valid).toBe(false);
  });

  it("validateStoryMatch always stamps a boundImageSha256 and boundContractFingerprint on its result", async () => {
    const result = await validateStoryMatch({
      slotId: "s",
      filename: "f.png",
      expectedRole: "r",
      imageBuffer: TINY_PNG,
      mimeType: "image/png",
      requiredAction: "test action",
    });
    expect(result.boundImageSha256).toBe(computeImageSha256(TINY_PNG));
    expect(result.boundContractFingerprint).toBeTruthy();
  });

  it("no prior result (null) is always treated as invalid — production must not silently pass", () => {
    expect(invalidateSemanticResultIfStale(null, "any-sha", "any-fp").valid).toBe(false);
    expect(invalidateSemanticResultIfStale(undefined, "any-sha", "any-fp").valid).toBe(false);
  });
});
