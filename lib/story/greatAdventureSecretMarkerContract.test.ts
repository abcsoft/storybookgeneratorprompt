import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import { GREAT_ADVENTURE_SECRET_MARKER_CONTRACT, secretMarkerFingerprint, secretMarkerPromptFragment } from "./greatAdventureSecretMarkerContract";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };

function scenePrompt(sceneId: string): string {
  const manifest = buildManifest(child, "great-adventure", "classic-landscape-11x8", "standard-single", []);
  const entry = manifest.find((m) => m.resolvedSlot?.sceneId === sceneId);
  if (!entry) throw new Error(`no resolved scene "${sceneId}"`);
  return entry.prompt;
}

describe("Great Adventure secret-marker contract — cross-scene parity", () => {
  it("both scenes embed the exact same fingerprint (contract id)", () => {
    const discovery = scenePrompt("ancient-ruins");
    const match = scenePrompt("island-marker");
    const fingerprint = secretMarkerFingerprint();
    // The fingerprint itself never appears in the prompt text (by design —
    // see secretMarkerFingerprint's docstring), so this test derives each
    // scene's marker fragment independently and compares them directly,
    // which is the real regression guard: two assembled prompts built from
    // DIFFERENT contract objects would produce different prose here even if
    // both happened to have the same id.
    expect(discovery).toContain(secretMarkerPromptFragment());
    expect(match).toContain(secretMarkerPromptFragment());
    expect(fingerprint).toBe(GREAT_ADVENTURE_SECRET_MARKER_CONTRACT.id);
  });

  it("fails if the two scenes were built from contracts with different ids (simulated drift)", () => {
    const discoveryFragment = secretMarkerPromptFragment({ ...GREAT_ADVENTURE_SECRET_MARKER_CONTRACT });
    const driftedFragment = secretMarkerPromptFragment({
      ...GREAT_ADVENTURE_SECRET_MARKER_CONTRACT,
      id: "some-other-marker-v2",
      geometricDescription: "a spiral rune",
    });
    expect(discoveryFragment).not.toBe(driftedFragment);
  });

  it("neither scene's prompt substitutes a forbidden alternate symbol description", () => {
    const discovery = scenePrompt("ancient-ruins").toLowerCase();
    const match = scenePrompt("island-marker").toLowerCase();
    for (const forbidden of ["ankh", "rune", "spiral"]) {
      expect(discovery).not.toContain(forbidden);
      expect(match).not.toContain(forbidden);
    }
  });

  it("the contract forbids letters/numbers/runes/alternate glyphs explicitly", () => {
    expect(GREAT_ADVENTURE_SECRET_MARKER_CONTRACT.forbiddenSubstitutions.length).toBeGreaterThan(0);
    expect(GREAT_ADVENTURE_SECRET_MARKER_CONTRACT.forbiddenSubstitutions.join(" ")).toMatch(/letters|numbers/i);
    expect(GREAT_ADVENTURE_SECRET_MARKER_CONTRACT.forbiddenSubstitutions.join(" ")).toMatch(/rune/i);
  });
});
