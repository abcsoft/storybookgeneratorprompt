import { describe, expect, it } from "vitest";
import { computeOverlayGeometry } from "./overlayGeometry";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";
import { classicLandscapeProfile } from "./profiles/classicLandscape";

describe("computeOverlayGeometry", () => {
  it("gives a single page exactly one leaf and no gutter", () => {
    const geo = computeOverlayGeometry(printifyHardcoverSquare8x8Profile, false);
    expect(geo.leaves).toHaveLength(1);
    expect(geo.gutter).toBeUndefined();
  });

  it("gives a spread exactly two leaves plus a gutter", () => {
    const geo = computeOverlayGeometry(printifyHardcoverSquare8x8Profile, true);
    expect(geo.leaves).toHaveLength(2);
    expect(geo.gutter).toBeDefined();
  });

  it("centers the finished/safe rectangles for a single Printify 8x8 page", () => {
    // canvas 2400, finished 2325 -> 37.5px margin each side -> 1.5625%
    const geo = computeOverlayGeometry(printifyHardcoverSquare8x8Profile, false);
    const finished = geo.leaves[0].finished;
    expect(finished.leftPct).toBeCloseTo((37.5 / 2400) * 100, 5);
    expect(finished.widthPct).toBeCloseTo((2325 / 2400) * 100, 5);

    // canvas 2400x2400, safe 2175x2250 -> x margin 112.5px, y margin 75px
    const safe = geo.leaves[0].safe;
    expect(safe.leftPct).toBeCloseTo((112.5 / 2400) * 100, 5);
    expect(safe.topPct).toBeCloseTo((75 / 2400) * 100, 5);
    expect(safe.widthPct).toBeCloseTo((2175 / 2400) * 100, 5);
    expect(safe.heightPct).toBeCloseTo((2250 / 2400) * 100, 5);
  });

  it("places the second leaf's rectangles in the right half of a spread", () => {
    const geo = computeOverlayGeometry(printifyHardcoverSquare8x8Profile, true);
    const [left, right] = geo.leaves;
    // Right leaf's finished rect starts past the 50% seam.
    expect(right.finished.leftPct).toBeGreaterThan(50);
    expect(left.finished.leftPct).toBeLessThan(50);
  });

  it("centers the gutter on the seam between the two leaves", () => {
    const geo = computeOverlayGeometry(printifyHardcoverSquare8x8Profile, true);
    const gutter = geo.gutter!;
    const center = gutter.leftPct + gutter.widthPct / 2;
    expect(center).toBeCloseTo(50, 5);
    expect(gutter.heightPct).toBe(100);
  });

  it("works for any profile's own numbers, not just Printify's", () => {
    const geo = computeOverlayGeometry(classicLandscapeProfile, false);
    expect(geo.leaves[0].finished.widthPct).toBeGreaterThan(0);
    expect(geo.leaves[0].finished.widthPct).toBeLessThanOrEqual(100);
    expect(geo.leaves[0].safe.widthPct).toBeLessThanOrEqual(geo.leaves[0].finished.widthPct);
  });

  it("every rectangle stays within the 0-100% bounds", () => {
    for (const spread of [false, true]) {
      const geo = computeOverlayGeometry(printifyHardcoverSquare8x8Profile, spread);
      for (const leaf of geo.leaves) {
        for (const rect of [leaf.finished, leaf.safe]) {
          expect(rect.leftPct).toBeGreaterThanOrEqual(0);
          expect(rect.leftPct + rect.widthPct).toBeLessThanOrEqual(100 + 1e-9);
          expect(rect.topPct + rect.heightPct).toBeLessThanOrEqual(100 + 1e-9);
        }
      }
    }
  });
});
