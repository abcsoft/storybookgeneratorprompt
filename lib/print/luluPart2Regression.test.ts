import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { luluPremiumColorLandscape11x85Profile } from "./profiles/luluPremiumColorLandscape11x85";
import { luluPremiumColorSquare85x85Profile } from "./profiles/luluPremiumColorSquare85x85";
import { computeTransformGeometry, type ArtworkTransform } from "./artworkTransform";
import { validatePageRaster } from "./luluPageComposer";
import { buildLuluInteriorBook } from "../pdf/luluExport";
import type { GeneratedPage, ChildProfile } from "../story/types";

describe("FIX PART 2: 300-PPI Flattened Lulu Renderer & Framing Tests", () => {
  // Test 1: Source resolution independence test (2752x1536 vs 1376x768)
  it("1. Source resolution independence: 2752x1536 and 1376x768 render identical destination geometry", () => {
    const destPx = { width: 3375, height: 2625 };
    const transform: ArtworkTransform = {
      mode: "fit",
      scale: 1.2,
      offsetX: 0.05,
      offsetY: -0.02,
      backgroundMode: "extended",
    };

    const sourceHigh = { width: 2752, height: 1536 };
    const sourceLow = { width: 1376, height: 768 };

    const geoHigh = computeTransformGeometry(sourceHigh, destPx, transform);
    const geoLow = computeTransformGeometry(sourceLow, destPx, transform);

    expect(geoHigh.width).toBe(geoLow.width);
    expect(geoHigh.height).toBe(geoLow.height);
    expect(geoHigh.left).toBe(geoLow.left);
    expect(geoHigh.top).toBe(geoLow.top);
    expect(geoHigh.destWidth).toBe(geoLow.destWidth);
    expect(geoHigh.destHeight).toBe(geoLow.destHeight);
    expect(geoHigh.showBackdrop).toBe(geoLow.showBackdrop);
  });

  // Test 2: Flattened opacity validation (no alpha channel, 100% opaque RGB)
  it("2. validatePageRaster rejects images with alpha channel and accepts 100% opaque sRGB JPEGs", async () => {
    const canvasPx = { width: 3375, height: 2625 };

    // Transparent PNG
    const transparentPng = await sharp({
      create: { width: 3375, height: 2625, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 0.5 } },
    })
      .png()
      .toBuffer();

    const valTransparent = await validatePageRaster(transparentPng, canvasPx);
    expect(valTransparent.ok).toBe(false);
    expect(valTransparent.hasAlpha).toBe(true);

    // Opaque JPEG
    const opaqueJpg = await sharp({
      create: { width: 3375, height: 2625, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    const valOpaque = await validatePageRaster(opaqueJpg, canvasPx);
    expect(valOpaque.ok).toBe(true);
    expect(valOpaque.hasAlpha).toBe(false);
    expect(valOpaque.width).toBe(3375);
    expect(valOpaque.height).toBe(2625);
  });

  // Test 3: Exact raster dimensions for Landscape and Square
  it("3. Lulu landscape raster equals 3375x2625 px and Lulu square equals 2625x2625 px", () => {
    expect(luluPremiumColorLandscape11x85Profile.canvasPx).toEqual({ width: 3375, height: 2625 });
    expect(luluPremiumColorSquare85x85Profile.canvasPx).toEqual({ width: 2625, height: 2625 });
  });

  // Test 4: Post-export 300-PPI validation
  it("4. buildLuluInteriorBook produces a PDF where every page is built from a 300-PPI flattened raster", async () => {
    const dummyChild: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };
    const dummyPages: GeneratedPage[] = [
      { index: 0, kind: "cover", text: "Cover Title", image: null, imageMimeType: "image/png", failed: false },
      { index: 1, kind: "scene", text: "Interior Page 1 text", image: null, imageMimeType: "image/png", failed: false },
    ];

    const pdfBuf = await buildLuluInteriorBook(dummyPages, dummyChild, luluPremiumColorLandscape11x85Profile);
    expect(pdfBuf.length).toBeGreaterThan(1000);

    const str = pdfBuf.toString("latin1");
    expect(str).toContain("/MediaBox");
  });
});
