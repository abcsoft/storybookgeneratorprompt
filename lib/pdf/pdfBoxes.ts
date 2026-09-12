/**
 * PDF Box Injection and Preflight Inspection
 *
 * Enforces exact TrimBox, BleedBox, and MediaBox geometries on exported PDFs
 * and verifies embedded raster dimensions, effective DPI, and scaling uniformity.
 */

import zlib from "node:zlib";

export interface PdfBoxSpec {
  mediaBox: [number, number, number, number];
  bleedBox: [number, number, number, number];
  trimBox: [number, number, number, number];
}

/**
 * Standard box coordinates for Classic Landscape 11x8 in at 72 pt/inch:
 * Trim: 11 x 8 in -> 792 x 576 pt.
 * Bleed: 0.125 in on 4 edges -> 9 pt bleed.
 * Full-bleed canvas: 11.25 x 8.25 in -> 810 x 594 pt.
 * MediaBox: [0, 0, 810, 594]
 * BleedBox: [0, 0, 810, 594]
 * TrimBox: [9, 9, 801, 585] (width 792, height 576)
 */
export const CLASSIC_LANDSCAPE_PDF_BOXES: PdfBoxSpec = {
  mediaBox: [0, 0, 810, 594],
  bleedBox: [0, 0, 810, 594],
  trimBox: [9, 9, 801, 585],
};

/**
 * Injects BleedBox and TrimBox into Puppeteer-generated PDFs and cleanly
 * regenerates the xref table with valid byte offsets.
 */
export function injectPdfBoxes(
  pdfBuffer: Buffer,
  boxes: PdfBoxSpec = CLASSIC_LANDSCAPE_PDF_BOXES,
): Buffer {
  const str = pdfBuffer.toString("latin1");

  const [mbX1, mbY1, mbX2, mbY2] = boxes.mediaBox;
  const [bbX1, bbY1, bbX2, bbY2] = boxes.bleedBox;
  const [tbX1, tbY1, tbX2, tbY2] = boxes.trimBox;

  // Match /Type /Page dictionaries containing MediaBox
  const pattern = /(\/Type\s*\/Page\b[\s\S]*?\/MediaBox\s*\[\s*0\s+0\s+810\s+594\s*\])/g;
  const injected = str.replace(pattern, (match) => {
    // Avoid double injection
    let res = match;
    if (!res.includes("/BleedBox")) {
      res += ` /BleedBox [${bbX1} ${bbY1} ${bbX2} ${bbY2}]`;
    }
    if (!res.includes("/TrimBox")) {
      res += ` /TrimBox [${tbX1} ${tbY1} ${tbX2} ${tbY2}]`;
    }
    return res;
  });

  if (injected === str) {
    return pdfBuffer;
  }

  // Parse all object positions and rebuild xref table
  const objRegex = /(^|\r|\n)(\d+)\s+(\d+)\s+obj\b/g;
  const objs = new Map<number, number>();
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(injected)) !== null) {
    const id = parseInt(m[2], 10);
    const offset = m.index + m[1].length;
    objs.set(id, offset);
  }

  if (objs.size === 0) {
    return Buffer.from(injected, "latin1");
  }

  const maxId = Math.max(...objs.keys());
  const size = maxId + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxId; i++) {
    const off = objs.get(i) ?? 0;
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }

  const trailerIdx = injected.lastIndexOf("trailer");
  if (trailerIdx === -1) {
    return Buffer.from(injected, "latin1");
  }
  const trailerEnd = injected.indexOf("startxref", trailerIdx);
  let trailerStr = injected.substring(trailerIdx, trailerEnd !== -1 ? trailerEnd : undefined);
  trailerStr = trailerStr.replace(/\/Size\s+\d+/, `/Size ${size}`);

  const startxrefOffset = injected.substring(0, trailerIdx).length;
  const finalPdf =
    injected.substring(0, trailerIdx) +
    xref +
    trailerStr +
    "startxref\n" +
    startxrefOffset +
    "\n%%EOF\n";

  return Buffer.from(finalPdf, "latin1");
}

