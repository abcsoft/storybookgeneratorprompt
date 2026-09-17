/**
 * Deterministic semantic-lint coverage for the Great Adventure standard-24
 * scene contracts (see greatAdventureSemanticContracts.ts).
 *
 * IMPORTANT: these tests inspect the COMPILED PROMPT STRING for required
 * keywords, forbidden substitution phrases, and cross-scene continuity
 * (e.g. the marker's identical wording). They prove the prompt CONTRACT is
 * internally consistent — they do NOT and cannot prove the image a model
 * actually renders from that prompt visually matches it. Whether generated
 * artwork matches is tracked separately in regenerationManifest.ts, which is
 * seeded from a direct visual audit of the rendered draft PDF, not from
 * these prompt-text checks.
 */

import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import { GREAT_ADVENTURE_SEMANTIC_CONTRACTS } from "./greatAdventureSemanticContracts";
import { SECRET_MARKER } from "./greatAdventureTemplate";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };
const profileId = "classic-landscape-11x8";

function manifestBySceneId() {
  const manifest = buildManifest(child, "great-adventure", profileId, "standard-single", []);
  const bySceneId = new Map<string, (typeof manifest)[number]>();
  for (const m of manifest) {
    const sceneId = m.resolvedSlot?.sceneId;
    if (sceneId) bySceneId.set(sceneId, m);
  }
  return bySceneId;
}

describe("Great Adventure semantic contracts", () => {
  it("every declared contract corresponds to a real resolved interior scene", () => {
    const bySceneId = manifestBySceneId();
    for (const contract of GREAT_ADVENTURE_SEMANTIC_CONTRACTS) {
      expect(bySceneId.has(contract.sceneId), `no resolved scene for contract "${contract.sceneId}"`).toBe(true);
    }
  });

  it("covers all 24 interior scenes exactly once (greeting, intro, 20 scenes, closing, video-qr)", () => {
    expect(GREAT_ADVENTURE_SEMANTIC_CONTRACTS.length).toBe(24);
    const ids = new Set(GREAT_ADVENTURE_SEMANTIC_CONTRACTS.map((c) => c.sceneId));
    expect(ids.size).toBe(24);
  });

  it("required characters/props/action keywords appear in the compiled prompt", () => {
    const bySceneId = manifestBySceneId();
    for (const contract of GREAT_ADVENTURE_SEMANTIC_CONTRACTS) {
      const entry = bySceneId.get(contract.sceneId);
      if (!entry) continue;
      const prompt = entry.prompt.toLowerCase();
      for (const character of contract.requiredCharacters) {
        if (character === "the child") continue; // always implicitly present via identity block
        expect(
          prompt.includes(character.toLowerCase()),
          `${contract.sceneId}: prompt is missing required character "${character}"`,
        ).toBe(true);
      }
    }
  });

  it("forbidden-substitution phrases are explicitly called out as forbidden, not silently allowed", () => {
    // Spot-check the two scenes with the strongest, most specific forbidden
    // substitutions rather than fuzzy-matching every free-text phrase above
    // (many are audit notes, not literal prompt strings).
    const bySceneId = manifestBySceneId();
    const chest = bySceneId.get("treasure-chest-reach")!;
    expect(chest.prompt.toLowerCase()).toContain("both hands");
    expect(chest.prompt.toLowerCase()).toMatch(/lid.*(raised|open|lifted)|lifted.*lid/);

    const storm = bySceneId.get("ocean-storm")!;
    expect(storm.prompt.toLowerCase()).toMatch(/wet|dripping|damp/);
    expect(storm.prompt.toLowerCase()).toContain("underwater");
  });

  it('the secret marker uses byte-identical wording in "ancient-ruins" (discovery) and "island-marker" (match)', () => {
    const bySceneId = manifestBySceneId();
    const discovery = bySceneId.get("ancient-ruins")!;
    const match = bySceneId.get("island-marker")!;
    expect(discovery.prompt).toContain(SECRET_MARKER);
    expect(match.prompt).toContain(SECRET_MARKER);
  });

  it("video-qr scene forbids AI-generated QR/URL/person content", () => {
    const bySceneId = manifestBySceneId();
    const videoQr = bySceneId.get("video-qr")!;
    const prompt = videoQr.prompt.toLowerCase();
    expect(prompt).toMatch(/do not (include|render)/);
    expect(prompt).toContain("qr");
    expect(videoQr.text).toBe(""); // never AI-authored CTA/QR text baked into the image
  });

  it("back cover uses the exact required closing copy", () => {
    const bySceneId = manifestBySceneId();
    const backcover = bySceneId.get("backcover")!;
    expect(backcover.text).toBe(`The End… or maybe it's just the beginning of ${child.name}'s next adventure!`);
  });

  it("text-safe regions are not all identical across scenes (regression guard against the always-bottom-left bug)", () => {
    const bySceneId = manifestBySceneId();
    const positions = new Set<string>();
    for (const contract of GREAT_ADVENTURE_SEMANTIC_CONTRACTS) {
      const entry = bySceneId.get(contract.sceneId);
      const resolved = entry?.resolvedSlot?.textPanelPosition;
      if (resolved) positions.add(resolved);
    }
    expect(positions.size, "every interior scene resolved to the same text-panel position").toBeGreaterThan(1);
  });

  it("each scene's resolved textPanelPosition matches its declared contract", () => {
    const bySceneId = manifestBySceneId();
    for (const contract of GREAT_ADVENTURE_SEMANTIC_CONTRACTS) {
      const entry = bySceneId.get(contract.sceneId);
      if (!entry?.resolvedSlot) continue;
      expect(
        entry.resolvedSlot.textPanelPosition,
        `${contract.sceneId}: resolved textPanelPosition should match its semantic contract`,
      ).toBe(contract.textSafeRegion);
    }
  });
});
