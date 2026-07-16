/**
 * Assemble generated pages into a single print-ready PDF using Puppeteer.
 *
 * The book is rendered as one HTML document (full-bleed landscape pages) and
 * printed to PDF at the configured trim + bleed size, with backgrounds enabled
 * so the full-bleed illustrations are preserved for the print shop. Spread pages
 * expand to two leaves inside the template.
 */

import sharp from "sharp";
import puppeteer from "puppeteer";
import { DPI } from "../config";
import type { ChildProfile, GeneratedPage } from "../story/types";
import { assertSpreadsAligned } from "./imposition";
import { PAGE_H_IN, PAGE_W_IN, renderBookHtml } from "./page-template";

const PAGE_W_PX = Math.round(PAGE_W_IN * DPI);
const PAGE_H_PX = Math.round(PAGE_H_IN * DPI);

/**
 * Downscale + JPEG-encode a page image to its needed print resolution. Full-res
 * PNGs (often 8–14 MB each) embedded as base64 produce a ~200 MB HTML string
 * that crashes Puppeteer's renderer during setContent. Spread images span two
 * leaves, so they keep twice the width.
 */
export async function optimizePageImage(
  image: Buffer,
  spread = false,
): Promise<{ data: Buffer; mimeType: string }> {
  const boxW = spread ? PAGE_W_PX * 2 : PAGE_W_PX;
  const data = await sharp(image)
    .rotate() // honor EXIF orientation
    .resize(boxW, PAGE_H_PX, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { data, mimeType: "image/jpeg" };
}

/** Brightness above which we switch the verse to dark ink (0–255 perceived).
 *  Calibrated against the sample book: light scenes (jungle ~143, misty waterfall
 *  ~131, golden treasure ~138) read better with dark ink, while the genuinely dark
 *  scenes (storm ~125, cave ~108, night ~82) stay white. */
const VERSE_INK_THRESHOLD = 128;

/** Choose the verse color from the brightness of the art behind it: dark ink on
 *  a light scene, white on a dark scene. */
export function chooseVerseInk(meanLuminance: number): "light" | "dark" {
  return meanLuminance > VERSE_INK_THRESHOLD ? "dark" : "light";
}

/** Only these page kinds render a verse via `.verse`. */
function hasVerse(kind: GeneratedPage["kind"]): boolean {
  return kind === "scene" || kind === "intro" || kind === "closing";
}

/**
 * Sample the lower-left region (where the verse sits) of a page image and pick
 * the verse ink. For spreads the verse is on the left leaf — i.e. the left half
 * of the wide image — so we sample the left ~30% there.
 */
async function pickVerseInk(
  image: Buffer,
  spread: boolean,
): Promise<"light" | "dark"> {
  try {
    const img = sharp(image);
    const { width = 0, height = 0 } = await img.metadata();
    if (!width || !height) return "light";
    const left = Math.round(width * 0.03);
    const cropW = Math.max(1, Math.round(width * (spread ? 0.3 : 0.6)) - left);
    const top = Math.round(height * 0.6);
    const cropH = Math.max(1, Math.round(height * 0.98) - top);
    const { channels } = await sharp(image)
      .extract({ left, top, width: cropW, height: cropH })
      .stats();
    const [r, g, b] = channels;
    const lum = 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
    return chooseVerseInk(lum);
  } catch {
    return "light"; // never fail the book over a sampling hiccup
  }
}

export async function buildBook(
  pages: GeneratedPage[],
  child: ChildProfile,
): Promise<Buffer> {
  // Fail fast: every two-page spread must land on a facing pair (begin on an
  // even page). A misaligned spread would be split across a page-turn in the
  // bound book, so we refuse to build rather than ship a broken spread.
  assertSpreadsAligned(pages);

  // Optimize every image before embedding so a full set of high-res pages
  // doesn't blow up the HTML and crash the renderer.
  const optimized: GeneratedPage[] = await Promise.all(
    pages.map(async (p) => {
      if (!p.image) return p;
      const { data, mimeType } = await optimizePageImage(p.image, p.spread);
      // Respect an explicit per-page ink override from the template; otherwise
      // auto-pick from the art behind the verse.
      const verseInk = hasVerse(p.kind)
        ? (p.verseInk ?? (await pickVerseInk(data, p.spread ?? false)))
        : p.verseInk;
      return { ...p, image: data, imageMimeType: mimeType, verseInk };
    }),
  );

  const html = renderBookHtml(optimized, child);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const pdf = await page.pdf({
      width: `${PAGE_W_IN}in`,
      height: `${PAGE_H_IN}in`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: false,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
