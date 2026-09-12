/**
 * Manual workflow — assemble a PDF from user-provided images.
 *
 * Fail-closed in production: A production PDF is NEVER emitted when any required
 * illustration slot is missing. Gradient placeholders exist ONLY in explicit draft mode.
 */

import { buildBook } from "../pdf/buildBook";
import { buildLuluInteriorBook } from "../pdf/luluExport";
import { getPrintProfile } from "../print/registry";
import { DEFAULT_BOOK_ID } from "../story/registry";
import { resolveLayoutPlan, type LayoutMode, type CustomSpreadSelection, type ResolvedAssetSlot } from "../story/layoutPlan";
import type { ChildProfile, GeneratedPage } from "../story/types";
import type { ArtworkTransform } from "../print/artworkTransform";

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

/**
 * Find image for an asset slot using authoritative slotId, canonical filename, aliases, or index.
 */
function findImageForSlot(
  slot: ResolvedAssetSlot,
  assetIndex: number,
  images: Map<number | string, ProvidedImage>,
): ProvidedImage | undefined {
  if (images.has(slot.slotId)) return images.get(slot.slotId);
  if (images.has(slot.expectedFilename)) return images.get(slot.expectedFilename);
  if (images.has(slot.filename)) return images.get(slot.filename);
  if (images.has(assetIndex)) return images.get(assetIndex);

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
): Promise<{ pdf: Buffer; usedPages: number; totalPages: number }> {
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
  const missingSlots: { slotId: string; physicalPages: number[]; role?: string }[] = [];
  for (let i = 0; i < plan.assets.length; i++) {
    const slot = plan.assets[i];
    const img = findImageForSlot(slot, i, images);
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

  const generated: GeneratedPage[] = plan.assets.map((slot, assetIndex) => {
    const img = findImageForSlot(slot, assetIndex, images);
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
    };
  });

  let pdf: Buffer;
  if (profile.exportMode === "lulu-interior-pdf") {
    pdf = await buildLuluInteriorBook(generated, child, profile);
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
    pdf = await buildBook(generated, child, profile, { draft: isDraft });
  }

  return {
    pdf,
    usedPages: images.size,
    totalPages: plan.assets.length,
  };
}
