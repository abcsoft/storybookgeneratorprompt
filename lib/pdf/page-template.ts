/**
 * HTML/CSS template for the book — a landscape picture book.
 *
 * Most scenes are a single full-bleed landscape page with the rhyming verse
 * woven into the artwork over a soft scrim (no cards or pill badges). A few
 * "hero" scenes are two-page spreads: one wide illustration split across both
 * leaves at the gutter, with the verse on the left leaf.
 *
 * Illustrations are embedded as data URIs (Puppeteer needs no network) and the
 * brand fonts are base64-embedded so the book renders identically anywhere.
 */

import { BLEED_INCHES, PAGE_HEIGHT_IN, PAGE_WIDTH_IN } from "../config";
import type { ChildProfile, GeneratedPage } from "../story/types";

/** Full leaf size in inches, including bleed on every edge. */
export const PAGE_W_IN = PAGE_WIDTH_IN + BLEED_INCHES * 2;
export const PAGE_H_IN = PAGE_HEIGHT_IN + BLEED_INCHES * 2;

const TITLE_GOLD = "#ffd36b";

// Embed the same fonts the site uses. Missing files fall back to system fonts.
const FONT_FILES: Array<[string, number, string]> = [
  ["Fredoka", 600, "fredoka-600.woff2"],
  ["Fredoka", 700, "fredoka-700.woff2"],
  ["Nunito", 700, "nunito-700.woff2"],
  ["Nunito", 800, "nunito-800.woff2"],
];

let fontCssCache: string | null = null;
/** Exported for reuse by lib/print's cover/page templates, which embed the
 *  same brand fonts at different canvas sizes. */
export function fontFaceCss(): string {
  if (fontCssCache !== null) return fontCssCache;
  if (typeof window !== "undefined") return "";
  const faces: string[] = [];
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    for (const [family, weight, file] of FONT_FILES) {
      try {
        const b64 = fs.readFileSync(path.join(process.cwd(), "public/fonts", file)).toString("base64");
        faces.push(
          `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; src: url("data:font/woff2;base64,${b64}") format("woff2"); }`,
        );
      } catch {
        // Fall back to Google Fonts @import when physical woff2 files missing
      }
    }
  } catch {
    return "";
  }
  fontCssCache = faces.join("\n");
  return fontCssCache;
}

/** Exported for reuse by lib/print's cover/page templates. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turn copy with blank lines into paragraphs and single newlines into breaks.
 *  Exported for reuse by lib/print's page template. */
