import { describe, expect, it } from "vitest";
import { buildReviewSequence } from "./reviewOrder";
import { buildManifest } from "./manifest";
import { spreadStartPages } from "../pdf/imposition";
import { buildPages } from "../story/registry";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("buildReviewSequence", () => {
  it("orders entries and numbers a simple 3-page book", () => {
    const entries = buildReviewSequence([
      { index: 0, kind: "cover", filename: "01.png", spread: false, aspect: "3:2" },
      { index: 1, kind: "scene", filename: "02.png", spread: false, aspect: "3:2" },
      { index: 2, kind: "backcover", filename: "03.png", spread: false, aspect: "3:2" },
    ]);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ layout: "single", page: 1 });
    expect(entries[1]).toMatchObject({ layout: "single", page: 2 });
    expect(entries[2]).toMatchObject({ layout: "single", page: 3 });
  });

  it("gives a spread a two-page range and advances the count by two", () => {
    const entries = buildReviewSequence([
      { index: 0, kind: "cover", filename: "01.png", spread: false, aspect: "3:2" },
      { index: 1, kind: "intro", filename: "02.png", spread: true, aspect: "21:9" },
      { index: 2, kind: "scene", filename: "03.png", spread: false, aspect: "3:2" },
    ]);
    expect(entries[1]).toMatchObject({ layout: "spread", startPage: 2, endPage: 3 });
    expect(entries[2]).toMatchObject({ layout: "single", page: 4 });
  });

  it("agrees with layout plan and ensures every spread starts on an even page", () => {
    // Dream Big now resolves through its registered standard-24
    // StoryEdition, which declares no approvedSpreadPairs, so its default
    // plan has zero spreads (no more 22-23 closing spread) — every entry is
    // single. The even-start-page rule itself is still enforced wherever a
    // spread CAN occur (see lib/story/layoutPlan.test.ts's Invariant 4,
    // still exercised there via assertValidFacingPair directly).
    const manifest = buildManifest(child, "dream-big", "printify-hardcover-square-8x8");
    const entries = buildReviewSequence(manifest);

    const spreads = entries.filter(
      (e): e is Extract<typeof e, { layout: "spread" }> => e.layout === "spread",
    );

    expect(spreads.length).toBe(0);
    for (const spread of spreads) {
      expect(spread.startPage % 2).toBe(0); // Starts on even page (verso)
      expect(spread.endPage).toBe(spread.startPage + 1); // Ends on facing odd page (recto)
    }

    // Closing is now a single interior page (23), not a 22-23 spread.
    const closingEntry = entries.find((e) => e.pageKind === "closing")!;
    expect(closingEntry.layout).toBe("single");
    if (closingEntry.layout === "single") {
      expect(closingEntry.page).toBe(23);
    }
  });

  it("keeps manifest order and carries filename/role/aspect through untouched", () => {
    const manifest = buildManifest(child, "dream-big");
    const entries = buildReviewSequence(manifest);
    expect(entries.map((e) => e.manifestIndex)).toEqual(manifest.map((m) => m.index));
    expect(entries[2].filename).toBe(manifest[2].filename);
    expect(entries[2].aspect).toBe(manifest[2].aspect);
  });
});
