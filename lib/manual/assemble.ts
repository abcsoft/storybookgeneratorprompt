/**
 * Manual workflow — assemble a PDF from user-provided images.
 *
 * Fail-closed in production: A production PDF is NEVER emitted when any required
 * illustration slot is missing. Gradient placeholders exist ONLY in explicit draft mode.
 */

import { buildBook, buildInteriorOnlyBook } from "../pdf/buildBook";
import { buildLuluInteriorBook } from "../pdf/luluExport";
import { getPrintProfile } from "../print/registry";
import { DEFAULT_BOOK_ID } from "../story/registry";
import { resolveLayoutPlan, type LayoutMode, type CustomSpreadSelection, type ResolvedAssetSlot } from "../story/layoutPlan";
import type { ChildProfile, GeneratedPage } from "../story/types";
import type { ArtworkTransform } from "../print/artworkTransform";
import {
  DRAFT_VIDEO_QR_PLACEHOLDER,
  renderVideoQrPng,
  renderVideoQrSvg,
  validateVideoQrTargetForProduction,
  videoQrRedirectUrl,
  type VideoQrTarget,
} from "../story/qr";

export { indexFromFilename } from "./filenameMatch";

export interface ProvidedImage {
  buffer: Buffer;
  mimeType: string;
  transform?: ArtworkTransform;
}

export interface AssembleFromImagesOptions {
  mode?: LayoutMode;
  layoutMode?: LayoutMode;
  customSpreads?: CustomSpreadSelection[];
  draft?: boolean;
  confirmLegacyOffsetRecovery?: boolean;
  /** Pre-resolved slot-to-image mapping from authoritative import resolution. */
  resolvedSlotMapping?: Map<string, ProvidedImage>;
  /** The configured HTTPS video-redirect target for the video-qr interior
   *  page. Required (and must pass validateVideoQrTargetForProduction) for
   *  any non-draft export; draft export uses DRAFT_VIDEO_QR_PLACEHOLDER when
   *  omitted so the page renders a clearly-labelled placeholder instead. */
  videoTarget?: VideoQrTarget;
}

export class MissingArtworkError extends Error {
  code = "MISSING_REQUIRED_ARTWORK";
  missingSlots: { slotId: string; physicalPages: number[]; role?: string }[];

  constructor(missingSlots: { slotId: string; physicalPages: number[]; role?: string }[]) {
    super(`Cannot export production PDF: ${missingSlots.length} required artwork slots are missing.`);
    this.name = "MissingArtworkError";
    this.missingSlots = missingSlots;
  }
}

/** Thrown when a production (non-draft) export would ship the video-qr page
 *  without a real, validated video target — a placeholder/missing QR must
 *  never reach a print-ready PDF. */
export class InvalidVideoQrError extends Error {
  code = "INVALID_VIDEO_QR";
  reason: string;

  constructor(reason: string) {
    super(`Cannot export production PDF: video-qr page is not production-ready — ${reason}`);
    this.name = "InvalidVideoQrError";
    this.reason = reason;
  }
}

/**
 * Find image for an asset slot using authoritative slotId, canonical filename, aliases, or index.
 */
function findImageForSlot(
  slot: ResolvedAssetSlot,
  _assetIndex: number,
  images: Map<number | string, ProvidedImage>,
): ProvidedImage | undefined {
  if (images.has(slot.slotId)) return images.get(slot.slotId);
  if (images.has(slot.expectedFilename)) return images.get(slot.expectedFilename);
  if (images.has(slot.filename)) return images.get(slot.filename);
  // REMOVED: generic numeric assetIndex fallback — images must resolve by
  // authoritative identity (slotId, canonical filename, or validated aliases),
  // never by raw positional index.

  for (const alias of slot.legacyAliases) {
    if (images.has(alias)) return images.get(alias);
    const aliasBase = alias.replace(/\.[^/.]+$/, "");
    if (images.has(aliasBase)) return images.get(aliasBase);
  }

  if (slot.sourceSceneIndex !== undefined && images.has(slot.sourceSceneIndex)) {
    return images.get(slot.sourceSceneIndex);
  }

  return undefined;
}

/**
 * Assemble print-ready or draft PDF from provided images.
 * Fails closed if not in draft mode and any required asset slot is missing.
 */
