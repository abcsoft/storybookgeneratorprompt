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

/** A spread occupies two print leaves; a single page occupies one. */
function leavesFor(page: ImposablePage): number {
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
export function assertSpreadsAligned(pages: ReadonlyArray<ImposablePage>): void {
  let printPage = 1;
  pages.forEach((page, index) => {
    if (page.spread && printPage % 2 !== 0) {
      const label = page.role ?? page.kind;
      throw new Error(
        `Spread "${label}" (page index ${index}) starts on print page ${printPage}, ` +
          `a right-hand page, so its two halves won't face each other. Spreads must ` +
          `begin on an even page (cover = page 1) — adjust the page sequence by one ` +
          `single page before it.`,
      );
    }
    printPage += leavesFor(page);
  });
}
