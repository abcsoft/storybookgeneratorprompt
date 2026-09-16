/**
 * "full-spread-24" is a stubbed LayoutMode: it must be rejected everywhere
 * (never silently produce a real plan) until an approved editorial mapping
 * replaces lib/story/editions/dreamBigFullSpread24.proposal.ts and is wired
 * into the registry — which this proposal file explicitly is not.
 */

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveLayoutPlan, recalculateAndValidatePhysicalPagePlan } from "./layoutPlan";
import { dreamBigFullSpread24Proposal } from "./editions/dreamBigFullSpread24.proposal";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Shihab", age: 4, gender: "boy" };

describe("full-spread-24 stub mode", () => {
  it("resolveLayoutPlan rejects it with a clear 'coming soon' error", () => {
    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId: "classic-landscape-11x8",
        mode: "full-spread-24",
        customSpreads: [],
      }),
    ).toThrow(/not available yet|editorial mapping|coming soon/i);
  });

  it("recalculateAndValidatePhysicalPagePlan reports it as unavailable without throwing", () => {
    const result = recalculateAndValidatePhysicalPagePlan(
      "dream-big",
      "classic-landscape-11x8",
      "full-spread-24",
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.explanation).toMatch(/coming soon|editorial mapping/i);
  });

  it("the proposal skeleton is explicitly not approved", () => {
    expect(dreamBigFullSpread24Proposal.status).toBe("PROPOSAL_NOT_APPROVED");
    expect(dreamBigFullSpread24Proposal.interiorSpreads.length).toBe(11);
    // Every creative field is still a TBD placeholder — this is a shape
    // skeleton, not content ready to activate.
    for (const spread of dreamBigFullSpread24Proposal.interiorSpreads) {
      expect(spread.rewrittenText).toBeNull();
      expect(spread.scenePromptSummary).toBeNull();
      expect(spread.sourceBeats.length).toBe(0);
    }
  });

  it("the proposal file is not imported by layoutPlan.ts or editions.ts (truly inactive)", () => {
    const root = path.resolve(__dirname, "..", "..");
    const layoutPlanSrc = fs.readFileSync(path.join(root, "lib/story/layoutPlan.ts"), "utf8");
    const editionsSrc = fs.readFileSync(path.join(root, "lib/story/editions.ts"), "utf8");
    expect(layoutPlanSrc).not.toMatch(/from\s+["'][^"']*dreamBigFullSpread24/);
    expect(editionsSrc).not.toMatch(/from\s+["'][^"']*dreamBigFullSpread24/);
  });
});
