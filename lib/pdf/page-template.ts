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
import { isDetectiveSignText, parseDetectiveSignText } from "../story/theGreatDetectiveTemplate";

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
function background(page: GeneratedPage, side?: "left" | "right" | "full", isDraft?: boolean): string {
  const uri = dataUri(page);
  if (!uri) {
    const label = page.slotId ?? page.role ?? (page.kind ? `${page.kind}` : `Page ${page.index + 1}`);
    return `<div class="bg fallback">
      <div class="draft-watermark">DRAFT — MISSING ART: ${escapeHtml(label)}</div>
    </div>`;
  }

  const transform = page.transform ? sanitizeTransform(page.transform) : undefined;
  // In print PDF, backdrop is only emitted if explicitly configured on a fitted asset with extended background
  const showBackdrop = Boolean(
    transform && transform.mode === "fit" && transform.backgroundMode === "extended",
  );

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
    `color:#231d2b;background:rgba(255,255,255,0.55);` +
    `padding:0.16in 0.24in;border-radius:0.16in`
  );
}

/** Inline position rules for one of the six declared text-panel positions
 *  (see TextPanelPosition in layoutGeometry.ts). Replaces the single
 *  hardcoded bottom-left `.verse` position so a scene whose subject, action,
 *  companion, marker, or chest sits in the lower-left of the frame can move
 *  its panel elsewhere instead of covering it. Horizontal inset matches the
 *  profile-aware text-safe margin already used by the bottom-left default
 *  (1.25in / 4.8-5.2in max-width); vertical inset mirrors it at the top. */
function versePositionStyle(pos: GeneratedPage["textPanelPosition"]): string {
  const maxWidth = "max-width:5.2in;";
  switch (pos) {
    case "top-left":
      return `position:absolute;left:1.25in;right:auto;top:0.85in;bottom:auto;${maxWidth}text-align:left;`;
    case "top-right":
      return `position:absolute;right:1.25in;left:auto;top:0.85in;bottom:auto;${maxWidth}text-align:left;`;
    case "bottom-right":
      return `position:absolute;right:1.25in;left:auto;bottom:0.95in;top:auto;${maxWidth}text-align:left;`;
    case "left":
      return `position:absolute;left:1.25in;right:auto;top:1.2in;bottom:1.2in;${maxWidth}text-align:left;display:flex;flex-direction:column;justify-content:center;`;
    case "right":
      return `position:absolute;right:1.25in;left:auto;top:1.2in;bottom:1.2in;${maxWidth}text-align:left;display:flex;flex-direction:column;justify-content:center;`;
    case "bottom-left":
    default:
      return `position:absolute;left:1.25in;right:auto;bottom:0.95in;top:auto;${maxWidth}text-align:left;`;
  }
}

/**
 * The application-rendered video-QR block for the "video-qr" interior page:
 * a real, deterministically-generated QR image (never AI-drawn), a vector CTA,
 * and a visible fallback URL — or, in draft mode with no real target yet, a
 * clearly-labelled placeholder. Production export never reaches this with an
 * unset/placeholder QR (lib/manual/assemble.ts fails closed before this
 * point), so the placeholder branch below is reachable in draft only.
 */