export function formatText(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

import { ARTWORK_FRAME_CSS } from "../print/artworkFrame";
import { sanitizeTransform } from "../print/artworkTransform";

function dataUri(page: GeneratedPage): string | null {
  if (!page.image) return null;
  return `data:${page.imageMimeType};base64,${page.image.toString("base64")}`;
}

/** Non-destructive artwork framing for classic PDF (contain + backdrop). */
function background(page: GeneratedPage, side?: "left" | "right" | "full"): string {
  const uri = dataUri(page);
  if (!uri) return `<div class="bg fallback"></div>`;

  const transform = sanitizeTransform(page.transform);
  const showBackdrop = transform.backgroundMode === "extended";

  if (side === "left" || side === "right") {
    const shiftStyle = side === "left" ? "left: 0%;" : "left: -100%;";
    return `
      <div class="art-frame">
        ${showBackdrop ? `<img class="art-frame__backdrop" src="${uri}" style="${shiftStyle} width: 200%; max-width: none;" alt="" />` : ""}
        <div style="position: absolute; inset: 0; overflow: hidden;">
          <div style="position: absolute; top: 0; ${shiftStyle} width: 200%; height: 100%;">
            <img class="art-frame__subject" src="${uri}" style="width: 100%; height: 100%; object-fit: contain;" alt="" />
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="art-frame">
      ${showBackdrop ? `<img class="art-frame__backdrop" src="${uri}" alt="" />` : ""}
      <img class="art-frame__subject" src="${uri}" alt="" />
    </div>`;
}

/**
 * Cover title lockup. The full title is usually "<Name>'s <Series> Adventure";
 * we make the child the hero — a small gold eyebrow ("The Dream Big Adventure")
 * above their name set large — and fall back to the raw title otherwise.
 */
function coverLockup(page: GeneratedPage, child: ChildProfile): string {
  const title = page.text.trim();
  const poss = `${child.name}'s`;
  let hero = title;
  let eyebrow = "";
  if (title.toLowerCase().startsWith(poss.toLowerCase())) {
    const rest = title.slice(poss.length).trim(); // e.g. "Great Detective"
    hero = child.name;
    if (rest) eyebrow = `The ${rest}`;
  }
  return `<div class="cover-title">
      ${eyebrow ? `<span class="cover-eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
      <h1 class="cover-name">${escapeHtml(hero)}</h1>
    </div>`;
}

/** Verse backing: dark ink over a soft translucent-white panel behind EVERY
 *  verse, on every page (light OR dark scene). UNCONDITIONAL by design — the box
 *  must never be missing, so this does NOT branch on verseInk. (Gating it on the
 *  auto-detected ink is exactly how some pages silently lost the box.) A flat,
 *  constant-alpha panel renders identically in Chrome, macOS Preview, and Acrobat;
 *  a blurred text-shadow does not (some viewers rasterize it into hard boxes). */
function verseStyle(): string {
  return (
    ` style="color:#231d2b;background:rgba(255,255,255,0.55);` +
    `padding:0.16in 0.24in;border-radius:0.16in"`
  );
}

function pageHtml(page: GeneratedPage, child: ChildProfile): string {
  if (page.kind === "cover") {
    return `<section class="page cover">
      ${background(page, "full")}
      <div class="scrim cover-scrim"></div>
      ${coverLockup(page, child)}
    </section>`;
  }

  if (page.kind === "backcover") {
    // The verse panel is omitted entirely when the back cover has no text, so an
    // image-only closing page stays clean (no empty panel painted over the art).
    const backText = page.text.trim()
      ? `<div class="backcover-text"><span class="backcover-panel">${escapeHtml(page.text)}</span></div>`
      : "";
    return `<section class="page backcover">
      ${background(page, "full")}
      <div class="scrim scrim-strong"></div>
      ${backText}
    </section>`;
  }

  // Two-page spread: one wide image split across the gutter, verse on the left.
  if (page.spread) {
    return `<section class="page spread spread-left">
      ${background(page, "left")}
      <div class="scrim"></div>
      <div class="verse"${verseStyle()}>${formatText(page.text)}</div>
    </section>
    <section class="page spread spread-right">
      ${background(page, "right")}
    </section>`;
  }

  // Single full-bleed page with verse woven into the art.
  return `<section class="page single">
    ${background(page, "full")}
    <div class="scrim"></div>
    <div class="verse"${verseStyle()}>${formatText(page.text)}</div>
  </section>`;
}

export function renderBookHtml(
  pages: GeneratedPage[],
  child: ChildProfile,
): string {
  const body = pages.map((p) => pageHtml(p, child)).join("\n");

  // Document title = the cover's title text, so it reflects the chosen book.
  const coverText = pages.find((p) => p.kind === "cover")?.text?.trim();
  const docTitle = coverText || `${child.name}'s Storybook`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>
  ${fontFaceCss()}
  @page { size: ${PAGE_W_IN}in ${PAGE_H_IN}in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Nunito", "Trebuchet MS", system-ui, sans-serif;
    color: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    position: relative;
    width: ${PAGE_W_IN}in;
    height: ${PAGE_H_IN}in;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  .bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .fallback {
    background: linear-gradient(165deg, #1f1a4d 0%, #4a3691 55%, #2f9e8f 100%);
  }

  /* Spread: the same wide image, shifted so each leaf shows half (continuous
     across the gutter). */
  .spread .bg { width: 200%; max-width: none; }
  .spread-left .bg { left: 0; }
  .spread-right .bg { left: -100%; }

  /* No dark panel behind text — the verse/title sit directly on the art and stay
     legible via the text outline + shadow defined below. The scrim div is kept
     (harmless) but paints nothing. */
  .scrim {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* Rhyming verse, woven into the lower-left of the art. */
  .verse {
    position: absolute;
    left: ${BLEED_INCHES + 0.6}in;
    right: auto;
    bottom: ${BLEED_INCHES + 0.55}in;
    max-width: 6.4in;
    text-align: left;
  }
  .verse p {
    margin: 0 0 0.1in;
    font-family: "Nunito", sans-serif;
    font-weight: 700;
    font-size: 21pt;
    line-height: 1.34;
    /* Ink + optional panel are set per-page on the .verse wrapper by verseStyle(). */
  }
  .verse p:last-child { margin-bottom: 0; }

  /* Cover title sits directly on the art (no dark glow); legibility via outline. */
  .cover-title {
    position: absolute;
    left: ${BLEED_INCHES + 0.85}in;
    right: auto;
    bottom: ${BLEED_INCHES + 0.95}in;
    max-width: 6in;
    text-align: left;
  }
  .cover-eyebrow {
    /* inline-flex so the dark panel hugs the eyebrow text (not the full width). */
    display: inline-flex;
    align-items: center;
    gap: 0.16in;
    font-family: "Nunito", sans-serif;
    font-weight: 800;
    font-size: 13pt;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #ffd277;
    margin-bottom: 0.18in;
    /* Dark pill behind the series title so the gold reads clearly over light
       covers (e.g. the desert scene). The name below stays boxless. */
    background: rgba(0, 0, 0, 0.6);
    padding: 0.1in 0.26in;
    border-radius: 0.6in;
  }
  .cover-eyebrow::before {
    content: "";
    width: 0.5in;
    height: 2.5px;
    border-radius: 3px;
    background: linear-gradient(90deg, ${TITLE_GOLD}, rgba(255, 211, 107, 0.08));
  }
  .cover-name {
    margin: 0;
    color: #fff;
    font-family: "Fredoka", "Trebuchet MS", sans-serif;
    font-size: 82pt;
    line-height: 0.96;
    font-weight: 700;
    letter-spacing: -0.015em;
    /* Plain text directly on the art — no shadow/box behind it. */
    text-shadow: none;
  }
  .backcover-text {
    position: absolute;
    left: ${BLEED_INCHES + 0.7}in;
    right: ${BLEED_INCHES + 0.7}in;
    bottom: ${BLEED_INCHES + 0.8}in;
    text-align: center;
    font-family: "Fredoka", "Trebuchet MS", sans-serif;
    font-size: 30pt;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  /* Dark ink on a soft translucent-white panel — the same legible backing used
     behind the verse on light scenes (see verseStyle), so the closing line reads
     clearly over a pale sky. The inline-block panel hugs the centered text. */
  .backcover-panel {
    display: inline-block;
    max-width: 8.2in;
    color: #231d2b;
    background: rgba(255, 255, 255, 0.45);
    padding: 0.16in 0.24in;
    border-radius: 0.16in;
    text-shadow: none;
  }

</style>
</head>
<body>
${body}
</body>
</html>`;
}
