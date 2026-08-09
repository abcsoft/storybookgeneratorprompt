import type { PrintProfile } from "../types";

/**
 * Lulu Premium Color Square 8.5×8.5 Profile.
 *
 * Trim: 8.5 x 8.5 inches
 * Bleed: 0.125 inches each side (0.25 inches total)
 * Full-bleed PDF page size: 8.75 x 8.75 inches
 * At 300 DPI: 2625 x 2625 pixels
 * PDF MediaBox: 630 x 630 points (8.75 * 72 x 8.75 * 72)
 */
export const luluPremiumColorSquare85x85Profile: PrintProfile = {
  id: "lulu-square-8.5x8.5",
  label: "Lulu Premium Color Square 8.5×8.5",
  provider: "lulu",
  product: "Premium Color Square 8.5x8.5",
  binding: "hardcover",
  nominalSizeIn: { width: 8.5, height: 8.5 },
  trimIn: { width: 8.5, height: 8.5 },
  bleedIn: 0.125,
  finalPageIn: { width: 8.75, height: 8.75 },
  finalPagePx: { width: 2625, height: 2625 },
  pdfPagePt: { width: 630, height: 630 },
  dpi: 300,
  canvasPx: { width: 2625, height: 2625 },
  finishedAreaPx: { width: 2550, height: 2550 },
  safeAreaPx: { width: 2400, height: 2400 },
  singleAspect: "1:1",
  spreadAspect: "2:1",
  exportMode: "lulu-interior-pdf",
};
