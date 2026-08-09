/**
 * Pure HTML/CSS builder for a wrap-around print cover (item 19): back cover |
 * spine | front cover, sized exactly to `profile.coverGeometryPx`. No Gemini
 * text ever appears here — the title/child name are rendered by the app.
 *
 * The front and back art come from the book's existing "cover" and
 * "backcover" page images (two separate square-ish scenes, same as the
 * landscape flow generates today) — this is NOT a single continuous
 * wrap-around illustration. Each half is cover-fit into its region. A true
 * single wrap illustration would need its own extra-wide scene prompt, which
 * isn't part of this pass.
 */

import { escapeHtml, fontFaceCss } from "../pdf/page-template";
import { ARTWORK_FRAME_CSS } from "./artworkFrame";
import type { PrintProfile } from "./types";

export interface CoverArt {
  /** data: URI for the front-cover art (required). */
  frontDataUri: string;
  /** data: URI for the back-cover art. Falls back to a soft panel if absent. */
  backDataUri?: string | null;
}

export interface CoverText {
  /** e.g. "Great Adventure" (without the child's name). */
  title: string;
  childName: string;
  subtitle?: string;
}

const TITLE_GOLD = "#ffd36b";

/** Split the wrap canvas into back | spine | front, back and front sharing
 *  the remaining width evenly around the (placeholder) spine. */
export function zones(profile: PrintProfile) {
  const canvas = profile.coverGeometryPx;
  if (!canvas) {
    throw new Error(`Print profile "${profile.id}" has no coverGeometryPx.`);
  }
  const spine = profile.spineWidthPx ?? 0;
  const halfWidth = (canvas.width - spine) / 2;
  return {
    canvas,
    spine,
    backLeft: 0,
    backWidth: halfWidth,
    spineLeft: halfWidth,
    frontLeft: halfWidth + spine,
    frontWidth: halfWidth,
  };
}

export interface CoverZonesPct {
  canvasWidth: number;
  canvasHeight: number;
  backLeftPct: number;
  backWidthPct: number;
  spineLeftPct: number;
  spineWidthPct: number;
  frontLeftPct: number;
  frontWidthPct: number;
  titleLeftPct: number;
  titleBottomPct: number;
  titleMaxWidthPct: number;
}

export function computeCoverZonesPct(profile: PrintProfile): CoverZonesPct {
  const z = zones(profile);
  const w = z.canvas.width;
  const h = z.canvas.height;
  return {
    canvasWidth: w,
    canvasHeight: h,
    backLeftPct: Number(((z.backLeft / w) * 100).toFixed(3)),
    backWidthPct: Number(((z.backWidth / w) * 100).toFixed(3)),
    spineLeftPct: Number(((z.spineLeft / w) * 100).toFixed(3)),
    spineWidthPct: Number(((z.spine / w) * 100).toFixed(3)),
    frontLeftPct: Number(((z.frontLeft / w) * 100).toFixed(3)),
    frontWidthPct: Number(((z.frontWidth / w) * 100).toFixed(3)),
    titleLeftPct: Number((((z.frontLeft + Math.round(z.frontWidth * 0.09)) / w) * 100).toFixed(3)),
    titleBottomPct: Number(((Math.round(h * 0.1) / h) * 100).toFixed(3)),
    titleMaxWidthPct: Number((((Math.round(z.frontWidth * 0.82)) / w) * 100).toFixed(3)),
  };
}

/** The same two-layer backdrop+subject frame the interior pages use (see
 *  lib/print/artworkFrame.ts) — the full art is always preserved, never
 *  cropped just to fill its (fixed-width) cover zone. */
function artFrameHtml(dataUri: string): string {
  return `<div class="art-frame">
    <img class="art-frame__backdrop" src="${dataUri}" alt="" />
    <img class="art-frame__subject" src="${dataUri}" alt="" />
  </div>`;
}

export function renderCoverHtml(
  profile: PrintProfile,
  art: CoverArt,
  text: CoverText,
): string {
  const z = zones(profile);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  ${fontFaceCss()}
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${z.canvas.width}px;
    height: ${z.canvas.height}px;
    overflow: hidden;
    font-family: "Nunito", "Trebuchet MS", system-ui, sans-serif;
  }
  .wrap {
    position: relative;
    width: ${z.canvas.width}px;
    height: ${z.canvas.height}px;
    background: #241b5e;
  }
  .art {
    position: absolute;
    top: 0;
    height: 100%;
  }
  ${ARTWORK_FRAME_CSS}
  .art-fallback {
    width: 100%;
    height: 100%;
    background: linear-gradient(165deg, #1f1a4d 0%, #4a3691 55%, #2f9e8f 100%);
  }
  .back {
    left: ${z.backLeft}px;
    width: ${z.backWidth}px;
  }
  .front {
    left: ${z.frontLeft}px;
    width: ${z.frontWidth}px;
  }
  .spine {
    position: absolute;
    top: 0;
    left: ${z.spineLeft}px;
    width: ${z.spine}px;
    height: 100%;
    background: #241b5e;
  }
  .cover-title {
    position: absolute;
    left: ${z.frontLeft + Math.round(z.frontWidth * 0.09)}px;
    bottom: ${Math.round(z.canvas.height * 0.1)}px;
    max-width: ${Math.round(z.frontWidth * 0.82)}px;
  }
  .cover-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 16px;
    font-family: "Nunito", sans-serif;
    font-weight: 800;
    font-size: 34px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #ffd277;
    margin-bottom: 18px;
    background: rgba(0, 0, 0, 0.6);
    padding: 10px 26px;
    border-radius: 60px;
  }
  .cover-eyebrow::before {
    content: "";
    width: 50px;
    height: 3px;
    border-radius: 3px;
    background: linear-gradient(90deg, ${TITLE_GOLD}, rgba(255, 211, 107, 0.08));
  }
  .cover-name {
    margin: 0;
    color: #fff;
    font-family: "Fredoka", "Trebuchet MS", sans-serif;
    font-size: 210px;
    line-height: 0.96;
    font-weight: 700;
    letter-spacing: -0.015em;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="art back">${art.backDataUri ? artFrameHtml(art.backDataUri) : `<div class="art-fallback"></div>`}</div>
    <div class="spine"></div>
    <div class="art front">${artFrameHtml(art.frontDataUri)}</div>
    <div class="cover-title">
      <span class="cover-eyebrow">${escapeHtml(`The ${text.title}`)}</span>
      <h1 class="cover-name">${escapeHtml(text.childName)}</h1>
    </div>
  </div>
</body>
</html>`;
}
