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

  it("submits resolved spread prompt and 21:9 preset for Starlit Dream constellation scene in Custom Spreads", async () => {
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    const plan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads: [{ startPage: 10, endPage: 11, textSide: "left" }],
    });

    const constellationSlot = plan.assets.find((a) => a.assetKind === "spread");
    expect(constellationSlot).toBeDefined();

    await generateBook(child, [], {
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads: [{ startPage: 10, endPage: 11, textSide: "left" }],
      generate: fakeGenerate,
      anchor: false,
    });

    const spreadCall = fakeCalls.find((c) => c.prompt === constellationSlot!.prompt);
    expect(spreadCall).toBeDefined();
    expect(spreadCall!.aspect).toBe("21:9");
    expect(spreadCall!.prompt).toContain("COMPOSITION (two-page continuous spread)");
    expect(spreadCall!.prompt).toContain("6675×2475 px");
  });

  it("submits single-page prompt and 4:3 preset when Starlit Dream closing resolves as single (never spread)", async () => {
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    const plan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads: [{ startPage: 4, endPage: 5, textSide: "left" }],
    });

    const closingSlot = plan.assets.find((a) => a.pageKind === "closing");
    expect(closingSlot).toBeDefined();
    expect(closingSlot!.assetKind).toBe("single-page");

    await generateBook(child, [], {
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads: [{ startPage: 4, endPage: 5, textSide: "left" }],
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

  it("submits resolved spread prompt and 21:9 preset for Great Adventure flying-home spread", async () => {
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

    const flyingHomeSlot = plan.assets.find((a) => a.sourceSceneIndex === 18 && a.assetKind === "spread");
    expect(flyingHomeSlot).toBeDefined();

    await generateBook(child, [], {
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      useEditorialDefault: true,
      generate: fakeGenerate,
      anchor: false,
    });

    const flyingHomeCall = fakeCalls.find((c) => c.prompt === flyingHomeSlot!.prompt);
    expect(flyingHomeCall).toBeDefined();
    expect(flyingHomeCall!.aspect).toBe(flyingHomeSlot!.providerPresetAspect);
    expect(flyingHomeCall!.prompt).toContain("COMPOSITION (two-page continuous spread)");
  });

  it("makes zero provider calls when a plan is invalid for the selected profile", async () => {
    const fakeCalls: Array<{ prompt: string; aspect: string }> = [];
    const fakeGenerate = async (prompt: string, _refs: ReferencePhoto[], aspect?: string) => {
      fakeCalls.push({ prompt, aspect: aspect ?? "" });
      return { data: await makeTinyPngBuffer(), mimeType: "image/png" };
    };

    // Great Adventure on Printify Square in standard-single mode resolves to 19 interior pages,
    // which violates Printify's strict 24-page hardcover requirement.
    const plan = resolveLayoutPlan({
      child,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      mode: "standard-single",
    });
    expect(plan.isValidForProfile).toBe(false);

    await expect(
      generateBook(child, [], {
        bookId: "great-adventure",
        profileId: "printify-hardcover-square-8x8",
        mode: "standard-single",
        generate: fakeGenerate,
        anchor: false,
      }),
    ).rejects.toThrow("Layout plan is invalid for profile");

    // Strictly zero calls reached the provider
    expect(fakeCalls.length).toBe(0);
  });
});
