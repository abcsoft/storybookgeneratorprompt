/**
 * Authoritative Layout Plan Engine
 *
 * Single source of truth for:
 * - Layout modes (Standard Single Pages vs Custom Spreads)
 * - Required asset slots & filenames (front-cover.png, page-01.png, spread-22-23.png, back-cover.png)
 * - Backward-compatible legacy aliases (01.png, 02.png, ...)
 * - Source aspect guidance (strictly one aspect per asset)
 * - Exact canvas pixel dimensions per print profile
 * - Physical page numbering & facing pair imposition (facing pairs: 2-3, 4-5... 22-23)
 * - Text placement (text-left, text-right, none)
 * - Safe regions (text safe, subject safe, gutter)
 * - Stable scene IDs and PageKind propagation
 * - Review tiles, upload slots, preflight, and export
 */

import { getPrintProfile } from "../print/registry";
import type { PrintProfile } from "../print/types";
import { getBook } from "./registry";
import { assertValidFacingPair, isValidFacingPair } from "../pdf/imposition";
import { getEditionForProfile } from "./editions";
import type { ChildProfile, StoryTemplate, LayoutType, PageKind, FramingMode } from "./types";

export type LayoutMode = "standard-single" | "custom-spreads";
export type AssetKind = "front-cover" | "back-cover" | "single-page" | "spread";
export type TextSide = "left" | "right" | "none";
export type SubjectSide = "left" | "right" | "centered";

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
  /** Center gutter percentage strip if this is a spread */
  gutter?: SafeRegionRectPct;
}

/** Compute eligible facing pairs for any page count. Never starts on odd or page 1. */
export function getEligibleFacingPairs(maxPage: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let p = 2; p < maxPage; p += 2) {
    pairs.push([p, p + 1]);
  }
  return pairs;
}

/** All physically valid facing pairs for a 24-page book. Never 1-2, 3-4, 5-6, or 23-24. */
export const ELIGIBLE_FACING_PAIRS: readonly [number, number][] = Object.freeze(
  getEligibleFacingPairs(24),
);

export interface CustomSpreadSelection {
  /** 1-based start physical page (must be an even number >= 2). */
  startPage: number;
  /** 1-based end physical page (must equal startPage + 1). */
  endPage: number;
  /** Text placement on the spread: left leaf, right leaf, or no text. */
  textSide: TextSide;
  /** Subject placement: left, right, or centered (defaults to auto-opposite of text). */
  subjectSide?: SubjectSide;
}

export interface PagePlanValidationResult {
  valid: boolean;
  physicalPageCount: number;
  requiredPageCount: number;
  spreadCount: number;
  singleCount: number;
  eligiblePairs: { startPage: number; endPage: number; label: string }[];
  spreads: CustomSpreadSelection[];
  errors: string[];
  explanation?: string;
}

/**
 * Recalculate and validate physical interior page plan before accepting a layout change.
 * Enforces strict facing pair imposition and validates against profile requirements.
 */
export function recalculateAndValidatePhysicalPagePlan(
  bookId: string,
  profileId: string = "printify-hardcover-square-8x8",
  mode: LayoutMode = "standard-single",
  customSpreads: CustomSpreadSelection[] = [],
): PagePlanValidationResult {
  const profile = getPrintProfile(profileId);
  const book = getBook(bookId);
  const interiorSpecs = book.pages
    .filter((p) => p.kind !== "cover" && p.kind !== "backcover")
    .filter((p) => !(p.role === "FINAL DREAM BIG" && profile.interiorPageCount !== 24));
  const edition = getEditionForProfile(bookId, profile);

  const errors: string[] = [];
  const requiredPageCount = profile.interiorPageCount ?? interiorSpecs.length;
  // Facing-pair bounds are checked against the full physical book (cover +
  // interior + backcover), not the interior-scene count alone — see
  // assertValidFacingPair in lib/pdf/imposition.ts.
  const totalPhysicalPages = requiredPageCount + 2;

  const eligiblePairs = getEligibleFacingPairs(totalPhysicalPages).map(
    ([startPage, endPage]) => ({
      startPage,
      endPage,
      label: `Pages ${startPage}–${endPage}`,
    }),
  );

  const validSpreads: CustomSpreadSelection[] = [];
  if (mode === "custom-spreads") {
    const seenStarts = new Set<number>();
    for (const s of customSpreads) {
      if (
        s.startPage === 1 ||
        s.startPage % 2 !== 0 ||
        s.endPage !== s.startPage + 1 ||
        s.endPage > totalPhysicalPages - 1
      ) {
        errors.push(
          `Invalid facing pair ${s.startPage}–${s.endPage}. Spreads must begin on an even physical page (2, 4, ... ${totalPhysicalPages - 2}) and span exactly two consecutive facing pages.`,
        );
      } else if (seenStarts.has(s.startPage)) {
        errors.push(
          `Duplicate spread configuration for physical page ${s.startPage}.`,
        );
      } else {
        seenStarts.add(s.startPage);
        validSpreads.push(s);
      }
    }
  }

  // Validate provider-specific constraints
  if (profile.interiorPageCount !== undefined) {
    if (!edition && interiorSpecs.length !== profile.interiorPageCount) {
      errors.push(
        `Story "${book.title}" provides ${interiorSpecs.length} interior scenes, but ${profile.label} requires exactly ${profile.interiorPageCount} interior pages. An editorial edition is required; scenes will not be silently duplicated or truncated.`,
      );
    }
  }

  const spreadCount = mode === "custom-spreads" ? validSpreads.length : 0;
  // For a variable-page profile (no fixed profile.interiorPageCount, e.g.
  // Classic Landscape), resolveLayoutPlan's actual asset-building loop does
  // NOT remove any story scenes to make room for a spread — every scene is
  // kept, and a spread simply occupies 2 physical pages for the 1 scene it
  // carries instead of 1. So each spread adds exactly one physical page
  // beyond the standard-single baseline (interiorSpecs.length), and the
  // total interior physical-page count is NOT a fixed budget that a spread
  // "spends" — it truthfully grows. (Verified against resolveLayoutPlan's
  // own resolvedInteriorCount output; see layoutPlan.test.ts.)
  //
  // A fixed-page profile (profile.interiorPageCount set, e.g. a Printify
  // edition) is a genuinely fixed budget instead — kept as before pending a
  // proper incompatible-selection rejection for that path (not yet
  // implemented: see the "fixed-page profile" TODO below).
  const isVariablePageBudget = profile.interiorPageCount === undefined;
  const physicalPageCount = isVariablePageBudget
    ? interiorSpecs.length + spreadCount
    : requiredPageCount;
  const singleCount = isVariablePageBudget
    ? interiorSpecs.length - spreadCount
    : physicalPageCount - spreadCount * 2;

  let explanation: string | undefined;
  if (errors.length > 0) {
    explanation = errors.join(" ");
  } else {
    explanation = `Layout is valid: exactly ${physicalPageCount} physical interior pages (${spreadCount} spread${spreadCount === 1 ? "" : "s"}, ${singleCount} single${singleCount === 1 ? "" : "s"}).`;
  }

  return {
    valid: errors.length === 0,
    physicalPageCount,
    requiredPageCount,
    spreadCount,
    singleCount,
    eligiblePairs,
    spreads: validSpreads,
    errors,
    explanation,
  };
}

