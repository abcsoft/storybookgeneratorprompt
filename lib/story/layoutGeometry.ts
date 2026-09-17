/**
 * Pure, dependency-free print-geometry helpers shared by `layoutPlan.ts` and
 * `storyEdition.ts`.
 *
 * This file exists to break a circular import: `layoutPlan.ts` calls into
 * `storyEdition.ts` (for the StoryEdition-priority resolution branch) and
 * `storyEdition.ts` calls back into a handful of pure geometry/filename
 * helpers that used to live in `layoutPlan.ts`. Node's CJS interop tolerates
 * that cycle at runtime (function declarations are hoisted, so by call time
 * everything is defined), but Vitest's Vite/ESM transform does not — a
 * module-level `const` on one side of the cycle can still be in its
 * temporal-dead-zone when the other side's top-level code runs, throwing
 * "Cannot access '...' before initialization". These helpers touch no other
 * module in this cycle (only `PrintProfile`/`PageKind` types), so moving them
 * to their own leaf module removes the cycle outright rather than relying on
 * import-order luck. `layoutPlan.ts` re-exports everything here so existing
 * consumers importing from "./layoutPlan" are unaffected.
 */

import type { PrintProfile } from "../print/types";
import type { PageKind } from "./types";

export type AssetKind = "front-cover" | "back-cover" | "single-page" | "spread";
export type TextSide = "left" | "right" | "none";
export type SubjectSide = "left" | "right" | "centered";

/**
 * The six declared text-panel positions a single interior page's story-text
 * (or the video-qr page's CTA block) may be placed in. Chosen per scene from
 * where the subject/action/companion/marker/chest/QR actually sits in that
 * scene's illustration, so the panel never covers a story-critical object —
 * see each StoryEditionScene's `textPanelPosition` in
 * greatAdventureSemanticContracts.ts. "left"/"right" are full-height side
 * placements (used mainly on spreads); the four corner values are for
 * single-page interior art where the subject occupies roughly half the
 * frame and the opposite corner is calm/uncluttered.
 */
export type TextPanelPosition = "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface SafeRegionRectPct {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface ResolvedSafeRegions {
  /** Text safe area percentage bounds within the full canvas */
  textSafe: SafeRegionRectPct;
  /** Subject safe area percentage bounds within the full canvas */
  subjectSafe: SafeRegionRectPct;
  /** Center gutter percentage bounds, spreads only */
  gutter?: SafeRegionRectPct;
}

