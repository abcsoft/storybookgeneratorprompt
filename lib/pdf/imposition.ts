/**
 * Page imposition guard for two-page spreads.
 *
 * The book is bound as a single block with the cover as page 1 (a right-hand
 * page). Opening the cover reveals pages 2 and 3 facing each other, so facing
 * pairs are (2,3), (4,5), (6,7)… A two-page spread — one wide illustration split
 * down the middle — only reads correctly when its left half lands on a left-hand
 * (verso) page and its right half on the facing right-hand (recto) page. That
 * happens exactly when the spread BEGINS on an even page.
 *
 * `assertSpreadsAligned` fails fast with a descriptive error when a spread would
 * start on an odd page (so its halves would be split across a page-turn) instead
 * of silently inserting blank filler pages.
 */

import type { PageKind } from "../story/types";

/** The minimal page shape the imposition checker needs. */
export interface ImposablePage {
  kind: PageKind;
  role?: string;
  spread?: boolean;
}

/** A spread occupies two print leaves; a single page occupies one. Takes just
 *  `{ spread }` (a strict subset of `ImposablePage`) so it's reusable from
 *  contexts that don't have a full `ImposablePage` on hand — e.g.
 *  lib/manual/reviewOrder.ts, so the review UI's page numbering can never
 *  silently disagree with the actual print imposition rule. */
export function leavesFor(page: { spread?: boolean }): number {
  return page.spread ? 2 : 1;
}

/** The 1-based print start page of each spread, in order (cover = page 1). */
export function spreadStartPages(pages: ReadonlyArray<ImposablePage>): number[] {
  const starts: number[] = [];
  let printPage = 1;
  for (const page of pages) {
    if (page.spread) starts.push(printPage);
    printPage += leavesFor(page);
  }
  return starts;
}

/**
 * Throw if any spread does not begin on an even print page. The error names the
 * offending spread and its odd start page so the page sequence can be fixed at
 * the source (no blank pages are ever inserted).
 */
export function assertSpreadsAligned(
  pages: ReadonlyArray<ImposablePage>,
  opts?: { physicalInterior?: boolean },
): void {
  const usePhysical =
    opts?.physicalInterior ||
    (pages[0]?.kind === "cover" && pages.some((p) => p.role === "FINAL DREAM BIG"));
  const targetPages = usePhysical
    ? pages.filter((p) => p.kind !== "cover" && p.kind !== "backcover")
    : pages;

  let printPage = 1;
  targetPages.forEach((page, index) => {
    if (page.spread && printPage % 2 !== 0) {
      const label = page.role ?? page.kind;
      throw new Error(
        `Spread "${label}" (page index ${index}) starts on print page ${printPage}, ` +
          `a right-hand page, so its two halves won't face each other. Spreads must ` +
          `begin on an even page — adjust the page sequence by one single page before it.`,
      );
    }
    printPage += leavesFor(page);
  });
}


/**
 * Check whether a physical page pair forms a valid interior facing spread.
 *
 * Page 1 is a single right-hand page (recto).
 * Page maxPages is a single left-hand page (verso).
 * Valid facing pairs are strictly (2,3), (4,5), (6,7) ... (maxPages-2, maxPages-1).
 * Under no circumstances may a spread begin on page 1 or any odd-numbered page,
 * nor may a spread span across 1-2 or across (maxPages-1)-maxPages.
 */
export function isValidFacingPair(startPage: number, endPage: number, maxPages: number = 24): boolean {
  if (startPage < 2 || endPage > maxPages - 1) return false;
  if (endPage !== startPage + 1) return false;
  if (startPage % 2 !== 0) return false; // must start on an even page (verso)
  return true;
}

/**
 * Throw a descriptive error if the given physical page range does not form a valid facing pair.
 */
export function assertValidFacingPair(startPage: number, endPage: number, maxPages: number = 24): void {
  if (startPage === 1 && endPage === 2) {
    throw new Error(
      `Invalid spread across physical pages 1–2: Page 1 is a single right-hand page (recto) facing the inside cover. Spreads cannot begin on page 1.`,
    );
  }
  if (startPage === maxPages - 1 && endPage === maxPages) {
    throw new Error(
      `Invalid spread across physical pages ${startPage}–${endPage}: Page ${maxPages} is a single left-hand page (verso) facing the back cover. Spreads cannot end on page ${maxPages}.`,
    );
  }
  if (startPage % 2 !== 0) {
    throw new Error(
      `Invalid spread starting on odd physical page ${startPage}. Two-page spreads must always begin on an even physical page (left-hand verso) and end on the facing odd page (right-hand recto).`,
    );
  }
  if (endPage !== startPage + 1) {
    throw new Error(
      `Invalid spread span ${startPage}–${endPage}. A two-page spread must span exactly two consecutive facing pages [${startPage}, ${startPage + 1}].`,
    );
  }
  if (startPage < 2 || endPage > maxPages - 1) {
    throw new Error(
      `Invalid spread pages [${startPage}, ${endPage}] for a ${maxPages}-page interior book. Valid facing pairs are (2,3), (4,5) ... (${maxPages - 2},${maxPages - 1}).`,
    );
  }
}

