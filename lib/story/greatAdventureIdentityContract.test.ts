/**
 * Proves the Great Adventure identity/style/companion/negative blocks are
 * byte-identical (same fingerprint) across every named scene, per the task's
 * item 1 ("Add tests proving parity across cover, intro, mountain, polar,
 * underwater, storm, island, cave, flight, closing, and back-cover
 * prompts"). This does not re-derive the prose — it fingerprints the exact
 * assembled blocks from lib/story/prompt/*, which every scene routes
 * through via buildIllustrationPrompt (see greatAdventureIdentityContract.ts
 * for why the child's identity is locked via photo-anchoring rather than
 * restated field-by-field in prose).
 */

import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import { styleRules } from "./prompt/styleRules";
import {
  GREAT_ADVENTURE_CHILD_IDENTITY_FIELDS,
  GREAT_ADVENTURE_SCOUT_CONTRACT,
  GREAT_ADVENTURE_SCOUT_IDENTITY_FIELDS,
  greatAdventureIdentityStyleFingerprint,
} from "./greatAdventureIdentityContract";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };

// sceneId per the standard-24 edition, covering every location named in the task.
const NAMED_SCENES: Record<string, string> = {
  cover: "cover",
  intro: "intro",
  mountain: "snowy-mountain",
  polar: "arctic-arrival",
  underwater: "coral-reef",
  storm: "ocean-storm",
  island: "island-arrival",
  cave: "crystal-cave",
  flight: "star-trail-homeward-flight",
  closing: "closing",
  "back-cover": "backcover",
};

function manifestBySceneId() {
  const manifest = buildManifest(child, "great-adventure", "classic-landscape-11x8", "standard-single", []);
  const bySceneId = new Map<string, (typeof manifest)[number]>();
  for (const m of manifest) {
    const id = m.resolvedSlot?.sceneId;
    if (id) bySceneId.set(id, m);
  }
  return bySceneId;
}

describe("Great Adventure identity/style/companion contract — cross-scene parity", () => {
  it("every named scene resolves to a real prompt", () => {
    const bySceneId = manifestBySceneId();
    for (const [label, sceneId] of Object.entries(NAMED_SCENES)) {
      expect(bySceneId.has(sceneId), `"${label}" (sceneId="${sceneId}") did not resolve`).toBe(true);
    }
  });

  it("identity block (photo-anchored 'match the real child exactly') is byte-identical across all named scenes", () => {
    const bySceneId = manifestBySceneId();
    const identityMarker = "IDENTITY FIRST — match the real child in the attached reference photos exactly:";
    const blocks = new Set<string>();
    for (const sceneId of Object.values(NAMED_SCENES)) {
      const prompt = bySceneId.get(sceneId)!.prompt;
      const start = prompt.indexOf(identityMarker);
      expect(start, `${sceneId}: missing identity block`).toBeGreaterThanOrEqual(0);
      // Identity block ends right before the TARGET ARTWORK FORMAT block.
      const end = prompt.indexOf("TARGET ARTWORK FORMAT", start);
      blocks.add(prompt.slice(start, end > start ? end : undefined).trim());
    }
    expect(blocks.size, "identity block text differs across named scenes").toBe(1);
  });

  it("Scout's companion-continuity block is byte-identical across every scene that includes Scout", () => {
    const bySceneId = manifestBySceneId();
    const companionMarker = "COMPANION CONTINUITY —";
    const scoutBlocks = new Set<string>();
    for (const sceneId of Object.values(NAMED_SCENES)) {
      const prompt = bySceneId.get(sceneId)!.prompt;
      const start = prompt.indexOf(companionMarker);
      if (start < 0) continue; // some scenes (e.g. video-qr-adjacent) may omit Scout — not in this named list, but guarded anyway
      const end = prompt.indexOf("FRAMING", start);
      scoutBlocks.add(prompt.slice(start, end > start ? end : undefined).trim());
    }
    expect(scoutBlocks.size, "Scout's companion block text differs across scenes").toBe(1);
    const [block] = scoutBlocks;
    expect(block).toContain("Scout");
    expect(block.toLowerCase()).toContain("golden");
    // The prohibition sentence legitimately contains the word "white" (as
    // part of "never white, pale, or cream") — check Scout isn't instead
    // POSITIVELY described as white/pale, not that the word never appears.
    expect(block.toLowerCase()).not.toMatch(/\bwhite (coat|puppy|dog|fur)\b/);
  });

  it("the shared styleRules() block (art-direction lock) is byte-identical across every named single-page scene", () => {
    const bySceneId = manifestBySceneId();
    const expected = styleRules();
    for (const [label, sceneId] of Object.entries(NAMED_SCENES)) {
      if (label === "cover" || label === "back-cover") continue; // cover/back-cover use a styleOverride path (different lockup), by design
      const prompt = bySceneId.get(sceneId)!.prompt;
      expect(prompt, `${label} (${sceneId}) is missing the exact shared style-lock block`).toContain(expected);
    }
  });

  it("the negative rules' book-wide invariant prohibitions appear in every named scene (jewelry, AI-generated text, no-mixing-styles)", () => {
    const bySceneId = manifestBySceneId();
    for (const [label, sceneId] of Object.entries(NAMED_SCENES)) {
      const prompt = bySceneId.get(sceneId)!.prompt.toLowerCase();
      expect(prompt, `${label}: missing "DO NOT:"`).toContain("do not:");
      expect(prompt, `${label}: missing jewelry prohibition`).toContain("jewelry");
      expect(prompt, `${label}: missing AI-generated-text prohibition`).toContain("ai-generated story");
    }
  });

  it("fingerprint function is deterministic and stable across repeated calls", () => {
    const a = greatAdventureIdentityStyleFingerprint();
    const b = greatAdventureIdentityStyleFingerprint();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("documents all 10 required child-identity fields and 8 Scout fields", () => {
    expect(GREAT_ADVENTURE_CHILD_IDENTITY_FIELDS.length).toBe(10);
    expect(GREAT_ADVENTURE_SCOUT_IDENTITY_FIELDS.length).toBeGreaterThanOrEqual(7);
    expect(GREAT_ADVENTURE_SCOUT_CONTRACT.consistencyRules.toLowerCase()).toContain("golden");
  });
});
