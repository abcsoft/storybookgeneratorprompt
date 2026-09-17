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
import { getStoryEdition, resolveStoryEditionPlan } from "./storyEdition";
import type { ChildProfile, StoryTemplate, LayoutType, PageKind, FramingMode, DeliveryGroup } from "./types";

/**
 * - "standard-single": every interior scene is its own single-page asset
 *   (24 image assets, 24 physical PDF leaves for Dream Big). Default.
 * - "custom-spreads" ("Expanded Hybrid" in the UI): the user picks story
 *   scenes to render as two-page spreads. Every original scene is kept —
 *   nothing is dropped, combined, or rewritten — so each selected spread
 *   adds exactly one physical PDF leaf beyond standard-single's baseline.
 *   The resulting page count is NOT fixed at 24; it grows with every
 *   spread selected, and the UI/API/Markdown must all say so truthfully.
 * - "full-spread-24": a *fixed* 24-physical-page edition (Page 1 standalone,
 *   11 interior spreads across Pages 2-23, Page 24 standalone — 13 image
 *   assets total) that requires rewriting/combining Dream Big's 22 source
 *   scenes down to 11 spread beats. That is an editorial content decision,
 *   not a layout-geometry one, and is NOT made here: this mode is a stub
 *   that resolveLayoutPlan() rejects until an approved edition (e.g. a
 *   registered "dream-big-full-spread-24" PrintEdition) exists. See
 *   lib/story/editions/dreamBigFullSpread24.proposal.ts.
 */
export type LayoutMode = "standard-single" | "custom-spreads" | "full-spread-24";

