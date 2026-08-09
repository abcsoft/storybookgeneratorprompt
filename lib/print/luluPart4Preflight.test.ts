import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getPrintProfile } from "./registry";
import { runLuluPreflight } from "./luluPreflight";
import { createAuthoritativeLuluCoverSpec, createPendingLuluCoverSpec, isLuluCoverReady } from "./luluCoverSpec";
import type { GeneratedPage } from "../story/types";

describe("FIX PART 4: Lulu Local Error Condition Preflight Regressions", () => {
  const luluLandscape = getPrintProfile("lulu-landscape-11x8.5");
  const luluSquare = getPrintProfile("lulu-square-8.5x8.5");

  // Helper to build 24 mock pages
  function buildMockPages(count: number = 24): GeneratedPage[] {
    return Array.from({ length: count }, (_, i) => ({
      index: i,
      kind: i === 0 ? "cover" : i === count - 1 ? "backcover" : "scene",
      prompt: "mock prompt",
      text: `Page ${i + 1}`,
      spread: false,
      image: Buffer.from("mock image data"),
      imageMimeType: "image/png",
      failed: false,
    }));
  }

  // Helper to build valid 3375x2625 opaque RGB rasters
  async function buildValidRasters(count: number = 22): Promise<Buffer[]> {
    const buf = await sharp({
      create: {
        width: 3375,
        height: 2625,
        channels: 3, // Opaque RGB (no alpha)
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    return Array.from({ length: count }, () => buf);
  }

  it("1. Valid Lulu package passes preflight with Premium Color quality preset", async () => {
    const pages = buildMockPages(24);
    const rasters = await buildValidRasters(22);
    const coverSpec = createAuthoritativeLuluCoverSpec({
      totalWidthIn: 22.75,
      totalHeightIn: 9.0,
      spineWidthIn: 0.25,
      frontWidthIn: 11.25,
      backWidthIn: 11.25,
    });

    const res = await runLuluPreflight(pages, luluLandscape, rasters, coverSpec);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.interiorReady).toBe(true);
    expect(res.coverReady).toBe(true);
    expect(res.metrics.printQualityPreset).toBe("Premium Color");
    expect(res.metrics.expectedPt).toEqual({ width: 810, height: 630 });
    expect(res.metrics.expectedPx).toEqual({ width: 3375, height: 2625 });
  });

  it("2. Preflight fails when page rasters have low resolution (wrong raster dimensions)", async () => {
    const pages = buildMockPages(24);
    // Build low-res 2000x1500 raster
    const lowResBuf = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const rasters = Array.from({ length: 22 }, () => lowResBuf);

    const res = await runLuluPreflight(pages, luluLandscape, rasters);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("dimensions 2000x1500 px do not match required 3375x2625 px"))).toBe(true);
  });

  it("3. Preflight fails when page raster contains unflattened alpha channel (transparency)", async () => {
    const pages = buildMockPages(24);
    // Build RGBA raster (with alpha)
    const transparentBuf = await sharp({
      create: {
        width: 3375,
        height: 2625,
        channels: 4, // Has alpha
        background: { r: 255, g: 255, b: 255, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const rasters = Array.from({ length: 22 }, () => transparentBuf);

    const res = await runLuluPreflight(pages, luluLandscape, rasters);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("unflattened alpha channel"))).toBe(true);
  });

  it("4. Preflight fails when an interior page is missing", async () => {
    const pages = buildMockPages(24);
    delete (pages[5] as Partial<GeneratedPage>).image; // missing page 6

    const res = await runLuluPreflight(pages, luluLandscape);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("interior pages are missing artwork"))).toBe(true);
  });

  it("5. Unauthoritative / pending cover spec blocks production cover export", () => {
    const pendingSpec = createPendingLuluCoverSpec(luluLandscape);
    expect(isLuluCoverReady(pendingSpec)).toBe(false);

    const authSpec = createAuthoritativeLuluCoverSpec({
      totalWidthIn: 22.75,
      totalHeightIn: 9.0,
      spineWidthIn: 0.25,
      frontWidthIn: 11.25,
      backWidthIn: 11.25,
    });
    expect(isLuluCoverReady(authSpec)).toBe(true);
  });
});
