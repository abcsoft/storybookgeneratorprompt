/**
 * Manual workflow — assemble a PDF from user-provided images.
 *
 * Pairs each provided image with its template page (by 0-based index) and runs
 * the same PDF builder as the automatic path. Pages with no provided image fall
 * back to a soft gradient so the book still assembles.
 */

import { buildBook } from "../pdf/buildBook";
import { buildLuluInteriorBook } from "../pdf/luluExport";
import { getPrintProfile } from "../print/registry";
import { buildPages, DEFAULT_BOOK_ID } from "../story/registry";
import type { ChildProfile, GeneratedPage } from "../story/types";

import type { ArtworkTransform } from "../print/artworkTransform";

export { indexFromFilename } from "./filenameMatch";

export interface ProvidedImage {
  buffer: Buffer;
  mimeType: string;
  transform?: ArtworkTransform;
}

/**
 * @param images map of 0-based page index -> image
 */
export async function assembleFromImages(
  child: ChildProfile,
  images: Map<number, ProvidedImage>,
  bookId: string = DEFAULT_BOOK_ID,
  profileId?: string,
): Promise<{ pdf: Buffer; usedPages: number; totalPages: number }> {
  const profile = getPrintProfile(profileId);
  const pages = buildPages(child, bookId);

  const generated: GeneratedPage[] = pages.map((p) => {
    const img = images.get(p.index);
    return {
      index: p.index,
      kind: p.kind,
      role: p.role,
      text: p.text,
      image: img?.buffer ?? null,
      imageMimeType: img?.mimeType ?? "image/png",
      failed: !img,
      spread: p.spread,
      verseInk: p.ink,
      transform: img?.transform,
    };
  });

  let pdf: Buffer;
  if (profile.exportMode === "lulu-interior-pdf") {
    pdf = await buildLuluInteriorBook(generated, child, profile);
    // Export complete Lulu package under storybook-out/
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
    pdf = await buildBook(generated, child);
  }

  return {
    pdf,
    usedPages: images.size,
    totalPages: pages.length,
  };
}
