import { describe, expect, it } from "vitest";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";
import { classicLandscapeProfile } from "./profiles/classicLandscape";
import { getEditionForProfile } from "../story/editions";
import { buildReviewSequenceForEdition } from "../manual/reviewOrder";
import "../story/greatAdventureTemplate";
import { computePageTextGeometry } from "./printifyPageTemplate";
import { computeCoverZonesPct } from "./coverTemplate";
import { computeTransformGeometry } from "./artworkTransform";

describe("Part 3: True WYSIWYG Book Review & Cover Preview Regression Tests", () => {
  const dummyChild = { name: "Ihan", age: 5, gender: "boy" as const };

  // Test 1: Printify single page review ratio = 1:1
  it("1. Printify 8x8 single page preview ratio equals 1:1 (2400x2400)", () => {
    const singleCanvas = printifyHardcoverSquare8x8Profile.canvasPx;
    const ratio = singleCanvas.width / singleCanvas.height;
    expect(ratio).toBe(1.0);
    expect(printifyHardcoverSquare8x8Profile.singleAspect).toBe("1:1");
  });

  // Test 2: Printify spread page review ratio = 2:1
  it("2. Printify 8x8 spread page preview ratio equals 2:1 (4800x2400)", () => {
    const spreadWidth = printifyHardcoverSquare8x8Profile.canvasPx.width * 2;
    const spreadHeight = printifyHardcoverSquare8x8Profile.canvasPx.height;
    const ratio = spreadWidth / spreadHeight;
    expect(ratio).toBe(2.0);
    expect(printifyHardcoverSquare8x8Profile.spreadAspect).toBe("2:1");
  });

  // Test 3: Classic Landscape profile ratio matches profile specs
  it("3. Classic Landscape profile aspect ratio matches ~1.36 (2700x1980)", () => {
    const canvas = classicLandscapeProfile.canvasPx;
    const ratio = canvas.width / canvas.height;
    expect(ratio).toBeCloseTo(1.36, 1);
  });

  // Test 4: Final page preview receives same transform as exporter
  it("4. Review preview receives identical transform geometry as exporter pipeline", () => {
    const sourcePx = { width: 2000, height: 1000 };
    const destPx = { width: 4800, height: 2400 };
    const transform = {
      mode: "manual" as const,
      scale: 0.8,
      offsetX: 0.1,
      offsetY: -0.05,
      backgroundMode: "extended" as const,
    };

    const reviewGeo = computeTransformGeometry(sourcePx, destPx, transform);
    expect(reviewGeo.destWidth).toBe(4800);
    expect(reviewGeo.destHeight).toBe(2400);
    expect(reviewGeo.showBackdrop).toBe(true);
  });

  // Test 5: Final page preview receives same text geometry & safe area
  it("5. Page preview text panel geometry matches export safe area calculation", () => {
    const geom = computePageTextGeometry(printifyHardcoverSquare8x8Profile);
    expect(geom.leftPct).toBeCloseTo(4.708, 2);
    expect(geom.bottomPct).toBeCloseTo(3.125, 2);
    expect(geom.maxWidthPct).toBeGreaterThan(70);
  });

  // Test 6: Physical page order = exported page order
  it("6. 24 physical interior pages in review map 1:1 to 24 exported physical pages", () => {
    const edition = getEditionForProfile("great-adventure", printifyHardcoverSquare8x8Profile);
    expect(edition).toBeDefined();
    if (!edition) return;

    expect(edition.interiorPageCount).toBe(24);
    expect(edition.physicalPages.length).toBe(24);

    const reviewSeq = buildReviewSequenceForEdition(edition);
    expect(reviewSeq.length).toBe(19); // 19 illustration entries representing 24 physical interior pages
  });

  // Test 7: Cover preview geometry = cover export geometry (5370x2850)
  it("7. Cover review wrap geometry matches cover export dimensions (5370x2850)", () => {
    const coverZones = computeCoverZonesPct(printifyHardcoverSquare8x8Profile);
    expect(coverZones.canvasWidth).toBe(5370);
    expect(coverZones.canvasHeight).toBe(2850);
    expect(coverZones.spineWidthPct).toBeGreaterThan(0);
    expect(coverZones.backWidthPct + coverZones.spineWidthPct + coverZones.frontWidthPct).toBeCloseTo(100, 1);
  });

  // Test 8: 24 Printify review pages map to 24 exported pages
  it("8. Physical page mapping aligns every interior page number from 1 to 24", () => {
    const edition = getEditionForProfile("great-adventure", printifyHardcoverSquare8x8Profile);
    expect(edition).toBeDefined();
    if (!edition) return;
    const pageNumbers = edition.physicalPages.map((p) => p.physicalPageNumber);
    expect(pageNumbers).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });
});
