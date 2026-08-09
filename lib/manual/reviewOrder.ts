/**
 * Pre-build book review ordering (item 5) — turns the flat manifest into the
 * sequence of PHYSICAL pages/spreads a human flips through, cover = page 1.
 * Reuses `leavesFor` from lib/pdf/imposition.ts (the same rule the landscape
 * PDF and Printify export both already rely on) so this view of page numbers
 * can never silently drift from the real imposition.
 */

import { leavesFor } from "../pdf/imposition";

export interface ReviewManifestEntry {
  index: number;
  kind: string;
  role?: string;
  filename: string;
  spread?: boolean;
  aspect: string;
}

interface ReviewEntryBase {
  manifestIndex: number;
  filename: string;
  pageKind: string;
  role?: string;
  aspect: string;
}

export type ReviewEntry =
  | (ReviewEntryBase & { layout: "single"; page: number })
  | (ReviewEntryBase & { layout: "spread"; startPage: number; endPage: number });

import type { PrintEdition } from "../story/editions";

/** Order + physical page numbers for every manifest entry, cover = page 1. */
export function buildReviewSequence(
  manifest: ReviewManifestEntry[],
): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  let printPage = 1;

  for (const m of manifest) {
    const leaves = leavesFor({ spread: m.spread });
    const base: ReviewEntryBase = {
      manifestIndex: m.index,
      filename: m.filename,
      pageKind: m.kind,
      role: m.role,
      aspect: m.aspect,
    };

    if (m.spread) {
      entries.push({ ...base, layout: "spread", startPage: printPage, endPage: printPage + 1 });
    } else {
      entries.push({ ...base, layout: "single", page: printPage });
    }

    printPage += leaves;
  }

  return entries;
}

/** Order + physical page numbers for a PrintEdition. */
export function buildReviewSequenceForEdition(
  edition: PrintEdition,
): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  const handledIllos = new Set<number>();

  for (const page of edition.physicalPages) {
    if (handledIllos.has(page.illustrationIndex)) continue;
    handledIllos.add(page.illustrationIndex);

    const illo = edition.illustrations.find((i) => i.index === page.illustrationIndex);
    if (!illo) continue;

    const base: ReviewEntryBase = {
      manifestIndex: illo.index,
      filename: illo.filename,
      pageKind: illo.kind,
      role: illo.role,
      aspect: illo.recommendedAspect,
    };

    if (page.side === "left" || page.side === "right") {
      const paired = edition.physicalPages.filter((x) => x.illustrationIndex === page.illustrationIndex);
      const startPage = paired[0]?.physicalPageNumber ?? page.physicalPageNumber;
      const endPage = paired[1]?.physicalPageNumber ?? (startPage + 1);
      entries.push({ ...base, layout: "spread", startPage, endPage });
    } else {
      entries.push({ ...base, layout: "single", page: page.physicalPageNumber });
    }
  }

  return entries;
}
