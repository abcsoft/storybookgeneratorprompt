import { getPrintProfile } from "../../print/registry";
import type { LayoutType, PageKind } from "../types";

export function buildTargetFormatBlock(
  profileId: string = "classic-landscape",
  layout: LayoutType = "single-page",
  kind: PageKind = "scene",
): string {
  const profile = getPrintProfile(profileId);
  const isSquare = profile.nominalSizeIn.width === profile.nominalSizeIn.height;
  const isSpread = layout !== "single-page";
  const isCover = kind === "cover";

  if (isCover) {
    if (isSquare) {
      return (
        "TARGET ARTWORK FORMAT — Square 1:1 composition for the front cover. " +
        "Keep the title-safe area clear in the top third of the frame. Do not create a widescreen landscape composition."
      );
    }
    return (
      "TARGET ARTWORK FORMAT — Landscape composition for the front cover. " +
      "Keep the title-safe area clear in the top third of the frame."
    );
  }

  if (isSpread) {
    if (isSquare) {
      return (
        "TARGET ARTWORK FORMAT — Wide approximately 2:1 master spread. " +
        "The image will be divided vertically into two square facing pages. Keep important subjects away from the exact center gutter."
      );
    }
    return (
      "TARGET ARTWORK FORMAT — Wide approximately 2:1 / 21:9 master spread composition. " +
      "The image will be divided vertically into two facing landscape pages. Keep important subjects away from the exact center gutter."
    );
  }

  if (isSquare) {
    return (
      "TARGET ARTWORK FORMAT — Square 1:1 composition. " +
      "This artwork will be used on a square printed page. Do not create a widescreen landscape composition. " +
      "Keep important subjects comfortably inside the central safe region. Keep approximately 8-10% visual safety from outside edges."
    );
  }

  return (
    "TARGET ARTWORK FORMAT — Landscape composition appropriate for the selected Lulu landscape page geometry. " +
    "Keep important subjects comfortably inside the central safe region."
  );
}

/** Full-bleed single landscape page (no gutter, no facing leaf). */
export function singlePageCompositionRules(): string {
  return (
    "COMPOSITION (single page) — frame the whole scene well inside the page: " +
    "keep about a 10% safety margin from every edge, with no head touching the " +
    "top, no arm or hand touching the left or right edge, and no feet touching " +
    "the bottom. NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE — " +
    "if the composition would crop a hand, foot, ear, or tail, pull the camera " +
    "back instead. Keep the lower-left corner calm and relatively open (soft " +
    "background only) — a short line of story text is added there afterward by " +
    "the layout software, not by you. Prefer a wider camera over an extreme " +
    "close-up unless the scene explicitly calls for one."
  );
}

/**
 * Two-page spread. `layout` selects the arrangement description; everything
 * else about the safety rules (gutter, outer margin, no-partial-body-parts) is
 * identical regardless of which named layout is requested, since only the
 * text-left/subject-right arrangement is currently render-accurate.
 */
export function spreadCompositionRules(layout: LayoutType): string {
  const arrangementNote =
    layout === "text-left-subject-right"
      ? ""
      : " (Note: this book's page template currently only renders the " +
        "text-left / subject-right arrangement correctly for two-page spreads — " +
        "treat the LEFT/RIGHT zones below as fixed regardless of the requested layout.)";

  return (
    "COMPOSITION (two-page spread) — this is one extra-wide illustration that " +
    "will be printed across two facing pages and folded down the exact vertical " +
    `center.${arrangementNote} ` +
    "LEFT PAGE (left half of the image): calm environmental storytelling " +
    "background with enough visual interest that it doesn't look empty, but " +
    "ABSOLUTELY NO child body parts and NO companion body parts here — no stray " +
    "hand, foot, head, or tail. Keep this area readable for a few lines of story " +
    "text that will be added afterward by the layout software. " +
    "CENTER GUTTER (the vertical strip straddling the fold): keep every important " +
    "subject clear of this strip — no faces, no eyes, no hands, no feet, no " +
    "companion, and no important prop may cross or sit on the fold line. " +
    "RIGHT PAGE (right half of the image): place the complete main subject — the " +
    "child, and the companion if present — safely and entirely inside this half, " +
    "with roughly a 10-12% safety margin from the outer edge: no head touching " +
    "the top, no arm touching the right edge, no feet touching the bottom, and " +
    "no body part crossing any edge of the page. NO PARTIAL HUMAN OR ANIMAL BODY " +
    "PART MAY ENTER FROM ANY EDGE — of the spread's outer edges or the center " +
    "gutter. Use a wider camera composition rather than a close-up so the whole " +
    "subject comfortably fits inside the safe region."
  );
}
