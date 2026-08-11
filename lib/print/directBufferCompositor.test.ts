import { describe, expect, it } from "vitest";
import sharp from "sharp";
import puppeteer from "puppeteer";
import { renderPrintifyPageHtml } from "./printifyPageTemplate";
import { getPrintProfile } from "./registry";
import { sanitizeTransform } from "./artworkTransform";

async function createSampleArtworkBuffer(width = 1600, height = 900): Promise<Buffer> {
  // Create a 1600x900 image with a bright yellow circle on green background
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const isCircle = dx * dx + dy * dy < 250 * 250;
      if (isCircle) {
        raw[idx] = 255;     // R
        raw[idx + 1] = 220; // G
        raw[idx + 2] = 0;   // B
        raw[idx + 3] = 255; // A
      } else {
        raw[idx] = 34;      // R
        raw[idx + 1] = 139; // G
        raw[idx + 2] = 34;  // B
        raw[idx + 3] = 255; // A
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("DIRECT BUFFER COMPOSITOR ISOLATION TEST", () => {
  const profile = getPrintProfile("printify-hardcover-square-8x8");

  it("1. Direct Buffer compositor produces a 2400x2400 page raster containing artwork pixels", async () => {
    const artworkBuffer = await createSampleArtworkBuffer(1600, 900);
    const dataUri = `data:image/png;base64,${artworkBuffer.toString("base64")}`;

    const html = renderPrintifyPageHtml(profile, {
      imageDataUri: dataUri,
      text: "Up, up, and away! Test story copy.",
      ink: "dark",
      transform: sanitizeTransform({ mode: "fill", scale: 1.0, offsetX: 0, offsetY: 0, backgroundMode: "none" }),
      sourcePx: { width: 1600, height: 900 },
    });

    // Launch Puppeteer to render HTML to raster
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: profile.canvasPx.width,
        height: profile.canvasPx.height,
        deviceScaleFactor: 1,
      });
      await page.setContent(html, { waitUntil: "load" });

      const pagePng = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: profile.canvasPx.width, height: profile.canvasPx.height },
      });

      // Analyze pagePng using Sharp stats
      const stats = await sharp(pagePng).stats();
      const meta = await sharp(pagePng).metadata();

      expect(meta.width).toBe(2400);
      expect(meta.height).toBe(2400);

      // Verify yellow circle / green artwork color channels are present
      // Green channel mean should be high (> 50) and Red channel mean should be > 30
      expect(stats.channels[0].mean).toBeGreaterThan(30);
      expect(stats.channels[1].mean).toBeGreaterThan(50);
    } finally {
      await browser.close();
    }
  }, 20000);
});
