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
  roleSlug?: string;
  slotId?: string;
  filename: string;
  spread?: boolean;
  aspect: string;
  physicalPages?: number[];
}

export interface ReviewEntryBase {
  manifestIndex: number;
  filename: string;
  pageKind: string;
  role?: string;
  roleSlug?: string;
  slotId?: string;
  aspect: string;
}

export type ReviewEntry =
  | (ReviewEntryBase & { layout: "single"; page: number })
  | (ReviewEntryBase & { layout: "spread"; startPage: number; endPage: number });

/**
 * Generates unambiguous user-facing physical page labels.
 * E.g. "Physical page 1 — Cover", "Physical page 2 — Intro", "Physical page 3 — Pilot".
 * Never shows "Page 0".
 */
export function formatPhysicalPageLabel(entry: {
  layout?: "single" | "spread" | "single-page" | string;
  page?: number;
  startPage?: number;
  endPage?: number;
  role?: string;
  roleSlug?: string;
  pageKind?: string;
  physicalPages?: number[];
}): string {
  const normKind = (entry.pageKind ?? "").toLowerCase().trim();
  const normRole = (entry.role ?? "").toLowerCase().trim();
  const normSlug = (entry.roleSlug ?? "").toLowerCase().trim();

  let roleName = "Scene";
  if (normKind === "cover" || normSlug === "cover" || normRole === "cover") {
    roleName = "Cover";
  } else if (normKind === "backcover" || normSlug === "backcover" || normRole === "backcover" || normRole === "happy dreamer") {
    roleName = "Back cover";
  } else if (normKind === "intro" || normSlug === "intro" || normRole === "intro" || normRole === "cozy reader") {
    roleName = "Intro";
  } else if (normKind === "closing" || normSlug === "closing" || normRole === "closing" || normRole === "dreamer") {
    roleName = "Closing";
  } else if (entry.role && entry.role.trim()) {
    roleName = entry.role.charAt(0).toUpperCase() + entry.role.slice(1);
  }

  const isSpread =
    entry.layout === "spread" ||
    (entry.physicalPages && entry.physicalPages.length === 2) ||
    (entry.startPage !== undefined && entry.endPage !== undefined);

  if (isSpread) {
    const start = entry.startPage ?? entry.physicalPages?.[0] ?? 1;
    const end = entry.endPage ?? entry.physicalPages?.[1] ?? start + 1;
    return `Physical pages ${start}–${end} — ${roleName}`;
  }

  const pageNum =
    entry.page !== undefined && entry.page > 0
      ? entry.page
      : (entry.physicalPages && entry.physicalPages.length > 0 ? entry.physicalPages[0] : 1);

  return `Physical page ${pageNum} — ${roleName}`;
}

import type { PrintEdition } from "../story/editions";

/** Order + physical page numbers for every manifest entry. */
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
      roleSlug: m.roleSlug,
      slotId: m.slotId,
      aspect: m.aspect,
    };

    if (m.physicalPages !== undefined) {
      if (m.physicalPages.length === 2 || m.spread) {
        const startPage = m.physicalPages[0] ?? printPage;
        const endPage = m.physicalPages[1] ?? startPage + 1;
        entries.push({ ...base, layout: "spread", startPage, endPage });
      } else if (m.physicalPages.length === 1) {
        entries.push({ ...base, layout: "single", page: m.physicalPages[0] });
      } else {
        // Multi-part cover or wrap cover: display physical page 1 for cover and final physical page for back cover
        const p = m.kind === "cover" ? 1 : manifest.length;
        entries.push({ ...base, layout: "single", page: p });
      }
      continue;
    }

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
