import { describe, expect, it } from "vitest";
import { assertSpreadsAligned, spreadStartPages } from "./imposition";
import type { PageKind } from "../story/types";

/** Minimal page shape the imposition checker cares about. */
function p(kind: PageKind, spread = false): { kind: PageKind; spread?: boolean } {
  return { kind, spread };
}

describe("spreadStartPages", () => {
  it("returns the 1-based print start page of each spread (cover = page 1)", () => {
    // cover(1) intro-spread(2-3) single(4) single(5) scene-spread(6-7)
    const pages = [
      p("cover"),
      p("intro", true),
      p("scene"),
      p("scene"),
      p("scene", true),
    ];
    expect(spreadStartPages(pages)).toEqual([2, 6]);
  });

  it("is empty when there are no spreads", () => {
    expect(spreadStartPages([p("cover"), p("scene"), p("backcover")])).toEqual([]);
  });
});

describe("assertSpreadsAligned", () => {
  it("passes when every spread starts on an even page", () => {
    const pages = [
      p("cover"),
      p("intro", true), // 2-3
      p("scene"),
      p("scene"),
      p("scene", true), // 6-7
      p("backcover"),
    ];
    expect(() => assertSpreadsAligned(pages)).not.toThrow();
  });

  it("passes when there are no spreads at all", () => {
    expect(() =>
      assertSpreadsAligned([p("cover"), p("scene"), p("backcover")]),
    ).not.toThrow();
  });

  it("throws and names the odd start page when a spread is misaligned", () => {
    // cover(1) single(2) scene-spread starts on 3 (odd) -> split across the turn
    const pages = [p("cover"), p("scene"), p("scene", true)];
    expect(() => assertSpreadsAligned(pages)).toThrow(/page 3/);
  });

  it("throws when a spread is the very first page (page 1, odd)", () => {
    expect(() => assertSpreadsAligned([p("scene", true)])).toThrow(/page 1/);
  });
});
