import { describe, expect, it } from "vitest";
import path from "node:path";
import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import sharp from "sharp";
import {
  computeTransformGeometry,
  sanitizeTransform,
  DEFAULT_ARTWORK_TRANSFORM,
  type ArtworkTransform,
} from "./artworkTransform";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";
import { exportPrintifyBook } from "./printifyExport";
import type { ProvidedImage } from "../manual/assemble";
import type { ChildProfile } from "../story/types";

describe("Part 2: Shared Artwork Framing Engine & Transform Math Regression Tests", () => {
  const squareSource = { width: 1000, height: 1000 };
  const portraitSource = { width: 1000, height: 1500 };
  const wideSource = { width: 2000, height: 1000 };
  const squareDest = { width: 2400, height: 2400 };
  const spreadDest = { width: 4800, height: 2400 };

  // Test 1: Fit transform calculation
  it("1. Calculates fit transform correctly", () => {
    const geo = computeTransformGeometry(portraitSource, squareDest, {
      ...DEFAULT_ARTWORK_TRANSFORM,
      mode: "fit",
    });
    // Height fits 2400, width becomes 1600, centered at left = 400, top = 0
    expect(geo.height).toBe(2400);
    expect(geo.width).toBe(1600);
    expect(geo.left).toBe(400);
    expect(geo.top).toBe(0);
    expect(geo.showBackdrop).toBe(true);
  });

  // Test 2: Fill transform calculation
  it("2. Calculates fill transform correctly", () => {
    const geo = computeTransformGeometry(portraitSource, squareDest, {
      ...DEFAULT_ARTWORK_TRANSFORM,
      mode: "fill",
    });
    // Width fills 2400, height becomes 3600, centered at left = 0, top = -600
    expect(geo.width).toBe(2400);
    expect(geo.height).toBe(3600);
    expect(geo.left).toBe(0);
    expect(geo.top).toBe(-600);
    expect(geo.showBackdrop).toBe(false);
  });

  // Test 3: Zoom transform
  it("3. Calculates zoom scale correctly", () => {
    const geo = computeTransformGeometry(squareSource, squareDest, {
      ...DEFAULT_ARTWORK_TRANSFORM,
      mode: "fit",
      scale: 1.5,
    });
    expect(geo.width).toBe(3600);
    expect(geo.height).toBe(3600);
    expect(geo.left).toBe(-600);
    expect(geo.top).toBe(-600);
  });

  // Test 4: X offset
  it("4. Calculates X offset correctly", () => {
    const geo = computeTransformGeometry(squareSource, squareDest, {
      ...DEFAULT_ARTWORK_TRANSFORM,
      offsetX: 0.2, // shift right by 20% of destWidth (480px)
    });
    expect(geo.left).toBe(480);
    expect(geo.top).toBe(0);
  });

  // Test 5: Y offset
  it("5. Calculates Y offset correctly", () => {
    const geo = computeTransformGeometry(squareSource, squareDest, {
      ...DEFAULT_ARTWORK_TRANSFORM,
      offsetY: -0.1, // shift up by 10% of destHeight (-240px)
    });
    expect(geo.left).toBe(0);
    expect(geo.top).toBe(-240);
  });

  // Test 6: Reset / default transform
  it("6. Reset returns default transform bounds", () => {
    const sanitized = sanitizeTransform(null);
    expect(sanitized).toEqual(DEFAULT_ARTWORK_TRANSFORM);

    const geo = computeTransformGeometry(squareSource, squareDest, sanitized);
    expect(geo.width).toBe(2400);
    expect(geo.height).toBe(2400);
    expect(geo.left).toBe(0);
    expect(geo.top).toBe(0);
  });

  // Test 7: Serialization & sanitization
  it("7. Sanitizes invalid scale and offset input bounds", () => {
    const badInput: Partial<ArtworkTransform> = {
      scale: 100, // should clamp to 5.0
      offsetX: -10, // should clamp to -2.0
      offsetY: 10, // should clamp to 2.0
    };
    const clean = sanitizeTransform(badInput);
    expect(clean.scale).toBe(5.0);
    expect(clean.offsetX).toBe(-2.0);
    expect(clean.offsetY).toBe(2.0);
  });

  // Test 8: Square destination geometry
  it("8. Square destination bounds match expected aspect", () => {
    const geo = computeTransformGeometry(squareSource, squareDest, DEFAULT_ARTWORK_TRANSFORM);
    expect(geo.destWidth).toBe(2400);
    expect(geo.destHeight).toBe(2400);
  });

  // Test 9: Spread 2-page master destination geometry
  it("9. Spread master destination bounds calculate 4800x2400", () => {
    const geo = computeTransformGeometry(wideSource, spreadDest, DEFAULT_ARTWORK_TRANSFORM);
    expect(geo.destWidth).toBe(4800);
    expect(geo.destHeight).toBe(2400);
    expect(geo.width).toBe(4800);
    expect(geo.height).toBe(2400);
  });

  // Test 10: Exact split coordinates for spread
  it("10. Master spread splits at exact center X (2400px)", () => {
    const geo = computeTransformGeometry(wideSource, spreadDest, {
      ...DEFAULT_ARTWORK_TRANSFORM,
      offsetX: 0.1, // shift right
    });
    // Left leaf gets 0..2400, Right leaf gets 2400..4800
    expect(geo.left).toBe(480);
    expect(geo.destWidth / 2).toBe(2400);
  });

  // Test 11: Transform survives review state and reaches exporter
  it("11. Saved transform data reaches exporter pipeline and produces valid files", async () => {
    const tmpDir = path.join(__dirname, "../../storybook-out/test-temp-part2-export");
    await mkdir(tmpDir, { recursive: true });
    try {
      const dummyChild: ChildProfile = { name: "Test", age: 5, gender: "boy" };
      const images = new Map<number, ProvidedImage>();

      const testPng = await sharp({
        create: { width: 2000, height: 1000, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 1 } },
      })
        .png()
        .toBuffer();

      // Custom transform with scale and offset
      const customTransform: ArtworkTransform = {
        mode: "manual",
        scale: 1.2,
        offsetX: 0.1,
        offsetY: -0.05,
        backgroundMode: "extended",
      };

      for (let i = 0; i < 21; i++) {
        images.set(i, {
          buffer: testPng,
          mimeType: "image/png",
          transform: i === 1 ? customTransform : undefined, // Apply to Illus 02 spread
        });
      }

      const result = await exportPrintifyBook({
        child: dummyChild,
        bookId: "great-adventure",
        profileId: "printify-hardcover-square-8x8",
        images,
      });

      expect(result.ok).toBe(true);
      expect(result.dir).toBeTruthy();
      const files = await readdir(result.dir!);
      expect(files).toContain("cover.png");
      expect(files).toContain("page-01.png");
      expect(files).toContain("page-24.png");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }, 120000);

  // Test 12: Invalid transforms fallback gracefully
  it("12. Invalid transform fallback maintains stable default behavior", () => {
    const nullTransformGeo = computeTransformGeometry(squareSource, squareDest, sanitizeTransform(null));
    expect(nullTransformGeo).toEqual(computeTransformGeometry(squareSource, squareDest, DEFAULT_ARTWORK_TRANSFORM));
  });
});