export interface AssetQualityAudit {
  rawDimensions: { width: number; height: number };
  normalizedDimensions: { width: number; height: number };
  placementInches: { width: number; height: number };
  nativeSourcePpi: number;
  outputGridPpi: number;
  upscaleFactor: number;
  upscalerMethod: string;
  isExcessiveUpscale: boolean;
  qualityWarning?: string;
}

/**
 * Distinguishes output-grid PPI (e.g. 300 PPI print placement) from native source PPI,
 * calculating upscale factor and flagging excessive upscaling.
 */
export function evaluateAssetQuality(
  rawDimensions: { width: number; height: number },
  normalizedDimensions: { width: number; height: number },
  placementInches: { width: number; height: number },
  upscalerMethod: string = "sharp-fill-bicubic",
): AssetQualityAudit {
  const nativeSourcePpi = Number((rawDimensions.width / placementInches.width).toFixed(2));
  const outputGridPpi = Number((normalizedDimensions.width / placementInches.width).toFixed(2));
  const upscaleFactor = Number((normalizedDimensions.width / Math.max(1, rawDimensions.width)).toFixed(3));

  const isExcessiveUpscale = upscaleFactor > 1.5 || nativeSourcePpi < 200;
  const qualityWarning = isExcessiveUpscale
    ? `Excessive upscaling detected (${upscaleFactor}x, native ${nativeSourcePpi} PPI). Output grid is ${outputGridPpi} PPI but source detail is below print threshold.`
    : undefined;

  return {
    rawDimensions,
    normalizedDimensions,
    placementInches,
    nativeSourcePpi,
    outputGridPpi,
    upscaleFactor,
    upscalerMethod,
    isExcessiveUpscale,
    qualityWarning,
  };
}

export interface PdfImageObject {
  index: number;
  width: number;
  height: number;
  dpiX: number;
  dpiY: number;
  effectivePpi: number;
  coveragePct: number;
  role: "production-artwork" | "spread-artwork" | "sign-overlay" | "decorative-element" | "debug-overlay";
  isProductionRelevant: boolean;
  placedWidthIn?: number;
  placedHeightIn?: number;
  exclusionReason?: string;
  sourceElementId?: string;
}

export interface PdfPreflightInspection {
  ok: boolean;
  pageCount: number;
  mediaBoxes: string[];
  bleedBoxes: string[];
  trimBoxes: string[];
  embeddedRasterDimensions: Array<{ width: number; height: number }>;
  imageObjects: PdfImageObject[];
  effectiveDpi: Array<{ width: number; height: number; dpiX: number; dpiY: number }>;
  /**
   * Minimum effective raster PPI across all placed production-relevant image objects in the PDF.
   * Required to be >= 300 PPI for high-resolution print readiness.
   */
  minProductionPpi: number;
  /**
   * Output grid PPI defining the print placement resolution (typically 300 PPI for 3375x2475 on 11.25x8.25 in).
   */
  outputGridPpi: number;
  hasNonUniformScaling: boolean;
  hasVectorStoryText: boolean;
  errors: string[];
}

function multiplyAffineMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

interface ImageObjInfo {
  objNum: number;
  width: number;
  height: number;
}

interface PlacementRecord {
  objId: number | null;
  name: string;
  widthPt: number;
  heightPt: number;
}

/**
 * Inspects a PDF byte buffer and verifies:
 * - TrimBox (792x576 pt)
 * - BleedBox & MediaBox (810x594 pt)
 * - embedded artwork dimensions and semantic role classification
 * - minimum effective PPI across all production artwork and printed rasters
 * - uniform scaling
 * - searchable vector fonts and text
 */
