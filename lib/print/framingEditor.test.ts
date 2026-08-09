import { describe, expect, it } from "vitest";
import {
  computeTransformGeometry,
  computePercentGeometry,
  getLayoutDimensions,
  sanitizeTransform,
  calculateCornerResize,
  DEFAULT_ARTWORK_TRANSFORM,
  type ArtworkTransform,
} from "./artworkTransform";

describe("CANVA/LULU MANUAL IMAGE FRAMING EDITOR ENGINE", () => {
  // Test 1: Fit scale math
  it("1. Fit mode calculates correct scale for single page", () => {
    const sourcePx = { width: 1500, height: 1000 };
    const destPx = { width: 2400, height: 2400 };
    const geo = computeTransformGeometry(sourcePx, destPx, { ...DEFAULT_ARTWORK_TRANSFORM, mode: "fit" });

    // fitScale = Math.min(2400/1500, 2400/1000) = Math.min(1.6, 2.4) = 1.6
    expect(geo.effectiveScale).toBeCloseTo(1.6);
    expect(geo.width).toBe(2400); // 1500 * 1.6
    expect(geo.height).toBe(1600); // 1000 * 1.6
  });

  // Test 2: Fill scale math
  it("2. Fill mode calculates correct scale for single page", () => {
    const sourcePx = { width: 1500, height: 1000 };
    const destPx = { width: 2400, height: 2400 };
    const geo = computeTransformGeometry(sourcePx, destPx, { ...DEFAULT_ARTWORK_TRANSFORM, mode: "fill" });

    // fillScale = Math.max(2400/1500, 2400/1000) = Math.max(1.6, 2.4) = 2.4
    expect(geo.effectiveScale).toBeCloseTo(2.4);
    expect(geo.width).toBe(3600); // 1500 * 2.4
    expect(geo.height).toBe(2400); // 1000 * 2.4
  });

  // Test 3: Drag X and Y update offsets correctly
  it("3. Drag X and Y update top/left positions predictably", () => {
    const sourcePx = { width: 2400, height: 2400 };
    const destPx = { width: 2400, height: 2400 };
    const transform: ArtworkTransform = {
      mode: "manual",
      scale: 1.0,
      offsetX: 0.1, // Shift right by 10% of container width (240px)
      offsetY: -0.2, // Shift up by 20% of container height (-480px)
      backgroundMode: "extended",
    };

    const geo = computeTransformGeometry(sourcePx, destPx, transform);
    expect(geo.left).toBe(240);
    expect(geo.top).toBe(-480);
  });

  // Test 4: Four-corner resize math with locked aspect ratio
  it("4. Corner resize calculates scale and locks aspect ratio", () => {
    const initialScale = 1.0;
    const initialW = 2400;
    const initialH = 1600;

    // Drag bottom-right corner outward by 240px
    const nextScaleBR = calculateCornerResize(initialScale, initialW, initialH, 240, 160, "bottom-right");
    expect(nextScaleBR).toBeGreaterThan(1.0);

    // Drag top-left corner inward by +240px
    const nextScaleTL = calculateCornerResize(initialScale, initialW, initialH, 240, 160, "top-left");
    expect(nextScaleTL).toBeLessThan(1.0);
  });

  // Test 5: Source-resolution independence regression
  it("5. High (2752x1536) and low (1376x768) resolutions produce identical relative placement", () => {
    const highRes = { width: 2752, height: 1536 };
    const lowRes = { width: 1376, height: 768 };
    const destPx = { width: 3375, height: 2625 };
    const transform: ArtworkTransform = {
      mode: "manual",
      scale: 1.25,
      offsetX: 0.15,
      offsetY: -0.08,
      backgroundMode: "extended",
    };

    const geoHigh = computeTransformGeometry(highRes, destPx, transform);
    const geoLow = computeTransformGeometry(lowRes, destPx, transform);

    const pctHigh = computePercentGeometry(geoHigh);
    const pctLow = computePercentGeometry(geoLow);

    expect(pctHigh.leftPct).toBeCloseTo(pctLow.leftPct, 3);
    expect(pctHigh.topPct).toBeCloseTo(pctLow.topPct, 3);
    expect(pctHigh.widthPct).toBeCloseTo(pctLow.widthPct, 3);
    expect(pctHigh.heightPct).toBeCloseTo(pctLow.heightPct, 3);
  });

  // Test 6: Serialization and sanitizeTransform bounds enforcement
  it("6. sanitizeTransform enforces min/max scale and offset bounds", () => {
    const invalidInput = {
      scale: 999.0, // Should clamp to 5.0
      offsetX: -99.0, // Should clamp to -2.0
      offsetY: NaN, // Should fallback to 0
    };

    const sanitized = sanitizeTransform(invalidInput);
    expect(sanitized.scale).toBe(5.0);
    expect(sanitized.offsetX).toBe(-2.0);
    expect(sanitized.offsetY).toBe(0);
    expect(sanitized.mode).toBe("fit");
  });

  // Test 7: Two-page master spread geometry
  it("7. Spread master geometry scales across 2:1 container", () => {
    const sourcePx = { width: 4000, height: 2000 };
    const destPx = { width: 4800, height: 2400 }; // 2:1 spread container
    const geo = computeTransformGeometry(sourcePx, destPx, DEFAULT_ARTWORK_TRANSFORM);

    expect(geo.destWidth).toBe(4800);
    expect(geo.destHeight).toBe(2400);
    expect(geo.width).toBe(4800);
    expect(geo.height).toBe(2400);
  });

  // Test 8: getLayoutDimensions correctly derives exact canvas aspect ratio
  it("8. getLayoutDimensions derives exact target geometry for single and spread", () => {
    const landscapeProfile: any = { canvasPx: { width: 2700, height: 1980 } };
    const squareProfile: any = { canvasPx: { width: 2400, height: 2400 } };

    const singleLandscape = getLayoutDimensions(landscapeProfile, "single");
    expect(singleLandscape.width).toBe(2700);
    expect(singleLandscape.height).toBe(1980);
    expect(singleLandscape.aspectRatio).toBeCloseTo(1.3636, 3);
    expect(singleLandscape.aspectCss).toBe("2700 / 1980");

    const spreadLandscape = getLayoutDimensions(landscapeProfile, "spread");
    expect(spreadLandscape.width).toBe(5400);
    expect(spreadLandscape.height).toBe(1980);
    expect(spreadLandscape.aspectRatio).toBeCloseTo(2.7272, 3);
    expect(spreadLandscape.aspectCss).toBe("5400 / 1980");

    const singleSquare = getLayoutDimensions(squareProfile, "single");
    expect(singleSquare.width).toBe(2400);
    expect(singleSquare.height).toBe(2400);
    expect(singleSquare.aspectRatio).toBe(1.0);
    expect(singleSquare.aspectCss).toBe("2400 / 2400");
  });
});
