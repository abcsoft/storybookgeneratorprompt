import { describe, expect, it } from "vitest";
import { styleRules } from "./styleRules";
import { buildIllustrationPrompt } from "./buildIllustrationPrompt";
import { buildManifest } from "../../manual/manifest";
import type { ChildProfile } from "../types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("FIX PART 3: Print-Profile Aware Gemini Prompts", () => {
  // Test 1: Global style contains no hardcoded universal orientation
  it("1. Global styleRules contains no hardcoded wide landscape or square orientation", () => {
    const style = styleRules();
    expect(style.toLowerCase()).not.toContain("wide landscape composition");
    expect(style.toLowerCase()).not.toContain("square composition");
    expect(style.toLowerCase()).not.toContain("21:9");
    expect(style.toLowerCase()).not.toContain("3:2");
    expect(style).toContain("Composition that leaves some calm");
  });

  // Test 2: Printify single page prompt (square 1:1)
  it("2. Printify single page prompt contains Square 1:1 composition and does NOT contain wide landscape", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Flying a kite in a grassy meadow.",
      layout: "single-page",
      profileId: "printify-hardcover-square-8x8",
    });

    expect(prompt).toContain("TARGET ARTWORK FORMAT — 1:1 single page (2400×2400 px target");
    expect(prompt).not.toContain("wide landscape");
    expect(prompt).not.toContain("2:1 / 21:9");
    expect(prompt).toContain("10% safety margin");
  });

  // Test 3: Printify spread prompt (continuous panoramic spread contract)
  it("3. Printify spread prompt contains 2:1 continuous panoramic spread and gutter instructions without seam/split", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Floating in outer space among stars and planets.",
      layout: "text-left-subject-right",
      profileId: "printify-hardcover-square-8x8",
    });

    expect(prompt).toContain("TARGET ARTWORK FORMAT — 2:1 continuous panoramic spread (4800×2400 px target");
    expect(prompt).toContain("uninterrupted panoramic scene across one wide canvas");
    expect(prompt).toContain("This is not a diptych, split-screen");
    expect(prompt).toContain("central gutter-safe zone");
    expect(prompt).not.toContain("2:1 / 21:9");
  });

  // Test 4: Lulu square prompt (square 1:1)
  it("4. Lulu square prompt contains Square 1:1 single page", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Reading a book in a cozy armchair.",
      layout: "single-page",
      profileId: "lulu-square-8.5x8.5",
    });

    expect(prompt).toContain("TARGET ARTWORK FORMAT — 1:1 single page");
    expect(prompt).not.toContain("2:1 / 21:9");
  });

  // Test 5: Lulu landscape prompt (landscape)
  it("5. Lulu landscape prompt contains Landscape composition", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Driving a train down a scenic track.",
      layout: "single-page",
      profileId: "lulu-landscape-11x8.5",
    });

    expect(prompt).toContain("TARGET ARTWORK FORMAT — 4:3 single page");
    expect(prompt).not.toContain("2:1 / 21:9");
  });


  // Test 6: Dream Big uses centralized prompt engine
  it("6. Dream Big manifest entries use centralized prompt builder with profile geometry and no contradictory aspects", () => {
    const squareManifest = buildManifest(child, "dream-big", "printify-hardcover-square-8x8");
    const landscapeManifest = buildManifest(child, "dream-big", "lulu-landscape-11x8.5");

    expect(squareManifest[0].prompt).toContain("Square 1:1 composition for the front cover.");
    expect(landscapeManifest[0].prompt).toContain("Landscape composition for the front cover.");
    for (const m of squareManifest) {
      expect(m.prompt).not.toContain("2:1 / 21:9");
    }
    for (const m of landscapeManifest) {
      expect(m.prompt).not.toContain("2:1 / 21:9");
    }
  });


  // Test 7: Same scene prompt changes when profile changes
  it("7. Same scene prompt differs between Printify Square and Lulu Landscape profiles", () => {
    const squarePrompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Building a sandcastle on a sunny beach.",
      layout: "single-page",
      profileId: "printify-hardcover-square-8x8",
    });

    const landscapePrompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Building a sandcastle on a sunny beach.",
      layout: "single-page",
      profileId: "lulu-landscape-11x8.5",
    });

    expect(squarePrompt).not.toEqual(landscapePrompt);
  });
});