function videoQrOverlay(page: GeneratedPage, child: ChildProfile): string {
  const qr = page.videoQr;
  const pos = page.textPanelPosition ?? "bottom-right";
  const boxStyle = versePositionStyle(pos) + "color:#231d2b;background:rgba(255,255,255,0.85);" +
    "padding:0.28in 0.32in;border-radius:0.2in;text-align:center;max-width:2.6in;";
  if (!qr || qr.isPlaceholder || !qr.dataUri || !qr.url) {
    return `<div class="video-qr-overlay" style="${boxStyle}">
      <div class="video-qr-placeholder-badge">VIDEO LINK NOT SET</div>
      <div class="video-qr-cta">Watch ${escapeHtml(child.name)}'s Great Adventure</div>
      <div class="video-qr-sub">Scan to watch the 1-minute personalized video.</div>
    </div>`;
  }
  // Prefer the inline <svg> markup: it renders as real vector paths in the
  // final PDF (kept crisp at any print resolution, and doesn't add an extra
  // embedded raster image to a page that already has its background art) —
  // fall back to the PNG data URI only if no SVG markup was provided.
  const qrMarkup = qr.svgMarkup
    ? `<div class="video-qr-image">${qr.svgMarkup}</div>`
    : `<img class="video-qr-image" src="${qr.dataUri}" alt="QR code to ${escapeHtml(child.name)}'s video" />`;
  return `<div class="video-qr-overlay" style="${boxStyle}">
    <div class="video-qr-cta">Watch ${escapeHtml(child.name)}'s Great Adventure</div>
    <div class="video-qr-sub">Scan to watch the 1-minute personalized video.</div>
    ${qrMarkup}
    <div class="video-qr-fallback-url">${escapeHtml(qr.url)}</div>
  </div>`;
}

function pageHtml(page: GeneratedPage, child: ChildProfile, isDraft?: boolean): string {
  const draftWatermark = isDraft
    ? `<div class="draft-overlay-watermark" aria-hidden="true">DRAFT / NOT FOR PRINT</div>`
    : "";

  if (page.kind === "cover") {
    return `<section class="page cover">
      ${background(page, "full", isDraft)}
      <div class="scrim cover-scrim"></div>
      ${coverLockup(page, child)}
      ${draftWatermark}
    </section>`;
  }

  if (page.kind === "backcover") {
    const isDetective = isDetectiveSignText(page.text);
    let backText = "";
    if (isDetective) {
      const { headline, agency } = parseDetectiveSignText(page.text);
      // Auto-scale font size for long child names to guarantee readable fit without overflow
      const fontSizePt = agency.length > 28 ? 13 : agency.length > 20 ? 15 : 18;
      backText = `<div class="detective-sign-overlay">
        <div class="detective-sign-headline">${escapeHtml(headline)}</div>
        <div class="detective-sign-agency" style="font-size: ${fontSizePt}pt;">${escapeHtml(agency)}</div>
      </div>`;
    } else if (page.text.trim()) {
      backText = `<div class="backcover-text"><span class="backcover-panel">${escapeHtml(page.text)}</span></div>`;
    }
    return `<section class="page backcover">
      ${background(page, "full", isDraft)}
      <div class="scrim scrim-strong"></div>
      ${backText}
      ${draftWatermark}
    </section>`;
  }

  // Two-page spread: one wide image split across the gutter, verse on the left.
  if (page.spread) {
    return `<section class="page spread spread-left">
      ${background(page, "left", isDraft)}
      <div class="scrim"></div>
      <div class="verse" style="${verseStyle()}">${formatText(page.text)}</div>
      ${draftWatermark}
    </section>
    <section class="page spread spread-right">
      ${background(page, "right", isDraft)}
      ${draftWatermark}
    </section>`;
  }

  // Video-QR page: application-rendered QR + CTA + fallback URL over the
  // reserved background art — NEVER the generic verse panel (which would
  // otherwise render as an empty, unlabeled white capsule for this page's
  // deliberately-empty `text`).
  if (page.kind === "video-qr") {
    return `<section class="page single video-qr-page">
      ${background(page, "full", isDraft)}
      <div class="scrim"></div>
      ${videoQrOverlay(page, child)}
      ${draftWatermark}
    </section>`;
  }

  // Single full-bleed page with verse woven into the art, positioned per this
  // scene's declared text-safe region (see TextPanelPosition) rather than a
  // single hardcoded corner.
  return `<section class="page single">
    ${background(page, "full", isDraft)}
    <div class="scrim"></div>
    <div class="verse" style="${versePositionStyle(page.textPanelPosition)}${verseStyle()}">${formatText(page.text)}</div>
    ${draftWatermark}
  </section>`;
}

