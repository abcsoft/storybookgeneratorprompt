import sharp from "sharp";
import { assertValidFacingPair, isValidFacingPair } from "../pdf/imposition";
import { parseFilename } from "../manual/filenameMatch";
import { classifyAspectMatch, orientationOf, parseAspect } from "./aspectCheck";
import { computePageTextGeometry } from "./printifyPageTemplate";
import { getPrintProfile, listPrintProfiles } from "./registry";
import { listBooks, DEFAULT_BOOK_ID } from "../story/registry";
import { resolveLayoutPlan, type LayoutMode, type CustomSpreadSelection, type ResolvedAssetSlot } from "../story/layoutPlan";
import { getEditionForProfile } from "../story/editions";
import type { ChildProfile } from "../story/types";
import type { PrintProfile } from "./types";

export interface PreflightFile {
  filename: string;
  buffer: Buffer;
}

export interface PreflightAssetReport {
  slotId: string;
  filename: string;
  actualDimensions: { width: number; height: number };
  expectedDimensions: { width: number; height: number };
  effectivePPI: number;
  nativeSourcePpi: number;
  outputGridPpi: number;
  destinationPages: number[];
  willCropOrExtend: boolean;
  cropOrExtendNote?: string;
  nativeSourceWidth: number;
  nativeSourceHeight: number;
  nativeEffectivePpiX: number;
  nativeEffectivePpiY: number;
  finalRasterWidth: number;
  finalRasterHeight: number;
  finalOutputGridPpi: number;
}

export interface PreflightOptions {
  child: ChildProfile;
  bookId?: string;
  profileId?: string;
  files: PreflightFile[];
  mode?: LayoutMode;
  customSpreads?: CustomSpreadSelection[];
  /** Allow low resolution images in unit tests. Default is false (fail closed). */
  allowLowResolutionForTesting?: boolean;
  /** If true, runs preflight in draft mode (accepts lower PPI with watermark warning). */
  draft?: boolean;
  /** Pre-resolved slot-to-file mapping from authoritative import resolution.
   *  When provided, preflight skips its own matchFilesToSlots() and uses this directly. */
  resolvedSlotMapping?: Map<string, PreflightFile>;
  /** Explicit user acknowledgement of quality warnings (150-299 PPI). */
  acknowledgeQualityWarnings?: boolean;
}

export interface PreflightIssue {
  type: string;
  code?: string;
  illustrationNumber?: number;
  filename?: string;
  expected?: string;
  actual?: string;
  recommendation?: string;
  message: string;
}

export interface QualityWarningSlot {
  slotId: string;
  filename: string;
  nativeWidth: number;
  nativeHeight: number;
  nativeEffectivePpi: number;
  physicalPages: number[];
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  issues?: PreflightIssue[];
  assetReports?: PreflightAssetReport[];
  /** Slots with 150-299 PPI that require explicit user acknowledgement. */
  qualityWarnings?: QualityWarningSlot[];
}

/**
 * Match uploaded files to resolved asset slots.
 */
