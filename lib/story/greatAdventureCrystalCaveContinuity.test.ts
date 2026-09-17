/**
 * Location-continuity lint for the crystal-cave sequence (crystal-cave ->
 * treasure-chest-reach -> chest-bursts-open -> star-friend): all four scenes
 * must stay inside the same cave. The draft PDF showed "star-friend"
 * silently switching to an outdoor forest path — this guards against that
 * regressing.
 */

import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };
const CAVE_SEQUENCE_SCENE_IDS = ["crystal-cave", "treasure-chest-reach", "chest-bursts-open", "star-friend"];
const FORBIDDEN_LOCATION_WORDS = ["forest", "outdoor", "outdoors", "trees", "daylight", "sunlight"];

function scenePrompt(sceneId: string): string {
  const manifest = buildManifest(child, "great-adventure", "classic-landscape-11x8", "standard-single", []);
  const entry = manifest.find((m) => m.resolvedSlot?.sceneId === sceneId);
  if (!entry) throw new Error(`no resolved scene "${sceneId}"`);
  return entry.prompt;
}

/** Just the scene description + lighting/composition portion of the prompt
 *  (excludes wardrobe text, which legitimately contains unrelated phrases
 *  like "dark outdoor shoes" that would otherwise false-positive a
 *  location-word check). */
function sceneAndLightingOnly(sceneId: string): string {
  const prompt = scenePrompt(sceneId);
  const start = prompt.indexOf(". ", prompt.indexOf("This is ")) + 2; // right after "This is X, a N-year-old boy. "
  const end = prompt.indexOf("WARDROBE CONTINUITY —");
  const scenePart = prompt.slice(start, end > start ? end : undefined);
  const lightStart = prompt.indexOf("LIGHTING & CAMERA —");
  const lightEnd = prompt.indexOf("DO NOT:", lightStart);
  const lightPart = lightStart >= 0 ? prompt.slice(lightStart, lightEnd > lightStart ? lightEnd : undefined) : "";
  return `${scenePart} ${lightPart}`.toLowerCase();
}

describe("Great Adventure — crystal-cave location continuity", () => {
  for (const sceneId of CAVE_SEQUENCE_SCENE_IDS) {
    it(`"${sceneId}" requires "crystal cave" / "cave" and forbids forest/outdoor/trees`, () => {
      const prompt = sceneAndLightingOnly(sceneId);
      expect(prompt, `${sceneId} should mention the cave`).toMatch(/\bcave\b/);
      for (const forbidden of FORBIDDEN_LOCATION_WORDS) {
        expect(prompt, `${sceneId} should not mention "${forbidden}"`).not.toContain(forbidden);
      }
    });
  }

  it('"star-friend" explicitly requires the open treasure chest and forbids relocating to a path/forest', () => {
    const prompt = sceneAndLightingOnly("star-friend");
    expect(prompt).toContain("treasure chest");
    expect(prompt).not.toContain("path");
    expect(prompt).not.toContain("fireflies");
  });
});
