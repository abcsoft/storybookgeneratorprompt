/**
 * Lulu Final 300-PPI Page Rasterizer & Validator.
 *
 * Renders each interior physical page at exact profile canvas dimensions
 * (3375 x 2625 px for Landscape 11x8.5, 2625 x 2625 px for Square 8.5x8.5) and
 * flattens all artwork, transforms, text panels, and typography into one 100%
 * opaque sRGB image buffer (0 alpha channel).
 */

import sharp from "sharp";
import type { Browser } from "puppeteer";
import type { GeneratedPage, ChildProfile } from "../story/types";
import type { PrintProfile, PxSize } from "./types";
import { renderPrintifyPageHtml } from "./printifyPageTemplate";
import { sanitizeTransform } from "./artworkTransform";

function dataUri(page: GeneratedPage): string | null {
  if (!page.image) return null;
  return `data:${page.imageMimeType};base64,${page.image.toString("base64")}`;
}

export interface PageRasterValidation {
  ok: boolean;
  width: number;
  height: number;
  channels: number;
  hasAlpha: boolean;
  errors: string[];
}

/**
 * Validates a rendered page raster image BEFORE PDF assembly or post-export.
 */
export async function validatePageRaster(
  buffer: Buffer,
  expectedPx: PxSize,
): Promise<PageRasterValidation> {
  const errors: string[] = [];
  try {
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const channels = meta.channels ?? 0;
    const hasAlpha = meta.hasAlpha ?? (channels > 3);

    if (width !== expectedPx.width || height !== expectedPx.height) {
      errors.push(
        `Raster dimensions ${width}x${height} do not match expected ${expectedPx.width}x${expectedPx.height}.`,
      );
    }

    if (hasAlpha) {
      errors.push(`Raster contains an unflattened alpha channel (must be opaque RGB/sRGB).`);
    }

    if (buffer.length === 0) {
      errors.push(`Raster buffer is empty (0 bytes).`);
    }

    return {
      ok: errors.length === 0,
      width,
      height,
      channels,
      hasAlpha,
      errors,
    };
  } catch (err) {
    return {
      ok: false,
      width: 0,
      height: 0,
      channels: 0,
      hasAlpha: true,
      errors: [`Failed to inspect raster image metadata: ${String(err)}`],
    };
  }
}

/**
 * Renders a single interior physical page to an opaque 300-PPI sRGB raster buffer.
 */
export async function composeLuluPageRaster(
  page: GeneratedPage,
  child: ChildProfile,
  profile: PrintProfile,
  browser: Browser,
  sourcePxOverride?: PxSize,
): Promise<Buffer> {
  const canvas = profile.canvasPx;
  const uri = dataUri(page);
  const transform = sanitizeTransform(page.transform);

  let sourcePx = sourcePxOverride;
  if (!sourcePx && page.image) {
    try {
      const meta = await sharp(page.image).metadata();
      if (meta.width && meta.height) {
        sourcePx = { width: meta.width, height: meta.height };
      }
    } catch {
      // fallback if metadata read fails
    }
  }

  const html = renderPrintifyPageHtml(profile, {
    imageDataUri: uri,
    text: page.text,
    ink: page.verseInk ?? "light",
    transform,
    sourcePx,
  });

  const puppetPage = await browser.newPage();
  try {
    await puppetPage.setViewport({
      width: canvas.width,
      height: canvas.height,
      deviceScaleFactor: 1,
    });
    await puppetPage.setContent(html, { waitUntil: "load" });

    const rawPng = await puppetPage.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    });

    // Flatten alpha into 100% opaque RGB sRGB JPEG (95 quality)
    const opaqueJpg = await sharp(rawPng)
      .removeAlpha()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 95 })
      .toBuffer();

    const validation = await validatePageRaster(opaqueJpg, canvas);
    if (!validation.ok) {
      throw new Error(`Page raster validation failed:\n${validation.errors.join("\n")}`);
    }

    return opaqueJpg;
  } finally {
    await puppetPage.close();
  }
}