function matchFilesToSlots(
  files: PreflightFile[],
  slots: ResolvedAssetSlot[],
  errors: string[],
  warnings: string[],
  issues: PreflightIssue[],
): Map<string, PreflightFile> {
  const bySlotId = new Map<string, PreflightFile>();
  const seenFilenames = new Set<string>();

  for (const file of files) {
    if (seenFilenames.has(file.filename)) {
      const msg = `Duplicate filename "${file.filename}".`;
      errors.push(msg);
      issues.push({
        type: "DUPLICATE_FILE",
        filename: file.filename,
        expected: "Unique filename per uploaded image",
        actual: `Duplicate file with name "${file.filename}"`,
        recommendation: "Remove duplicate files or rename distinct illustrations uniquely.",
        message: msg,
      });
      continue;
    }
    seenFilenames.add(file.filename);

    const norm = file.filename.toLowerCase();
    const base = norm.replace(/\.[^/.]+$/, "");

    // Find slot by exact filename, slotId, or legacy aliases
    let matchedSlot = slots.find(
      (s) =>
        s.filename.toLowerCase() === norm ||
        s.slotId.toLowerCase() === base ||
        s.legacyAliases.some((alias) => alias.toLowerCase() === norm),
    );

    if (!matchedSlot) {
      // Try structural parsing fallback
      const parsed = parseFilename(file.filename);
      if (parsed.kind === "front-cover") {
        matchedSlot = slots.find((s) => s.assetKind === "front-cover");
      } else if (parsed.kind === "back-cover") {
        matchedSlot = slots.find((s) => s.assetKind === "back-cover");
      } else if (parsed.kind === "spread" && parsed.spreadPages) {
        matchedSlot = slots.find(
          (s) =>
            s.assetKind === "spread" &&
            s.physicalPages[0] === parsed.spreadPages![0] &&
            s.physicalPages[1] === parsed.spreadPages![1],
        );
      } else if (parsed.kind === "page" && parsed.pageNumber !== undefined) {
        matchedSlot = slots.find(
          (s) => s.assetKind === "single-page" && s.physicalPages.includes(parsed.pageNumber!),
        );
      } else if (parsed.isLegacy && parsed.index !== undefined) {
        matchedSlot = slots[parsed.index];
      }
    }

    if (!matchedSlot) {
      warnings.push(`"${file.filename}" does not match any required asset slot in this book — ignored.`);
      continue;
    }

    if (bySlotId.has(matchedSlot.slotId)) {
      const existing = bySlotId.get(matchedSlot.slotId)!;
      const msg = `"${file.filename}" and "${existing.filename}" both resolve to slot "${matchedSlot.slotId}" — rename or remove one.`;
      errors.push(msg);
      issues.push({
        type: "DUPLICATE_SLOT_MAPPING",
        filename: file.filename,
        expected: `Single image for slot "${matchedSlot.slotId}"`,
        actual: `Both "${file.filename}" and "${existing.filename}" map to slot "${matchedSlot.slotId}"`,
        recommendation: "Ensure each slot has only one assigned image file.",
        message: msg,
      });
      continue;
    }

    bySlotId.set(matchedSlot.slotId, file);
  }

  return bySlotId;
}