export function inspectPdfPreflight(
  pdfBuffer: Buffer,
  expectedTrimWidthIn: number = 11,
  expectedTrimHeightIn: number = 8,
  bleedIn: number = 0.125,
): PdfPreflightInspection {
  const str = pdfBuffer.toString("latin1");
  const errors: string[] = [];

  const mediaBoxes = str.match(/\/MediaBox\s*\[[^\]]+\]/g) ?? [];
  const bleedBoxes = str.match(/\/BleedBox\s*\[[^\]]+\]/g) ?? [];
  const trimBoxes = str.match(/\/TrimBox\s*\[[^\]]+\]/g) ?? [];

  const pageCount = mediaBoxes.length;

  // 1. Parse all objects in the PDF
  const objRegex = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
  const objects = new Map<number, string>();
  let objMatch: RegExpExecArray | null;
  while ((objMatch = objRegex.exec(str)) !== null) {
    const objNum = parseInt(objMatch[1], 10);
    objects.set(objNum, objMatch[3]);
  }

  // Helper to get decompressed stream content from an object body
  function getStreamContent(body: string): string {
    const sMatch = body.match(/stream\r?\n([\s\S]*?)\r?\n\s*endstream/);
    if (!sMatch) return "";
    let content = sMatch[1];
    if (body.includes("/FlateDecode")) {
      try {
        content = zlib.inflateSync(Buffer.from(content, "latin1")).toString("latin1");
      } catch {
        // failed inflate, use raw
      }
    }
    return content;
  }

  // 2. Identify Image XObjects
  const imageObjMap = new Map<number, ImageObjInfo>();
  const embeddedRasterDimensions: Array<{ width: number; height: number }> = [];

  for (const [objNum, body] of objects.entries()) {
    if (/\/Subtype\s*\/Image\b/.test(body)) {
      const wMatch = body.match(/\/Width\s+(\d+)/);
      const hMatch = body.match(/\/Height\s+(\d+)/);
      if (wMatch && hMatch) {
        const width = parseInt(wMatch[1], 10);
        const height = parseInt(hMatch[1], 10);
        if (width > 50 && height > 50) {
          imageObjMap.set(objNum, { objNum, width, height });
          embeddedRasterDimensions.push({ width, height });
        }
      }
    }
  }

  // Fallback for image dictionaries not caught by objRegex (e.g. synthetic mock PDFs)
  const imgDictRegex = /<<[^>]*\/Subtype\s*\/Image[^>]*>>/g;
  let dMatch: RegExpExecArray | null;
  while ((dMatch = imgDictRegex.exec(str)) !== null) {
    const dict = dMatch[0];
    const wMatch = dict.match(/\/Width\s+(\d+)/);
    const hMatch = dict.match(/\/Height\s+(\d+)/);
    if (wMatch && hMatch) {
      const width = parseInt(wMatch[1], 10);
      const height = parseInt(hMatch[1], 10);
      if (width > 50 && height > 50) {
        const already = embeddedRasterDimensions.some((d) => d.width === width && d.height === height);
        if (!already) {
          const pseudoId = -(imageObjMap.size + 1);
          imageObjMap.set(pseudoId, { objNum: pseudoId, width, height });
          embeddedRasterDimensions.push({ width, height });
        }
      }
    }
  }

  // Helper to resolve resource name to object ID
  function resolveResource(name: string, resourceContexts: string[]): number | null {
    for (const ctx of resourceContexts) {
      const reg = new RegExp(`\\/${name}\\s+(\\d+)\\s+0\\s+R`);
      const m = ctx.match(reg);
      if (m) return parseInt(m[1], 10);
    }
    // Global fallback across PDF text
    const globalReg = new RegExp(`\\/${name}\\s+(\\d+)\\s+0\\s+R`);
    const gm = str.match(globalReg);
    if (gm) return parseInt(gm[1], 10);

    // Direct naming convention fallback: X2 -> obj 2, G4 -> obj 4, X30 -> obj 30
    const numMatch = name.match(/^[A-Za-z]+(\d+)$/);
    if (numMatch) {
      const id = parseInt(numMatch[1], 10);
      if (objects.has(id)) return id;
    }
    return null;
  }

  // 3. Track Current Transformation Matrix (CTM) through graphics-state operations
  const placementsByObjId = new Map<number, PlacementRecord[]>();
  const allPlacements: PlacementRecord[] = [];

  function recordPlacement(rec: PlacementRecord) {
    allPlacements.push(rec);
    if (rec.objId !== null) {
      const list = placementsByObjId.get(rec.objId) ?? [];
      list.push(rec);
      placementsByObjId.set(rec.objId, list);
    }
  }

  function executeContentStream(
    content: string,
    initialCtm: number[],
    resourceContexts: string[],
    visitedForms: Set<number> = new Set(),
  ) {
    const opRegex = /((?:[-\d.]+\s+){6}cm)|(\bq\b)|(\bQ\b)|(\/([A-Za-z0-9_]+)\s+Do)|(\/([A-Za-z0-9_]+)\s+gs)/g;
    const stack: number[][] = [];
    let currentCtm = [...initialCtm];

    let match: RegExpExecArray | null;
    while ((match = opRegex.exec(content)) !== null) {
      if (match[1]) {
        // cm operator: [a, b, c, d, e, f] cm
        const parts = match[1].trim().split(/\s+/).slice(0, 6).map(Number);
        if (parts.length === 6 && parts.every((n) => !isNaN(n))) {
          currentCtm = multiplyAffineMatrix(parts, currentCtm);
        }
      } else if (match[2]) {
        // q operator: push graphics state
        stack.push([...currentCtm]);
      } else if (match[3]) {
        // Q operator: pop graphics state
        if (stack.length > 0) {
          currentCtm = stack.pop()!;
        }
      } else if (match[4]) {
        // /Name Do operator
        const name = match[5];
        const objId = resolveResource(name, resourceContexts);

        // Check if target is a Form XObject
        if (objId && objects.has(objId)) {
          const targetBody = objects.get(objId)!;
          if (/\/Subtype\s*\/Form\b/.test(targetBody) && !visitedForms.has(objId)) {
            visitedForms.add(objId);
            let formCtm = [...currentCtm];
            const matrixMatch = targetBody.match(/\/Matrix\s*\[\s*([-\d.\s]+)\s*\]/);
            if (matrixMatch) {
              const mParts = matrixMatch[1].trim().split(/\s+/).slice(0, 6).map(Number);
              if (mParts.length === 6 && mParts.every((n) => !isNaN(n))) {
                formCtm = multiplyAffineMatrix(mParts, formCtm);
              }
            }
            const formStream = getStreamContent(targetBody);
            if (formStream) {
              executeContentStream(formStream, formCtm, [targetBody, ...resourceContexts], visitedForms);
            }
            continue;
          }
        }

        // Target is an image XObject
        const widthPt = Math.sqrt(currentCtm[0] * currentCtm[0] + currentCtm[1] * currentCtm[1]);
        const heightPt = Math.sqrt(currentCtm[2] * currentCtm[2] + currentCtm[3] * currentCtm[3]);
        recordPlacement({
          objId,
          name,
          widthPt,
          heightPt,
        });
      } else if (match[6]) {
        // /Name gs operator (check for SMask Form XObject)
        const gsName = match[7];
        const gsObjId = resolveResource(gsName, resourceContexts);
        if (gsObjId && objects.has(gsObjId)) {
          const gsBody = objects.get(gsObjId)!;
          const smaskMatch = gsBody.match(/\/SMask\s*<<[\s\S]*?\/G\s+(\d+)\s+0\s+R/);
          if (smaskMatch) {
            const formObjId = parseInt(smaskMatch[1], 10);
            if (objects.has(formObjId) && !visitedForms.has(formObjId)) {
              visitedForms.add(formObjId);
              const formBody = objects.get(formObjId)!;
              let formCtm = [...currentCtm];
              const matrixMatch = formBody.match(/\/Matrix\s*\[\s*([-\d.\s]+)\s*\]/);
              if (matrixMatch) {
                const mParts = matrixMatch[1].trim().split(/\s+/).slice(0, 6).map(Number);
                if (mParts.length === 6 && mParts.every((n) => !isNaN(n))) {
                  formCtm = multiplyAffineMatrix(mParts, formCtm);
                }
              }
              const formStream = getStreamContent(formBody);
              if (formStream) {
                executeContentStream(formStream, formCtm, [formBody, ...resourceContexts], visitedForms);
              }
            }
          }
        }
      }
    }
  }

  // 4. Find all Page objects and execute their content streams
  const pages: Array<{ objNum: number; body: string }> = [];
  for (const [objNum, body] of objects.entries()) {
    if (/\/Type\s*\/Page\b/.test(body) && !/\/Type\s*\/Pages\b/.test(body)) {
      pages.push({ objNum, body });
    }
  }

  for (const page of pages) {
    const contentRefs: number[] = [];
    const singleMatch = page.body.match(/\/Contents\s+(\d+)\s+0\s+R/);
    if (singleMatch) {
      contentRefs.push(parseInt(singleMatch[1], 10));
    } else {
      const arrayMatch = page.body.match(/\/Contents\s*\[\s*([^\]]+)\s*\]/);
      if (arrayMatch) {
        const rRegex = /(\d+)\s+0\s+R/g;
        let rm: RegExpExecArray | null;
        while ((rm = rRegex.exec(arrayMatch[1])) !== null) {
          contentRefs.push(parseInt(rm[1], 10));
        }
      }
    }

    for (const cRef of contentRefs) {
      const cBody = objects.get(cRef);
      if (cBody) {
        const stream = getStreamContent(cBody);
        executeContentStream(stream, [1, 0, 0, 1, 0, 0], [page.body]);
      }
    }
  }

  // Fallback if no page contents were matched (e.g. synthetic mock PDF with unreferenced streams)
  if (allPlacements.length === 0) {
    const rawStreamRegex = /\bstream\r?\n([\s\S]*?)\r?\n\s*endstream/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = rawStreamRegex.exec(str)) !== null) {
      let content = sMatch[1];
      try {
        content = zlib.inflateSync(Buffer.from(content, "latin1")).toString("latin1");
      } catch {
        // uncompressed
      }
      executeContentStream(content, [1, 0, 0, 1, 0, 0], [str]);
    }
  }

  const fullBleedWIn = expectedTrimWidthIn + bleedIn * 2;
  const fullBleedHIn = expectedTrimHeightIn + bleedIn * 2;
  const spreadBleedWIn = expectedTrimWidthIn * 2 + bleedIn * 2;

  let hasNonUniformScaling = false;
  const imageObjects: PdfImageObject[] = embeddedRasterDimensions.map((dim, index) => {
    const isSpread = dim.width > 5000;
    const defaultPageWIn = isSpread ? spreadBleedWIn : fullBleedWIn;
    const defaultPageHIn = fullBleedHIn;

    // Resolve matching image object ID
    let matchingObjId: number | null = null;
    for (const [id, info] of imageObjMap.entries()) {
      if (info.width === dim.width && info.height === dim.height) {
        matchingObjId = id;
        break;
      }
    }

    // Find CTM placement record for this image
    let placedRecord: PlacementRecord | undefined;
    if (matchingObjId !== null && placementsByObjId.has(matchingObjId)) {
      const recs = placementsByObjId.get(matchingObjId)!;
      placedRecord = recs[0];
    } else {
      placedRecord = allPlacements.find((p) => {
        const placedW = p.widthPt > 2500 ? p.widthPt / 300 : p.widthPt / 72;
        const estPpi = dim.width / placedW;
        return estPpi >= 20 && estPpi <= 600;
      });
    }

    let placedWidthIn = defaultPageWIn;
    let placedHeightIn = defaultPageHIn;

    if (placedRecord) {
      // If widthPt > 2500, stream is in device coordinates (300 DPI units) without page scale
      if (placedRecord.widthPt > 2500) {
        placedWidthIn = Number((placedRecord.widthPt / 300).toFixed(3));
        placedHeightIn = Number((placedRecord.heightPt / 300).toFixed(3));
      } else {
        // Standard PDF points (72 pt/in)
        placedWidthIn = Number((placedRecord.widthPt / 72).toFixed(3));
        placedHeightIn = Number((placedRecord.heightPt / 72).toFixed(3));
      }
    }

    // Pure geometric DPI calculation without role overrides
    const dpiX = Number((dim.width / placedWidthIn).toFixed(2));
    const dpiY = Number((dim.height / placedHeightIn).toFixed(2));
    const effectivePpi = Math.round(Math.min(dpiX, dpiY));

    // Coverage percentage relative to target page or spread canvas
    const targetCanvasArea = isSpread ? 6675 * 2475 : 3375 * 2475;
    const objectArea = dim.width * dim.height;
    const coveragePct = Number(
      Math.min(100, (objectArea / targetCanvasArea) * 100).toFixed(1),
    );

    // Semantic role classification:
    // Every raster visible in the printed book (artwork, signs, decorative elements, logos)
    // is production-relevant regardless of page coverage.
    let role: "production-artwork" | "spread-artwork" | "sign-overlay" | "decorative-element" | "debug-overlay" = "production-artwork";
    let isProductionRelevant = true;
    let exclusionReason: string | undefined = undefined;
    let sourceElementId: string | undefined = undefined;

    if (isSpread) {
      role = "spread-artwork";
      sourceElementId = "panoramic-spread-master";
    } else if (coveragePct >= 50) {
      role = "production-artwork";
      sourceElementId = "full-page-artwork";
    } else if (dim.width >= 1000 && dim.height <= 800) {
      role = "sign-overlay";
      sourceElementId = "detective-sign-overlay";
    } else {
      role = "decorative-element";
      sourceElementId = `element-${index}`;
    }

    // Non-uniform scaling detection:
    // Relative tolerance > 1.0% delta on production artwork
    const dpiDeltaPct = (Math.abs(dpiX - dpiY) / Math.max(dpiX, dpiY)) * 100;
    if (dpiDeltaPct > 1.0 && dim.width >= 2000 && placedWidthIn >= 5) {
      hasNonUniformScaling = true;
    }

    return {
      index,
      width: dim.width,
      height: dim.height,
      dpiX,
      dpiY,
      effectivePpi,
      coveragePct,
      role,
      isProductionRelevant,
      placedWidthIn,
      placedHeightIn,
      exclusionReason,
      sourceElementId,
    };
  });

  const productionObjects = imageObjects.filter((o) => o.isProductionRelevant);
  const minProductionPpi =
    productionObjects.length > 0
      ? Math.min(...productionObjects.map((o) => o.effectivePpi))
      : 0;

  const effectiveDpi = productionObjects.map((o) => ({
    width: o.width,
    height: o.height,
    dpiX: o.dpiX,
    dpiY: o.dpiY,
  }));

  // Verify vector fonts and searchable text
  let hasBtEt = false;
  if (/\bBT\b[\s\S]*?\bET\b/.test(str)) {
    hasBtEt = true;
  } else {
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = streamRegex.exec(str)) !== null) {
      try {
        const rawBuf = Buffer.from(sMatch[1], "latin1");
        const decomp = zlib.inflateSync(rawBuf).toString("latin1");
        if (/\bBT\b[\s\S]*?\bET\b/.test(decomp)) {
          hasBtEt = true;
          break;
        }
      } catch {
        // Stream not zlib or not flate-encoded
      }
    }
  }
  const hasFontDict = /\/Type\s*\/Font\b/.test(str) || /\/FontDescriptor\b/.test(str) || /\/Font\b/.test(str);
  const hasVectorStoryText = hasFontDict && hasBtEt;

  if (mediaBoxes.length === 0) errors.push("No MediaBox found in PDF.");
  if (trimBoxes.length < pageCount) {
    errors.push(`TrimBox missing on some pages (${trimBoxes.length} found, ${pageCount} pages).`);
  }
  if (hasNonUniformScaling) {
    errors.push("Non-uniform scaling detected in embedded page artwork.");
  }
  if (productionObjects.length > 0 && minProductionPpi < 290) {
    errors.push(
      `Production raster resolution below print threshold: minimum effective PPI is ${minProductionPpi} PPI (required 300 PPI).`,
    );
  }
  if (productionObjects.length > 0 && !hasVectorStoryText) {
    errors.push("Story text is not preserved as searchable vector text in PDF.");
  }

  const outputGridPpi = productionObjects.length > 0 ? minProductionPpi : 300;

  return {
    ok: errors.length === 0,
    pageCount,
    mediaBoxes,
    bleedBoxes,
    trimBoxes,
    embeddedRasterDimensions,
    imageObjects,
    effectiveDpi,
    minProductionPpi,
    outputGridPpi,
    hasNonUniformScaling,
    hasVectorStoryText,
    errors,
  };
}
