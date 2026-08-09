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

    expect(prompt).toContain("TARGET ARTWORK FORMAT — Square 1:1 composition.");
    expect(prompt).not.toContain("wide landscape");
    expect(prompt).toContain("Keep approximately 8-10% visual safety from outside edges.");
  });

  // Test 3: Printify spread prompt (2:1 master spread + gutter)
  it("3. Printify spread prompt contains 2:1 master spread and gutter instructions", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Floating in outer space among stars and planets.",
      layout: "text-left-subject-right",
      profileId: "printify-hardcover-square-8x8",
    });

    expect(prompt).toContain("TARGET ARTWORK FORMAT — Wide approximately 2:1 master spread.");
    expect(prompt).toContain("divided vertically into two square facing pages");
    expect(prompt).toContain("CENTER GUTTER");
  });

  // Test 4: Lulu square prompt (square 1:1)
  it("4. Lulu square prompt contains Square 1:1 composition", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Reading a book in a cozy armchair.",
      layout: "single-page",
      profileId: "lulu-square-8.5x8.5",
    });

    expect(prompt).toContain("TARGET ARTWORK FORMAT — Square 1:1 composition.");
    expect(prompt).not.toContain("Landscape composition appropriate");
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

    expect(prompt).toContain("TARGET ARTWORK FORMAT — Landscape composition appropriate for the selected Lulu landscape page geometry.");
  });

  // Test 6: Dream Big uses centralized prompt engine
  it("6. Dream Big manifest entries use centralized prompt builder with profile geometry", () => {
    const squareManifest = buildManifest(child, "dream-big", "printify-hardcover-square-8x8");
    const landscapeManifest = buildManifest(child, "dream-big", "lulu-landscape-11x8.5");

    expect(squareManifest[0].prompt).toContain("Square 1:1 composition for the front cover.");
    expect(landscapeManifest[0].prompt).toContain("Landscape composition for the front cover.");
    expect(squareManifest[1].prompt).toContain("Wide approximately 2:1 master spread.");
    expect(landscapeManifest[1].prompt).toContain("Wide approximately 2:1 / 21:9 master spread composition.");
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