/** Compute normalized role slug for canonical naming. */
export function getRoleSlug(kind: PageKind, role?: string): string {
  if (kind === "cover") return "cover";
  if (kind === "greeting") return "greeting";
  if (kind === "intro") return "intro";
  if (kind === "closing") return "closing";
  if (kind === "backcover") return "backcover";
  if (kind === "video-qr") return "video-qr";
  if (!role) return "scene";

  const r = role.toLowerCase().trim();
  if (r.includes("pilot")) return "pilot";
  if (r.includes("racer") || r.includes("race car")) return "race-car-driver";
  if (r.includes("astronaut")) return "astronaut";
  if (r.includes("doctor")) return "doctor";
  if (r.includes("firefighter")) return "firefighter";
  if (r.includes("scientist")) return "scientist";
  if (r.includes("army officer")) return "army-officer";
  if (r.includes("soccer")) return "soccer-player";
  if (r.includes("karate")) return "karate-master";
  if (r.includes("detective")) return "detective";
  if (r.includes("magician")) return "magician";
  if (r.includes("chef")) return "chef";
  if (r.includes("rockstar")) return "rockstar";
  if (r.includes("artist") || r.includes("painter")) return "artist";
  if (r.includes("teacher")) return "teacher";
  if (r.includes("explorer")) return "explorer";
  if (r.includes("photographer")) return "photographer";
  if (r.includes("diver")) return "deep-sea-diver";
  if (r.includes("vet")) return "veterinarian";
  if (r.includes("inventor")) return "inventor";

  return r.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Build canonical filename for an asset slot.
 */
export function canonicalFilenameForSlot(kind: AssetKind, physicalPages: number[]): string {
  if (kind === "front-cover") return "front-cover.png";
  if (kind === "back-cover") return "back-cover.png";
  if (kind === "spread") {
    const p1 = String(physicalPages[0]).padStart(2, "0");
    const p2 = String(physicalPages[1]).padStart(2, "0");
    return `spread-${p1}-${p2}.png`;
  }
  const p = String(physicalPages[0]).padStart(2, "0");
  return `page-${p}.png`;
}

/**
 * Compute safe regions for text, subject, and center gutter.
 */
export function computeAssetSafeRegions(
  profile: PrintProfile,
  kind: AssetKind,
  textSide: TextSide,
  subjectSide: SubjectSide,
): ResolvedSafeRegions {
  const canvas = profile.canvasPx;
  const safe = profile.safeAreaPx;
  const marginXPct = ((canvas.width - safe.width) / 2 / canvas.width) * 100;
  const marginYPct = ((canvas.height - safe.height) / 2 / canvas.height) * 100;
  const safeWidthPct = (safe.width / canvas.width) * 100;
  const safeHeightPct = (safe.height / canvas.height) * 100;

  if (kind === "front-cover" || kind === "back-cover") {
    return {
      textSafe: {
        leftPct: 9.0,
        topPct: 70.0,
        widthPct: 82.0,
        heightPct: 20.0,
      },
      subjectSafe: {
        leftPct: 15.0,
        topPct: 10.0,
        widthPct: 70.0,
        heightPct: 58.0,
      },
    };
  }

  if (kind === "spread") {
    const totalWidthPx = canvas.width * 2;
    const safeMarginX = (canvas.width - safe.width) / 2;
    const gutterWidthPx = safeMarginX * 2;
    const gutterWidthPct = (gutterWidthPx / totalWidthPx) * 100;
    const gutterLeftPct = 50 - gutterWidthPct / 2;

    const gutter: SafeRegionRectPct = {
      leftPct: Number(gutterLeftPct.toFixed(2)),
      topPct: 0,
      widthPct: Number(gutterWidthPct.toFixed(2)),
      heightPct: 100,
    };

    if (textSide === "left") {
      return {
        textSafe: { leftPct: 6.0, topPct: 65.0, widthPct: 38.0, heightPct: 25.0 },
        subjectSafe: { leftPct: 52.0, topPct: marginYPct, widthPct: 42.0, heightPct: safeHeightPct },
        gutter,
      };
    } else if (textSide === "right") {
      return {
        textSafe: { leftPct: 56.0, topPct: 65.0, widthPct: 38.0, heightPct: 25.0 },
        subjectSafe: { leftPct: marginXPct / 2, topPct: marginYPct, widthPct: 42.0, heightPct: safeHeightPct },
        gutter,
      };
    } else {
      return {
        textSafe: { leftPct: 0, topPct: 0, widthPct: 0, heightPct: 0 },
        subjectSafe: {
          leftPct: marginXPct / 2,
          topPct: marginYPct,
          widthPct: 100 - marginXPct,
          heightPct: safeHeightPct,
        },
        gutter,
      };
    }
  }

  // Single interior page
  return {
    textSafe: {
      leftPct: Number(marginXPct.toFixed(2)),
      topPct: Number((100 - marginYPct - 25).toFixed(2)),
      widthPct: Number(((safe.width * 0.82 / canvas.width) * 100).toFixed(2)),
      heightPct: 25.0,
    },
    subjectSafe: {
      leftPct: Number(marginXPct.toFixed(2)),
      topPct: Number(marginYPct.toFixed(2)),
      widthPct: Number(safeWidthPct.toFixed(2)),
      heightPct: Number(safeHeightPct.toFixed(2)),
    },
  };
}

/**
 * Programmatically derive the minimum provider source resolution required to achieve
 * at least 200 native PPI and stay within the maximum 1.5x upscale threshold.
 */
export function deriveProviderNativeMinimum(
  targetWidth: number,
  targetHeight: number,
  providerAspect: string,
  maxUpscaleFactor = 1.5,
): { width: number; height: number; minNativePpi: number; maxUpscaleFactor: number } {
  const parts = providerAspect.split(":").map(Number);
  const aspect = parts[0] && parts[1] ? parts[0] / parts[1] : targetWidth / targetHeight;

  const minWidth = Math.ceil(targetWidth / maxUpscaleFactor);
  const minHeight = Math.round(minWidth / aspect);

  return {
    width: minWidth,
    height: minHeight,
    minNativePpi: 200,
    maxUpscaleFactor,
  };
}

/**
 * Derive target canvas dimensions and aspect string for a profile.
 */
export function getProfileAssetGeometry(
  profile: PrintProfile,
  kind: AssetKind,
): {
  dimensions: { width: number; height: number };
  printDimensionsIn: {
    trimWidthIn: number;
    trimHeightIn: number;
    bleedIn: number;
    spread: boolean;
  };
  targetCanvasAspect: string;
  trimAspect: string;
  providerPresetAspect: string;
  aspect: string;
  normalizedProductionDimensions: { width: number; height: number };
  normalizationStrategy: "proportional-cover-crop" | "proportional-contain-backdrop" | "exact-match";
  minResolution: { width: number; height: number };
} {
  const isSpread = kind === "spread";
  const singleWidth = profile.canvasPx.width;
  const singleHeight = profile.canvasPx.height;
  const spreadWidth = singleWidth * 2;
  const spreadHeight = singleHeight;

  const bleedIn = profile.bleedIn ?? 0.125;
  const trimWidthIn = isSpread ? profile.nominalSizeIn.width * 2 : profile.nominalSizeIn.width;
  const trimHeightIn = profile.nominalSizeIn.height;
  const continuousSpreadWidth = Math.round((trimWidthIn + bleedIn * 2) * profile.dpi);

  const printDimensionsIn = {
    trimWidthIn,
    trimHeightIn,
    bleedIn,
    spread: isSpread,
  };

  if (profile.id === "printify-hardcover-square-8x8") {
    if (isSpread) {
      return {
        dimensions: { width: 4800, height: 2400 },
        printDimensionsIn,
        targetCanvasAspect: "2:1",
        trimAspect: "2:1",
        providerPresetAspect: "2:1",
        aspect: "2:1",
        normalizedProductionDimensions: { width: 4800, height: 2400 },
        normalizationStrategy: "exact-match",
        minResolution: deriveProviderNativeMinimum(4800, 2400, "2:1"),
      };
    }
    return {
      dimensions: { width: 2400, height: 2400 },
      printDimensionsIn,
      targetCanvasAspect: "1:1",
      trimAspect: "1:1",
      providerPresetAspect: "1:1",
      aspect: "1:1",
      normalizedProductionDimensions: { width: 2400, height: 2400 },
      normalizationStrategy: "exact-match",
      minResolution: deriveProviderNativeMinimum(2400, 2400, "1:1"),
    };
  }

  if (profile.id.startsWith("classic-landscape")) {
    if (isSpread) {
      // Continuous spread canvas: 22.25 x 8.25 in at 300 DPI = 6675 x 2475 px (89:33 ratio, approx 2.696970).
      // Closest provider preset is 21:9 (2.333333).
      // Sliced into 2 separate full-bleed pages: 2 x (11.25 x 8.25 in at 300 DPI) = 2 x 3375 = 6750 px (22.5 in).
      return {
        dimensions: { width: 6675, height: 2475 },
        printDimensionsIn,
        targetCanvasAspect: "89:33",
        trimAspect: "11:4",
        providerPresetAspect: "21:9",
        aspect: "89:33",
        normalizedProductionDimensions: { width: 6675, height: 2475 },
        normalizationStrategy: "proportional-cover-crop",
        minResolution: deriveProviderNativeMinimum(6675, 2475, "21:9"),
      };
    }
    // Single page: 11.25 x 8.25 in at 300 DPI = 3375 x 2475 px (15:11 ratio, approx 1.363636).
    // Closest provider preset is 4:3 (1.333333, 2.22% delta vs 3:2 at 10.0% delta).
    return {
      dimensions: { width: 3375, height: 2475 },
      printDimensionsIn,
      targetCanvasAspect: "15:11",
      trimAspect: "11:8",
      providerPresetAspect: "4:3",
      aspect: "15:11",
      normalizedProductionDimensions: { width: 3375, height: 2475 },
      normalizationStrategy: "proportional-cover-crop",
      minResolution: deriveProviderNativeMinimum(3375, 2475, "4:3"),
    };
  }

  // Generic fallback for any other profile (e.g. Lulu)
  if (isSpread) {
    const targetCanvasAspect = profile.targetCanvasSpreadAspect ?? profile.spreadAspect;
    const trimAspect = profile.trimSpreadAspect ?? "11:4";
    const providerPresetAspect = profile.providerPresetSpreadAspect ?? profile.spreadAspect;
    return {
      dimensions: { width: continuousSpreadWidth, height: spreadHeight },
      printDimensionsIn,
      targetCanvasAspect,
      trimAspect,
      providerPresetAspect,
      aspect: targetCanvasAspect,
      normalizedProductionDimensions: { width: continuousSpreadWidth, height: spreadHeight },
      normalizationStrategy: "proportional-cover-crop",
      minResolution: deriveProviderNativeMinimum(continuousSpreadWidth, spreadHeight, providerPresetAspect),
    };
  }
  const targetCanvasAspect = profile.targetCanvasAspect ?? profile.singleAspect;
  const trimAspect = profile.trimAspect ?? "11:8";
  const providerPresetAspect = profile.providerPresetAspect ?? profile.singleAspect;
  return {
    dimensions: { width: singleWidth, height: singleHeight },
    printDimensionsIn,
    targetCanvasAspect,
    trimAspect,
    providerPresetAspect,
    aspect: targetCanvasAspect,
    normalizedProductionDimensions: { width: singleWidth, height: singleHeight },
    normalizationStrategy: "proportional-cover-crop",
    minResolution: deriveProviderNativeMinimum(singleWidth, singleHeight, providerPresetAspect),
  };
}
