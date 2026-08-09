/**
 * Shared aspect-ratio tolerance rules — used by both the server-side
 * preflight (lib/print/preflight.ts) and the instant client-side import
 * check (lib/manual/clientImageCheck.ts) so "how close is close enough"
 * is decided in exactly one place.
 *
 * `expected` here is the profile's RECOMMENDED aspect for a page (what the
 * user was told to set in the Gemini app — profile.singleAspect/
 * spreadAspect), not a promise that the final print pixels will be that
 * exact ratio. Manually-generated art routinely comes back at a nearby but
 * not identical ratio (a 3:2 photo for a 1:1 page, etc.) — the export
 * compositor (lib/print/artworkFrame.ts + printifyPageTemplate.ts/
 * printifyExport.ts) always preserves the full source via contain-fit and
 * never crops it to force an exact match, so a ratio mismatch alone is
 * never a reason the book "can't be printed" — only a reason to flag it for
 * a human to glance at. The one thing that IS genuinely unusable is a
 * source whose ORIENTATION is the opposite of what the page needs (e.g. a
 * portrait photo for a wide two-page spread) — that's what `error` is
 * reserved for.
 */

export const ASPECT_WARN_THRESHOLD = 0.08;

/** Half-width of the "reads as square" band around a 1:1 ratio. A ratio
 *  within ±15% of 1.0 is treated as neither portrait nor landscape, so a
 *  near-square crop doesn't flip-flop between orientations. */
export const ASPECT_SQUARE_BAND = 0.15;

export type Orientation = "portrait" | "square" | "landscape";

export function parseAspect(aspect: string): number {
  const [w, h] = aspect.split(":").map(Number);
  return w && h ? w / h : 1;
}

export function relativeDiff(actual: number, expected: number): number {
  return Math.abs(actual - expected) / expected;
}

/** Which orientation a width/height ratio reads as. */
export function orientationOf(ratio: number): Orientation {
  if (ratio > 1 + ASPECT_SQUARE_BAND) return "landscape";
  if (ratio < 1 - ASPECT_SQUARE_BAND) return "portrait";
  return "square";
}

/** True for the one combination that's genuinely incompatible without
 *  extreme cropping or padding: a portrait source against a landscape
 *  target, or vice versa. Square is compatible with either — it just means
 *  a wider or narrower letterbox border, never a lost subject. */
function orientationsAreOpposite(a: Orientation, b: Orientation): boolean {
  return (a === "portrait" && b === "landscape") || (a === "landscape" && b === "portrait");
}

/**
 * Classify how well a source image's aspect ratio matches a page's
 * recommended aspect ratio.
 *
 * - "error": the source's ORIENTATION is incompatible with the page's
 *   (portrait vs. landscape) — this can't be used here without cropping out
 *   or padding away most of the artwork.
 * - "warn": usable (same or square-compatible orientation) but not a close
 *   match — the full image is still used, just letterboxed more than ideal.
 * - "ok": close enough that letterboxing will be minimal/unnoticeable.
 */
export function classifyAspectMatch(
  actual: number,
  expected: number,
): "ok" | "warn" | "error" {
  const actualOrientation = orientationOf(actual);
  const expectedOrientation = orientationOf(expected);
  if (orientationsAreOpposite(actualOrientation, expectedOrientation)) {
    return "error";
  }
  const diff = relativeDiff(actual, expected);
  return diff <= ASPECT_WARN_THRESHOLD ? "ok" : "warn";
}
