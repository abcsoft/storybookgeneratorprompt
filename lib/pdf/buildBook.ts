/**
 * Assemble generated pages into a single print-ready PDF using Puppeteer.
 *
 * For Classic Landscape 11x8 standard-single:
 * Trim: 11 × 8 inches
 * Full bleed: 11.25 × 8.25 inches
 * Final page raster: 3375 × 2475 px
 * Output grid: 300 PPI
 * All final page backgrounds must be exactly 3375×2475 pixels.
 * Preserves aspect ratio without non-uniform stretching.
 */

import sharp from "sharp";
import puppeteer from "puppeteer";
import { DPI } from "../config";
import type { ChildProfile, GeneratedPage } from "../story/types";
import { assertSpreadsAligned } from "./imposition";
import { PAGE_H_IN, PAGE_W_IN, renderBookHtml } from "./page-template";
import { injectPdfBoxes } from "./pdfBoxes";
import type { PrintProfile } from "../print/types";
import type { ArtworkTransform } from "../print/artworkTransform";

export const PAGE_W_PX = Math.round(PAGE_W_IN * DPI); // 3375 px
export const PAGE_H_PX = Math.round(PAGE_H_IN * DPI); // 2475 px

export interface BuildBookOptions {
  draft?: boolean;
}

/**
 * Optimize and normalize a page image into an EXACT fixed-size page raster:
 * Single page: exactly 3375 × 2475 px (300 PPI on 11.25 × 8.25 in).
 * Spread: exactly 6675 × 2475 px (300 PPI on 22.25 × 8.25 in).
 *
 * Preserves aspect ratio without non-uniform stretching.
 * If "contain" is requested, generates a blurred ambient backdrop rather than uneven black/transparent padding.
 */
export async function optimizePageImage(
  image: Buffer,
  spread = false,
  transform?: ArtworkTransform,
): Promise<{ data: Buffer; mimeType: string }> {
  const targetW = spread ? 6675 : 3375;
  const targetH = 2475;

  let pipeline = sharp(image).rotate();
  const meta = await pipeline.metadata();
  const srcW = meta.width ?? targetW;
  const srcH = meta.height ?? targetH;

  const t = transform as any;

  // Handle contain framing with ambient backdrop
  if (t?.fit === "contain" || t?.mode === "fit") {
    const backdrop = await sharp(image)
      .rotate()
      .resize(targetW, targetH, { fit: "cover" })
      .blur(25)
      .modulate({ brightness: 0.85 })
      .toBuffer();

    const contained = await sharp(image)
      .rotate()
      .resize(targetW, targetH, { fit: "inside" })
      .toBuffer();

    const composited = await sharp(backdrop)
      .composite([{ input: contained, gravity: "center" }])
      .resize(targetW, targetH, { fit: "fill" })
      .jpeg({ quality: 85 })
      .toBuffer();

    return { data: composited, mimeType: "image/jpeg" };
  }

  // Handle explicit crop rect if provided
  if (t?.cropRect) {
    const { x, y, width, height } = t.cropRect;
    if (width > 0 && height > 0 && x >= 0 && y >= 0) {
      const extractLeft = Math.max(0, Math.min(Math.round(x), srcW - 1));
      const extractTop = Math.max(0, Math.min(Math.round(y), srcH - 1));
      const extractW = Math.max(1, Math.min(Math.round(width), srcW - extractLeft));
      const extractH = Math.max(1, Math.min(Math.round(height), srcH - extractTop));
      pipeline = pipeline.extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH });
    }
  }

  // Standard proportional cover crop producing exact fixed raster size without stretching
  const position = t?.position ?? "center";
  const data = await pipeline
    .resize(targetW, targetH, {
      fit: "cover",
      position,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { data, mimeType: "image/jpeg" };
}

/** Brightness above which we switch the verse to dark ink (0–255 perceived). */
const VERSE_INK_THRESHOLD = 128;

export function chooseVerseInk(meanLuminance: number): "light" | "dark" {
  return meanLuminance > VERSE_INK_THRESHOLD ? "dark" : "light";
}

function hasVerse(kind: GeneratedPage["kind"]): boolean {
  return kind === "scene" || kind === "intro" || kind === "closing" || kind === "greeting";
}

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
    return "light";
  }
}

