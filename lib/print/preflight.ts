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
import {
  calculateSha256,
  computeAuthoritativePhysicalDimensionsIn,
  type ImageProvenanceMetadata,
} from "../enhance/provenance";
import { verifyEnhancementReceipt, verifyVisualApprovalRecord } from "../enhance/receipt";
import type { SignedEnhancementReceipt, SignedEnhancementApprovalRecord } from "../enhance/types";

export interface PreflightFile {
  filename: string;
  buffer: Buffer;
  provenance?: ImageProvenanceMetadata;
  receipt?: SignedEnhancementReceipt;
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
  provenance?: ImageProvenanceMetadata;
}
export interface QualityAcknowledgementRecord {
  slotId: string;
  sourceSha256?: string;
  imageSha256?: string;
  bookId?: string;
  profileId: string;
  layout?: string;
  layoutMode?: string;
  computedNativeEffectivePpi?: number;
  nativeEffectivePpi?: number;
  destinationDimensions?: { width: number; height: number };
  timestamp?: string;
  acknowledgedAt?: string;
}

export interface PreflightOptions {
  child?: ChildProfile;
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
  /** Explicit user acknowledgement of quality warnings (150-299 PPI) - disabled in production. */
  acknowledgeQualityWarnings?: boolean;
  /** Structured, bound quality acknowledgement records keyed by slotId or filename */
  qualityAcknowledgements?: Record<string, QualityAcknowledgementRecord>;
  /** Server-signed visual approval records keyed by slotId or filename */
  visualApprovals?: Record<string, SignedEnhancementApprovalRecord>;
  /** Provenance metadata keyed by slotId or filename */
  provenances?: Record<string, ImageProvenanceMetadata>;
  /** Server-signed enhancement receipts keyed by slotId or filename */
  receipts?: Record<string, SignedEnhancementReceipt>;
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
        (s.filename && s.filename.toLowerCase() === norm) ||
        (s.expectedFilename && s.expectedFilename.toLowerCase() === norm) ||
        s.slotId?.toLowerCase() === base ||
        s.legacyAliases?.some((alias) => alias.toLowerCase() === norm),
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
      child: opts.child ?? { name: "Child", age: 4, gender: "neutral" },
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
      // "Illustration N" (a 1-based, user-facing position) must be the
      // asset's true position in the resolved book, i.e. illustrationIndex
      // (always finalized to the real 0-based array position by both
      // resolveLayoutPlan()'s legacy branches and
      // resolveStoryEditionPlan()). asset.sourceSceneIndex is NOT
      // positional for a StoryEdition-resolved plan — storyEdition.ts
      // reserves 0/1 for the front/back cover and numbers interior assets
      // from 2, so using it here would show users the wrong "Illustration
      // N" for every interior asset.
      const illoNum = asset.illustrationIndex + 1;
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