export async function assembleFromImages(
  child: ChildProfile,
  images: Map<number | string, ProvidedImage>,
  bookId: string = DEFAULT_BOOK_ID,
  profileId?: string,
  opts?: AssembleFromImagesOptions,
): Promise<{ pdf: Buffer; interiorPdf?: Buffer; usedPages: number; totalPages: number }> {
  const profile = getPrintProfile(profileId);
  const effectiveMode = opts?.layoutMode ?? opts?.mode ?? "standard-single";
  const isDraft = opts?.draft === true;

  const plan = resolveLayoutPlan({
    child,
    bookId,
    profileId: profile.id,
    mode: effectiveMode,
    customSpreads: opts?.customSpreads,
  });

  // Check for missing required slots
  const resolvedMap = opts?.resolvedSlotMapping;
  const missingSlots: { slotId: string; physicalPages: number[]; role?: string }[] = [];
  for (let i = 0; i < plan.assets.length; i++) {
    const slot = plan.assets[i];
    const img = resolvedMap
      ? resolvedMap.get(slot.slotId)
      : findImageForSlot(slot, i, images);
    if (slot.required && !img) {
      missingSlots.push({
        slotId: slot.slotId,
        physicalPages: slot.physicalPages,
        role: slot.role ?? slot.roleSlug,
      });
    }
  }

  if (!isDraft && missingSlots.length > 0) {
    throw new MissingArtworkError(missingSlots);
  }

  // Video-QR target: resolve once up front. Draft export always has a valid
  // (placeholder) target to render; production requires a real one and fails
  // closed here — before any raster/PDF work — rather than shipping a page
  // with a blank or placeholder QR.
  const hasVideoQrSlot = plan.assets.some((s) => s.pageKind === "video-qr");
  let effectiveVideoTarget: VideoQrTarget | null = null;
  if (hasVideoQrSlot) {
    if (isDraft) {
      effectiveVideoTarget = opts?.videoTarget ?? DRAFT_VIDEO_QR_PLACEHOLDER;
    } else {
      const check = validateVideoQrTargetForProduction(opts?.videoTarget);
      if (!check.valid) {
        throw new InvalidVideoQrError(check.reason ?? "no valid video target configured");
      }
      effectiveVideoTarget = opts!.videoTarget!;
    }
  }
  const videoQrIsPlaceholder =
    effectiveVideoTarget != null &&
    (effectiveVideoTarget === DRAFT_VIDEO_QR_PLACEHOLDER || effectiveVideoTarget.token === DRAFT_VIDEO_QR_PLACEHOLDER.token);
  const videoQrUrl = effectiveVideoTarget ? videoQrRedirectUrl(effectiveVideoTarget) : null;
  const videoQrPngDataUri =
    effectiveVideoTarget && !videoQrIsPlaceholder
      ? `data:image/png;base64,${(await renderVideoQrPng(videoQrUrl!, 900)).toString("base64")}`
      : null;
  const videoQrSvgMarkup =
    effectiveVideoTarget && !videoQrIsPlaceholder ? await renderVideoQrSvg(videoQrUrl!) : null;

  const generated: GeneratedPage[] = plan.assets.map((slot, assetIndex) => {
    const img = resolvedMap
      ? resolvedMap.get(slot.slotId)
      : findImageForSlot(slot, assetIndex, images);
    const isSpread = slot.assetKind === "spread";
    return {
      index: assetIndex,
      kind: slot.pageKind,
      role: slot.role ?? slot.sourceSceneRole,
      text: slot.storyText,
      image: img?.buffer ?? null,
      imageMimeType: img?.mimeType ?? "image/png",
      failed: !img,
      spread: isSpread,
      transform: img?.transform,
      slotId: slot.slotId,
      textPanelPosition: slot.textPanelPosition,
      videoQr:
        slot.pageKind === "video-qr"
          ? {
              dataUri: videoQrPngDataUri,
              svgMarkup: videoQrSvgMarkup,
              url: videoQrIsPlaceholder ? null : videoQrUrl,
              isPlaceholder: videoQrIsPlaceholder,
            }
          : undefined,
    };
  });

  let pdf: Buffer;
  let interiorPdf: Buffer | undefined;
  if (profile.exportMode === "lulu-interior-pdf") {
    pdf = await buildLuluInteriorBook(generated, child, profile);
    interiorPdf = pdf; // this path's `pdf` already IS the interior-only file
    const { exportLuluPackage } = await import("../print/luluPackageExport");
    try {
      await exportLuluPackage({
        child,
        bookId,
        profileId: profile.id,
        pages: generated,
      });
    } catch (err) {
      console.warn("[storybook] Lulu package export failed:", err);
    }
  } else {
    // `pdf` is the combined cover+interior+backcover REVIEW PROOF — labelled
    // and returned for on-screen preview/download, but never the production
    // interior file. `interiorPdf` is the genuine production interior-only
    // output (exactly N interior pages, greeting first / video-qr last, real
    // vector story text) — computed alongside it so every profile using this
    // pipeline (not just the Lulu-branded ones) gets a real split output.
    pdf = await buildBook(generated, child, profile, { draft: isDraft });
    try {
      interiorPdf = await buildInteriorOnlyBook(generated, child, { draft: isDraft });
    } catch (err) {
      // Don't fail the whole (already-succeeded) combined-proof export over
      // the interior-only invariant checks — surface it as a missing field
      // instead, same fail-closed spirit as the Lulu package export above.
      console.warn("[storybook] Interior-only PDF build failed:", err);
    }
  }

  return {
    pdf,
    interiorPdf,
    usedPages: images.size,
    totalPages: plan.assets.length,
  };
}
