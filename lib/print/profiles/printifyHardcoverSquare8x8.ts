/**
 * Printify Hardcover Square 8×8 — exact production template measurements as
 * given (not reinterpreted): 2400×2400px @ 300dpi interior artwork, 2325×2325
 * finished region, 2175×2250 safe region, 5370×2850 wrap cover canvas.
 */

import type { PrintProfile } from "../types";

export const printifyHardcoverSquare8x8Profile: PrintProfile = {
  id: "printify-hardcover-square-8x8",
  label: "Printify Hardcover Square 8×8",
  provider: "printify",
  product: "Hardcover Square 8x8",
  binding: "hardcover",
  nominalSizeIn: { width: 8, height: 8 },
  dpi: 300,
  canvasPx: { width: 2400, height: 2400 },
  finishedAreaPx: { width: 2325, height: 2325 },
  safeAreaPx: { width: 2175, height: 2250 },
  coverGeometryPx: { width: 5370, height: 2850 },
  // Placeholder — depends on final page count/paper, which Printify computes
  // per order and isn't part of the numbers this profile was given. Confirm
  // against Printify's live spec sheet for your page count before ordering;
  // lib/print/preflight.ts surfaces a warning for this every export.
  spineWidthPx: 120,
  // Standard bottom-right ISBN/UPC barcode placement, as a percentage of the
  // back-cover zone (never hardcoded pixels) — a ~2in x 1.2in barcode is
  // typical; 2/8.5≈24%, 1.2/8.5≈14% on this trim size, inset a further
  // margin from the trim edge.
  barcodeSafeAreaPct: { rightPct: 6, bottomPct: 6, widthPct: 26, heightPct: 16 },
  singleAspect: "1:1",
  spreadAspect: "2:1",
  providerPresetAspect: "1:1",
  providerPresetSpreadAspect: "2:1",
  exportMode: "printify-folder",
  interiorPageCount: 24,
};
