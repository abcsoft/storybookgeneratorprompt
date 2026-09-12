/**
 * Print-profile domain types. A `PrintProfile` fully describes one physical
 * product: its trim size, resolution, safe/finished regions, and how it gets
 * exported. All dimensions the app cares about come from a profile — nothing
 * about print geometry should be scattered elsewhere (item 10).
 */

export interface PxSize {
  width: number;
  height: number;
}

export interface InSize {
  width: number;
  height: number;
}

export interface PrintProfile {
  /** Stable id, e.g. "classic-landscape-11x8", "printify-hardcover-square-8x8", or "lulu-landscape-11x8.5". */
  id: string;
  /** Display name shown in the profile picker. */
  label: string;
  /** Print provider: "printify", "lulu", or "self". */
  provider: "printify" | "lulu" | "self";
  /** Product name at the provider, e.g. "Premium Color Landscape 11x8.5". */
  product: string;
  binding: "hardcover" | "softcover" | "none";
  /** Trim size in inches. */
  nominalSizeIn: InSize;
  /** Trim size in inches (alias for nominalSizeIn). */
  trimIn?: InSize;
  /** Bleed in inches on each side (e.g. 0.125). */
  bleedIn?: number;
  /** Full-bleed page size in inches (e.g. 11.25 x 8.75). */
  finalPageIn?: InSize;
  /** Full-bleed raster size in pixels at DPI (canvasPx). */
  finalPagePx?: PxSize;
  /** Page MediaBox size in PDF points (72 pt/inch). */
  pdfPagePt?: PxSize;
  dpi: number;
  /** Full-bleed single-page interior artwork canvas, in pixels. */
  canvasPx: PxSize;
  /** The trimmed finished page region, in pixels. */
  finishedAreaPx: PxSize;
  /** The region text/important content must stay inside, in pixels. */
  safeAreaPx: PxSize;
  /** Wrap-around cover canvas (back + spine + front + bleed), if this profile
   *  has a separate cover product. */
  coverGeometryPx?: PxSize;
  /** Placeholder spine width. */
  spineWidthPx?: number;
  /** Physical trim aspect ratio for a single page, e.g. "11:8", "1:1". */
  trimAspect?: string;
  /** Full-bleed target canvas aspect ratio for a single page, e.g. "15:11", "1:1". */
  targetCanvasAspect?: string;
  /** Mathematically closest provider-requested aspect preset for a single page, e.g. "4:3", "1:1". */
  providerPresetAspect?: string;
  /** Physical trim aspect ratio for a spread, e.g. "11:4", "2:1". */
  trimSpreadAspect?: string;
  /** Full-bleed target canvas aspect ratio for a continuous spread master, e.g. "89:33", "2:1". */
  targetCanvasSpreadAspect?: string;
  /** Closest provider-requested aspect preset for a spread, e.g. "21:9", "16:9". */
  providerPresetSpreadAspect?: string;
  /** Aspect ratio string for a single page, passed to prompt / app. */
  singleAspect: string;
  /** Aspect ratio string for a two-page spread. */
  spreadAspect: string;
  /** Which export pipeline builds the deliverable for this profile:
   *  "single-pdf" = legacy lib/pdf/buildBook.ts flow (unchanged);
   *  "printify-folder" = lib/print/printifyExport.ts;
   *  "lulu-interior-pdf" = dedicated Lulu interior PDF exporter. */
  exportMode: "single-pdf" | "printify-folder" | "lulu-interior-pdf";
  /** Exact required interior physical page count for products enforcing fixed page counts. */
  interiorPageCount?: number;
}