async function renderPagesToPdf(pages: GeneratedPage[], child: ChildProfile, isDraft: boolean): Promise<Buffer> {
  // Fail closed in production: no missing artwork allowed
  if (!isDraft) {
    const missingPages = pages.filter((p) => p.failed || !p.image);
    if (missingPages.length > 0) {
      const err = new Error(
        `Production PDF assembly failed: ${missingPages.length} required artwork pages are missing.`,
      );
      (err as any).code = "MISSING_REQUIRED_ARTWORK";
      (err as any).missingSlots = missingPages.map((p) => ({
        slotId: p.slotId ?? `page-${String(p.index + 1).padStart(2, "0")}`,
        physicalPages: [p.index + 1],
      }));
      throw err;
    }
  }

  // Fail fast: every two-page spread must land on a facing pair
  if (pages.some((p) => p.spread)) {
    assertSpreadsAligned(pages);
  }

  // Optimize and normalize every image to exact raster dimensions
  const optimized: GeneratedPage[] = await Promise.all(
    pages.map(async (p) => {
      if (!p.image) return p;
      const { data, mimeType } = await optimizePageImage(p.image, p.spread, p.transform);
      const verseInk = hasVerse(p.kind)
        ? (p.verseInk ?? (await pickVerseInk(data, p.spread ?? false)))
        : p.verseInk;
      return { ...p, image: data, imageMimeType: mimeType, verseInk };
    }),
  );

  const html = renderBookHtml(optimized, child, { draft: isDraft });

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

    const rawBuffer = Buffer.from(pdf);
    return injectPdfBoxes(rawBuffer);
  } finally {
    await browser.close();
  }
}

export async function buildBook(
  pages: GeneratedPage[],
  child: ChildProfile,
  profile?: PrintProfile,
  options?: BuildBookOptions,
): Promise<Buffer> {
  return renderPagesToPdf(pages, child, options?.draft === true);
}

/**
 * `great-adventure-interior.pdf` production output for any profile using
 * this (vector-PDF, page.pdf()) pipeline — filters out the cover/backcover
 * pages and renders the SAME HTML/CSS as the combined preview, so it keeps
 * real, searchable vector story text (unlike the Lulu raster pipeline in
 * lib/pdf/luluExport.ts, which flattens every page to an opaque JPEG for
 * print-color fidelity and has no embedded text at all).
 *
 * Fails closed on the same structural invariants as
 * lib/pdf/luluExport.ts's buildLuluInteriorBook: no cover/backcover leaking
 * into the interior sequence, no duplicate slots, greeting must be page 1,
 * video-qr must be the last interior page (when those kinds are present —
 * i.e. for a StoryEdition-backed book; older books without a greeting/
 * video-qr page skip that specific check).
 */
export async function buildInteriorOnlyBook(
  pages: GeneratedPage[],
  child: ChildProfile,
  options?: BuildBookOptions,
): Promise<Buffer> {
  const isDraft = options?.draft === true;
  const interiorPages = pages.filter((p) => p.kind !== "cover" && p.kind !== "backcover");

  if (interiorPages.some((p) => p.kind === "cover" || p.kind === "backcover")) {
    throw new Error("Interior PDF invariant violated: a cover/backcover page survived the interior filter.");
  }
  const seenSlotIds = new Set<string>();
  for (const p of interiorPages) {
    if (p.slotId) {
      if (seenSlotIds.has(p.slotId)) {
        throw new Error(`Interior PDF invariant violated: duplicate slot "${p.slotId}" in the interior page sequence.`);
      }
      seenSlotIds.add(p.slotId);
    }
  }
  const hasStandardEditionKinds = interiorPages.some((p) => p.kind === "greeting" || p.kind === "video-qr");
  if (hasStandardEditionKinds) {
    const greetingIndex = interiorPages.findIndex((p) => p.kind === "greeting");
    const videoQrIndex = interiorPages.findIndex((p) => p.kind === "video-qr");
    if (greetingIndex !== -1 && greetingIndex !== 0) {
      throw new Error("Interior PDF invariant violated: the greeting page must be interior page 1.");
    }
    if (videoQrIndex !== -1 && videoQrIndex !== interiorPages.length - 1) {
      throw new Error("Interior PDF invariant violated: the video-qr page must be the last interior page.");
    }
  }

  return renderPagesToPdf(interiorPages, child, isDraft);
}

/**
 * A labelled review/proof PDF — the SAME combined cover+interior+backcover
 * document as before, but callers should treat this as a preview artifact
 * only, never as a production printer file (see buildInteriorOnlyBook /
 * lib/print/coverWrapExport.ts for the actual production outputs).
 */
export async function buildCombinedReviewProof(
  pages: GeneratedPage[],
  child: ChildProfile,
  options?: BuildBookOptions,
): Promise<Buffer> {
  return renderPagesToPdf(pages, child, options?.draft === true);
}
