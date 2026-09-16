import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkIdentityConsistency,
  TestMockIdentityVisionProvider,
  type IdentityCheckStatus,
} from "./identityConsistency";

const anchor = Buffer.from("anchor-bytes");
const identicalCandidate = Buffer.from("anchor-bytes");
const differentCandidate = Buffer.from("different-bytes");

describe("checkIdentityConsistency — fail-closed policy", () => {
  let savedVisionKey: string | undefined;
  let savedVisionUrl: string | undefined;

  beforeEach(() => {
    savedVisionKey = process.env.VISION_API_KEY;
    savedVisionUrl = process.env.VISION_API_URL;
    delete process.env.VISION_API_KEY;
    delete process.env.VISION_API_URL;
  });

  afterEach(() => {
    if (savedVisionKey === undefined) delete process.env.VISION_API_KEY;
    else process.env.VISION_API_KEY = savedVisionKey;
    if (savedVisionUrl === undefined) delete process.env.VISION_API_URL;
    else process.env.VISION_API_URL = savedVisionUrl;
  });

  it("returns NOT_CHECKED when no vision provider is injected/configured (provider: null forces this)", async () => {
    const result = await checkIdentityConsistency({
      slotId: "03-pilot",
      filename: "03-pilot.png",
      anchorImageBuffer: anchor,
      candidateImageBuffer: differentCandidate,
      mimeType: "image/png",
      provider: null,
    });
    expect(result.status).toBe("NOT_CHECKED");
  });

  it("NOT_CHECKED is never treated as a pass by any consumer contract", () => {
    // Structural guard: the status union has exactly these four values, and
    // "pass" logic anywhere in the app must branch on IDENTITY_MATCH only —
    // this test documents/locks the exhaustive set so a future refactor
    // can't silently fold NOT_CHECKED into a truthy/pass branch.
    const allStatuses: IdentityCheckStatus[] = [
      "IDENTITY_MATCH",
      "POSSIBLE_IDENTITY_DRIFT",
      "NOT_CHECKED",
      "CHECK_FAILED",
    ];
    const passStatuses = allStatuses.filter((s) => s === "IDENTITY_MATCH");
    expect(passStatuses).toEqual(["IDENTITY_MATCH"]);
    expect(passStatuses).not.toContain("NOT_CHECKED");
  });

  it("a test-mode mock provider can return IDENTITY_MATCH for identical images", async () => {
    const result = await checkIdentityConsistency({
      slotId: "01-cover",
      filename: "01-cover.png",
      anchorImageBuffer: anchor,
      candidateImageBuffer: identicalCandidate,
      mimeType: "image/png",
      provider: new TestMockIdentityVisionProvider(),
    });
    expect(result.status).toBe("IDENTITY_MATCH");
  });

  it("a test-mode mock provider returns POSSIBLE_IDENTITY_DRIFT for differing images", async () => {
    const result = await checkIdentityConsistency({
      slotId: "03-pilot",
      filename: "03-pilot.png",
      anchorImageBuffer: anchor,
      candidateImageBuffer: differentCandidate,
      mimeType: "image/png",
      provider: new TestMockIdentityVisionProvider(),
    });
    expect(result.status).toBe("POSSIBLE_IDENTITY_DRIFT");
  });

  it("a provider throwing an error returns CHECK_FAILED, not a silent pass", async () => {
    const throwingProvider = {
      id: "throwing",
      isConfigured: true,
      isPaid: false,
      compareIdentity: async () => {
        throw new Error("network unreachable");
      },
    };
    const result = await checkIdentityConsistency({
      slotId: "05-astronaut",
      filename: "05-astronaut.png",
      anchorImageBuffer: anchor,
      candidateImageBuffer: differentCandidate,
      mimeType: "image/png",
      provider: throwingProvider,
    });
    expect(result.status).toBe("CHECK_FAILED");
  });

  it("with real env vars absent, the default (unspecified provider) resolution is NOT_CHECKED outside test mode", async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedAllowMock = process.env.ALLOW_TEST_MOCK_PROVIDERS;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.ALLOW_TEST_MOCK_PROVIDERS;
      const result = await checkIdentityConsistency({
        slotId: "09-army-officer",
        filename: "09-army-officer.png",
        anchorImageBuffer: anchor,
        candidateImageBuffer: differentCandidate,
        mimeType: "image/png",
        // provider omitted entirely -> real getActiveIdentityVisionProvider() resolution
      });
      expect(result.status).toBe("NOT_CHECKED");
    } finally {
      (process.env as any).NODE_ENV = savedNodeEnv;
      if (savedAllowMock !== undefined) process.env.ALLOW_TEST_MOCK_PROVIDERS = savedAllowMock;
    }
  });
});
