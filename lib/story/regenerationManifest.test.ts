import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import { GREAT_ADVENTURE_REGENERATION_MANIFEST, renderRegenerationReport } from "./regenerationManifest";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };

describe("Great Adventure regeneration manifest", () => {
  it("covers every resolved asset (24 interior + front/back cover)", () => {
    const manifest = buildManifest(child, "great-adventure", "classic-landscape-11x8", "standard-single", []);
    const sceneIds = new Set(manifest.map((m) => m.resolvedSlot?.sceneId).filter((id): id is string => Boolean(id)));
    const manifestSceneIds = new Set(GREAT_ADVENTURE_REGENERATION_MANIFEST.map((e) => e.sceneId));
    for (const id of sceneIds) {
      expect(manifestSceneIds.has(id), `regeneration manifest is missing an entry for resolved scene "${id}"`).toBe(true);
    }
  });

  it("every entry has a non-empty, specific reason", () => {
    for (const entry of GREAT_ADVENTURE_REGENERATION_MANIFEST) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  it("the confirmed-defective pages from the visual audit are not silently marked KEEP_EXISTING", () => {
    const flagged = [
      "ancient-ruins",
      "island-marker",
      "arctic-arrival",
      "arctic-aurora",
      "ocean-storm",
      "treasure-chest-reach",
      "savanna-riverbank",
      "star-friend",
    ];
    for (const sceneId of flagged) {
      const entry = GREAT_ADVENTURE_REGENERATION_MANIFEST.find((e) => e.sceneId === sceneId);
      expect(entry, `no manifest entry for flagged scene "${sceneId}"`).toBeDefined();
      expect(entry!.decision, `${sceneId} should not be KEEP_EXISTING given its confirmed defect`).not.toBe("KEEP_EXISTING");
    }
  });

  it("renders a non-empty human-readable report grouped by decision", () => {
    const report = renderRegenerationReport();
    expect(report).toContain("REGENERATION_REQUIRED");
    expect(report).toContain("KEEP_EXISTING");
    expect(report.length).toBeGreaterThan(100);
  });
});