export function renderBookHtml(
  pages: GeneratedPage[],
  child: ChildProfile,
  options?: { draft?: boolean },
): string {
  const isDraft = options?.draft === true;
  const body = pages.map((p) => pageHtml(p, child, isDraft)).join("\n");

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
  ${ARTWORK_FRAME_CSS}
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
    position: relative;
    background: linear-gradient(165deg, #1f1a4d 0%, #4a3691 55%, #2f9e8f 100%);
  }

  .draft-watermark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Fredoka", "Nunito", sans-serif;
    font-size: 24pt;
    font-weight: 700;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 24px;
    text-align: center;
    z-index: 10;
  }

  .draft-overlay-watermark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Fredoka", "Trebuchet MS", sans-serif;
    font-size: 52pt;
    font-weight: 900;
    color: rgba(220, 38, 38, 0.48);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    transform: rotate(-25deg);
    pointer-events: none;
    z-index: 50;
    border: 8px dashed rgba(220, 38, 38, 0.40);
    margin: 1.2in 0.8in;
    border-radius: 0.25in;
    text-shadow: 0 2px 10px rgba(255, 255, 255, 0.7);
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

  /* Rhyming verse, woven into the page within the strict profile-aware text-safe boundary */
  .verse {
    position: absolute;
    left: 1.25in;
    right: auto;
    bottom: 0.95in;
    max-width: 5.2in;
    text-align: left;
  }
  .spread-left .verse {
    left: 1.20in;
    right: auto;
    bottom: 0.95in;
    max-width: 4.8in;
  }
  .spread-right .verse {
    left: 1.35in;
    right: auto;
    bottom: 0.95in;
    max-width: 4.8in;
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

  /* Application-rendered QR + CTA + fallback URL for the video-qr page —
     deterministic vector/raster overlay, never AI-generated art or text. */
  .video-qr-overlay {
    font-family: "Nunito", sans-serif;
  }
  .video-qr-cta {
    font-weight: 800;
    font-size: 15pt;
    margin-bottom: 0.06in;
  }
  .video-qr-sub {
    font-weight: 700;
    font-size: 10.5pt;
    opacity: 0.85;
    margin-bottom: 0.16in;
  }
  .video-qr-image {
    width: 1.7in;
    height: 1.7in;
    display: block;
    margin: 0 auto 0.12in;
    background: #ffffff;
  }
  .video-qr-image svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .video-qr-fallback-url {
    font-weight: 700;
    font-size: 9pt;
    word-break: break-all;
  }
  .video-qr-placeholder-badge {
    font-weight: 800;
    font-size: 9pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #b3261e;
    margin-bottom: 0.1in;
  }

  /* Cover title sits directly on the art (no dark glow); legibility via outline. */
  .cover-title {
    position: absolute;
    left: 1.25in;
    right: auto;
    bottom: 1.05in;
    max-width: 5.8in;
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
    font-size: 64pt;
    line-height: 0.96;
    font-weight: 700;
    letter-spacing: -0.015em;
    /* Plain text directly on the art — no shadow/box behind it. */
    text-shadow: none;
    word-break: break-word;
  }
  .backcover-text {
    position: absolute;
    left: 1.25in;
    right: 1.25in;
    bottom: 1.05in;
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

  /* Dedicated rustic wooden sign placard overlay for The Great Detective back cover */
  .detective-sign-overlay {
    position: absolute;
    right: 1.25in;
    bottom: 1.05in;
    width: 3.3in;
    text-align: center;
    padding: 0.18in 0.24in;
    background: rgba(254, 243, 199, 0.94);
    border: 3.5px solid #78350f;
    border-radius: 0.18in;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    transform: rotate(-1.5deg);
  }
  .detective-sign-headline {
    font-family: "Fredoka", "Nunito", sans-serif;
    font-weight: 700;
    font-size: 19pt;
    color: #991b1b;
    letter-spacing: 0.05em;
    margin-bottom: 0.06in;
    text-transform: uppercase;
  }
  .detective-sign-agency {
    font-family: "Nunito", "Trebuchet MS", sans-serif;
    font-weight: 800;
    color: #451a03;
    line-height: 1.16;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    word-break: break-word;
  }

</style>
</head>
<body>
${body}
</body>
</html>`;
}
