/**
 * Editorial-integrity regression coverage for the standard-24 content
 * expansion (10-beat stories split into 20 sequential scenes, Great
 * Adventure's +3 new scenes, The Great Detective's intro-extraction/merge).
 *
 * These are content-authoring invariants, not layout-geometry ones:
 * - A companion never appears in a scene's prompt before its own narrative
 *   first-appearance scene (no premature reveal introduced by a split).
 * - No two narrative scenes in the same story share byte-identical prompt
 *   text or page copy (guards against an accidental literal-duplication
 *   paste when splitting a beat into two halves).
 * - The Great Detective's merged/extracted scenes still narrate the case in
 *   a sensible order: intro before the search, the search before the
 *   footprint deduction, the footprint deduction before the case closes.
 */

import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Rowan", age: 6, gender: "neutral" };
const profileId = "classic-landscape-11x8";

const COMPANION_STORIES: { bookId: string; companionName: string }[] = [
  { bookId: "kindness-garden", companionName: "Pip" },
  { bookId: "dinosaur-discovery", companionName: "Sprout" },
  { bookId: "space-explorer", companionName: "Orbit" },
  { bookId: "rainbow-kingdom", companionName: "Luma" },
  { bookId: "underwater-kingdom", companionName: "Coral" },
  { bookId: "bedtime-dream", companionName: "Twinkle" },
  { bookId: "great-adventure", companionName: "Scout" },
];

const ALL_BOOK_IDS = [
  "dream-big",
  "great-adventure",
  "the-great-detective",
  "kindness-garden",
  "dinosaur-discovery",
  "space-explorer",
  "rainbow-kingdom",
  "safari-friendship",
  "underwater-kingdom",
  "bedtime-dream",
];

describe("Companion introduction timing (no premature reveal)", () => {
  for (const { bookId, companionName } of COMPANION_STORIES) {
    it(`${bookId}: ${companionName} never appears in a scene prompt before ${companionName}'s own first narrative appearance`, () => {
      const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
      const scenes = manifest.filter((m) => m.kind === "scene");
      expect(scenes.length).toBe(20);

      const firstAppearanceIndex = scenes.findIndex((m) => m.prompt.includes(companionName));
      expect(firstAppearanceIndex, `${companionName} should appear in at least one scene`).toBeGreaterThanOrEqual(0);

      for (let i = 0; i < firstAppearanceIndex; i++) {
        expect(
          scenes[i].prompt.includes(companionName),
          `${bookId} scene #${i + 1} (${scenes[i].filename}) mentions ${companionName} before ` +
            `${companionName}'s real first appearance at scene #${firstAppearanceIndex + 1} (${scenes[firstAppearanceIndex].filename})`,
        ).toBe(false);
      }
    });
  }
});

describe("No accidental literal-duplication across split scenes", () => {
  for (const bookId of ALL_BOOK_IDS) {
    it(`${bookId}: every narrative scene has a distinct prompt and distinct page copy`, () => {
      const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
      const scenes = manifest.filter((m) => m.kind === "scene");
      expect(scenes.length).toBe(20);

      const promptSeen = new Map<string, string>();
      const textSeen = new Map<string, string>();
      for (const m of scenes) {
        const priorPrompt = promptSeen.get(m.prompt);
        expect(priorPrompt, `${m.filename} has an identical prompt to ${priorPrompt} — likely a duplication bug from splitting a beat`).toBeUndefined();
        promptSeen.set(m.prompt, m.filename);

        const priorText = textSeen.get(m.text);
        expect(priorText, `${m.filename} has identical page copy to ${priorText} — likely a duplication bug from splitting a beat`).toBeUndefined();
        textSeen.set(m.text, m.filename);
      }
    });
  }
});

describe("The Great Detective: merged/extracted scenes narrate the case in order", () => {
  it("intro precedes the search scenes, which precede the footprint deduction, which precedes closing", () => {
    const manifest = buildManifest(child, "the-great-detective", profileId, "standard-single", []);
    const bySceneId = new Map(manifest.map((m) => [m.resolvedSlot?.sceneId, m]));

    const intro = bySceneId.get("intro");
    const search = bySceneId.get("search-playground") ?? manifest.find((m) => m.resolvedSlot?.sceneId?.startsWith("search"));
    const footprint = bySceneId.get("footprint-discovery") ?? manifest.find((m) => m.resolvedSlot?.sceneId?.startsWith("footprint"));
    const closing = bySceneId.get("case-closed") ?? manifest.find((m) => m.kind === "closing");

    expect(intro, "intro scene should exist").toBeDefined();
    expect(closing, "closing scene should exist").toBeDefined();

    const introPage = intro!.physicalPages![0];
    const closingPage = closing!.physicalPages![0];
    expect(introPage).toBeLessThan(closingPage);

    if (search) {
      expect(introPage).toBeLessThan(search.physicalPages![0]);
      expect(search.physicalPages![0]).toBeLessThan(closingPage);
    }
    if (footprint) {
      expect(introPage).toBeLessThan(footprint.physicalPages![0]);
      expect(footprint.physicalPages![0]).toBeLessThan(closingPage);
    }
    if (search && footprint) {
      expect(search.physicalPages![0]).toBeLessThan(footprint.physicalPages![0]);
    }
  });
});