export interface ResolvedPhysicalLeaf {
  /** 1-based physical interior page number (e.g. 1 to 24). */
  physicalPageNumber: number;
  /** "left" for even pages (verso), "right" for odd pages (recto). */
  leafSide: "left" | "right";
  /** "left" (inside spine) or "right" (outside edge). */
  bindingEdge: "left" | "right";
  /** Whether story text is placed on this leaf. */
  hasText: boolean;
  /** Text copy rendered on this leaf (null if art-only). */
  text: string | null;
  /** Text placement side relative to spread ("left", "right", or "none"). */
  textSide: TextSide;
}

export interface ResolvedAssetSlot {
  /** Unique slot identifier, e.g. "01-cover", "02-intro", "03-pilot", ..., "24-backcover". */
  slotId: string;
  /** 0-based index of this asset in the authoritative resolved asset array. */
  illustrationIndex: number;
  /** Stable scene identifier across editions & templates, e.g. "cover", "intro", "pilot", "closing", "backcover". */
  sceneId: string;
  pageKind: PageKind;
  kind: PageKind;
  profileId: string;
  layout: LayoutType;
  assetKind: AssetKind;
  /** Canonical filename, e.g. "01-cover.png", "02-intro.png", "03-pilot.png", ..., "24-backcover.png". */
  filename: string;
  expectedFilename: string;
  /** Legacy filename aliases for backward compatibility, e.g. ["01.png", "front-cover.png"]. */
  legacyAliases: string[];
  /** 0-based index of corresponding page in base StoryTemplate. */
  sourceSceneIndex: number;
  sourceSceneRole?: string;
  role?: string;
  roleSlug: string;
  required: boolean;
  /** 1-based physical interior page numbers consumed by this asset. */
  physicalPages: number[];
  textSide: TextSide;
  subjectSide: SubjectSide;
  /** Exact canvas width and height in pixels for the destination print profile. */
  destinationDimensions: { width: number; height: number };
  /** Exact physical trim and bleed dimensions in inches. */
  printDimensionsIn: {
    trimWidthIn: number;
    trimHeightIn: number;
    bleedIn: number;
    spread: boolean;
  };
  /** Full-bleed target canvas aspect ratio (e.g. "15:11", "89:33", "1:1", "2:1") */
  targetCanvasAspect: string;
  /** Physical trim aspect ratio (e.g. "11:8", "11:4", "1:1", "2:1") */
  trimAspect: string;
  /** Closest provider-requested aspect-ratio preset (e.g. "4:3", "21:9", "1:1", "2:1") */
  providerPresetAspect: string;
  /** Exact target aspect ratio string matching target canvas aspect — never contradictory. */
  expectedSourceAspect: string;
  /** Exact dimensions of the normalized production asset in pixels */
  normalizedProductionDimensions: { width: number; height: number };
  /** Strategy used when normalizing non-exact provider outputs */
  normalizationStrategy: "proportional-cover-crop" | "proportional-contain-backdrop" | "exact-match";
  /** Minimum acceptable source resolution in pixels for print quality. */
  minAcceptableResolution: { width: number; height: number };
  safeRegions: ResolvedSafeRegions;
  framing?: FramingMode;
  prompt: string;
  storyText: string;
  leaves: ResolvedPhysicalLeaf[];
}

