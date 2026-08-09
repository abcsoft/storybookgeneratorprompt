/**
 * Shared "no blind crop" artwork framing — one strategy, used identically by
 * the real Printify export renderer (lib/print/printifyPageTemplate.ts,
 * lib/print/coverTemplate.ts — both Puppeteer/CSS) AND the Book Review
 * preview (app/BookReview.tsx — browser CSS), so the preview never shows a
 * different composition than what actually gets exported. The sharp-based
 * spread compositor in lib/print/printifyExport.ts mirrors the same two-
 * layer idea with sharp's own operations (a different rendering engine, so
 * not byte-identical, but the same algorithm).
 *
 * A source image's aspect ratio is not guaranteed to match the target
 * canvas (a hand-generated Gemini image routinely isn't exactly on-ratio —
 * see lib/print/aspectCheck.ts). Rather than crop the source to force-fill
 * the canvas — which can slice off a child's head, hands, or another
 * important part of the scene — every frame is two layers built from the
 * SAME source image:
 *
 *   1. `.art-frame__backdrop` — cover-fills the entire frame, blurred and
 *      darkened. Purely an atmospheric extension so a mismatched aspect
 *      never shows hard letterbox bars — never the content that's judged.
 *   2. `.art-frame__subject` — contain-fits the frame, centered. The FULL,
 *      uncropped source artwork. Nothing is ever cut off from this layer
 *      just to fill the canvas.
 *
 * When a source already matches the frame's aspect exactly (e.g. a spread
 * half that's already been pre-composed to the exact canvas size), the two
 * layers coincide and the backdrop is simply invisible — this is why every
 * page can go through the same treatment with no special-casing.
 */

/** CSS blur radius for the backdrop layer, in the Puppeteer/browser CSS
 *  `filter: blur()` sense. */
export const ARTWORK_FRAME_BACKDROP_BLUR_PX = 48;
/** sharp's `.blur(sigma)` — a different unit than the CSS pixel radius
 *  above, chosen to look visually equivalent for the sharp-based spread
 *  compositor in printifyExport.ts. */
export const ARTWORK_FRAME_BACKDROP_BLUR_SIGMA = 24;
/** Shared by both the CSS `brightness()` filter and sharp's
 *  `.modulate({ brightness })` — 1 = unchanged, less than 1 = darker. */
export const ARTWORK_FRAME_BACKDROP_BRIGHTNESS = 0.55;
/** Slight upscale so the blurred backdrop's own edges (softened by the
 *  blur) never peek in from outside the frame. CSS-only — sharp's `cover`
 *  resize already fills the frame exactly, no extra scale needed. */
export const ARTWORK_FRAME_BACKDROP_SCALE = 1.08;

/** One CSS string, embedded verbatim by both the server-rendered export
 *  HTML and the client-rendered Book Review preview — not reproduced
 *  separately in each, so the two can never silently drift apart. */
export const ARTWORK_FRAME_CSS = `
.art-frame {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1c1440;
}
.art-frame__backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: blur(${ARTWORK_FRAME_BACKDROP_BLUR_PX}px) brightness(0.75);
  transform: scale(1.15);
}
.art-frame__subject {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
`;
