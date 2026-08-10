import { describe, expect, it } from "vitest";
import {
  calculateCornerResize,
  computeTransformGeometry,
  DEFAULT_ARTWORK_TRANSFORM,
  getLayoutDimensions,
  resolveArtworkRender,
  sanitizeTransform,
  type ArtworkTransform,
} from "./artworkTransform";

import { getPrintProfile } from "./registry";

describe("FRAMING EDITOR COMPLETE REGRESSION & STATE MATRIX TESTS", () => {
  const profile = getPrintProfile("printify-hardcover-square-8x8");

  it("1. manual offset X and Y are clamped within safe range", () => {
    const t: ArtworkTransform = { mode: "manual", scale: 1.0, offsetX: 0.25, offsetY: -0.15, backgroundMode: "none" };
    const sanitized = sanitizeTransform(t);
    expect(sanitized.offsetX).toBe(0.25);
    expect(sanitized.offsetY).toBe(-0.15);
  });

  it("2. corner resize scales larger and smaller while locking aspect ratio", () => {
    const initialScale = 1.0;
    const initialW = 2400;
    const initialH = 2400;

    const scaleLarger = calculateCornerResize(initialScale, initialW, initialH, 240, 240, "bottom-right");
    expect(scaleLarger).toBeGreaterThan(1.0);

    const scaleSmaller = calculateCornerResize(initialScale, initialW, initialH, -240, -240, "bottom-right");
    expect(scaleSmaller).toBeLessThan(1.0);
  });

  it("3. Fit mode resets framing to full image visible", () => {
    const t: ArtworkTransform = { mode: "fit", scale: 1.0, offsetX: 0, offsetY: 0, backgroundMode: "none" };
    const geo = computeTransformGeometry({ width: 2000, height: 1000 }, { width: 2400, height: 2400 }, t);
    expect(geo.width).toBeLessThanOrEqual(2400);
    expect(geo.height).toBeLessThanOrEqual(2400);
  });

  it("4. Fill mode resets framing to canvas completely covered", () => {
    const t: ArtworkTransform = { mode: "fill", scale: 1.0, offsetX: 0, offsetY: 0, backgroundMode: "none" };
    const geo = computeTransformGeometry({ width: 2000, height: 1000 }, { width: 2400, height: 2400 }, t);
    expect(geo.width).toBeGreaterThanOrEqual(2400);
    expect(geo.height).toBeGreaterThanOrEqual(2400);
  });

  it("5. Reset returns to DEFAULT_ARTWORK_TRANSFORM", () => {
    const reset = sanitizeTransform(DEFAULT_ARTWORK_TRANSFORM);
    expect(reset.mode).toBe("fit");
    expect(reset.scale).toBe(1.0);
    expect(reset.offsetX).toBe(0);
    expect(reset.offsetY).toBe(0);
  });

  it("6. Same transform yields identical framing independent of source resolution", () => {
    const transform: ArtworkTransform = { mode: "manual", scale: 1.25, offsetX: 0.1, offsetY: -0.05, backgroundMode: "none" };
    const target = { width: 2400, height: 2400 };

    const renderHighRes = resolveArtworkRender({
      sourceWidth: 2752,
      sourceHeight: 1536,
      targetWidth: target.width,
      targetHeight: target.height,
      layout: "single",
      transform,
    });

    const renderLowRes = resolveArtworkRender({
      sourceWidth: 1376,
      sourceHeight: 768,
      targetWidth: target.width,
      targetHeight: target.height,
      layout: "single",
      transform,
    });

    expect(Math.abs(renderHighRes.leftPct - renderLowRes.leftPct)).toBeLessThan(0.01);
    expect(Math.abs(renderHighRes.topPct - renderLowRes.topPct)).toBeLessThan(0.01);
    expect(Math.abs(renderHighRes.widthPct - renderLowRes.widthPct)).toBeLessThan(0.01);
  });

  it("7. Spread uses one master 2:1 transform canvas", () => {
    const dims = getLayoutDimensions(profile, "spread");
    expect(dims.width).toBe(4800);
    expect(dims.height).toBe(2400);
    expect(dims.aspectCss).toBe("4800 / 2400");
  });
});
