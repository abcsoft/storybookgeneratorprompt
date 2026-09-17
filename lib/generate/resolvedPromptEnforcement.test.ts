import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { generateBook } from "./orchestrator";
import { resolveLayoutPlan } from "../story/layoutPlan";
import type { ChildProfile, ReferencePhoto } from "../story/types";

const child: ChildProfile = { name: "Leo", age: 5, gender: "boy" };

async function makeTinyPngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe("Resolved-Prompt-Only Enforcement at API & Provider Boundary", () => {
  it("submits only resolved slot prompt and 4:3 preset for Starlit Dream intro in Standard Single", async () => {
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    const plan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const introSlot = plan.assets.find((a) => a.pageKind === "intro");
    expect(introSlot).toBeDefined();

    await generateBook(child, [], {
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      generate: fakeGenerate,
      anchor: false,
    });

    const introCall = fakeCalls.find((c) => c.prompt === introSlot!.prompt);
    expect(introCall).toBeDefined();
    expect(introCall!.aspect).toBe(introSlot!.providerPresetAspect); // "4:3"
    expect(introCall!.prompt).toContain("COMPOSITION (single page)");
    expect(introCall!.prompt).not.toContain("COMPOSITION (two-page continuous spread)");
    expect(introCall!.prompt).not.toContain("6675×2475");
  });

  it("Custom Spreads is rejected outright for Starlit Dream — no approved spread pairs on its standard-24 edition", async () => {
    // Bedtime Dream ("Starlit Dream") now resolves through its registered
    // standard-24 StoryEdition, which declares no approvedSpreadPairs, so
    // there's no longer a live "constellation spread" resolution path — the
    // request must fail closed rather than submitting a hand-built spread
    // prompt. generateBook() must propagate the same rejection and make zero
    // provider calls.
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "bedtime-dream",
        profileId: "classic-landscape-11x8",
        mode: "custom-spreads",
        customSpreads: [{ startPage: 10, endPage: 11, textSide: "left" }],
      }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");

    await expect(
      generateBook(child, [], {
        bookId: "bedtime-dream",
        profileId: "classic-landscape-11x8",
        mode: "custom-spreads",
        customSpreads: [{ startPage: 10, endPage: 11, textSide: "left" }],
        generate: fakeGenerate,
        anchor: false,
      }),
    ).rejects.toThrow("Custom spreads require an approved fixed-24 editorial mapping.");
    expect(fakeCalls.length).toBe(0);
  });

  it("submits single-page prompt and 4:3 preset when Starlit Dream closing resolves as single (never spread)", async () => {
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    // Standard-single (Bedtime Dream's only valid resolution now, since its
    // standard-24 edition has no approvedSpreadPairs): closing is always a
    // single interior page.
    const plan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const closingSlot = plan.assets.find((a) => a.pageKind === "closing");
    expect(closingSlot).toBeDefined();
    expect(closingSlot!.assetKind).toBe("single-page");

    await generateBook(child, [], {
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      generate: fakeGenerate,
      anchor: false,
    });

    const closingCall = fakeCalls.find((c) => c.prompt === closingSlot!.prompt);
    expect(closingCall).toBeDefined();
    expect(closingCall!.aspect).toBe("4:3");
    expect(closingCall!.prompt).toContain("COMPOSITION (single page)");
    expect(closingCall!.prompt).not.toContain("COMPOSITION (two-page continuous spread)");
    expect(closingCall!.prompt).not.toContain("6675×2475");
    expect(closingCall!.prompt).not.toContain("89:33");
  });

  it("Great Adventure's standard-24 edition takes priority over the legacy flying-home spread edition even with useEditorialDefault — every page resolves single, and generateBook submits each resolved prompt", async () => {
    // Great Adventure's registered standard-24 StoryEdition takes priority
    // over the legacy great-adventure-printify-24 PrintEdition (which had a
    // flying-home spread) for every profile, regardless of
    // useEditorialDefault — that option is now silently inert for any story
    // with a standard-24 edition (i.e. all 10 registered stories).
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    const plan = resolveLayoutPlan({
      child,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      useEditorialDefault: true,
    });

    expect(plan.assets.some((a) => a.assetKind === "spread")).toBe(false);
    const homewardFlightSlot = plan.assets.find((a) => a.sceneId === "star-trail-homeward-flight");
    expect(homewardFlightSlot).toBeDefined();
    expect(homewardFlightSlot!.assetKind).toBe("single-page");

    await generateBook(child, [], {
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      useEditorialDefault: true,
      generate: fakeGenerate,
      anchor: false,
    });

    const homewardFlightCall = fakeCalls.find((c) => c.prompt === homewardFlightSlot!.prompt);
    expect(homewardFlightCall).toBeDefined();
    expect(homewardFlightCall!.aspect).toBe(homewardFlightSlot!.providerPresetAspect);
    expect(homewardFlightCall!.prompt).toContain("COMPOSITION (single page)");
    expect(homewardFlightCall!.prompt).not.toContain("COMPOSITION (two-page continuous spread)");
  });

  it("makes zero provider calls when a plan is genuinely invalid (mode 'full-spread-24', which is not available for any story yet)", async () => {
    // Every one of the 10 registered stories now has a standard-24 edition,
    // so resolveLayoutPlan() always resolves validly (isValidForProfile:
    // true) for standard-single/custom-spreads requests — a genuinely
    // invalid plan is no longer reachable that way (see
    // lib/story/pipelineAuditRegression.test.ts's "Dream Big on Printify
    // 24-page hardcover is valid because an editorial edition exists").
    // "full-spread-24" is still genuinely rejected for every story, though —
    // it requires an approved editorial mapping that doesn't exist yet.
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "great-adventure",
        profileId: "printify-hardcover-square-8x8",
        mode: "full-spread-24",
      }),
    ).toThrow("Full Spread 24-Page Edition is not available yet");

    await expect(
      generateBook(child, [], {
        bookId: "great-adventure",
        profileId: "printify-hardcover-square-8x8",
        mode: "full-spread-24",
        generate: fakeGenerate,
        anchor: false,
      }),
    ).rejects.toThrow("Full Spread 24-Page Edition is not available yet");

    // Strictly zero calls reached the provider
    expect(fakeCalls.length).toBe(0);
  });
});
