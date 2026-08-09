import puppeteer from "puppeteer";
import sharp from "sharp";
import type { ChildProfile, GeneratedPage } from "../story/types";
import type { PrintProfile } from "../print/types";
import { assertSpreadsAligned } from "./imposition";
import { composeLuluPageRaster, validatePageRaster } from "../print/luluPageComposer";
import { renderPrintifyPageHtml } from "../print/printifyPageTemplate";
import { sanitizeTransform } from "../print/artworkTransform";

export async function buildLuluInteriorBook(
  pages: GeneratedPage[],
  child: ChildProfile,
  profile: PrintProfile,
): Promise<Buffer> {
  if (profile.exportMode !== "lulu-interior-pdf") {
    throw new Error(
      `Profile "${profile.id}" exportMode is "${profile.exportMode}", expected "lulu-interior-pdf".`,
    );
  }

  // 1. Validate spread alignment against full page tree (cover = page 1)
  assertSpreadsAligned(pages);

  // 2. Filter out cover and backcover pages — Lulu interior PDF contains ONLY interior pages
  const interiorPages = pages.filter(
    (p) => p.kind !== "cover" && p.kind !== "backcover",
  );

  const canvas = profile.canvasPx;
  const pageWIn = profile.finalPageIn?.width ?? canvas.width / profile.dpi;
  const pageHIn = profile.finalPageIn?.height ?? canvas.height / profile.dpi;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const pageRasters: Buffer[] = [];

  try {
    // 3. Render every physical interior page to a 300-PPI flattened opaque sRGB raster
    for (const p of interiorPages) {
      if (p.spread) {
        // Two-page spread: render wide master spread HTML (2 * canvas.width) and split into left & right leaves
        const wideCanvas = { width: canvas.width * 2, height: canvas.height };
        let sourcePx: { width: number; height: number } | undefined;
        if (p.image) {
          try {
            const meta = await sharp(p.image).metadata();
            if (meta.width && meta.height) sourcePx = { width: meta.width, height: meta.height };
          } catch {
            // ignore
          }
        }

        const uri = p.image ? `data:${p.imageMimeType};base64,${p.image.toString("base64")}` : null;
        const html = renderPrintifyPageHtml(
          { ...profile, canvasPx: wideCanvas },
          {
            imageDataUri: uri,
            text: p.text,
            ink: p.verseInk ?? "light",
            transform: sanitizeTransform(p.transform),
            sourcePx,
          },
        );

        const puppetPage = await browser.newPage();
        try {
          await puppetPage.setViewport({
            width: wideCanvas.width,
            height: wideCanvas.height,
            deviceScaleFactor: 1,
          });
          await puppetPage.setContent(html, { waitUntil: "load" });

          // Left leaf
          const leftPng = await puppetPage.screenshot({
            type: "png",
            clip: { x: 0, y: 0, width: canvas.width, height: canvas.height },
          });
          const leftJpg = await sharp(leftPng)
            .removeAlpha()
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 95 })
            .toBuffer();
          await validatePageRaster(leftJpg, canvas);
          pageRasters.push(leftJpg);

          // Right leaf (no verse text on right leaf)
          const rightPng = await puppetPage.screenshot({
            type: "png",
            clip: { x: canvas.width, y: 0, width: canvas.width, height: canvas.height },
          });
          const rightJpg = await sharp(rightPng)
            .removeAlpha()
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 95 })
            .toBuffer();
          await validatePageRaster(rightJpg, canvas);
          pageRasters.push(rightJpg);
        } finally {
          await puppetPage.close();
        }
      } else {
        // Single interior page
        const raster = await composeLuluPageRaster(p, child, profile, browser);
        pageRasters.push(raster);
      }
    }

    // 4. Assemble image-only HTML embedding already-flattened 300-PPI page rasters
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${pageWIn}in ${pageHIn}in; margin: 0; }
    body { margin: 0; padding: 0; background: #ffffff; }
    .lulu-leaf {
      width: ${pageWIn}in;
      height: ${pageHIn}in;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .lulu-leaf img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: fill;
    }
  </style>
</head>
<body>
  ${pageRasters
    .map((r) => `<div class="lulu-leaf"><img src="data:image/jpeg;base64,${r.toString("base64")}" alt="" /></div>`)
    .join("")}
</body>
</html>`;

    // 5. Print to PDF with Puppeteer at profile's exact full-bleed dimensions
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        width: `${pageWIn}in`,
        height: `${pageHIn}in`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: false,
      });

      const pdfBuf = Buffer.from(pdf);

      // Post-export validation: check PDF MediaBox
      const expectedPtW = Math.round(pageWIn * 72);
      const expectedPtH = Math.round(pageHIn * 72);
      const str = pdfBuf.toString("latin1");
      const mbMatch = str.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/i);

      if (mbMatch) {
        const actualW = Math.round(Math.abs(parseFloat(mbMatch[3]) - parseFloat(mbMatch[1])));
        const actualH = Math.round(Math.abs(parseFloat(mbMatch[4]) - parseFloat(mbMatch[2])));
        if (Math.abs(actualW - expectedPtW) > 1 || Math.abs(actualH - expectedPtH) > 1) {
          throw new Error(
            `Exported PDF MediaBox ${actualW}x${actualH} pt does not match expected ${expectedPtW}x${expectedPtH} pt.`,
          );
        }
      }

      return pdfBuf;
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
