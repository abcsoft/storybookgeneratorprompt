/**
 * Print-geometry overlay data (item 6) — canvas/finished/safe/gutter
 * rectangles for the pre-build review's large preview, expressed as
 * PERCENTAGES of the rendered artwork so the React layer never hardcodes any
 * profile's pixel geometry. Every number here is derived from
 * `PrintProfile.canvasPx/finishedAreaPx/safeAreaPx` — nothing Printify- or
 * landscape-specific. Review-only: this data never touches an exported file.
 */

import type { PrintProfile } from "./types";

export interface OverlayRectPct {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface LeafOverlay {
  finished: OverlayRectPct;
  safe: OverlayRectPct;
}

export interface OverlayGeometry {
  /** One entry for a single page, two (left, right) for a spread. */
  leaves: LeafOverlay[];
  /** Present only for a spread — the center-fold safety strip. */
  gutter?: OverlayRectPct;
}

function centeredRect(
  outerWidth: number,
  outerHeight: number,
  innerWidth: number,
  innerHeight: number,
  offsetXPx: number,
  totalWidthPx: number,
): OverlayRectPct {
  const marginX = (outerWidth - innerWidth) / 2;
  const marginY = (outerHeight - innerHeight) / 2;
  return {
    leftPct: ((offsetXPx + marginX) / totalWidthPx) * 100,
    topPct: (marginY / outerHeight) * 100,
    widthPct: (innerWidth / totalWidthPx) * 100,
    heightPct: (innerHeight / outerHeight) * 100,
  };
}

/**
 * @param spread whether this page renders as a two-page spread (one wide
 *   image split visually down the middle, same as lib/pdf/page-template.ts).
 */
export function computeOverlayGeometry(
  profile: PrintProfile,
  spread: boolean,
): OverlayGeometry {
  const { canvasPx, finishedAreaPx, safeAreaPx } = profile;
  const totalWidthPx = spread ? canvasPx.width * 2 : canvasPx.width;

  function leafAt(offsetXPx: number): LeafOverlay {
    return {
      finished: centeredRect(
        canvasPx.width,
        canvasPx.height,
        finishedAreaPx.width,
        finishedAreaPx.height,
        offsetXPx,
        totalWidthPx,
      ),
      safe: centeredRect(
        canvasPx.width,
        canvasPx.height,
        safeAreaPx.width,
        safeAreaPx.height,
        offsetXPx,
        totalWidthPx,
      ),
    };
  }

  if (!spread) {
    return { leaves: [leafAt(0)] };
  }

  // Gutter width = the same horizontal safe-margin lib/print/printifyPageTemplate.ts
  // already computes for a single page, doubled at the seam where the two
  // facing pages meet.
  const safeMarginX = (canvasPx.width - safeAreaPx.width) / 2;
  const gutterWidthPx = safeMarginX * 2;

  return {
    leaves: [leafAt(0), leafAt(canvasPx.width)],
    gutter: {
      leftPct: ((canvasPx.width - gutterWidthPx / 2) / totalWidthPx) * 100,
      topPct: 0,
      widthPct: (gutterWidthPx / totalWidthPx) * 100,
      heightPct: 100,
    },
  };
}