/** Compute normalized role slug for canonical naming. */
export function getRoleSlug(kind: PageKind, role?: string): string {
  if (kind === "cover") return "cover";
  if (kind === "intro") return "intro";
  if (kind === "closing") return "closing";
  if (kind === "backcover") return "backcover";
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

export interface ResolvedLayoutPlan {
  storyId: string;
  profileId: string;
  mode: LayoutMode;
  interiorPageCount: number;
  assets: ResolvedAssetSlot[];
  coverAsset: ResolvedAssetSlot;
  backCoverAsset: ResolvedAssetSlot;
  interiorAssets: ResolvedAssetSlot[];
  /** Lookup from 1-based physical page number to the asset slot and leaf details. */
  pageToAsset: Map<number, { asset: ResolvedAssetSlot; leaf: ResolvedPhysicalLeaf }>;
  /** Validation / limitation warnings or errors (e.g. if story scenes count doesn't match fixed profile page count without an editorial edition) */
  limitations?: string[];
  isValidForProfile: boolean;
}

export interface ResolveLayoutPlanOptions {
  child: ChildProfile;
  bookId: string;
  profileId?: string;
  mode?: LayoutMode;
  /** Explicit custom spread facing pairs if mode is "custom-spreads". */
  customSpreads?: CustomSpreadSelection[];
  /** If true, uses the default editorial plan for stories that specify one (e.g. Dream Big pages 22-23 spread). */
  useEditorialDefault?: boolean;
}

/**
 * Determine default subject side as the auto-opposite of text side.
 */
export function defaultSubjectSideFor(textSide: TextSide): SubjectSide {
  if (textSide === "left") return "right";
  if (textSide === "right") return "left";
  return "centered";
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

/**
 * Resolve the authoritative layout plan for a story, profile, and child.
 *
 * This is the SINGLE SOURCE OF TRUTH across the entire application:
 * - Standard Single Pages: Every interior page is strictly its own single-page asset.
 * - Custom Spreads: User-selected valid facing pairs become continuous spreads.
 * - Editorial Editions: Explicitly registered editions (e.g. Dream Big 24-page on Printify).
 */
export function resolveLayoutPlan(opts: ResolveLayoutPlanOptions): ResolvedLayoutPlan {
  const { child, bookId, profileId = "printify-hardcover-square-8x8" } = opts;
  const book = getBook(bookId);
  const profile = getPrintProfile(profileId);

  const customSpreads = opts.customSpreads ?? [];

  // 1. Identify cover and backcover pages from the book template
  const coverSpecIndex = book.pages.findIndex((p) => p.kind === "cover");
  const backCoverSpecIndex = book.pages.findIndex((p) => p.kind === "backcover");
  const interiorSpecsWithIndex = book.pages
    .map((spec, index) => ({ spec, index }))
    .filter(({ spec }) => spec.kind !== "cover" && spec.kind !== "backcover")
    .filter(({ spec }) => {
      // "FINAL DREAM BIG" is specifically an editorial filler for Printify fixed-24 interior edition
      if (spec.role === "FINAL DREAM BIG" && profile.interiorPageCount !== 24) {
        return false;
      }
      return true;
    });

  // 2. Check for registered PrintEdition
  const edition = getEditionForProfile(bookId, profile);

  // 3. Determine target interior pages & validate provider count
  const limitations: string[] = [];
  let isValidForProfile = true;

  if (profile.interiorPageCount !== undefined) {
    if (!edition && interiorSpecsWithIndex.length !== profile.interiorPageCount) {
      limitations.push(
        `Story "${book.title}" contains ${interiorSpecsWithIndex.length} interior scenes, but ${profile.label} requires exactly ${profile.interiorPageCount} interior pages. An editorial edition is required to support this profile without altering story narrative.`,
      );
      isValidForProfile = false;
    }
  }

  // 4. Validate custom spread requests or editorial defaults
  const spreadFacingPairs = new Map<number, CustomSpreadSelection>();
  if (opts.mode === "custom-spreads") {
    const totalInterior = profile.interiorPageCount ?? interiorSpecsWithIndex.length;
    // assertValidFacingPair's maxPages is the full physical book page count
    // (cover + interior + backcover), not the interior-scene count alone.
    const totalPhysicalPages = totalInterior + 2;
    for (const spread of customSpreads) {
      assertValidFacingPair(spread.startPage, spread.endPage, totalPhysicalPages);
      if (spreadFacingPairs.has(spread.startPage)) {
        throw new Error(`Duplicate spread configuration starting at physical page ${spread.startPage}.`);
      }
      spreadFacingPairs.set(spread.startPage, spread);
    }
  } else if (
    opts.useEditorialDefault !== false &&
    opts.mode !== "standard-single" &&
    bookId === "dream-big" &&
    (profile.interiorPageCount ?? interiorSpecsWithIndex.length) >= 24
  ) {
    // Dream Big default editorial plan: a spread on facing pages 22-23.
    // Note: whichever scene the sequential scene cursor reaches when it hits
    // physical page 22 becomes this spread's content — for the current
    // 22-scene Dream Big template that's the last career (Inventor), not
    // Closing, even though this branch only fires when interiorPageCount is
    // padded to >=24 (not classic-landscape's 22-scene, undefined-count case).
    spreadFacingPairs.set(22, {
      startPage: 22,
      endPage: 23,
      textSide: "left",
      subjectSide: "right",
    });
  }

  const mode: LayoutMode =
    opts.mode ?? (spreadFacingPairs.size > 0 ? "custom-spreads" : "standard-single");

  const isSinglePdf = profile.exportMode === "single-pdf";
  const expectedTotalAssets = 1 + interiorSpecsWithIndex.length + 1;

  // 5. Construct front-cover asset
  const coverGeometry = getProfileAssetGeometry(profile, "front-cover");
  const coverIllIndex = edition ? edition.coverIllustrationIndex : (coverSpecIndex >= 0 ? coverSpecIndex : 0);
  const coverSpec = book.pages[coverIllIndex] ?? book.pages[0];
  const coverFraming: FramingMode = coverSpec.framing ?? "waist-up portrait";
  const coverPrompt = coverSpec.illustrationPrompt(child, profile.id, {
    layout: "single-page",
    textSide: "left",
    subjectSide: "centered",
    framing: coverFraming,
  });
  const coverText = coverSpec.text(child);
  const coverLegacyAlias = edition && edition.illustrations[coverIllIndex]?.filename
    ? edition.illustrations[coverIllIndex].filename
    : "01.png";

  const coverPhysicalPages = isSinglePdf ? [1] : [];
  const coverLeaf: ResolvedPhysicalLeaf = {
    physicalPageNumber: 1,
    leafSide: "right",
    bindingEdge: "left",
    hasText: true,
    text: coverText,
    textSide: "left",
  };

  const coverAsset: ResolvedAssetSlot = {
    slotId: "01-cover",
    illustrationIndex: 0,
    sceneId: "cover",
    pageKind: "cover",
    kind: "cover",
    profileId: profile.id,
    layout: "single-page",
    assetKind: "front-cover",
    filename: "01-cover.png",
    expectedFilename: "01-cover.png",
    legacyAliases: Array.from(new Set([coverLegacyAlias, "01.png", "front-cover.png", "cover.png", "01-cover.png"])),
    sourceSceneIndex: coverIllIndex,
    sourceSceneRole: coverSpec.role ?? "cover",
    role: "cover",
    roleSlug: "cover",
    required: true,
    physicalPages: coverPhysicalPages,
    textSide: "left",
    subjectSide: "centered",
    destinationDimensions: profile.coverGeometryPx
      ? { width: profile.coverGeometryPx.width, height: profile.coverGeometryPx.height }
      : coverGeometry.dimensions,
    printDimensionsIn: coverGeometry.printDimensionsIn,
    targetCanvasAspect: coverGeometry.targetCanvasAspect,
    trimAspect: coverGeometry.trimAspect,
    providerPresetAspect: coverGeometry.providerPresetAspect,
    expectedSourceAspect: profile.singleAspect,
    normalizedProductionDimensions: coverGeometry.normalizedProductionDimensions,
    normalizationStrategy: coverGeometry.normalizationStrategy,
    minAcceptableResolution: coverGeometry.minResolution,
    safeRegions: computeAssetSafeRegions(profile, "front-cover", "left", "centered"),
    framing: coverFraming,
    prompt: coverPrompt,
    storyText: coverText,
    leaves: isSinglePdf ? [coverLeaf] : [],
  };

  // 6. Construct back-cover asset
  const backCoverGeometry = getProfileAssetGeometry(profile, "back-cover");
  const backCoverIllIndex = edition
    ? edition.backCoverIllustrationIndex
    : (profile.interiorPageCount !== 24 && bookId === "dream-big"
        ? expectedTotalAssets - 1
        : (backCoverSpecIndex >= 0 ? backCoverSpecIndex : book.pages.length - 1));
  const backCoverSpec = book.pages[backCoverSpecIndex >= 0 ? backCoverSpecIndex : book.pages.length - 1] ?? book.pages[book.pages.length - 1];
  const backCoverFraming: FramingMode | undefined =
    backCoverSpec.framing ?? (backCoverSpec.kind === "backcover" ? "waist-up portrait" : undefined);
  const backCoverPrompt = backCoverSpec.illustrationPrompt(child, profile.id, {
    layout: "single-page",
    textSide: "none",
    subjectSide: "centered",
    framing: backCoverFraming,
  });
  const backCoverText = backCoverSpec.text(child);
  const backCoverPhysicalPageNumber = isSinglePdf ? expectedTotalAssets : 0;
  const backCoverSlotNum = String(isSinglePdf ? expectedTotalAssets : expectedTotalAssets).padStart(2, "0");
  const backCoverSlotId = `${backCoverSlotNum}-backcover`;
  const backCoverLegacyAlias = edition && edition.illustrations[backCoverIllIndex]?.filename
    ? edition.illustrations[backCoverIllIndex].filename
    : `${String(expectedTotalAssets).padStart(2, "0")}.png`;

  const backCoverLeaf: ResolvedPhysicalLeaf = {
    physicalPageNumber: backCoverPhysicalPageNumber,
    leafSide: "left",
    bindingEdge: "right",
    hasText: false,
    text: null,
    textSide: "none",
  };

  const backCoverAsset: ResolvedAssetSlot = {
    slotId: backCoverSlotId,
    illustrationIndex: expectedTotalAssets - 1,
    sceneId: "backcover",
    pageKind: "backcover",
    kind: "backcover",
    profileId: profile.id,
    layout: "single-page",
    assetKind: "back-cover",
    filename: `${backCoverSlotId}.png`,
    expectedFilename: `${backCoverSlotId}.png`,
    legacyAliases: Array.from(
      new Set([
        backCoverLegacyAlias,
        `${String(expectedTotalAssets).padStart(2, "0")}.png`,
        `${String(book.pages.length).padStart(2, "0")}.png`,
        "24.png",
        "back-cover.png",
        "backcover.png",
        `${backCoverSlotId}.png`,
      ]),
    ),
    sourceSceneIndex: backCoverIllIndex,
    sourceSceneRole: backCoverSpec.role ?? "backcover",
    role: "backcover",
    roleSlug: "backcover",
    required: true,
    physicalPages: isSinglePdf ? [backCoverPhysicalPageNumber] : [],
    textSide: "none",
    subjectSide: "centered",
    destinationDimensions: backCoverGeometry.dimensions,
    printDimensionsIn: backCoverGeometry.printDimensionsIn,
    targetCanvasAspect: backCoverGeometry.targetCanvasAspect,
    trimAspect: backCoverGeometry.trimAspect,
    providerPresetAspect: backCoverGeometry.providerPresetAspect,
    expectedSourceAspect: profile.singleAspect,
    normalizedProductionDimensions: backCoverGeometry.normalizedProductionDimensions,
    normalizationStrategy: backCoverGeometry.normalizationStrategy,
    minAcceptableResolution: backCoverGeometry.minResolution,
    safeRegions: computeAssetSafeRegions(profile, "back-cover", "none", "centered"),
    framing: backCoverFraming,
    prompt: backCoverPrompt,
    storyText: backCoverText,
    leaves: isSinglePdf ? [backCoverLeaf] : [],
  };

  // 7. Build interior assets and map physical pages
  const interiorAssets: ResolvedAssetSlot[] = [];
  const pageToAsset = new Map<number, { asset: ResolvedAssetSlot; leaf: ResolvedPhysicalLeaf }>();

  if (isSinglePdf) {
    pageToAsset.set(1, { asset: coverAsset, leaf: coverLeaf });
  }

  // A. Use registered PrintEdition if active
  if (
    edition &&
    mode !== "custom-spreads" &&
    opts.mode !== "standard-single" &&
    !opts.customSpreads &&
    opts.useEditorialDefault !== false
  ) {
    let i = 0;
    while (i < edition.physicalPages.length) {
      const curr = edition.physicalPages[i];
      const next = edition.physicalPages[i + 1];
      const isSpread =
        curr.side === "left" &&
        next?.side === "right" &&
        curr.illustrationIndex === next.illustrationIndex;

      const illSpec = edition.illustrations[curr.illustrationIndex];
      const sceneIndex = curr.illustrationIndex;
      const bookSpec = book.pages[sceneIndex];
      const isSpreadLayout = isSpread;

      const textSide: TextSide =
        curr.storyTextLeaf === "right"
          ? "right"
          : curr.storyTextLeaf === "none"
            ? "none"
            : curr.text
              ? "left"
              : next?.text
                ? "right"
                : "left";
      const subjectSide: SubjectSide = defaultSubjectSideFor(textSide);
      const effectiveLayout: LayoutType = isSpreadLayout
        ? textSide === "right"
          ? "subject-left-text-right"
          : textSide === "none"
            ? "full-art-no-text"
            : "text-left-subject-right"
        : "single-page";

      const scenePrompt = bookSpec.illustrationPrompt(child, profile.id, {
        layout: effectiveLayout,
        textSide,
        subjectSide,
        framing: bookSpec.framing,
      });
      const sceneText = illSpec?.text ? illSpec.text(child) : bookSpec.text(child);
      const roleSlug = getRoleSlug(bookSpec?.kind ?? "scene", bookSpec?.role);
      const sceneId =
        bookSpec?.role ??
        (bookSpec?.kind === "intro"
          ? "intro"
          : bookSpec?.kind === "closing"
            ? "closing"
            : `scene-${String(sceneIndex).padStart(2, "0")}`);

      if (isSpread) {
        const p1 = curr.physicalPageNumber;
        const p2 = next.physicalPageNumber;
        const geom = getProfileAssetGeometry(profile, "spread");
        const slotId = `spread-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
        const filename = canonicalFilenameForSlot("spread", [p1, p2]);
        const legacyAliases = Array.from(new Set([
          curr.filename,
          `spread-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}.png`,
          `${roleSlug}.png`,
        ])).filter(Boolean);

        const leaf1: ResolvedPhysicalLeaf = {
          physicalPageNumber: p1,
          leafSide: "left",
          bindingEdge: "right",
          hasText: textSide === "left",
          text: textSide === "left" ? sceneText : null,
          textSide: textSide === "left" ? "left" : "none",
        };
        const leaf2: ResolvedPhysicalLeaf = {
          physicalPageNumber: p2,
          leafSide: "right",
          bindingEdge: "left",
          hasText: textSide === "right",
          text: textSide === "right" ? sceneText : null,
          textSide: textSide === "right" ? "right" : "none",
        };

        const asset: ResolvedAssetSlot = {
          slotId,
          illustrationIndex: interiorAssets.length + 1,
          sceneId,
          pageKind: bookSpec?.kind ?? "closing",
          kind: bookSpec?.kind ?? "closing",
          role: bookSpec?.role ?? bookSpec?.kind,
          roleSlug,
          required: true,
          profileId: profile.id,
          layout: effectiveLayout,
          assetKind: "spread",
          filename,
          expectedFilename: filename,
          legacyAliases,
          sourceSceneIndex: sceneIndex,
          sourceSceneRole: bookSpec?.role,
          physicalPages: [p1, p2],
          textSide,
          subjectSide,
          destinationDimensions: geom.dimensions,
          printDimensionsIn: geom.printDimensionsIn,
          targetCanvasAspect: geom.targetCanvasAspect,
          trimAspect: geom.trimAspect,
          providerPresetAspect: geom.providerPresetAspect,
          expectedSourceAspect: profile.spreadAspect,
          normalizedProductionDimensions: geom.normalizedProductionDimensions,
          normalizationStrategy: geom.normalizationStrategy,
          minAcceptableResolution: geom.minResolution,
          safeRegions: computeAssetSafeRegions(profile, "spread", textSide, subjectSide),
          framing: bookSpec.framing,
          prompt: scenePrompt,
          storyText: sceneText,
          leaves: [leaf1, leaf2],
        };

        interiorAssets.push(asset);
        pageToAsset.set(p1, { asset, leaf: leaf1 });
        pageToAsset.set(p2, { asset, leaf: leaf2 });
        i += 2;
      } else {
        const p = curr.physicalPageNumber;
        const geom = getProfileAssetGeometry(profile, "single-page");
        const slotNum = String(p).padStart(2, "0");
        const slotId = `page-${slotNum}`;
        const filename = canonicalFilenameForSlot("single-page", [p]);
        const legacyAliases = Array.from(new Set([
          curr.filename,
          `page-${slotNum}.png`,
          `${roleSlug}.png`,
        ])).filter(Boolean);

        const leafSide = p % 2 === 0 ? "left" : "right";
        const bindingEdge = p % 2 === 0 ? "right" : "left";

        const leaf: ResolvedPhysicalLeaf = {
          physicalPageNumber: p,
          leafSide,
          bindingEdge,
          hasText: true,
          text: sceneText,
          textSide: "left",
        };

        const asset: ResolvedAssetSlot = {
          slotId,
          illustrationIndex: interiorAssets.length + 1,
          sceneId,
          pageKind: bookSpec?.kind ?? "scene",
          kind: bookSpec?.kind ?? "scene",
          role: bookSpec?.role ?? bookSpec?.kind,
          roleSlug,
          required: true,
          profileId: profile.id,
          layout: "single-page",
          assetKind: "single-page",
          filename,
          expectedFilename: filename,
          legacyAliases,
          sourceSceneIndex: sceneIndex,
          sourceSceneRole: bookSpec?.role,
          physicalPages: [p],
          textSide: "left",
          subjectSide: "right",
          destinationDimensions: geom.dimensions,
          printDimensionsIn: geom.printDimensionsIn,
          targetCanvasAspect: geom.targetCanvasAspect,
          trimAspect: geom.trimAspect,
          providerPresetAspect: geom.providerPresetAspect,
          expectedSourceAspect: profile.singleAspect,
          normalizedProductionDimensions: geom.normalizedProductionDimensions,
          normalizationStrategy: geom.normalizationStrategy,
          minAcceptableResolution: geom.minResolution,
          safeRegions: computeAssetSafeRegions(profile, "single-page", "left", "right"),
          framing: bookSpec.framing,
          prompt: scenePrompt,
          storyText: sceneText,
          leaves: [leaf],
        };

        interiorAssets.push(asset);
        pageToAsset.set(p, { asset, leaf });
        i += 1;
      }
    }

    const allAssets = [coverAsset, ...interiorAssets, backCoverAsset];
    allAssets.forEach((a, idx) => {
      a.illustrationIndex = idx;
      a.required = true;
    });

    return {
      storyId: book.id,
      profileId: profile.id,
      mode: opts.mode ?? "custom-spreads",
      interiorPageCount: edition.interiorPageCount,
      assets: allAssets,
      coverAsset,
      backCoverAsset,
      interiorAssets,
      pageToAsset,
      limitations: limitations.length > 0 ? limitations : undefined,
      isValidForProfile,
    };
  }

  // B. Standard Single or Custom Spreads mapping
  let sceneCursor = 0;
  let pageNumber = isSinglePdf ? 2 : 1;
  const isStandardSingle = mode === "standard-single";

  while (sceneCursor < interiorSpecsWithIndex.length) {
    const isSpreadStart = !isStandardSingle && spreadFacingPairs.has(pageNumber);
    const sceneEntry = interiorSpecsWithIndex[sceneCursor++];
    const roleSlug = getRoleSlug(sceneEntry.spec.kind, sceneEntry.spec.role);

    if (isSpreadStart) {
      const spreadConfig = spreadFacingPairs.get(pageNumber)!;
      const p1 = spreadConfig.startPage;
      const p2 = spreadConfig.endPage;

      const geom = getProfileAssetGeometry(profile, "spread");
      const p1Str = String(p1).padStart(2, "0");
      const p2Str = String(p2).padStart(2, "0");
      const slotId = isSinglePdf ? `spread-${p1Str}-${p2Str}-${roleSlug}` : `spread-${p1Str}-${p2Str}`;
      const filename = canonicalFilenameForSlot("spread", [p1, p2]);
      const legacyNumber = sceneEntry.index + 1;
      const legacyAliases = Array.from(new Set([
        `${String(legacyNumber).padStart(2, "0")}.png`,
        `spread-${p1Str}-${p2Str}.png`,
        `${roleSlug}.png`,
      ])).filter(Boolean);

      const textSide = spreadConfig.textSide;
      const subjectSide = spreadConfig.subjectSide ?? defaultSubjectSideFor(textSide);
      const effectiveLayout: LayoutType =
        textSide === "right"
          ? "subject-left-text-right"
          : textSide === "none"
            ? "full-art-no-text"
            : "text-left-subject-right";

      const scenePrompt = sceneEntry.spec.illustrationPrompt(child, profile.id, {
        layout: effectiveLayout,
        textSide,
        subjectSide,
        framing: sceneEntry.spec.framing,
      });
      const fullText = textSide === "none" ? "" : sceneEntry.spec.text(child);
      const sceneId =
        sceneEntry.spec.role ??
        (sceneEntry.spec.kind === "intro"
          ? "intro"
          : sceneEntry.spec.kind === "closing"
            ? "closing"
            : `scene-${String(sceneCursor).padStart(2, "0")}`);

      const leaf1: ResolvedPhysicalLeaf = {
        physicalPageNumber: p1,
        leafSide: "left",
        bindingEdge: "right",
        hasText: textSide === "left",
        text: textSide === "left" ? fullText : null,
        textSide: textSide === "left" ? "left" : "none",
      };

      const leaf2: ResolvedPhysicalLeaf = {
        physicalPageNumber: p2,
        leafSide: "right",
        bindingEdge: "left",
        hasText: textSide === "right",
        text: textSide === "right" ? fullText : null,
        textSide: textSide === "right" ? "right" : "none",
      };

      const asset: ResolvedAssetSlot = {
        slotId,
        illustrationIndex: interiorAssets.length + 1,
        sceneId,
        pageKind: sceneEntry.spec.kind,
        kind: sceneEntry.spec.kind,
        role: sceneEntry.spec.role ?? sceneEntry.spec.kind,
        roleSlug,
        required: true,
        profileId: profile.id,
        layout: effectiveLayout,
        assetKind: "spread",
        filename,
        expectedFilename: isSinglePdf ? `${slotId}.png` : filename,
        legacyAliases,
        sourceSceneIndex: sceneEntry.index,
        sourceSceneRole: sceneEntry.spec.role,
        physicalPages: [p1, p2],
        textSide,
        subjectSide,
        destinationDimensions: geom.dimensions,
        printDimensionsIn: geom.printDimensionsIn,
        targetCanvasAspect: geom.targetCanvasAspect,
        trimAspect: geom.trimAspect,
        providerPresetAspect: geom.providerPresetAspect,
        expectedSourceAspect: profile.spreadAspect,
        normalizedProductionDimensions: geom.normalizedProductionDimensions,
        normalizationStrategy: geom.normalizationStrategy,
        minAcceptableResolution: geom.minResolution,
        safeRegions: computeAssetSafeRegions(profile, "spread", textSide, subjectSide),
        framing: sceneEntry.spec.framing,
        prompt: scenePrompt,
        storyText: fullText,
        leaves: [leaf1, leaf2],
      };

      interiorAssets.push(asset);
      pageToAsset.set(p1, { asset, leaf: leaf1 });
      pageToAsset.set(p2, { asset, leaf: leaf2 });

      pageNumber += 2;
    } else {
      // Single interior page
      const p = pageNumber;
      const geom = getProfileAssetGeometry(profile, "single-page");
      const slotNum = String(p).padStart(2, "0");
      const slotId = isSinglePdf ? `${slotNum}-${roleSlug}` : `page-${slotNum}`;
      const canonicalName = isSinglePdf ? `${slotId}.png` : canonicalFilenameForSlot("single-page", [p]);
      const legacyNumber = sceneEntry.index + 1;
      const legacyAliases = Array.from(new Set([
        `${String(legacyNumber).padStart(2, "0")}.png`,
        `page-${slotNum}.png`,
        `${roleSlug}.png`,
        `${slotNum}-${roleSlug}.png`,
      ])).filter(Boolean);

      const leafSide = p % 2 === 0 ? "left" : "right";
      const bindingEdge = p % 2 === 0 ? "right" : "left";
      const fullText = sceneEntry.spec.text(child);

      const leaf: ResolvedPhysicalLeaf = {
        physicalPageNumber: p,
        leafSide,
        bindingEdge,
        hasText: true,
        text: fullText,
        textSide: "left",
      };

      const sceneId =
        sceneEntry.spec.role ??
        (sceneEntry.spec.kind === "intro"
          ? "intro"
          : sceneEntry.spec.kind === "closing"
            ? "closing"
            : `scene-${String(sceneCursor).padStart(2, "0")}`);

      const asset: ResolvedAssetSlot = {
        slotId,
        illustrationIndex: interiorAssets.length + 1,
        sceneId,
        pageKind: sceneEntry.spec.kind,
        kind: sceneEntry.spec.kind,
        role: sceneEntry.spec.role ?? sceneEntry.spec.kind,
        roleSlug,
        required: true,
        profileId: profile.id,
        layout: "single-page",
        assetKind: "single-page",
        filename: canonicalName,
        expectedFilename: canonicalName,
        legacyAliases,
        sourceSceneIndex: sceneEntry.index,
        sourceSceneRole: sceneEntry.spec.role,
        physicalPages: [p],
        textSide: "left",
        subjectSide: "right",
        destinationDimensions: geom.dimensions,
        printDimensionsIn: geom.printDimensionsIn,
        targetCanvasAspect: geom.targetCanvasAspect,
        trimAspect: geom.trimAspect,
        providerPresetAspect: geom.providerPresetAspect,
        expectedSourceAspect: profile.singleAspect,
        normalizedProductionDimensions: geom.normalizedProductionDimensions,
        normalizationStrategy: geom.normalizationStrategy,
        minAcceptableResolution: geom.minResolution,
        safeRegions: computeAssetSafeRegions(profile, "single-page", "left", "right"),
        framing: sceneEntry.spec.framing,
        prompt: sceneEntry.spec.illustrationPrompt(child, profile.id, {
          layout: "single-page",
          textSide: "left",
          subjectSide: "right",
          framing: sceneEntry.spec.framing,
        }),
        storyText: fullText,
        leaves: [leaf],
      };

      interiorAssets.push(asset);
      pageToAsset.set(p, { asset, leaf });

      pageNumber += 1;
    }
  }

  if (isSinglePdf) {
    const backCoverPage = pageNumber;
    const bcSlotNum = String(backCoverPage).padStart(2, "0");
    backCoverAsset.physicalPages = [backCoverPage];
    backCoverAsset.slotId = `${bcSlotNum}-backcover`;
    backCoverAsset.expectedFilename = `${backCoverAsset.slotId}.png`;
    backCoverAsset.filename = `${backCoverAsset.slotId}.png`;
    backCoverAsset.legacyAliases = Array.from(
      new Set([
        `${bcSlotNum}.png`,
        "24.png",
        "back-cover.png",
        "backcover.png",
        `${backCoverAsset.slotId}.png`,
      ]),
    );
    backCoverAsset.leaves = [
      {
        physicalPageNumber: backCoverPage,
        leafSide: "left",
        bindingEdge: "right",
        hasText: false,
        text: null,
        textSide: "none",
      },
    ];
    pageToAsset.set(backCoverPage, { asset: backCoverAsset, leaf: backCoverAsset.leaves[0] });
  }

  const allAssets = [coverAsset, ...interiorAssets, backCoverAsset];
  allAssets.forEach((a, idx) => {
    a.illustrationIndex = idx;
    a.required = true;
  });

  const resolvedInteriorCount = isSinglePdf ? pageNumber - 2 : pageNumber - 1;

  if (profile.interiorPageCount !== undefined && resolvedInteriorCount !== profile.interiorPageCount) {
    limitations.push(
      `Story "${book.title}" in ${mode} mode resolves to ${resolvedInteriorCount} interior pages, but ${profile.label} requires exactly ${profile.interiorPageCount} interior pages. Spreads or dedicated edition mappings are required to reach ${profile.interiorPageCount} pages.`,
    );
    isValidForProfile = false;
  }

  if (profile.provider === "lulu") {
    if (resolvedInteriorCount % 2 !== 0) {
      limitations.push(
        `Story "${book.title}" resolves to ${resolvedInteriorCount} interior pages, but ${profile.label} requires an even page count (divisible by 2).`,
      );
      isValidForProfile = false;
    }
    if (resolvedInteriorCount < 24) {
      limitations.push(
        `Story "${book.title}" resolves to ${resolvedInteriorCount} interior pages, but ${profile.label} requires at least 24 interior pages for hardcover print.`,
      );
      isValidForProfile = false;
    }
  }

  return {
    storyId: book.id,
    profileId: profile.id,
    mode: opts.mode ?? (spreadFacingPairs.size > 0 ? "custom-spreads" : "standard-single"),
    interiorPageCount: resolvedInteriorCount,
    assets: allAssets,
    coverAsset,
    backCoverAsset,
    interiorAssets,
    pageToAsset,
    limitations: limitations.length > 0 ? limitations : undefined,
    isValidForProfile,
  };
}
