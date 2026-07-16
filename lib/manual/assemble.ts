/**
 * Manual workflow — assemble a PDF from user-provided images.
 *
 * Pairs each provided image with its template page (by 0-based index) and runs
 * the same PDF builder as the automatic path. Pages with no provided image fall
 * back to a soft gradient so the book still assembles.
 */

import { buildBook } from "../pdf/buildBook";
import { buildPages, DEFAULT_BOOK_ID } from "../story/registry";
import type { ChildProfile, GeneratedPage } from "../story/types";

export interface ProvidedImage {
  buffer: Buffer;
  mimeType: string;
}

/**
 * @param images map of 0-based page index -> image
 */
export async function assembleFromImages(
  child: ChildProfile,
  images: Map<number, ProvidedImage>,
  bookId: string = DEFAULT_BOOK_ID,
): Promise<{ pdf: Buffer; usedPages: number; totalPages: number }> {
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
    };
  });

  const pdf = await buildBook(generated, child);
  return {
    pdf,
    usedPages: images.size,
    totalPages: pages.length,
  };
}

/**
 * Extract the leading 1-based page number from a filename like "01.png" or
 * "page-3.jpg" and return the matching 0-based index, or null if none.
 */
export function indexFromFilename(filename: string): number | null {
  const match = filename.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1;
}
