import { describe, expect, it } from "vitest";
import { buildIllustrationPrompt } from "./buildIllustrationPrompt";
import type { ChildProfile, CompanionSpec } from "../types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
const companion: CompanionSpec = {
  name: "Scout",
  description: "a small fluffy light-brown puppy",
  consistencyRules: "same floppy ears and fur on every page",
};

describe("buildIllustrationPrompt", () => {
  it("keeps the scene description prominent and verbatim", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Riding a bicycle down a rainbow hill.",
      layout: "single-page",
    });
    expect(prompt).toContain("Riding a bicycle down a rainbow hill.");
  });

  it("assembles blocks in identity -> continuity -> style -> composition -> scene -> negative order", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: { defaultOutfit: "a red cape", companion },
      scene: "UNIQUE_SCENE_MARKER",
      layout: "single-page",
    });
    const identityIdx = prompt.indexOf("IDENTITY FIRST");
    const wardrobeIdx = prompt.indexOf("WARDROBE CONTINUITY");
    const companionIdx = prompt.indexOf("COMPANION CONTINUITY");
    const compositionIdx = prompt.indexOf("COMPOSITION (single page)");
    const sceneIdx = prompt.indexOf("UNIQUE_SCENE_MARKER");
    const negativeIdx = prompt.indexOf("DO NOT:");

    expect(identityIdx).toBeGreaterThanOrEqual(0);
    expect(wardrobeIdx).toBeGreaterThan(identityIdx);
    expect(companionIdx).toBeGreaterThan(wardrobeIdx);
    expect(compositionIdx).toBeGreaterThan(companionIdx);
    expect(sceneIdx).toBeGreaterThan(compositionIdx);
    expect(negativeIdx).toBeGreaterThan(sceneIdx);
  });

  it("omits wardrobe/companion blocks entirely when a story has neither", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "A calm meadow.",
      layout: "single-page",
    });
    expect(prompt).not.toContain("WARDROBE CONTINUITY");
    expect(prompt).not.toContain("COMPANION CONTINUITY");
  });

  it("companionOverride: null suppresses the story's default companion for one page", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: { companion },
      scene: "A solo rest moment.",
      layout: "single-page",
      companionOverride: null,
    });
    expect(prompt).not.toContain("COMPANION CONTINUITY");
    expect(prompt).not.toContain("Scout");
  });

  it("outfitOverride replaces the story's defaultOutfit for one page", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: { defaultOutfit: "explorer khakis" },
      scene: "A snowy peak.",
      layout: "single-page",
      outfitOverride: "a warm winter coat",
    });
    expect(prompt).toContain("a warm winter coat");
    expect(prompt).not.toContain("explorer khakis");
  });

  it("uses the strong spread safety language for text-left-subject-right", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Flying home.",
      layout: "text-left-subject-right",
    });
    expect(prompt).toContain(
      "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE",
    );
    expect(prompt).toContain("CENTER GUTTER");
  });

  it("appends scene-specific composition notes after the scene", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Riding a whale.",
      layout: "text-left-subject-right",
      compositionNotes: "never crop the whale's rider",
    });
    const sceneIdx = prompt.indexOf("Riding a whale.");
    const notesIdx = prompt.indexOf("never crop the whale's rider");
    expect(notesIdx).toBeGreaterThan(sceneIdx);
  });

  it("includes the child's age and gender-agreeing noun", () => {
    const prompt = buildIllustrationPrompt({
      child: { name: "Zara", age: 6, gender: "girl" },
      story: {},
      scene: "Painting a mural.",
      layout: "single-page",
    });
    expect(prompt).toContain("6-year-old girl");
  });

  it("adds the lighting/camera clause only when light is provided", () => {
    const withLight = buildIllustrationPrompt({
      child,
      story: {},
      scene: "A sunny beach.",
      layout: "single-page",
      light: "Warm noon sun from above.",
    });
    const withoutLight = buildIllustrationPrompt({
      child,
      story: {},
      scene: "A sunny beach.",
      layout: "single-page",
    });
    expect(withLight).toContain("LIGHTING & CAMERA");
    expect(withoutLight).not.toContain("LIGHTING & CAMERA");
  });
});
