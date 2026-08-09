/**
 * Lulu Preflight Validator.
 *
 * Runs comprehensive preflight checks before marking Lulu exports PRINT READY.
 */

import sharp from "sharp";
import type { GeneratedPage } from "../story/types";
import type { PrintProfile, PxSize } from "./types";
import { isLuluCoverReady, type LuluCoverSpec } from "./luluCoverSpec";

export interface LuluPreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  interiorReady: boolean;
  coverReady: boolean;
  metrics: {
    pageCount: number;
    expectedPt: { width: number; height: number };
    expectedPx: PxSize;
    effectiveDpi: number;
    printQualityPreset: "Premium Color";
  };
}

export async function runLuluPreflight(
  pages: GeneratedPage[],
  profile: PrintProfile,
  pageRasters?: Buffer[],
  coverSpec?: LuluCoverSpec,
): Promise<LuluPreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (profile.provider !== "lulu") {
    errors.push(`Profile "${profile.id}" provider is "${profile.provider}", expected "lulu".`);
  }

  const pageWIn = profile.finalPageIn?.width ?? profile.canvasPx.width / profile.dpi;
  const pageHIn = profile.finalPageIn?.height ?? profile.canvasPx.height / profile.dpi;
  const expectedPtW = Math.round(pageWIn * 72);
  const expectedPtH = Math.round(pageHIn * 72);

  const interiorPages = pages.filter((p) => p.kind !== "cover" && p.kind !== "backcover");

  // Check missing images
  const missingPages = interiorPages.filter((p) => !p.image && (!pageRasters || !pageRasters[p.index]));
  if (missingPages.length > 0) {
    errors.push(`${missingPages.length} interior pages are missing artwork.`);
  }

  // Check physical page rasters if provided
  if (pageRasters && pageRasters.length > 0) {
    for (let i = 0; i < pageRasters.length; i++) {
      const buf = pageRasters[i];
      if (!buf || buf.length === 0) {
        errors.push(`Interior page raster ${i + 1} is empty (0 bytes).`);
        continue;
      }
      try {
        const meta = await sharp(buf).metadata();
        const w = meta.width ?? 0;
        const h = meta.height ?? 0;
        const channels = meta.channels ?? 0;
        const hasAlpha = meta.hasAlpha ?? (channels > 3);

        if (w !== profile.canvasPx.width || h !== profile.canvasPx.height) {
          errors.push(
            `Page raster ${i + 1} dimensions ${w}x${h} px do not match required ${profile.canvasPx.width}x${profile.canvasPx.height} px.`,
          );
        }

        if (hasAlpha) {
          errors.push(`Page raster ${i + 1} contains unflattened alpha channel (must be opaque sRGB).`);
        }
      } catch (err) {
        errors.push(`Failed to inspect page raster ${i + 1}: ${String(err)}`);
      }
    }
  }

  // Cover spec preflight check
  const coverReady = isLuluCoverReady(coverSpec);
  if (!coverReady) {
    warnings.push(
      "Cover template is PENDING: authoritative Lulu template dimensions not provided. " +
        "Interior PDF is production-ready; cover.pdf is marked pending template.",
    );
  }

  const interiorReady = errors.length === 0;

  return {
    ok: interiorReady,
    errors,
    warnings,
    interiorReady,
    coverReady,
    metrics: {
      pageCount: interiorPages.length,
      expectedPt: { width: expectedPtW, height: expectedPtH },
      expectedPx: profile.canvasPx,
      effectiveDpi: profile.dpi,
      printQualityPreset: "Premium Color",
    },
  };
}
