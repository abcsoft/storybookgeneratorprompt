/**
 * Renders a wrap-around cover (lib/print/coverTemplate.ts) to a PNG at exact
 * `profile.coverGeometryPx`, via a headless Puppeteer screenshot — same
 * engine `lib/pdf/buildBook.ts` uses for the landscape PDF, so font/CSS
 * rendering stays consistent across both print pipelines.
 */

import puppeteer from "puppeteer";
import { renderCoverHtml, type CoverArt, type CoverText } from "./coverTemplate";
import type { PrintProfile } from "./types";

export interface CoverArtInput {
  front: { data: Buffer; mimeType: string };
  back?: { data: Buffer; mimeType: string } | null;
}

function dataUri(image: { data: Buffer; mimeType: string }): string {
  return `data:${image.mimeType};base64,${image.data.toString("base64")}`;
}

export async function composeCover(
  profile: PrintProfile,
  artInput: CoverArtInput,
  text: CoverText,
): Promise<Buffer> {
  const canvas = profile.coverGeometryPx;
  if (!canvas) {
    throw new Error(`Print profile "${profile.id}" has no coverGeometryPx.`);
  }

  const art: CoverArt = {
    frontDataUri: dataUri(artInput.front),
    backDataUri: artInput.back ? dataUri(artInput.back) : null,
  };
  const html = renderCoverHtml(profile, art, text);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: canvas.width,
      height: canvas.height,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "load" });

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    });

    return Buffer.from(png);
  } finally {
    await browser.close();
  }
}