export async function runPreflight(
  opts: PreflightOptions,
): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: PreflightIssue[] = [];
  const assetReports: PreflightAssetReport[] = [];

  const bookId = opts.bookId ?? DEFAULT_BOOK_ID;
  const profile = getPrintProfile(opts.profileId);

  // 1. Validate Book & Profile existence
  if (opts.bookId && !listBooks().some((b) => b.id === opts.bookId)) {
    const msg = `Unknown book id "${opts.bookId}".`;
    errors.push(msg);
    issues.push({
      type: "UNKNOWN_BOOK",
      expected: "Registered storybook id",
      actual: opts.bookId,
      recommendation: "Select an available story from the catalogue.",
      message: msg,
    });
  }
  if (opts.profileId && !listPrintProfiles().some((p) => p.id === opts.profileId)) {
    const msg = `Unknown print profile id "${opts.profileId}".`;
    errors.push(msg);
    issues.push({
      type: "UNKNOWN_PROFILE",
      expected: "Registered print profile id",
      actual: opts.profileId,
      recommendation: "Choose a valid print provider profile.",
      message: msg,
    });
  }

  // 2. Resolve Authoritative Layout Plan
  let plan;
  try {
    plan = resolveLayoutPlan({
      child: opts.child,
      bookId,
      profileId: profile.id,
      mode: opts.mode,
      customSpreads: opts.customSpreads,
    });
  } catch (err) {
    const msg = `Layout resolution failed: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(msg);
    issues.push({
      type: "LAYOUT_RESOLUTION_FAILED",
      expected: "Valid layout plan resolution",
      actual: err instanceof Error ? err.message : String(err),
      recommendation: "Ensure layout mode and spread selections are physically valid.",
      message: msg,
    });
    return { ok: false, errors, warnings, issues };
  }

  // 3. Fail closed if layout plan is not valid for this profile or page count does not match requirement
  if (!plan.isValidForProfile && plan.limitations && plan.limitations.length > 0) {
    for (const lim of plan.limitations) {
      if (!errors.includes(lim)) {
        errors.push(lim);
        issues.push({
          type: "PLAN_LIMITATION",
          expected: `Valid layout plan for profile "${profile.id}"`,
          actual: lim,
          recommendation: "Adjust story layout mode or choose a compatible print profile.",
          message: lim,
        });
      }
    }
  }

  if (profile.interiorPageCount && plan.interiorPageCount !== profile.interiorPageCount) {
    const msg = `Physical page count mismatch: book has ${plan.interiorPageCount} pages, but profile "${profile.id}" requires exactly ${profile.interiorPageCount} pages.`;
    errors.push(msg);
    issues.push({
      type: "PAGE_COUNT_MISMATCH",
      expected: `${profile.interiorPageCount} interior pages`,
      actual: `${plan.interiorPageCount} interior pages`,
      recommendation: `Match the required ${profile.interiorPageCount} interior pages for this profile.`,
      message: msg,
    });
  }

  if (profile.provider === "printify" && profile.interiorPageCount === 24) {
    if (bookId !== "dream-big" && !getEditionForProfile(bookId, profile)) {
      const msg = `Story "${bookId}" does not yet have a 24-page Printify edition.`;
      errors.push(msg);
      issues.push({
        type: "MISSING_EDITION",
        expected: "Registered 24-page Printify edition",
        actual: "None found",
        recommendation: "Select an edition supported by Printify.",
        message: msg,
      });
    }
  }

  // 4. Validate Two Layout Authorities (if edition exists)
  const edition = getEditionForProfile(bookId, profile);
  if (edition) {
    if (edition.interiorPageCount !== plan.interiorPageCount) {
      const msg = `Layout authority disagreement: PrintEdition requires ${edition.interiorPageCount} pages, but ResolvedLayoutPlan has ${plan.interiorPageCount} pages.`;
      errors.push(msg);
      issues.push({
        type: "EDITION_MISMATCH",
        expected: `${edition.interiorPageCount} pages`,
        actual: `${plan.interiorPageCount} pages`,
        recommendation: "Reconcile edition specification with layout engine.",
        message: msg,
      });
    }
  }

  // 5. Spread Imposition Invariants Check
  for (const asset of plan.interiorAssets) {
    if (asset.assetKind === "spread") {
      const illoNum =
        asset.sourceSceneIndex !== undefined
          ? asset.sourceSceneIndex + 1
          : plan.assets.findIndex((s) => s.slotId === asset.slotId) + 1;
      if (asset.physicalPages.length !== 2) {
        const msg = `Spread illustration "${asset.slotId}" maps to ${asset.physicalPages.length} leaves, expected exactly 2.`;
        errors.push(msg);
        issues.push({
          type: "INVALID_SPREAD_LEAF_COUNT",
          illustrationNumber: illoNum,
          filename: asset.filename,
          expected: "Exactly 2 physical leaves",
          actual: `${asset.physicalPages.length} physical leaves`,
          recommendation: "Configure spread across exactly 2 consecutive facing pages.",
          message: msg,
        });
      }
      const startPage = asset.physicalPages[0];
      const endPage = asset.physicalPages[1];

      if (!isValidFacingPair(startPage, endPage, plan.interiorPageCount)) {
        try {
          assertValidFacingPair(startPage, endPage, plan.interiorPageCount);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(errMsg);
          issues.push({
            type: "INVALID_SPREAD_IMPOSITION",
            illustrationNumber: illoNum,
            filename: asset.filename,
            expected: "Spread must begin on an even physical page and span a valid facing pair",
            actual: `Invalid facing pair ${startPage}–${endPage}`,
            recommendation: "Spreads must start on an even page (e.g. 2, 4, 6) and span 2 consecutive pages.",
            message: errMsg,
          });
        }
      }
    } else if (asset.assetKind === "single-page") {
      if (asset.physicalPages.length !== 1) {
        const illoNum =
          asset.sourceSceneIndex !== undefined
            ? asset.sourceSceneIndex + 1
            : plan.assets.findIndex((s) => s.slotId === asset.slotId) + 1;
        const msg = `Single illustration "${asset.slotId}" maps to ${asset.physicalPages.length} leaves, expected exactly 1.`;
        errors.push(msg);
        issues.push({
          type: "INVALID_SINGLE_LEAF_COUNT",
          illustrationNumber: illoNum,
          filename: asset.filename,
          expected: "Exactly 1 physical leaf",
          actual: `${asset.physicalPages.length} physical leaves`,
          recommendation: "Ensure single page maps to one page.",
          message: msg,
        });
      }
    }
  }

  // 6. Match Files to Resolved Slots — use pre-resolved mapping if provided
  const bySlotId = opts.resolvedSlotMapping
    ? opts.resolvedSlotMapping
    : matchFilesToSlots(opts.files, plan.assets, errors, warnings, issues);

  // 7. Check for Missing Required Assets
  const missingSlots = plan.assets.filter((slot) => !bySlotId.has(slot.slotId));
  if (missingSlots.length > 0) {
    const missingSummary =
      `${missingSlots.length} of ${plan.assets.length} required assets are missing: ` +
      missingSlots
        .map((s) =>
          s.legacyAliases.length > 0
            ? `${s.filename} (${s.legacyAliases.join(", ")})`
            : s.filename,
        )
        .join(", ");
    errors.push(missingSummary);

    for (const s of missingSlots) {
      const idx = plan.assets.findIndex((a) => a.slotId === s.slotId);
      issues.push({
        type: "MISSING_REQUIRED_ARTWORK",
        code: "MISSING_REQUIRED_ARTWORK",
        slotId: s.slotId,
        physicalPages: s.physicalPages,
        illustrationNumber: idx + 1,
        filename: s.expectedFilename ?? s.filename,
        expected: `File matching "${s.expectedFilename ?? s.filename}" or (${s.legacyAliases.join(", ")})`,
        actual: "File is missing",
        recommendation: `Upload an illustration for Illustration ${idx + 1} (${s.expectedFilename ?? s.filename}).`,
        message: `Missing required artwork for slot "${s.slotId}" (physical pages: ${s.physicalPages.join(", ")}).`,
      } as any);
    }
  }

  // 8. Validate Individual Source Assets
  for (const slot of plan.assets) {
    const file = bySlotId.get(slot.slotId);
    if (!file) continue;

    const illoNum =
      slot.sourceSceneIndex !== undefined
        ? slot.sourceSceneIndex + 1
        : plan.assets.findIndex((s) => s.slotId === slot.slotId) + 1;

    try {
      const meta = await sharp(file.buffer).metadata();
      if (!meta.width || !meta.height) {
        const msg = `Could not decode "${file.filename}" as a valid image.`;
        errors.push(msg);
        issues.push({
          type: "CORRUPT_IMAGE",
          illustrationNumber: illoNum,
          filename: file.filename,
          expected: "Valid decodable PNG or JPEG image",
          actual: "Unable to decode image metadata",
          recommendation: "Re-save or re-export the image as a valid PNG or JPEG.",
          message: msg,
        });
        continue;
      }

      const actualWidth = meta.width;
      const actualHeight = meta.height;
      const expectedWidth = slot.destinationDimensions.width;
      const expectedHeight = slot.destinationDimensions.height;

      // 1. Aspect ratio & Orientation check (evaluated first so orientation issues are prioritized)
      const actualAspect = actualWidth / actualHeight;
      const expectedAspect = parseAspect(slot.expectedSourceAspect);
      const aspectClassification = classifyAspectMatch(actualAspect, expectedAspect);

      let willCropOrExtend = false;
      let cropOrExtendNote: string | undefined = undefined;

      if (aspectClassification === "error") {
        const actualOrientation = orientationOf(actualAspect);
        const expectedOrientation = orientationOf(expectedAspect);
        const msg =
          `Illustration ${illoNum} (${file.filename}) is ${actualOrientation}, but needs a ` +
          `${expectedOrientation} layout (recommended ${slot.expectedSourceAspect}) — this can't be ` +
          `used here without cropping or padding out the artwork. Regenerate with a ` +
          `${expectedOrientation} aspect ratio.`;
        errors.push(msg);
        issues.push({
          type: "INCOMPATIBLE_ORIENTATION",
          illustrationNumber: illoNum,
          filename: file.filename,
          expected: `${expectedOrientation} layout (${slot.expectedSourceAspect})`,
          actual: `${actualOrientation} layout (${actualWidth}×${actualHeight}, aspect ${actualAspect.toFixed(2)})`,
          recommendation: `Regenerate or reframe illustration ${illoNum} with a ${expectedOrientation} aspect ratio.`,
          message: msg,
        });
      } else if (aspectClassification === "warn") {
        willCropOrExtend = true;
        cropOrExtendNote = `aspect ratio differs slightly (${actualAspect.toFixed(2)} vs expected ${slot.expectedSourceAspect}). Background extension or letterboxing will occur.`;
        warnings.push(`"${file.filename}": ${cropOrExtendNote}`);
      }

      // 2. Effective PPI calculation and resolution policy
      // Placement dimensions across full bleed leaf before enlargement
      const nominalWidthIn =
        slot.assetKind === "spread"
          ? (profile.finalPageIn?.width ? profile.finalPageIn.width * 2 : profile.nominalSizeIn.width * 2)
          : (profile.finalPageIn?.width ?? profile.nominalSizeIn.width);
      const nominalHeightIn = profile.finalPageIn?.height ?? profile.nominalSizeIn.height;
      const nativeEffectivePpiX = actualWidth / nominalWidthIn;
      const nativeEffectivePpiY = actualHeight / nominalHeightIn;
      const nativeEffectivePpi = Math.min(nativeEffectivePpiX, nativeEffectivePpiY);
      const effectivePPI = nativeEffectivePpi;
      const nativeSourcePpi = nativeEffectivePpi;
      const finalRasterWidth = slot.destinationDimensions.width;
      const finalRasterHeight = slot.destinationDimensions.height;
      const finalOutputGridPpi = 300;

      const isDraft = opts.draft === true;
      const isProduction = !isDraft && !opts.allowLowResolutionForTesting;

      // Authoritative production quality policy:
      // - native PPI below 150: hard error; production export blocked
      // - native PPI from 150 to below 300: warning requiring explicit user acknowledgement
      // - native PPI 300 or above: pass
      // - draft mode may accept lower PPI but must show a visible DRAFT watermark
      if (nativeEffectivePpi < 150) {
        if (isProduction) {
          const ppiMsg =
            `Source resolution for "${file.filename}" is below print-safe threshold: ${actualWidth}×${actualHeight} px ` +
            `yields only ${Math.round(nativeEffectivePpi)} native effective PPI on ${nominalWidthIn}×${nominalHeightIn}" canvas ` +
            `(${nativeEffectivePpiX.toFixed(1)} PPI horizontal, ${nativeEffectivePpiY.toFixed(1)} PPI vertical). ` +
            `Production export is blocked. Minimum print quality requires 150 PPI (150 native PPI, ${Math.round(nominalWidthIn * 150)}×${Math.round(nominalHeightIn * 150)} px).`;
          errors.push(ppiMsg);
          issues.push({
            type: "LOW_PPI",
            code: "LOW_PPI",
            illustrationNumber: illoNum,
            filename: file.filename,
            expected: `Minimum 150 native effective PPI (${Math.round(nominalWidthIn * 150)}×${Math.round(nominalHeightIn * 150)} px)`,
            actual: `${actualWidth}×${actualHeight} px (${Math.round(nativeEffectivePpi)} native PPI)`,
            recommendation: `Provide a higher-resolution image with at least 150 native PPI (${Math.round(nominalWidthIn * 150)}×${Math.round(nominalHeightIn * 150)} px) or export in draft mode.`,
            message: ppiMsg,
          });
        } else {
          warnings.push(
            `"${file.filename}" native effective PPI is ${Math.round(nativeEffectivePpi)} (below 150 PPI). Allowed in draft mode with visible DRAFT watermark.`,
          );
        }
      } else if (nativeEffectivePpi < 300) {
        const needsAcknowledgement = isProduction && !opts.acknowledgeQualityWarnings;
        if (needsAcknowledgement) {
          const ackMsg =
            `"${file.filename}" native effective PPI is ${Math.round(nativeEffectivePpi)} (between 150 and 299 PPI). ` +
            `Requires explicit user acknowledgement for production export. ` +
            `Output grid is ${finalOutputGridPpi} PPI (${finalRasterWidth}×${finalRasterHeight} px); ` +
            `enlargement does not create genuine native 300-PPI detail.`;
          errors.push(ackMsg);
          issues.push({
            type: "QUALITY_WARNING_UNACKNOWLEDGED",
            code: "QUALITY_WARNING_UNACKNOWLEDGED",
            illustrationNumber: illoNum,
            filename: file.filename,
            expected: `Minimum 300 native effective PPI or explicit quality acknowledgement`,
            actual: `${actualWidth}×${actualHeight} px (${Math.round(nativeEffectivePpi)} native PPI)`,
            recommendation: `Provide higher-resolution images (300+ PPI) or explicitly acknowledge the quality warning.`,
            message: ackMsg,
          });
        } else {
          warnings.push(
            `"${file.filename}" native effective PPI is ${Math.round(nativeEffectivePpi)} (between 150 and 299 PPI). Requires explicit user acknowledgement for production export. Output grid is ${finalOutputGridPpi} PPI (${finalRasterWidth}×${finalRasterHeight} px); enlargement does not create genuine native 300-PPI detail.`,
          );
        }
      }

      // Story text safe area and gutter bounds check
      const isSpread = slot.assetKind === "spread";
      const textGeom = computePageTextGeometry(profile, isSpread);
      if (isSpread) {
        const textRightEdgePct = textGeom.leftPct + textGeom.maxWidthPct;
        if (textRightEdgePct > 47) {
          const msg = `Illustration "${file.filename}" story text extends into spine gutter area (${textRightEdgePct.toFixed(1)}% > 47%).`;
          errors.push(msg);
          issues.push({
            type: "TEXT_SAFE_AREA_VIOLATION",
            illustrationNumber: illoNum,
            filename: file.filename,
            expected: "Story text within safe area <= 47%",
            actual: `Story text extends to ${textRightEdgePct.toFixed(1)}%`,
            recommendation: "Adjust spread text placement away from center gutter.",
            message: msg,
          });
        }
      }

      assetReports.push({
        slotId: slot.slotId,
        filename: file.filename,
        actualDimensions: { width: actualWidth, height: actualHeight },
        expectedDimensions: { width: expectedWidth, height: expectedHeight },
        effectivePPI: Math.round(effectivePPI),
        nativeSourcePpi: Math.round(nativeSourcePpi),
        outputGridPpi: finalOutputGridPpi,
        destinationPages: slot.physicalPages,
        willCropOrExtend,
        cropOrExtendNote,
        nativeSourceWidth: actualWidth,
        nativeSourceHeight: actualHeight,
        nativeEffectivePpiX: Number(nativeEffectivePpiX.toFixed(1)),
        nativeEffectivePpiY: Number(nativeEffectivePpiY.toFixed(1)),
        finalRasterWidth,
        finalRasterHeight,
        finalOutputGridPpi,
      });
    } catch {
      const msg = `Could not read "${file.filename}" as an image (file is corrupt or unreadable).`;
      errors.push(msg);
      issues.push({
        type: "UNREADABLE_IMAGE",
        illustrationNumber: illoNum,
        filename: file.filename,
        expected: "Valid readable image file",
        actual: "File could not be read or decoded",
        recommendation: "Ensure file is not corrupted and is in PNG or JPEG format.",
        message: msg,
      });
    }
  }

  // 9. Check if dimensions differ between illustrations (create warning, not error)
  const uniqueDimensions = new Set(
    assetReports.map((r) => `${r.actualDimensions.width}×${r.actualDimensions.height}`),
  );
  if (uniqueDimensions.size > 1) {
    warnings.push(
      `Source dimensions differ between illustrations (${Array.from(uniqueDimensions).join(", ")}). Proportional normalization will ensure uniform final page size.`,
    );
  }

  // 10. Profile-specific notes
  if (profile.provider === "printify" && profile.spineWidthPx) {
    warnings.push(
      `Spine width is a placeholder (${profile.spineWidthPx}px) — confirm against Printify's live spec sheet before ordering.`,
    );
  }

  // 10. Collect quality warning slots for the acknowledgement contract
  const qualityWarnings: QualityWarningSlot[] = [];
  for (const report of assetReports) {
    if (report.nativeSourcePpi >= 150 && report.nativeSourcePpi < 300) {
      const slot = plan.assets.find((s) => s.slotId === report.slotId);
      qualityWarnings.push({
        slotId: report.slotId,
        filename: report.filename,
        nativeWidth: report.nativeSourceWidth,
        nativeHeight: report.nativeSourceHeight,
        nativeEffectivePpi: report.nativeSourcePpi,
        physicalPages: slot?.physicalPages ?? report.destinationPages,
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    issues,
    assetReports,
    qualityWarnings: qualityWarnings.length > 0 ? qualityWarnings : undefined,
  };
}

