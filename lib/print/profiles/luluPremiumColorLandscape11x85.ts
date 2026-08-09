import type { PrintProfile } from "../types";

/**
 * Lulu Premium Color Landscape 11×8.5 Profile.
 *
 * Trim: 11 x 8.5 inches
 * Bleed: 0.125 inches each side (0.25 inches total)
 * Full-bleed PDF page size: 11.25 x 8.75 inches
 * At 300 DPI: 3375 x 2625 pixels
 * PDF MediaBox: 810 x 630 points (11.25 * 72 x 8.75 * 72)
 */
export const luluPremiumColorLandscape11x85Profile: PrintProfile = {
  id: "lulu-landscape-11x8.5",
  label: "Lulu Premium Color Landscape 11×8.5",
  provider: "lulu",
  product: "Premium Color Landscape 11x8.5",
  binding: "hardcover",
  nominalSizeIn: { width: 11, height: 8.5 },
  trimIn: { width: 11, height: 8.5 },
  bleedIn: 0.125,
  finalPageIn: { width: 11.25, height: 8.75 },
  finalPagePx: { width: 3375, height: 2625 },
  pdfPagePt: { width: 810, height: 630 },
  dpi: 300,
  canvasPx: { width: 3375, height: 2625 },
  finishedAreaPx: { width: 3300, height: 2550 },
  safeAreaPx: { width: 3150, height: 2400 },
  singleAspect: "4:3",
  spreadAspect: "21:9",
  exportMode: "lulu-interior-pdf",
};
