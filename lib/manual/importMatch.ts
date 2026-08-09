/**
 * Smart bulk-import matching (item 2). Pure and dependency-light (only
 * `indexFromFilename`, which has zero server-only deps) so it runs instantly
 * client-side the moment files are selected — no round trip needed just to
 * see what's missing.
 */

import { indexFromFilename } from "./filenameMatch";

export interface ImportMatchReport {
  required: number;
  matched: number;
  /** Required filenames with no provided file. */
  missing: string[];
  /** Extra files that resolve to a page another file already claimed. */
  duplicates: { filename: string; index: number; claimedBy: string }[];
  /** Provided filenames that don't parse to any page in this book. */
  unmatched: string[];
  /** The file to use for each page index, after resolving matches/duplicates. */
  byIndex: Map<number, string>;
}

/**
 * @param providedFilenames every filename the user selected, in order, not deduped.
 * @param requiredFilenames the book's expected filenames, index i -> page i (e.g. buildManifest(...).map(m => m.filename)).
 */
export function matchImportedFiles(
  providedFilenames: string[],
  requiredFilenames: string[],
): ImportMatchReport {
  const byIndex = new Map<number, string>();
  const duplicates: ImportMatchReport["duplicates"] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const filename of providedFilenames) {
    const index = indexFromFilename(filename);

    if (seen.has(filename)) {
      duplicates.push({ filename, index: index ?? -1, claimedBy: filename });
      continue;
    }
    seen.add(filename);

    if (index === null || index < 0 || index >= requiredFilenames.length) {
      unmatched.push(filename);
      continue;
    }
    const existing = byIndex.get(index);
    if (existing) {
      duplicates.push({ filename, index, claimedBy: existing });
      continue;
    }
    byIndex.set(index, filename);
  }

  const missing = requiredFilenames.filter((_, i) => !byIndex.has(i));

  return {
    required: requiredFilenames.length,
    matched: byIndex.size,
    missing,
    duplicates,
    unmatched,
    byIndex,
  };
}
