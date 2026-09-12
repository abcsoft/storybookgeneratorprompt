import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  calculateNormalizationTransform,
  normalizeProductionAsset,
} from "../print/artworkTransform";

describe("Provider-To-Target Crop Safety & Normalization Geometry", () => {
  it("calculates exact deterministic telemetry for 4:3 single-page cover crop (3375x2475 target)", () => {
    const rawDimensions = { width: 2048, height: 1536 }; // Exact 4:3 preset
    const targetDimensions = { width: 3375, height: 2475 };

    const telemetry = calculateNormalizationTransform(rawDimensions, targetDimensions, "proportional-cover-crop");

    expect(telemetry.rawProviderDimensions).toEqual(rawDimensions);
    expect(telemetry.targetDimensions).toEqual(targetDimensions);
    expect(telemetry.strategyUsed).toBe("proportional-cover-crop");
    expect(telemetry.transformationUsed).toBe("crop");

    // Width scales to 3375, height scales to round(1536 * (3375 / 2048)) = 2531
    expect(telemetry.scaledDimensions.width).toBe(3375);
    expect(telemetry.scaledDimensions.height).toBe(2531);

    // Total excess height: 2531 - 2475 = 56 px (approx 56.25 px)
    expect(telemetry.pixelsRemoved.totalVertical).toBe(56);
    expect(telemetry.pixelsRemoved.top).toBe(28);
    expect(telemetry.pixelsRemoved.bottom).toBe(28);
    expect(telemetry.pixelsRemoved.totalHorizontal).toBe(0);

    expect(telemetry.cropRectangle).toEqual({
      left: 0,
      top: 28,
      width: 3375,
      height: 2475,
    });
  });

  it("calculates exact deterministic telemetry for 21:9 spread cover crop (6675x2475 target)", () => {
    // Exact 21:9 preset resolution (e.g. 5040x2160 or 2560x1080 -> 21:9 = 2.3333)
    const rawDimensions = { width: 5040, height: 2160 };
    const targetDimensions = { width: 6675, height: 2475 };

    const telemetry = calculateNormalizationTransform(rawDimensions, targetDimensions, "proportional-cover-crop");

    expect(telemetry.rawProviderDimensions).toEqual(rawDimensions);
    expect(telemetry.targetDimensions).toEqual(targetDimensions);
    expect(telemetry.strategyUsed).toBe("proportional-cover-crop");
    expect(telemetry.transformationUsed).toBe("crop");

    // Width scales to 6675, height scales to round(2160 * (6675 / 5040)) = 2861
    expect(telemetry.scaledDimensions.width).toBe(6675);
    expect(telemetry.scaledDimensions.height).toBe(2861);

    // Total excess height: 2861 - 2475 = 386 px (approx 385.71 px)
    expect(telemetry.pixelsRemoved.totalVertical).toBe(386);
    expect(telemetry.pixelsRemoved.top).toBe(193);
    expect(telemetry.pixelsRemoved.bottom).toBe(193);
    expect(telemetry.pixelsRemoved.totalHorizontal).toBe(0);

    expect(telemetry.cropRectangle).toEqual({
      left: 0,
      top: 193,
      width: 6675,
      height: 2475,
    });
  });

  it("normalizes a 4:3 image with circular shapes: circles remain circles (no stretching) and markers survive", async () => {
    // Generate SVG with a central circle and boundary markers placed inside safe regions
    const svg = `
      <svg width="2048" height="1536" xmlns="http://www.w3.org/2000/svg">
        <rect width="2048" height="1536" fill="#ffffff" />
        <!-- Pure central circle with radius 300 -->
        <circle cx="1024" cy="768" r="300" fill="#ff0000" />
        <!-- Top safe marker at y=250 (16.2% from top, inside 15% safe region) -->
        <circle cx="1024" cy="250" r="40" fill="#0000ff" />
        <!-- Bottom safe marker at y=1286 (16.2% from bottom, inside 15% safe region) -->
        <circle cx="1024" cy="1286" r="40" fill="#00aa00" />
      </svg>
    `;

    const rawBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const targetDimensions = { width: 3375, height: 2475 };

    const norm = await normalizeProductionAsset(rawBuffer, targetDimensions, "proportional-cover-crop");

    // 1. Output dimensions must be exact
    expect(norm.width).toBe(3375);
    expect(norm.height).toBe(2475);
    expect(norm.scaleX).toBe(norm.scaleY);
    expect(norm.scaleX).toBe(norm.uniformScale);

    // 2. Crop bounds must match telemetry
    expect(norm.cropBounds).toEqual({
      left: 0,
      top: 28,
      width: 3375,
      height: 2475,
    });

    // 3. Circle geometry verification: extract the central circle and verify aspect ratio is exactly 1.0
    const rawPixels = await sharp(norm.data).raw().toBuffer();
    const channels = 4; // RGBA
    const getPixel = (x: number, y: number) => {
      const idx = (y * 3375 + x) * channels;
      return {
        r: rawPixels[idx],
        g: rawPixels[idx + 1],
        b: rawPixels[idx + 2],
        a: rawPixels[idx + 3],
      };
    };

    // Scaled center: x = round(1024 * (3375/2048)) = 1688; y = round(768 * (3375/2048)) - 28 = 1266 - 28 = 1238
    const centerX = 1688;
    const centerY = 1238;
    const isRed = (x: number, y: number) => {
      const p = getPixel(x, y);
      return p.r > 200 && p.g < 50 && p.b < 50;
    };

    expect(isRed(centerX, centerY)).toBe(true);

    // Find horizontal and vertical extent of the red circle
    let leftEdge = centerX;
    while (leftEdge > 0 && isRed(leftEdge, centerY)) leftEdge--;

    let rightEdge = centerX;
    while (rightEdge < 3375 && isRed(rightEdge, centerY)) rightEdge++;

    let topEdge = centerY;
    while (topEdge > 0 && isRed(centerX, topEdge)) topEdge--;

    let bottomEdge = centerY;
    while (bottomEdge < 2475 && isRed(centerX, bottomEdge)) bottomEdge++;

    const circleWidth = rightEdge - leftEdge;
    const circleHeight = bottomEdge - topEdge;

    // Radius was 300 -> diameter was 600 -> scaled diameter = 600 * (3375 / 2048) approx 989 px
    expect(Math.abs(circleWidth - circleHeight)).toBeLessThanOrEqual(2); // Pixel rounding tolerance <= 2px
    expect(Math.abs(circleWidth - 989)).toBeLessThanOrEqual(4);

    // 4. Verify protected markers remained visible in final output
    // Top blue marker: scaled y = round(250 * 1.64795) - 28 = 412 - 28 = 384 px. Center is well within canvas.
    const topMarkerPixel = getPixel(1688, 384);
    expect(topMarkerPixel.b).toBeGreaterThan(200); // Blue marker visible

    // Bottom green marker: scaled y = round(1286 * 1.64795) - 28 = 2119 - 28 = 2091 px.
    const bottomMarkerPixel = getPixel(1688, 2091);
    expect(bottomMarkerPixel.g).toBeGreaterThan(150); // Green marker visible
  });

  it("supports contain+backdrop when full 21:9 height must be preserved without cropping", async () => {
    const rawDimensions = { width: 2560, height: 1080 };
    const targetDimensions = { width: 6675, height: 2475 };

    const telemetry = calculateNormalizationTransform(rawDimensions, targetDimensions, "proportional-contain-backdrop");

    expect(telemetry.strategyUsed).toBe("proportional-contain-backdrop");
    expect(telemetry.transformationUsed).toBe("contain-backdrop");
    expect(telemetry.pixelsRemoved.totalVertical).toBe(0);
    expect(telemetry.pixelsRemoved.totalHorizontal).toBe(0);

    // Perform actual contain+backdrop normalization
    const svg = `<svg width="2560" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="2560" height="1080" fill="#336699"/></svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();

    const norm = await normalizeProductionAsset(buf, targetDimensions, "proportional-contain-backdrop");

    expect(norm.width).toBe(6675);
    expect(norm.height).toBe(2475);
    expect(norm.strategy).toBe("proportional-contain-backdrop");
    expect(norm.scaleX).toBe(norm.scaleY);
  });
});