      // plan.interiorPageCount excludes cover/backcover; assertValidFacingPair's
      // maxPages is the full physical book page count.
      const totalPhysicalPages = plan.interiorPageCount + 2;
      if (!isValidFacingPair(startPage, endPage, totalPhysicalPages)) {
        try {
          assertValidFacingPair(startPage, endPage, totalPhysicalPages);
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
        const illoNum = asset.illustrationIndex + 1;
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

    const illoNum = slot.illustrationIndex + 1;

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

      const provenance =
        file.provenance ??
        opts.provenances?.[slot.slotId] ??
        opts.provenances?.[file.filename];

      const actualWidth = meta.width;
      const actualHeight = meta.height;
      const expectedWidth = slot.destinationDimensions.width;
      const expectedHeight = slot.destinationDimensions.height;

      // 1. Authoritative aspect ratio calculated exclusively from destinationDimensions
      const actualAspect = actualWidth / actualHeight;
      const expectedAspect = slot.destinationDimensions
        ? slot.destinationDimensions.width / slot.destinationDimensions.height
        : parseAspect(slot.targetCanvasAspect ?? slot.expectedSourceAspect);
      const expectedAspectLabel =
        slot.targetCanvasAspect ??
        (slot.destinationDimensions
          ? `${slot.destinationDimensions.width}:${slot.destinationDimensions.height}`
          : slot.expectedSourceAspect);
      const aspectClassification = classifyAspectMatch(actualAspect, expectedAspect);

      let willCropOrExtend = false;
      let cropOrExtendNote: string | undefined = undefined;

      if (aspectClassification === "error") {
        const actualOrientation = orientationOf(actualAspect);
        const expectedOrientation = orientationOf(expectedAspect);
        const msg =
          `Illustration ${illoNum} (${file.filename}) is ${actualOrientation}, but needs a ` +
          `${expectedOrientation} layout (target aspect ${expectedAspectLabel}) — this can't be ` +
          `used here without cropping or padding out the artwork. Regenerate with a ` +
          `${expectedOrientation} aspect ratio.`;
        errors.push(msg);
        issues.push({
          type: "INCOMPATIBLE_ORIENTATION",
          illustrationNumber: illoNum,
          filename: file.filename,
          expected: `${expectedOrientation} layout (${expectedAspectLabel})`,
          actual: `${actualOrientation} layout (${actualWidth}×${actualHeight}, aspect ${actualAspect.toFixed(2)})`,
          recommendation: `Regenerate or reframe illustration ${illoNum} with a ${expectedOrientation} aspect ratio.`,
          message: msg,
        });
      } else if (aspectClassification === "warn") {
        willCropOrExtend = true;
        cropOrExtendNote = `aspect ratio differs slightly (${actualAspect.toFixed(2)} vs expected ${expectedAspectLabel}). Background extension or letterboxing will occur.`;
        warnings.push(`"${file.filename}": ${cropOrExtendNote}`);
      }

      // 2. Effective PPI calculation and resolution policy
      // Authoritative physical placement dimensions derived strictly from destination pixels and profile DPI
      const physicalDimensions = computeAuthoritativePhysicalDimensionsIn(
        slot.destinationDimensions,
        profile.dpi,
      );
      const nominalWidthIn = physicalDimensions.width;
      const nominalHeightIn = physicalDimensions.height;
      const isDraft = opts.draft === true;
      const isProduction = !isDraft && !opts.allowLowResolutionForTesting;

      // Check provenance and receipt for enhancement method and provider class
      const receipt =
        file.receipt ??
        opts.receipts?.[slot.slotId] ??
        opts.receipts?.[file.filename] ??
        provenance?.receipt;

      let verifiedReceiptValid = false;
      let receiptVerificationError = "";
      if (receipt) {
        const verifyRes = verifyEnhancementReceipt(receipt, {
          expectedSlotId: slot.slotId,
          expectedBookId: opts.bookId,
          expectedProfileId: profile.id,
          expectedLayoutMode: opts.mode || "standard-single",
          expectedEnhancedBuffer: file.buffer,
          expectedDimensions: slot.destinationDimensions,
          expectedDestinationDimensions: slot.destinationDimensions,
          requireProductionTrusted: isProduction,
        });
        verifiedReceiptValid = verifyRes.valid;
        if (!verifyRes.valid) {
          receiptVerificationError = verifyRes.error || "Invalid receipt";
        }
      }

      // True AI enhancement requires verified server receipt with providerClass === "real-ai" or "local-ai"
      // In test mode, allowLowResolutionForTesting allows mock provider test doubles
      const isGenuineAiEnhanced =
        verifiedReceiptValid &&
        (receipt?.payload.providerClass === "real-ai" ||
          receipt?.payload.providerClass === "local-ai");

      const isMockEnhanced =
        provenance?.enhancementMethod === "mocked-ai-super-res" ||
        receipt?.payload?.providerClass === "test-mock";

      const isResampledOnly =
        provenance?.enhancementMethod === "resampled" ||
        receipt?.payload?.providerClass === "resampling";

      // ─────────────────────────────────────────────────────────────
      // Visual Approval Verification
      // Client-controlled enhancementStatus === "approved" is strictly NOT trusted.
      // Must have a valid server-signed visual approval record.
      // ─────────────────────────────────────────────────────────────
      const currentSha = calculateSha256(file.buffer);
      const approvalRecord =
        file.provenance?.approvalRecord ??
        provenance?.approvalRecord ??
        opts.visualApprovals?.[slot.slotId] ??
        opts.visualApprovals?.[file.filename];

      let isVisualApprovalValid = false;
      let visualApprovalError = "";

      if (approvalRecord) {
        const verifyApp = verifyVisualApprovalRecord(approvalRecord, {
          expectedBookId: opts.bookId,
          expectedSlotId: slot.slotId,
          expectedProfileId: profile.id,
          expectedLayoutMode: opts.mode || "standard-single",
          expectedEnhancedSha256: currentSha,
          expectedDestinationDimensions: slot.destinationDimensions,
        });
        isVisualApprovalValid = verifyApp.valid;
        if (!verifyApp.valid) {
          visualApprovalError = verifyApp.error || "Invalid visual approval record";
        }
      }

      // If in production and client claims enhancementStatus === "approved" without a valid signed approval record:
      if (isProduction && provenance?.enhancementStatus === "approved" && !isVisualApprovalValid) {
        const forgedApprovalMsg = `Artwork for slot "${slot.slotId}" (${file.filename}) presents unverified client approval without a valid server-signed visual approval record: ${visualApprovalError || "No signed approval record provided"}. Production export blocked.`;
        errors.push(forgedApprovalMsg);
        issues.push({
          type: "FORGED_OR_UNVERIFIED_APPROVAL",
          code: "FORGED_OR_UNVERIFIED_APPROVAL",
          illustrationNumber: illoNum,
          filename: file.filename,
          expected: "Valid server-signed visual approval record",
          actual: visualApprovalError || "Missing or forged approval record",
          recommendation: "Review before/after preview and approve via the visual review modal.",
          message: forgedApprovalMsg,
        });
      }

      const isApproved = isProduction
        ? isVisualApprovalValid
        : isVisualApprovalValid || provenance?.enhancementStatus === "approved";

      // Native effective PPI: derive from original pixel dimensions if recorded in provenance
      const originalWidth = provenance?.originalPixelDimensions?.width ?? actualWidth;
      const originalHeight = provenance?.originalPixelDimensions?.height ?? actualHeight;
      const nativeEffectivePpiX = originalWidth / nominalWidthIn;
      const nativeEffectivePpiY = originalHeight / nominalHeightIn;
      const nativeEffectivePpi =
        provenance?.nativeEffectivePpi ?? Math.min(nativeEffectivePpiX, nativeEffectivePpiY);

      // Detail PPI: Only verified real/local AI super-resolution restores 300 PPI detail
      const effectivePPI = isGenuineAiEnhanced && isApproved ? 300 : nativeEffectivePpi;
      const nativeSourcePpi = nativeEffectivePpi;
      const finalRasterWidth = slot.destinationDimensions.width;
      const finalRasterHeight = slot.destinationDimensions.height;
      const finalOutputGridPpi = 300;

      // Fail-closed check: if enhanced, dimensions must match destination canvas exactly
      if (isGenuineAiEnhanced || isMockEnhanced || isResampledOnly) {
        if (actualWidth !== finalRasterWidth || actualHeight !== finalRasterHeight) {
          const dimMsg = `Enhanced illustration "${file.filename}" dimensions ${actualWidth}×${actualHeight} do not match destination canvas ${finalRasterWidth}×${finalRasterHeight}.`;
          errors.push(dimMsg);
          issues.push({
            type: "INCORRECT_ENHANCED_DIMENSIONS",
            code: "INCORRECT_ENHANCED_DIMENSIONS",
            illustrationNumber: illoNum,
            filename: file.filename,
            expected: `${finalRasterWidth}×${finalRasterHeight} px`,
            actual: `${actualWidth}×${actualHeight} px`,
            recommendation: "Ensure resolution enhancement scales proportionally to target destination dimensions.",
            message: dimMsg,
          });
        }
      }

      // Authoritative production quality policy:
      // - native PPI below 150:
      //     * Invalid/forged receipt: hard error INVALID_ENHANCEMENT_RECEIPT.
      //     * Verified genuine AI super-resolution + approved: passes directly.
      //     * Verified genuine AI super-resolution + unapproved: blocks with ENHANCEMENT_APPROVAL_REQUIRED.
      //     * Mock AI enhancement: ALWAYS rejected in production export (even if approved!).
      //     * Plain resampled: hard error! Plain resampling cannot rewrite native 107 PPI as native 300 PPI.
      //     * Unenhanced: hard error; production export blocked. Acknowledgement cannot bypass.
      // - native PPI 150 to below 300:
      //     * If approved AI-super-resolution: passes directly.
      //     * Otherwise: warning requiring per-slot explicit user acknowledgement bound to file hash and PPI.
      // - native PPI 300 or above: pass
      // - draft mode accepts lower PPI with visible DRAFT watermark
      if (nativeEffectivePpi < 150) {
        if (isProduction) {
          if (
            (provenance?.enhancementMethod === "external-ai-super-res" ||
              provenance?.enhancementMethod === "ai-enhanced" ||
              provenance?.enhancementMethod === "local-realesrgan") &&
            !receipt
          ) {
            const forgedMsg = `Artwork for slot "${slot.slotId}" (${file.filename}) claims AI super-resolution but lacks a valid, cryptographically verifiable server receipt. Production export blocked.`;
            errors.push(forgedMsg);
            issues.push({
              type: "FORGED_OR_UNVERIFIED_ENHANCEMENT",
              code: "FORGED_OR_UNVERIFIED_ENHANCEMENT",
              illustrationNumber: illoNum,
              filename: file.filename,
              expected: "Valid, server-signed enhancement receipt",
              actual: "No receipt provided for claimed AI enhancement",
              recommendation: "Process artwork through authoritative server enhancement API.",
              message: forgedMsg,
            });
          } else if (receipt && !verifiedReceiptValid) {
            const forgedMsg = `Enhanced artwork for slot "${slot.slotId}" (${file.filename}) failed cryptographic receipt verification: ${receiptVerificationError}.`;
            errors.push(forgedMsg);
            issues.push({
              type: "INVALID_ENHANCEMENT_RECEIPT",
              code: "INVALID_ENHANCEMENT_RECEIPT",
              illustrationNumber: illoNum,
              filename: file.filename,
              expected: "Valid server-signed enhancement receipt matching uploaded bytes and slot",
              actual: receiptVerificationError,
              recommendation: "Re-run enhancement through the authoritative server API.",
              message: forgedMsg,
            });
          } else if (isGenuineAiEnhanced && isApproved) {
            // Approved genuine AI super-resolution passes
          } else if (isGenuineAiEnhanced && !isApproved) {
            const unapprovedMsg = `AI-enhanced illustration "${file.filename}" (native ${Math.round(nativeEffectivePpi)} PPI) requires explicit visual approval before production export.`;
            errors.push(unapprovedMsg);
            issues.push({
              type: "ENHANCEMENT_APPROVAL_REQUIRED",
              code: "ENHANCEMENT_APPROVAL_REQUIRED",
              illustrationNumber: illoNum,
              filename: file.filename,
              expected: "Explicit visual user approval of AI super-resolution result",
              actual: "Unapproved enhancement",
              recommendation: "Review before/after preview and explicitly approve the enhanced illustration.",
              message: unapprovedMsg,
            });
          } else if (isMockEnhanced) {
            const mockMsg = `Illustration "${file.filename}" has native ${Math.round(nativeEffectivePpi)} PPI. Mocked or test-double enhancement cannot satisfy production print quality gates. Production export requires genuine approved AI super-resolution or higher-resolution source artwork.`;
            errors.push(mockMsg);
            issues.push({
              type: "MOCKED_ENHANCEMENT_REJECTED",
              code: "MOCKED_ENHANCEMENT_REJECTED",
              illustrationNumber: illoNum,
              filename: file.filename,
              expected: `Genuine AI super-resolution or minimum 150 native effective PPI (${Math.round(nominalWidthIn * 150)}×${Math.round(nominalHeightIn * 150)} px)`,
              actual: `Mocked AI super-resolution (native ${Math.round(nativeEffectivePpi)} PPI)`,
              recommendation: "Use a configured genuine AI super-resolution provider or upload higher-resolution source images.",
              message: mockMsg,
            });
          } else if (isResampledOnly) {
            const resampledMsg = `Source "${file.filename}" has native ${Math.round(nativeEffectivePpi)} PPI. Plain pixel resampling cannot rewrite native low-resolution artwork as print quality. Production export requires genuine AI enhancement or higher-resolution source artwork.`;
            errors.push(resampledMsg);
            issues.push({
              type: "LOW_PPI",
              code: "LOW_PPI",
              illustrationNumber: illoNum,
              filename: file.filename,
              expected: `Minimum 150 native effective PPI (${Math.round(nominalWidthIn * 150)}×${Math.round(nominalHeightIn * 150)} px)`,
              actual: `${actualWidth}×${actualHeight} px (native ${Math.round(nativeEffectivePpi)} PPI, plain resampled)`,
              recommendation: "Use AI super-resolution or upload a high-resolution source file.",
              message: resampledMsg,
            });
          } else {
            const ppiMsg =
              `Source resolution for "${file.filename}" is below print-safe threshold: ${originalWidth}×${originalHeight} px ` +
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
              actual: `${originalWidth}×${originalHeight} px (${Math.round(nativeEffectivePpi)} native PPI)`,
              recommendation: `Provide a higher-resolution image with at least 150 native PPI (${Math.round(nominalWidthIn * 150)}×${Math.round(nominalHeightIn * 150)} px), auto-fix with AI enhancement, or export in draft mode.`,
              message: ppiMsg,
            });
          }
        } else {
          warnings.push(
            `"${file.filename}" native effective PPI is ${Math.round(nativeEffectivePpi)} (below 150 PPI). Allowed in draft mode with visible DRAFT watermark.`,
          );
        }
      } else if (nativeEffectivePpi < 300) {
        if (isGenuineAiEnhanced && isApproved) {
          // Approved genuine AI-enhancement passes directly with no warnings or blocking issues!
        } else {
          let isSlotQualityAcknowledged = false;
          let ackRejectReason = "";

          if (opts.qualityAcknowledgements) {
            const rec =
              opts.qualityAcknowledgements[slot.slotId] ||
              opts.qualityAcknowledgements[file.filename];

            if (rec) {
              const recSha = rec.sourceSha256 || rec.imageSha256;
              const recPpi = rec.computedNativeEffectivePpi ?? rec.nativeEffectivePpi;
              const recLayout = rec.layout || rec.layoutMode;
              const PPI_TOLERANCE = 1.0;

              if (rec.slotId !== slot.slotId) {
                ackRejectReason = `Slot mismatch: record was for "${rec.slotId}", slot is "${slot.slotId}".`;
              } else if (recSha !== currentSha) {
                ackRejectReason = `Artwork hash mismatch: record hash "${recSha}" does not match current "${currentSha}".`;
              } else if (rec.bookId && opts.bookId && rec.bookId !== opts.bookId) {
                ackRejectReason = `Book ID mismatch: record was for "${rec.bookId}", current is "${opts.bookId}".`;
              } else if (rec.profileId !== profile.id) {
                ackRejectReason = `Profile mismatch: record was for "${rec.profileId}", current is "${profile.id}".`;
              } else if (recLayout && recLayout !== (opts.mode || "standard-single")) {
                ackRejectReason = `Layout mismatch: record was for "${recLayout}", current is "${opts.mode || "standard-single"}".`;
              } else if (typeof recPpi !== "number" || Math.abs(recPpi - nativeEffectivePpi) > PPI_TOLERANCE) {
                ackRejectReason = `Recorded PPI (${recPpi}) does not match current computed native PPI (${nativeEffectivePpi.toFixed(1)}) within tolerance (±${PPI_TOLERANCE} PPI).`;
              } else if (
                rec.destinationDimensions &&
                (rec.destinationDimensions.width !== slot.destinationDimensions.width ||
                  rec.destinationDimensions.height !== slot.destinationDimensions.height)
              ) {
                ackRejectReason = `Destination dimensions mismatch: record has ${rec.destinationDimensions.width}×${rec.destinationDimensions.height}, destination is ${slot.destinationDimensions.width}×${slot.destinationDimensions.height}.`;
              } else {
                isSlotQualityAcknowledged = true;
              }
            }
          }

          // Production export strictly rejects global acknowledgeQualityWarnings boolean.
          // Quality acknowledgement must be per-slot and cryptographically bound.
          const needsAcknowledgement = isProduction && !isSlotQualityAcknowledged;
          if (needsAcknowledgement) {
            const detailMsg = ackRejectReason ? ` (${ackRejectReason})` : "";
            const ackMsg =
              `"${file.filename}" native effective PPI is ${Math.round(nativeEffectivePpi)} (between 150 and 299 PPI). ` +
              `Requires explicit user acknowledgement bound to slot, file hash, and PPI for production export.${detailMsg} ` +
              `Output grid is ${finalOutputGridPpi} PPI (${finalRasterWidth}×${finalRasterHeight} px); ` +
              `enlargement does not create genuine native 300-PPI detail.`;
            errors.push(ackMsg);
            issues.push({
              type: "QUALITY_WARNING_UNACKNOWLEDGED",
              code: "QUALITY_WARNING_UNACKNOWLEDGED",
              illustrationNumber: illoNum,
              filename: file.filename,
              expected: `Minimum 300 native effective PPI, verified genuine AI enhancement, or valid bound quality acknowledgement`,
              actual: `${actualWidth}×${actualHeight} px (${Math.round(nativeEffectivePpi)} native PPI)`,
              recommendation: `Enhance with Real-ESRGAN, provide higher-resolution images (300+ PPI), or explicitly acknowledge the quality warning for this slot.`,
              message: ackMsg,
            });
          } else {
            warnings.push(
              `"${file.filename}" native effective PPI is ${Math.round(nativeEffectivePpi)} (between 150 and 299 PPI). ${isProduction ? "Quality warning acknowledged for production export." : "Allowed in draft mode."} Output grid is ${finalOutputGridPpi} PPI (${finalRasterWidth}×${finalRasterHeight} px); enlargement does not create genuine native 300-PPI detail.`,
            );
          }
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
        nativeSourceWidth: originalWidth,
        nativeSourceHeight: originalHeight,
        nativeEffectivePpiX: Number(nativeEffectivePpiX.toFixed(1)),
        nativeEffectivePpiY: Number(nativeEffectivePpiY.toFixed(1)),
        finalRasterWidth,
        finalRasterHeight,
        finalOutputGridPpi,
        provenance,
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
    const isApprovedAi =
      report.effectivePPI >= 300 &&
      (report.provenance?.providerClass === "real-ai" ||
        report.provenance?.providerClass === "local-ai" ||
        report.provenance?.enhancementMethod === "ai-enhanced" ||
        report.provenance?.enhancementMethod === "local-realesrgan");

    if (!isApprovedAi && report.nativeSourcePpi >= 150 && report.nativeSourcePpi < 300) {
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

