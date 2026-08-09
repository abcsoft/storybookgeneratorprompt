/**
 * The existing landscape picture-book format, wrapped as a `PrintProfile`.
 * Purely descriptive/UI-facing — `lib/pdf/buildBook.ts` and
 * `lib/pdf/page-template.ts` keep reading `lib/config.ts` directly and are
 * NOT changed by this profile, so the landscape export path has zero
 * behavior change from adding the print-profile system.
 */

import {
  ASPECT_SINGLE,
  ASPECT_SPREAD,
  BLEED_INCHES,
  DPI,
  PAGE_HEIGHT_IN,
  PAGE_WIDTH_IN,
} from "../../config";
import type { PrintProfile } from "../types";

const fullBleedWidthIn = PAGE_WIDTH_IN + BLEED_INCHES * 2;
const fullBleedHeightIn = PAGE_HEIGHT_IN + BLEED_INCHES * 2;

export const classicLandscapeProfile: PrintProfile = {
  id: "classic-landscape-11x8",
  label: "Classic Landscape 11×8 (current)",
  provider: "self",
  product: "Landscape picture book",
  binding: "none",
  nominalSizeIn: { width: PAGE_WIDTH_IN, height: PAGE_HEIGHT_IN },
  dpi: DPI,
  canvasPx: {
    width: Math.round(fullBleedWidthIn * DPI),
    height: Math.round(fullBleedHeightIn * DPI),
  },
  finishedAreaPx: {
    width: Math.round(PAGE_WIDTH_IN * DPI),
    height: Math.round(PAGE_HEIGHT_IN * DPI),
  },
  // No formal safe-area concept in the legacy flow — approximate as the
  // finished area minus a small margin.
  safeAreaPx: {
    width: Math.round((PAGE_WIDTH_IN - 1) * DPI),
    height: Math.round((PAGE_HEIGHT_IN - 1) * DPI),
  },
  singleAspect: ASPECT_SINGLE,
  spreadAspect: ASPECT_SPREAD,
  exportMode: "single-pdf",
};
