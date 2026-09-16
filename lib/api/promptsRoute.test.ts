/**
 * Regression coverage for POST /api/prompts — the bug reproduced was a
 * silent 500 (default Next.js HTML error page) when generating a Dream Big
 * + Classic Landscape 11x8 Custom Spreads request for physical pages 22-23,
 * caused by `assertValidFacingPair` being given the interior-scene count
 * (22) instead of the total physical page count (24) as its upper bound.
 * See lib/story/layoutPlan.ts and lib/print/preflight.ts for the fix.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DREAM_BIG_CUSTOM_SPREAD_REQUEST = {
  name: "Shihab",
  age: "4",
  gender: "boy",
  bookId: "dream-big",
  profileId: "classic-landscape-11x8",
  mode: "custom-spreads",
  customSpreads: [{ startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" }],
};

const DREAM_BIG_STANDARD_SINGLE_REQUEST = {
  name: "Shihab",
  age: "4",
  gender: "boy",
  bookId: "dream-big",
  profileId: "classic-landscape-11x8",
  mode: "standard-single",
  customSpreads: [],
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/prompts", () => {
  it("Dream Big + Classic Landscape + Standard Single succeeds", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(postRequest(DREAM_BIG_STANDARD_SINGLE_REQUEST));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.pages.length).toBeGreaterThan(0);
    expect(typeof body.markdown).toBe("string");
    expect(body.markdown.length).toBeGreaterThan(0);
  });

  it("Dream Big + Classic Landscape + valid Pages 22-23 spread succeeds (the reproduced crash)", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(postRequest(DREAM_BIG_CUSTOM_SPREAD_REQUEST));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();

    expect(body.pages.length).toBeGreaterThan(0);
    expect(typeof body.markdown).toBe("string");
    expect(body.markdown.length).toBeGreaterThan(0);
    expect(typeof body.anchorPrompt).toBe("string");
    expect(body.anchorPrompt.length).toBeGreaterThan(0);
    expect(Array.isArray(body.resolvedSlots)).toBe(true);
    expect(body.resolvedSlots.length).toBeGreaterThan(0);

    const spreadSlot = body.resolvedSlots.find(
      (s: any) => Array.isArray(s.physicalPages) && s.physicalPages.includes(22) && s.physicalPages.includes(23),
    );
    expect(spreadSlot).toBeTruthy();
    expect(spreadSlot.profileId).toBe("classic-landscape-11x8");
    expect(spreadSlot.textSide).toBe("left");
    expect(spreadSlot.subjectSide).toBe("right");
    expect(spreadSlot.physicalPages).toEqual([22, 23]);
    expect(spreadSlot.destinationDimensions.width).toBeGreaterThan(spreadSlot.destinationDimensions.height);
  });

  it("11 selected spreads (all eligible pairs): 24 assets, 35 physical leaves, Closing at 34, Backcover at 35", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const elevenPairs = Array.from({ length: 11 }, (_, i) => ({
      startPage: 2 + i * 2,
      endPage: 3 + i * 2,
      textSide: "left",
      subjectSide: "right",
    }));
    const res = await POST(
      postRequest({ ...DREAM_BIG_CUSTOM_SPREAD_REQUEST, customSpreads: elevenPairs }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages.length).toBe(24);
    const spreads = body.pages.filter((p: any) => p.spread);
    const singles = body.pages.filter((p: any) => !p.spread);
    expect(spreads.length).toBe(11);
    expect(singles.length).toBe(13);
    const closing = body.pages.find((p: any) => p.kind === "closing");
    const backcover = body.pages.find((p: any) => p.kind === "backcover");
    expect(closing.physicalPages).toEqual([34]);
    expect(closing.filename).toBe("34-closing.png");
    expect(backcover.physicalPages).toEqual([35]);
    expect(backcover.filename).toBe("35-backcover.png");
    expect(body.markdown).toMatch(/produce \*\*35 physical PDF pages\*\*/);
  });

  it("standard-single with a leftover non-empty customSpreads array still succeeds (client may hold stale spread-selector state)", async () => {
    // Reproduces a real regression: ManualFlow.tsx's default customSpreads
    // state for dream-big is non-empty ([{22,23}]) even when the user is on
    // Standard Single mode, and it's sent on every request regardless of
    // mode. customSpreads is inert in that mode by design — the lint gate
    // must not compare it against the (spread-free) resolved output.
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(
      postRequest({ ...DREAM_BIG_STANDARD_SINGLE_REQUEST, customSpreads: DREAM_BIG_CUSTOM_SPREAD_REQUEST.customSpreads }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages.filter((p: any) => p.spread).length).toBe(0);
  });

  it("mode 'full-spread-24' is rejected with a clear EDITION_NOT_AVAILABLE code, not a 500", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(
      postRequest({ ...DREAM_BIG_STANDARD_SINGLE_REQUEST, mode: "full-spread-24" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("EDITION_NOT_AVAILABLE");
    expect(body.error).toMatch(/not available yet|editorial mapping|coming soon/i);
  });

  it("invalid profile (unparseable age) returns structured JSON 400", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(
      postRequest({ ...DREAM_BIG_STANDARD_SINGLE_REQUEST, name: "", age: "4" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_PROFILE");
    expect(typeof body.error).toBe("string");
    expect(typeof body.requestId).toBe("string");
  });

  it("invalid spread (odd start page) returns structured JSON 400 via Zod", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(
      postRequest({
        ...DREAM_BIG_CUSTOM_SPREAD_REQUEST,
        customSpreads: [{ startPage: 3, endPage: 4, textSide: "left", subjectSide: "right" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_CUSTOM_SPREADS");
    expect(body.error).toMatch(/facing pair/i);
    expect(typeof body.requestId).toBe("string");
  });

  it("invalid spread (out of range for the book edition) returns structured JSON 400 via layout validation", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(
      postRequest({
        ...DREAM_BIG_CUSTOM_SPREAD_REQUEST,
        customSpreads: [{ startPage: 40, endPage: 41, textSide: "left", subjectSide: "right" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_LAYOUT");
    expect(typeof body.requestId).toBe("string");
  });

  it("duplicate/overlapping spreads return structured JSON 400", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(
      postRequest({
        ...DREAM_BIG_CUSTOM_SPREAD_REQUEST,
        customSpreads: [
          { startPage: 2, endPage: 3, textSide: "left", subjectSide: "right" },
          { startPage: 2, endPage: 3, textSide: "right", subjectSide: "left" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_CUSTOM_SPREADS");
    expect(body.error).toMatch(/claimed by more than one spread/i);
  });

  it("malformed JSON body returns structured JSON 400, not the default HTML error page", async () => {
    const { POST } = await import("@/app/api/prompts/route");
    const req = new Request("http://localhost/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.code).toBe("INVALID_JSON_BODY");
  });

  it("an unexpected internal exception returns a sanitized JSON 500, never the default HTML error page", async () => {
    vi.resetModules();
    vi.doMock("@/lib/manual/manifest", async () => {
      const actual = await vi.importActual<typeof import("@/lib/manual/manifest")>(
        "@/lib/manual/manifest",
      );
      return {
        ...actual,
        buildManifest: () => {
          throw new TypeError("boom: unexpected shape at /secret/internal/path.ts");
        },
      };
    });
    try {
      const { POST } = await import("@/app/api/prompts/route");
      const res = await POST(postRequest(DREAM_BIG_STANDARD_SINGLE_REQUEST));
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body.code).toBe("PROMPTS_INTERNAL_ERROR");
      expect(typeof body.requestId).toBe("string");
      // Never leak the raw exception message, stack, or filesystem paths.
      expect(body.error).not.toMatch(/boom/);
      expect(body.error).not.toMatch(/secret|internal|\.ts/);
      expect(JSON.stringify(body)).not.toMatch(/at .*:\d+:\d+/); // no stack frames
    } finally {
      vi.doUnmock("@/lib/manual/manifest");
      vi.resetModules();
    }
  });
});

describe("POST /api/prompts — dependency isolation from paid/local-AI providers", () => {
  const ENHANCEMENT_ENV_VARS = [
    "REAL_ESRGAN_BIN",
    "REAL_ESRGAN_MODEL_DIR",
    "REAL_ESRGAN_MODEL",
    "REAL_ESRGAN_TIMEOUT_MS",
    "ENHANCEMENT_SIGNING_SECRET",
    "ENHANCEMENT_API_KEY",
    "ENHANCEMENT_API_URL",
    "ENHANCEMENT_PROVIDER",
    "ALLOW_TEST_MOCK_PROVIDERS",
    "GEMINI_API_KEY",
  ] as const;

  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {};
    for (const key of ENHANCEMENT_ENV_VARS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENHANCEMENT_ENV_VARS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it("still returns HTTP 200 with every enhancement/paid-provider env var absent", async () => {
    vi.resetModules(); // force a fresh import graph with the env vars cleared
    const { POST } = await import("@/app/api/prompts/route");
    const res = await POST(postRequest(DREAM_BIG_CUSTOM_SPREAD_REQUEST));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages.length).toBeGreaterThan(0);
    expect(body.markdown.length).toBeGreaterThan(0);
  });

  it("app/api/prompts/route.ts never imports lib/enhance/* (module import must not throw or reach provider code)", async () => {
    const routeSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../app/api/prompts/route.ts", import.meta.url), "utf8"),
    );
    expect(routeSource).not.toMatch(/from\s+["'][^"']*lib\/enhance/);
  });
});
