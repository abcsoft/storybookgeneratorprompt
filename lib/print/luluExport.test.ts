import { describe, expect, it } from "vitest";
import { luluPremiumColorLandscape11x85Profile } from "./profiles/luluPremiumColorLandscape11x85";
import { luluPremiumColorSquare85x85Profile } from "./profiles/luluPremiumColorSquare85x85";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";
import { classicLandscapeProfile } from "./profiles/classicLandscape";
import { buildLuluInteriorBook } from "../pdf/luluExport";
import type { GeneratedPage, ChildProfile } from "../story/types";

// Helper function to extract MediaBox [width, height] in PDF points from PDF buffer header
function getPdfPageDimensionsPt(pdfBuffer: Buffer): { width: number; height: number } {
  const str = pdfBuffer.toString("latin1");
  const mediaBoxMatch = str.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (mediaBoxMatch) {
    return {
      width: parseFloat(mediaBoxMatch[1]),
      height: parseFloat(mediaBoxMatch[2]),
    };
  }
  // Fallback: check /CropBox or general MediaBox pattern
  const bboxMatch = str.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (bboxMatch) {
    return {
      width: parseFloat(bboxMatch[1]),
      height: parseFloat(bboxMatch[2]),
    };
  }
  throw new Error("Could not parse MediaBox from generated PDF buffer");
}

describe("FIX PART 1: Lulu Print Profile & PDF Geometry Tests", () => {
  // Test 1: Lulu landscape trim dimensions
  it("1. Lulu landscape trim dimensions equal 11 x 8.5 inches", () => {
    const p = luluPremiumColorLandscape11x85Profile;
    expect(p.nominalSizeIn).toEqual({ width: 11, height: 8.5 });
    expect(p.trimIn).toEqual({ width: 11, height: 8.5 });
  });

  // Test 2: Lulu landscape final bleed dimensions
  it("2. Lulu landscape final bleed dimensions equal 11.25 x 8.75 inches", () => {
    const p = luluPremiumColorLandscape11x85Profile;
    expect(p.bleedIn).toBe(0.125);
    expect(p.finalPageIn).toEqual({ width: 11.25, height: 8.75 });
  });

  // Test 3: Lulu landscape raster equals 3375 x 2625
  it("3. Lulu landscape raster dimensions equal 3375 x 2625 pixels", () => {
    const p = luluPremiumColorLandscape11x85Profile;
    expect(p.canvasPx).toEqual({ width: 3375, height: 2625 });
    expect(p.finalPagePx).toEqual({ width: 3375, height: 2625 });
  });

  // Test 4: Lulu landscape PDF page MediaBox equals 810 x 630 points
  it("4. Lulu landscape PDF page MediaBox equals 810 x 630 points", async () => {
    const p = luluPremiumColorLandscape11x85Profile;
    expect(p.pdfPagePt).toEqual({ width: 810, height: 630 });

    const dummyChild: ChildProfile = { name: "TestChild", age: 5, gender: "boy" };
    const dummyPages: GeneratedPage[] = [
      { index: 0, kind: "cover", text: "Cover Title", image: null, imageMimeType: "image/png", failed: false },
      { index: 1, kind: "scene", text: "Interior Page 1 text", image: null, imageMimeType: "image/png", failed: false },
      { index: 2, kind: "scene", text: "Interior Page 2 text", image: null, imageMimeType: "image/png", failed: false },
    ];

    const pdfBuf = await buildLuluInteriorBook(dummyPages, dummyChild, p);
    const dims = getPdfPageDimensionsPt(pdfBuf);
    expect(dims.width).toBeCloseTo(810, 0);
    expect(dims.height).toBeCloseTo(630, 0);
  });

  // Test 5: Lulu square raster equals 2625 x 2625
  it("5. Lulu square raster dimensions equal 2625 x 2625 pixels", () => {
    const p = luluPremiumColorSquare85x85Profile;
    expect(p.canvasPx).toEqual({ width: 2625, height: 2625 });
    expect(p.finalPagePx).toEqual({ width: 2625, height: 2625 });
  });

  // Test 6: Lulu square PDF page MediaBox equals 630 x 630 points
  it("6. Lulu square PDF page MediaBox equals 630 x 630 points", async () => {
    const p = luluPremiumColorSquare85x85Profile;
    expect(p.pdfPagePt).toEqual({ width: 630, height: 630 });

    const dummyChild: ChildProfile = { name: "TestChild", age: 5, gender: "girl" };
    const dummyPages: GeneratedPage[] = [
      { index: 0, kind: "cover", text: "Cover Title", image: null, imageMimeType: "image/png", failed: false },
      { index: 1, kind: "scene", text: "Interior Page 1 text", image: null, imageMimeType: "image/png", failed: false },
    ];

    const pdfBuf = await buildLuluInteriorBook(dummyPages, dummyChild, p);
    const dims = getPdfPageDimensionsPt(pdfBuf);
    expect(dims.width).toBeCloseTo(630, 0);
    expect(dims.height).toBeCloseTo(630, 0);
  });

  // Test 7: Printify dimensions remain 100% unchanged
  it("7. Printify dimensions remain unchanged (2400x2400 interior, 5370x2850 cover)", () => {
    const p = printifyHardcoverSquare8x8Profile;
    expect(p.canvasPx).toEqual({ width: 2400, height: 2400 });
    expect(p.coverGeometryPx).toEqual({ width: 5370, height: 2850 });
  });

  // Test 8: Wrong provider/profile cannot silently use Classic Landscape geometry
  it("8. Wrong profile exportMode throws error when passed to buildLuluInteriorBook", async () => {
    const dummyChild: ChildProfile = { name: "TestChild", age: 5, gender: "boy" };
    const dummyPages: GeneratedPage[] = [
      { index: 0, kind: "scene", text: "text", image: null, imageMimeType: "image/png", failed: false },
    ];
    await expect(
      buildLuluInteriorBook(dummyPages, dummyChild, classicLandscapeProfile),
    ).rejects.toThrow();
  });
});
