import { describe, expect, it } from "vitest";
import { evaluateExportGate } from "./exportGate";
import type { IllustrationStatus } from "./illustrationStatus";

const allApproved: IllustrationStatus[] = ["approved", "approved", "approved"];
const oneMissing: IllustrationStatus[] = ["approved", "missing", "approved"];
const oneNeedsRegen: IllustrationStatus[] = ["approved", "needs-regeneration", "approved"];
const mixedAddedApproved: IllustrationStatus[] = ["approved", "added", "approved"];

describe("evaluateExportGate", () => {
  it("blocks on any missing illustration, non-strict", () => {
    const result = evaluateExportGate(oneMissing, { strict: false });
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => r.includes("missing"))).toBe(true);
  });

  it("blocks on any illustration marked needs-regeneration, non-strict", () => {
    const result = evaluateExportGate(oneNeedsRegen, { strict: false });
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => r.includes("needs regeneration"))).toBe(true);
  });

  it("does not block on 'added' (not yet approved) illustrations in non-strict mode", () => {
    const result = evaluateExportGate(mixedAddedApproved, { strict: false });
    expect(result.blocked).toBe(false);
  });

  it("surfaces a non-blocking warning when something is added but not approved, non-strict", () => {
    const result = evaluateExportGate(mixedAddedApproved, { strict: false });
    expect(result.warning).toBe("Not all images are approved.");
  });

  it("has no warning when everything is approved", () => {
    const result = evaluateExportGate(allApproved, { strict: false });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("blocks in strict mode when anything isn't approved, even with no missing/regen", () => {
    const result = evaluateExportGate(mixedAddedApproved, { strict: true });
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => r.toLowerCase().includes("strict"))).toBe(true);
  });

  it("passes in strict mode once everything is approved", () => {
    const result = evaluateExportGate(allApproved, { strict: true });
    expect(result.blocked).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("still leads with missing/regen reasons in strict mode rather than duplicating them", () => {
    const result = evaluateExportGate(oneMissing, { strict: true });
    expect(result.reasons.length).toBe(1);
    expect(result.reasons[0]).toContain("missing");
  });
});
