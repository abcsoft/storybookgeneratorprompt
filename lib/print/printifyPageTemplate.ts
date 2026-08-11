/**
 * Pure HTML builder for one interior page at `profile.canvasPx`, with the
 * verse positioned inside `profile.safeAreaPx` (item 18: text safe zones —
 * never place text near the trim edge). Screenshot this at exact `canvasPx`
 * dimensions (viewport == canvasPx, deviceScaleFactor 1) to get one
 * deliverable page PNG (see printifyExport.ts). CSS here is deliberately in
 * raw px, 1:1 with the screenshot's output pixels.
 *
 * Text is rendered by the app here too, same as the landscape template —
 * Gemini's artwork never contains the story copy.
 */

import { fontFaceCss, formatText } from "../pdf/page-template";
import {
  computePercentGeometry,
  computeTransformGeometry,
  sanitizeTransform,
  type ArtworkTransform,
} from "./artworkTransform";
import { ARTWORK_FRAME_CSS } from "./artworkFrame";
import type { PrintProfile, PxSize } from "./types";

export interface PrintifyPageInput {
  /** data: URI for this page's artwork, or null to fall back to a soft panel. */
  imageDataUri: string | null;
  /** The verse/story text for this page, or null/"" to render art-only. */
  text: string | null;
  ink?: "light" | "dark";
  transform?: ArtworkTransform;
  sourcePx?: PxSize;
}

export interface PageTextGeometryPct {
  leftPct: number;
  bottomPct: number;
  maxWidthPct: number;
}

export function computePageTextGeometry(profile: PrintProfile, isSpread?: boolean): PageTextGeometryPct {
  if (isSpread) {
    return {
      leftPct: 6.0,
      bottomPct: 8.0,
      maxWidthPct: 38.0,
    };
  }
  const canvas = profile.canvasPx;
  const safe = profile.safeAreaPx;
  const marginX = Math.round((canvas.width - safe.width) / 2);
  const marginY = Math.round((canvas.height - safe.height) / 2);
  return {
    leftPct: Number(((marginX / canvas.width) * 100).toFixed(3)),
    bottomPct: Number(((marginY / canvas.height) * 100).toFixed(3)),
    maxWidthPct: Number((((safe.width * 0.82) / canvas.width) * 100).toFixed(3)),
  };
}

export function renderPrintifyPageHtml(
  profile: PrintProfile,
  input: PrintifyPageInput,
): string {
  const canvas = profile.canvasPx;
  const safe = profile.safeAreaPx;
  const marginX = Math.round((canvas.width - safe.width) / 2);
  const marginY = Math.round((canvas.height - safe.height) / 2);
  const ink = input.ink ?? "light";

  const verseStyle =
    ink === "dark"
      ? "color:#231d2b;background:rgba(255,255,255,0.55);"
      : "color:#fff;background:rgba(0,0,0,0.32);";

  const transform = sanitizeTransform(input.transform);
  let subjectStyleAttr = "";
  let showBackdrop = transform.backgroundMode === "extended";

  if (input.sourcePx) {
    const geo = computeTransformGeometry(input.sourcePx, canvas, transform);
    const pct = computePercentGeometry(geo);
    subjectStyleAttr = `style="position: absolute; left: ${pct.leftPct.toFixed(3)}%; top: ${pct.topPct.toFixed(3)}%; width: ${pct.widthPct.toFixed(3)}%; height: ${pct.heightPct.toFixed(3)}%; object-fit: fill;"`;
    showBackdrop = geo.showBackdrop;
  } else if (input.imageDataUri) {
    const geo = computeTransformGeometry(canvas, canvas, transform);
    const pct = computePercentGeometry(geo);
    subjectStyleAttr = `style="position: absolute; left: ${pct.leftPct.toFixed(3)}%; top: ${pct.topPct.toFixed(3)}%; width: ${pct.widthPct.toFixed(3)}%; height: ${pct.heightPct.toFixed(3)}%; object-fit: fill;"`;
  }

  const background = input.imageDataUri
    ? `<div class="art-frame">
         ${showBackdrop ? `<img class="art-frame__backdrop" src="${input.imageDataUri}" alt="" />` : ""}
         <img class="art-frame__subject" src="${input.imageDataUri}" alt="" ${subjectStyleAttr} />
       </div>`
    : `<div class="bg fallback"></div>`;

  const verse =
    input.text && input.text.trim()
      ? `<div class="verse" style="${verseStyle}">${formatText(input.text)}</div>`
      : "";

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
    width: ${canvas.width}px;
    height: ${canvas.height}px;
    overflow: hidden;
    font-family: "Nunito", "Trebuchet MS", system-ui, sans-serif;
  }
  .page { position: relative; width: ${canvas.width}px; height: ${canvas.height}px; }
  ${ARTWORK_FRAME_CSS}
  .bg {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
  }
  .fallback {
    background: linear-gradient(165deg, #1f1a4d 0%, #4a3691 55%, #2f9e8f 100%);
  }
  .verse {
    position: absolute;
    left: ${marginX}px;
    bottom: ${marginY}px;
    max-width: ${Math.round(safe.width * 0.82)}px;
    padding: 28px 36px;
    border-radius: 24px;
  }
  .verse p {
    margin: 0 0 12px;
    font-family: "Nunito", sans-serif;
    font-weight: 700;
    font-size: 84px;
    line-height: 1.32;
  }
  .verse p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
  <div class="page">
    ${background}
    ${verse}
  </div>
</body>
</html>`;
}

/**
 * `proof.pdf` — a visual flip-through check, built from the ALREADY
 * SCREENSHOTTED page PNGs (not re-rendered), so it's guaranteed to show
 * exactly the delivered pixels. Deliberately uses inch-based CSS (matching
 * `lib/pdf/page-template.ts`'s convention) since this goes through
 * Puppeteer's `page.pdf()`, which lays out physical paper size in inches —
 * unlike the raw-px screenshot template above. The cover isn't included
 * (different canvas size); check `cover.png` directly instead.
 */
export function renderPrintifyProofHtml(
  profile: PrintProfile,
  pageDataUris: string[],
): string {
  const widthIn = profile.canvasPx.width / profile.dpi;
  const heightIn = profile.canvasPx.height / profile.dpi;
  const body = pageDataUris
    .map(
      (uri) =>
        `<section class="page"><img class="bg" src="${uri}" alt="" /></section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${widthIn}in ${heightIn}in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .page {
    position: relative;
    width: ${widthIn}in;
    height: ${heightIn}in;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .bg { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
</head>
<body>${body}</body>
</html>`;
}
