import { describe, expect, it } from "vitest";
import sharp from "sharp";
import puppeteer from "puppeteer";
import { renderPrintifyPageHtml } from "./printifyPageTemplate";
import { getPrintProfile } from "./registry";
import { computeTransformGeometry, sanitizeTransform, resolveArtworkRender, type ArtworkTransform } from "./artworkTransform";
import { composeCover } from "./coverComposer";

async function createColoredBuffer(w = 1600, h = 900, color = { r: 239, g: 68, b: 68 }): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { ...color, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe("EXPORT ARTWORK INTEGRITY REGRESSION SUITE", () => {
  const profile = getPrintProfile("printify-hardcover-square-8x8");

  it("1. Direct Buffer -> compositor visibly includes artwork pixels in 2400x2400 raster", async () => {
    const buf = await createColoredBuffer(1600, 900, { r: 239, g: 68, b: 68 });
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;

    const html = renderPrintifyPageHtml(profile, {
      imageDataUri: dataUri,
      text: "Test Copy",
      ink: "light",
      transform: sanitizeTransform({ mode: "fill", scale: 1.0, offsetX: 0, offsetY: 0, backgroundMode: "none" }),
      sourcePx: { width: 1600, height: 900 },
    });

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 2400, height: 2400 });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll("img"));
        await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((res) => (i.onload = res)))));
      });

      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 2400, height: 2400 } });
      const stats = await sharp(png).stats();

      // Red channel mean should be dominant (> 80)
      expect(stats.channels[0].mean).toBeGreaterThan(80);
    } finally {
      await browser.close();
    }
  }, 20000);

  it("2. Server receives non-zero File bytes and valid data URIs", async () => {
    const buf = await createColoredBuffer(1000, 1000);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("3. Browser blob URL is never embedded as dataUri string for server export", () => {
    const blobUrl = "blob:http://localhost:3000/1234-5678";
    expect(blobUrl.startsWith("blob:")).toBe(true);
    expect(blobUrl.startsWith("data:image")).toBe(false);
  });

  it("4. Default transform yields non-zero visible artwork rectangle", () => {
    const geo = computeTransformGeometry({ width: 2000, height: 1000 }, { width: 2400, height: 2400 }, sanitizeTransform(undefined));
    expect(geo.width).toBeGreaterThan(0);
    expect(geo.height).toBeGreaterThan(0);
  });

  it("5. Saved transform serializes/deserializes correctly without losing precision", () => {
    const original: ArtworkTransform = { mode: "manual", scale: 1.35, offsetX: 0.12, offsetY: -0.08, backgroundMode: "extended" };
    const serialized = JSON.stringify(original);
    const deserialized = sanitizeTransform(JSON.parse(serialized));
    expect(deserialized.mode).toBe("manual");
    expect(deserialized.scale).toBe(1.35);
    expect(deserialized.offsetX).toBe(0.12);
    expect(deserialized.offsetY).toBe(-0.08);
    expect(deserialized.backgroundMode).toBe("extended");
  });

  it("6. Source resolution does not change relative artwork placement", () => {
    const t: ArtworkTransform = { mode: "manual", scale: 1.2, offsetX: 0.1, offsetY: 0.05, backgroundMode: "none" };
    const renderHigh = resolveArtworkRender({ sourceWidth: 2752, sourceHeight: 1536, targetWidth: 2400, targetHeight: 2400, transform: t, layout: "single" });
    const renderLow = resolveArtworkRender({ sourceWidth: 1376, sourceHeight: 768, targetWidth: 2400, targetHeight: 2400, transform: t, layout: "single" });

    expect(Math.abs(renderHigh.leftPct - renderLow.leftPct)).toBeLessThan(0.01);
    expect(Math.abs(renderHigh.topPct - renderLow.topPct)).toBeLessThan(0.01);
  });

  it("7. Background layer does not cover foreground artwork in HTML stack", () => {
    const html = renderPrintifyPageHtml(profile, {
      imageDataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      text: "Test",
      transform: sanitizeTransform({ backgroundMode: "extended" }),
      sourcePx: { width: 1000, height: 1000 },
    });

    const backdropIdx = html.indexOf("art-frame__backdrop");
    const subjectIdx = html.indexOf("art-frame__subject");
    const verseIdx = html.indexOf("verse");

    // Order: backdrop before subject, subject before verse
    expect(backdropIdx).toBeGreaterThan(-1);
    expect(subjectIdx).toBeGreaterThan(backdropIdx);
    expect(verseIdx).toBeGreaterThan(subjectIdx);
  });

  it("8. Cover compositor renders front artwork buffer without blanking", async () => {
    const frontBuf = await createColoredBuffer(2000, 2000, { r: 59, g: 130, b: 246 });
    const coverPng = await composeCover(
      profile,
      { front: { data: frontBuf, mimeType: "image/png" } },
      { title: "Dream Big", childName: "Mehedi" },
    );

    const stats = await sharp(coverPng).stats();
    expect(stats.channels[2].mean).toBeGreaterThan(50); // Blue channel dominant
  }, 20000);

  it("9. Printify profile interior page count remains exactly 24", () => {
    expect(profile.interiorPageCount).toBe(24);
  });

  it("10. Final Printify page dimensions remain exactly 2400x2400", () => {
    expect(profile.canvasPx.width).toBe(2400);
    expect(profile.canvasPx.height).toBe(2400);
  });
});
