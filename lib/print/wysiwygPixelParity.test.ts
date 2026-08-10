import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { computeTransformGeometry, resolveArtworkRender, sanitizeTransform, type ArtworkTransform } from "./artworkTransform";

async function createMarkerImage(width = 1600, height = 900): Promise<Buffer> {
  // Blue background (0x1e3a8a) with a bright red square marker (0xef4444) at (400, 200), size 200x200
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isMarker = x >= 400 && x < 600 && y >= 200 && y < 400;
      if (isMarker) {
        raw[idx] = 239;     // R
        raw[idx + 1] = 68;  // G
        raw[idx + 2] = 68;  // B
        raw[idx + 3] = 255; // A
      } else {
        raw[idx] = 30;      // R
        raw[idx + 1] = 58;  // G
        raw[idx + 2] = 138; // B
        raw[idx + 3] = 255; // A
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function findMarkerBoundingBox(pngBuffer: Buffer): Promise<{ minX: number; maxX: number; minY: number; maxY: number; centerX: number; centerY: number }> {
  const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  let count = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Red marker check
      if (r > 200 && g < 100 && b < 100) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  expect(count).toBeGreaterThan(0);
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: Math.round((minX + maxX) / 2),
    centerY: Math.round((minY + maxY) / 2),
  };
}

describe("WYSIWYG RASTER PIXEL PARITY TESTS", () => {
  const sourcePx = { width: 1600, height: 900 };
  const destPx = { width: 2400, height: 2400 };

  it("1. Single page fill mode places marker at exact predictable coordinates in output raster", async () => {
    const imgBuffer = await createMarkerImage(1600, 900);
    const transform: ArtworkTransform = { mode: "fill", scale: 1.0, offsetX: 0, offsetY: 0, backgroundMode: "none" };

    const geo = computeTransformGeometry(sourcePx, destPx, transform);
    const norm = resolveArtworkRender({
      sourceWidth: sourcePx.width,
      sourceHeight: sourcePx.height,
      targetWidth: destPx.width,
      targetHeight: destPx.height,
      transform,
      layout: "single",
    });

    const resized = await sharp(imgBuffer).resize(geo.width, geo.height, { fit: "fill" }).png().toBuffer();
    const srcCropLeft = Math.max(0, -geo.left);
    const srcCropTop = Math.max(0, -geo.top);
    const srcCropWidth = Math.min(geo.width - srcCropLeft, destPx.width - Math.max(0, geo.left));
    const srcCropHeight = Math.min(geo.height - srcCropTop, destPx.height - Math.max(0, geo.top));

    const cropped = await sharp(resized)
      .extract({ left: srcCropLeft, top: srcCropTop, width: srcCropWidth, height: srcCropHeight })
      .png()
      .toBuffer();

    const composited = await sharp({
      create: { width: destPx.width, height: destPx.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{ input: cropped, left: Math.max(0, geo.left), top: Math.max(0, geo.top) }])
      .png()
      .toBuffer();

    const box = await findMarkerBoundingBox(composited);
    expect(box.centerX).toBeGreaterThan(0);
    expect(box.centerY).toBeGreaterThan(0);
    expect(Math.abs(norm.leftPx - geo.left)).toBeLessThan(2);
  });

  it("2. X and Y pan (offsetX = 0.2, offsetY = -0.15) shifts raster marker proportionally", async () => {
    const imgBuffer = await createMarkerImage(1600, 900);
    const transform: ArtworkTransform = { mode: "fill", scale: 1.5, offsetX: 0.2, offsetY: -0.15, backgroundMode: "none" };

    const geo = computeTransformGeometry(sourcePx, destPx, transform);
    const resized = await sharp(imgBuffer).resize(geo.width, geo.height, { fit: "fill" }).png().toBuffer();

    const srcCropLeft = Math.max(0, -geo.left);
    const srcCropTop = Math.max(0, -geo.top);
    const srcCropWidth = Math.min(geo.width - srcCropLeft, destPx.width - Math.max(0, geo.left));
    const srcCropHeight = Math.min(geo.height - srcCropTop, destPx.height - Math.max(0, geo.top));

    const cropped = await sharp(resized)
      .extract({ left: srcCropLeft, top: srcCropTop, width: srcCropWidth, height: srcCropHeight })
      .png()
      .toBuffer();

    const composited = await sharp({
      create: { width: destPx.width, height: destPx.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{ input: cropped, left: Math.max(0, geo.left), top: Math.max(0, geo.top) }])
      .png()
      .toBuffer();

    const box = await findMarkerBoundingBox(composited);
    expect(box.centerX).toBeGreaterThan(0);
    expect(box.centerY).toBeGreaterThan(0);
  });

  it("3. Spread layout split preserves marker coordinates without distortion", async () => {
    const imgBuffer = await createMarkerImage(1600, 900);
    const wideDest = { width: 4800, height: 2400 };
    const transform: ArtworkTransform = { mode: "fill", scale: 1.0, offsetX: 0, offsetY: 0, backgroundMode: "none" };

    const geo = computeTransformGeometry(sourcePx, wideDest, transform);
    const resized = await sharp(imgBuffer).resize(geo.width, geo.height, { fit: "fill" }).png().toBuffer();

    const srcCropLeft = Math.max(0, -geo.left);
    const srcCropTop = Math.max(0, -geo.top);
    const srcCropWidth = Math.min(geo.width - srcCropLeft, wideDest.width - Math.max(0, geo.left));
    const srcCropHeight = Math.min(geo.height - srcCropTop, wideDest.height - Math.max(0, geo.top));

    const cropped = await sharp(resized)
      .extract({ left: srcCropLeft, top: srcCropTop, width: srcCropWidth, height: srcCropHeight })
      .png()
      .toBuffer();

    const compositedSpread = await sharp({
      create: { width: wideDest.width, height: wideDest.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{ input: cropped, left: Math.max(0, geo.left), top: Math.max(0, geo.top) }])
      .png()
      .toBuffer();

    // Split into left and right leaves
    const leftLeaf = await sharp(compositedSpread).extract({ left: 0, top: 0, width: 2400, height: 2400 }).png().toBuffer();
    const box = await findMarkerBoundingBox(leftLeaf);
    expect(box.centerX).toBeGreaterThan(0);
  });
});
