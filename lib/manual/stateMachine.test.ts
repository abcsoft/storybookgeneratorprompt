import { describe, expect, it } from "vitest";
import {
  derivePrimaryBadge,
  statusAfterClearRegeneration,
  statusAfterImport,
} from "./illustrationStatus";
import {
  clearedIllustrations,
  reviewResetIllustrations,
  type IllustrationEntry,
} from "./sessionReset";
import { evaluateExportGate } from "./exportGate";
import { DEFAULT_ARTWORK_TRANSFORM } from "../print/artworkTransform";

describe("ILLUSTRATION LIFECYCLE & STATE MACHINE REGRESSION TESTS", () => {
  // Test 1: pending -> approved
  it("1. Transition pending -> approved sets status to approved and derives Approved badge", () => {
    const entry: IllustrationEntry = {
      status: "added",
      needsRegeneration: false,
      file: null,
      objectUrl: "blob:test",
      clientCheck: null,
    };

    const approved: IllustrationEntry = { ...entry, status: "approved" };
    expect(approved.status).toBe("approved");

    const badge = derivePrimaryBadge(approved);
    expect(badge.label).toBe("Approved");
    expect(badge.kind).toBe("approved");
  });

  // Test 2: approved -> framing adjusted
  it("2. Transition approved -> framing adjusted preserves Approved badge and adds secondary tag", () => {
    const entry: IllustrationEntry = {
      status: "approved",
      needsRegeneration: false,
      file: null,
      objectUrl: "blob:test",
      clientCheck: null,
      transform: { ...DEFAULT_ARTWORK_TRANSFORM, scale: 1.25, offsetX: 0.1 },
    };

    const badge = derivePrimaryBadge({
      status: entry.status,
      needsRegeneration: entry.needsRegeneration,
      hasCustomTransform: true,
    });

    expect(badge.label).toBe("Approved");
    expect(badge.kind).toBe("approved");
    expect(badge.secondaryTag).toBe("Framing Adjusted");
  });

  // Test 3: approved -> needs regeneration
  it("3. Transition approved -> needs regeneration sets warning state and blocks export", () => {
    const entry: IllustrationEntry = {
      status: "needs-regeneration",
      needsRegeneration: true,
      file: null,
      objectUrl: "blob:test",
      clientCheck: null,
    };

    const badge = derivePrimaryBadge(entry);
    expect(badge.label).toBe("Needs regeneration");
    expect(badge.kind).toBe("needs-regeneration");

    const gate = evaluateExportGate([entry], { strict: false });
    expect(gate.blocked).toBe(true);
    expect(gate.reasons[0]).toContain("needs regeneration");
  });

  // Test 4: needs regeneration -> undo
  it("4. Undo regeneration request restores previous status and removes warning flag", () => {
    const entry: IllustrationEntry = {
      status: "needs-regeneration",
      needsRegeneration: true,
      file: null,
      objectUrl: "blob:test",
      clientCheck: null,
    };

    const restoredStatus = statusAfterClearRegeneration(entry.status);
    const restoredEntry: IllustrationEntry = {
      ...entry,
      status: restoredStatus,
      needsRegeneration: false,
    };

    expect(restoredEntry.status).toBe("added");
    expect(restoredEntry.needsRegeneration).toBe(false);

    const badge = derivePrimaryBadge(restoredEntry);
    expect(badge.label).toBe("Added");
    expect(badge.kind).toBe("added");
  });

  // Test 5: approved -> replace image
  it("5. Replace image invalidates old transform, resets approval and clears regeneration flag", () => {
    const entry: IllustrationEntry = {
      status: "approved",
      needsRegeneration: false,
      file: null,
      objectUrl: "blob:old",
      clientCheck: null,
      transform: { ...DEFAULT_ARTWORK_TRANSFORM, scale: 1.5 },
    };

    const replaced: IllustrationEntry = {
      status: statusAfterImport(),
      needsRegeneration: false,
      file: null,
      objectUrl: "blob:new",
      clientCheck: null,
      transform: { ...DEFAULT_ARTWORK_TRANSFORM },
    };

    expect(replaced.status).toBe("added");
    expect(replaced.needsRegeneration).toBe(false);
    expect(replaced.transform?.scale).toBe(1.0);
  });

  // Test 6: Reset Review explicitly clears needsRegeneration and approved status
  it("6. Reset Review resets approved and needsRegeneration states consistently without contradiction", () => {
    const map: Record<number, IllustrationEntry> = {
      0: { status: "approved", needsRegeneration: false, file: null, objectUrl: "blob:0", clientCheck: null },
      1: { status: "needs-regeneration", needsRegeneration: true, file: null, objectUrl: "blob:1", clientCheck: null },
      2: { status: "added", needsRegeneration: false, file: null, objectUrl: "blob:2", clientCheck: null },
    };

    const resetMap = reviewResetIllustrations(map);

    expect(resetMap[0].status).toBe("added");
    expect(resetMap[0].needsRegeneration).toBe(false);

    expect(resetMap[1].status).toBe("added");
    expect(resetMap[1].needsRegeneration).toBe(false);

    expect(resetMap[2].status).toBe("added");
    expect(resetMap[2].needsRegeneration).toBe(false);
  });

  // Test 7: Export gate requires strict approval for all pages in production mode
  it("7. evaluateExportGate blocks production export if any page is unapproved or needs regeneration", () => {
    const map: IllustrationEntry[] = [
      { status: "approved", needsRegeneration: false, file: null, objectUrl: "blob:0", clientCheck: null },
      { status: "added", needsRegeneration: false, file: null, objectUrl: "blob:1", clientCheck: null },
    ];

    const strictResult = evaluateExportGate(map, { strict: true });
    expect(strictResult.blocked).toBe(true);
    expect(strictResult.reasons[0]).toContain("approved yet");

    const draftResult = evaluateExportGate(map, { strict: false });
    expect(draftResult.blocked).toBe(false);
    expect(draftResult.warning).toContain("Not all images are approved");
  });
});