// AssetKind, TextSide, SubjectSide, SafeRegionRectPct, ResolvedSafeRegions,
// and the pure geometry/filename/role-slug helpers below live in
// layoutGeometry.ts — a dependency-free leaf module — and are re-exported
// here so every existing "./layoutPlan" consumer is unaffected. See that
// file's header comment for why: storyEdition.ts needs these without
// creating a runtime circular import back into this file.
import {
  getRoleSlug,
  canonicalFilenameForSlot,
  computeAssetSafeRegions,
  deriveProviderNativeMinimum,
  getProfileAssetGeometry,
  type AssetKind,
  type TextSide,
  type SubjectSide,
  type SafeRegionRectPct,
  type ResolvedSafeRegions,
  type TextPanelPosition,
} from "./layoutGeometry";
export {
  getRoleSlug,
  canonicalFilenameForSlot,
  computeAssetSafeRegions,
  deriveProviderNativeMinimum,
  getProfileAssetGeometry,
};
export type { AssetKind, TextSide, SubjectSide, SafeRegionRectPct, ResolvedSafeRegions, TextPanelPosition };

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
  /** Interior physical leaves only (excludes front/back cover). */
  physicalPageCount: number;
  requiredPageCount: number;
  spreadCount: number;
  /** Single interior physical leaves (excludes front/back cover). */
  singleCount: number;
  eligiblePairs: { startPage: number; endPage: number; label: string }[];
  spreads: CustomSpreadSelection[];
  errors: string[];
  explanation?: string;
  /** True when this mode/profile combination is not currently available
   *  (e.g. "full-spread-24" pending editorial approval). */
  unavailable?: boolean;

  // Explicit, never-ambiguous counts (section 5/6): "pages" always means a
  // physical PDF leaf here, never an image asset — the two are only equal
  // when there are zero spreads.
  /** Story scenes in the source template (22 for Dream Big) — constant
   *  across every mode; a scene is never dropped, combined, or duplicated. */
  storySceneCount: number;
  /** Total distinct image FILES to generate (cover + backcover + interior
   *  singles + interior spreads, each spread counted once). */
  imageAssetCount: number;
  /** Of imageAssetCount, how many are two-page spread images. */
  spreadAssetCount: number;
  /** Of imageAssetCount, how many are single-page images (interior singles
   *  PLUS the front and back cover). */
  singleAssetCount: number;
  /** Total interior physical PDF leaves (singles=1 leaf, spreads=2 leaves). */
  interiorLeafCount: number;
  /** interiorLeafCount + front cover + back cover — the true total physical
   *  page count of the resulting PDF. */
  totalPdfLeafCount: number;
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

  if (mode === "full-spread-24") {
    errors.push(
      "Full Spread 24-Page Edition is coming soon — editorial mapping required. " +
        "Rewriting Dream Big's 22 source scenes down to 11 spread beats is an editorial content " +
        "decision that has not been reviewed/approved yet. Use Standard Single or Expanded Hybrid instead.",
    );
    const storySceneCount = interiorSpecs.length;
    return {
      valid: false,
      unavailable: true,
      physicalPageCount: totalPhysicalPages - 2,
      requiredPageCount,
      spreadCount: 0,
      singleCount: 0,
      eligiblePairs,
      spreads: [],
      errors,
      explanation: errors.join(" "),
      storySceneCount,
      imageAssetCount: 0,
      spreadAssetCount: 0,
      singleAssetCount: 0,
      interiorLeafCount: 0,
      totalPdfLeafCount: 0,
    };
  }

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
  const storySceneCount = interiorSpecs.length;
  const isVariablePageBudget = profile.interiorPageCount === undefined;
  // Variable-page profiles (e.g. Classic Landscape, no fixed
  // profile.interiorPageCount): resolveLayoutPlan's asset-building loop does
  // NOT remove any story scenes to make room for a spread — every scene is
  // kept, and a spread simply occupies 2 physical pages for the 1 scene it
  // carries instead of 1. So each spread truthfully adds one physical page
  // beyond the standard-single baseline (storySceneCount). (Verified
  // against resolveLayoutPlan's own resolvedInteriorCount output; see
  // dreamBigCustomSpreadsIntegrity.test.ts.)
  //
  // Fixed-page profiles with a registered PrintEdition (e.g. the Printify
  // 24-page hardcover): the edition's own default mapping already reaches
  // exactly profile.interiorPageCount via its own fixed spreads (see
  // dreamBigPrintify24Edition) — that path is untouched here. This function
  // keeps the pre-existing "spread spends 2 of the fixed budget" display
  // model for that case; a real per-selection reachability check against
  // the registered edition (rather than this budget approximation) is a
  // separate, not-yet-implemented improvement.
  const physicalPageCount = isVariablePageBudget ? storySceneCount + spreadCount : requiredPageCount;
  const singleCount = isVariablePageBudget ? storySceneCount - spreadCount : physicalPageCount - spreadCount * 2;
  const spreadAssetCount = spreadCount;
  const singleAssetCount = singleCount + 2; // + front cover + back cover
  const imageAssetCount = singleAssetCount + spreadAssetCount;
  const interiorLeafCount = physicalPageCount;
  const totalPdfLeafCount = interiorLeafCount + 2; // + front cover + back cover

  let explanation: string | undefined;
  if (errors.length > 0) {
    explanation = errors.join(" ");
  } else if (!isVariablePageBudget) {
    // Fixed-page profile: physicalPageCount is the profile's own required
    // budget, not a value that grows with spreads (see the branch above).
    explanation = `Layout is valid: exactly ${physicalPageCount} physical interior pages (${spreadCount} spread${spreadCount === 1 ? "" : "s"}, ${singleCount} single${singleCount === 1 ? "" : "s"}).`;
  } else if (spreadCount > 0) {
    explanation =
      `Layout is valid: ${imageAssetCount} image assets (${spreadAssetCount} spread${spreadAssetCount === 1 ? "" : "s"}, ` +
      `${singleAssetCount} single${singleAssetCount === 1 ? "" : "s"}) producing ${totalPdfLeafCount} physical PDF pages ` +
      `(standard-single would be ${storySceneCount + 2} pages — this selection adds ${spreadCount} page${spreadCount === 1 ? "" : "s"}).`;
  } else {
    explanation = `Layout is valid: exactly ${totalPdfLeafCount} physical pages (${imageAssetCount} image assets, no spreads).`;
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
    storySceneCount,
    imageAssetCount,
    spreadAssetCount,
    singleAssetCount,
    interiorLeafCount,
    totalPdfLeafCount,
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
  /** One of the six declared story-text-panel positions (see TextPanelPosition
   *  in layoutGeometry.ts), chosen per scene so the panel never covers the
   *  main face, required action, companion, secret marker, treasure chest, QR
   *  code, or other story-critical object. Defaults to "bottom-left" for
   *  slots resolved outside a StoryEdition (legacy path) or scenes that don't
   *  declare one explicitly. */
  textPanelPosition?: TextPanelPosition;
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
  /** "cover" for the separate front/spine/back wrap (never an interior page
   *  number) or "interior" for the numbered page sequence. Defaults to
   *  "interior" for legacy (non-StoryEdition) resolution paths that don't
   *  set it explicitly — those paths already treat cover/backcover as
   *  distinct assetKinds outside physicalPages numbering. */
  deliveryGroup?: DeliveryGroup;
  /** 1-based interior page number (1..interiorPageCount) for a
   *  StoryEdition-resolved plan. Absent for deliveryGroup "cover" assets and
   *  for legacy resolution paths. */
  physicalInteriorPage?: number;
  /** The StoryEdition id this slot was resolved from (e.g. "standard-24"),
   *  absent for legacy (non-StoryEdition) resolution paths. */
  storyEditionId?: string;
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
  /** Number of separate cover assets (front + back = 2 for a standard wrap),
   *  set on a StoryEdition-resolved plan; absent for legacy paths. */
  coverAssetCount?: number;
  /** The StoryEdition id this plan was resolved from (e.g. "standard-24"),
   *  absent for legacy (non-StoryEdition) resolution paths. */
  storyEditionId?: string;
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
 * Resolve the authoritative layout plan for a story, profile, and child.
 *
 * This is the SINGLE SOURCE OF TRUTH across the entire application:
 * - Standard Single Pages: Every interior page is strictly its own single-page asset.
 * - Custom Spreads: User-selected valid facing pairs become continuous spreads.
 * - Editorial Editions: Explicitly registered editions (e.g. Dream Big 24-page on Printify).
 */
export function resolveLayoutPlan(opts: ResolveLayoutPlanOptions): ResolvedLayoutPlan {
  if (opts.mode === "full-spread-24") {
    throw new Error(
      "Full Spread 24-Page Edition is not available yet — it requires an approved editorial " +
        "mapping (rewriting Dream Big's 22 source scenes down to 11 spread beats) that has not " +
        "been reviewed. Use Standard Single or Expanded Hybrid instead.",
    );
  }
  const { child, bookId, profileId = "printify-hardcover-square-8x8" } = opts;
  const book = getBook(bookId);
  const profile = getPrintProfile(profileId);

  const customSpreads = opts.customSpreads ?? [];

  // A StoryEdition (e.g. "standard-24") is a provider-independent editorial
  // edition — when one is registered for this story, it takes priority over
  // the legacy per-story PageSpec/PrintEdition machinery below for Standard
  // Single (and the "no explicit mode" default), for every print profile.
  // Custom Spreads is only meaningful against a StoryEdition that has
  // explicitly approved facing pairs as spreads — none currently do, so any
  // custom-spreads request against a StoryEdition-backed story is rejected
  // with a clear, actionable message rather than silently combining scenes
  // or growing the page count past interiorPageCount.
  const standardEdition = getStoryEdition(bookId, "standard-24");
  if (standardEdition) {
    if (opts.mode === "custom-spreads" && customSpreads.length > 0) {
      const approved = new Set((standardEdition.approvedSpreadPairs ?? []).map(([a, b]) => `${a}-${b}`));
      const unapproved = customSpreads.filter((s) => !approved.has(`${s.startPage}-${s.endPage}`));
      if (unapproved.length > 0) {
        throw new Error("Custom spreads require an approved fixed-24 editorial mapping.");
      }
    }
    return resolveStoryEditionPlan(standardEdition, child, profile);
  }

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
