import { describe, expect, it } from "vitest";
import {
  canMarkStatus,
  derivePrimaryBadge,
  ILLUSTRATION_STATUSES,
  statusAfterClearRegeneration,
  statusAfterImport,
  statusAfterRemove,
} from "./illustrationStatus";

describe("illustrationStatus", () => {
  it("never infers approved on import — always added", () => {
    expect(statusAfterImport()).toBe("added");
  });

  it("resets to missing on remove", () => {
    expect(statusAfterRemove()).toBe("missing");
  });

  it("resets needs-regeneration to added when cleared", () => {
    expect(statusAfterClearRegeneration("needs-regeneration")).toBe("added");
    expect(statusAfterClearRegeneration("approved")).toBe("approved");
  });

  it("derives badge priority correctly without badge conflicts", () => {
    // Needs regeneration overrides custom transform
    expect(
      derivePrimaryBadge({
        status: "needs-regeneration",
        needsRegeneration: true,
        hasCustomTransform: true,
      }),
    ).toEqual({ label: "Needs regeneration", kind: "needs-regeneration" });

    // Custom transform shows Framing Adjusted when not needing regeneration
    expect(
      derivePrimaryBadge({
        status: "added",
        needsRegeneration: false,
        hasCustomTransform: true,
      }),
    ).toEqual({ label: "Framing Adjusted", kind: "adjusted" });

    // Approved status when no custom transform
    expect(
      derivePrimaryBadge({
        status: "approved",
        needsRegeneration: false,
        hasCustomTransform: false,
      }),
    ).toEqual({ label: "Approved", kind: "approved" });
  });

  it("lists all four statuses", () => {
    expect(ILLUSTRATION_STATUSES).toEqual([
      "missing",
      "added",
      "needs-regeneration",
      "approved",
    ]);
  });

  describe("canMarkStatus", () => {
    it("refuses to approve or flag a page with no image", () => {
      expect(canMarkStatus("missing", "approved")).toBe(false);
      expect(canMarkStatus("missing", "needs-regeneration")).toBe(false);
    });

    it("allows approving an added or needs-regeneration page", () => {
      expect(canMarkStatus("added", "approved")).toBe(true);
      expect(canMarkStatus("needs-regeneration", "approved")).toBe(true);
    });

    it("allows flagging an added or approved page for regeneration", () => {
      expect(canMarkStatus("added", "needs-regeneration")).toBe(true);
      expect(canMarkStatus("approved", "needs-regeneration")).toBe(true);
    });

    it("is a no-op marking the same status again", () => {
      expect(canMarkStatus("approved", "approved")).toBe(false);
      expect(canMarkStatus("needs-regeneration", "needs-regeneration")).toBe(false);
    });
  });
});
