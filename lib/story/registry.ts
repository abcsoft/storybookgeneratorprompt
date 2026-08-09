/**
 * Story-book registry.
 *
 * The one place that knows about every book. To add a new storybook later:
 * create a file that exports a `StoryTemplate` and add it to `STORY_BOOKS`.
 * Everything else (generation, prompts, PDF, UI picker) works off this list.
 */

import { bedtimeDreamBook } from "./bedtimeDreamTemplate";
import { dinosaurDiscoveryBook } from "./dinosaurDiscoveryTemplate";
import { dreamBigBook } from "./dreamBigTemplate";
import { greatAdventureBook } from "./greatAdventureTemplate";
import { kindnessGardenBook } from "./kindnessGardenTemplate";
import { rainbowKingdomBook } from "./rainbowKingdomTemplate";
import { safariFriendshipBook } from "./safariFriendshipTemplate";
import { spaceExplorerBook } from "./spaceExplorerTemplate";
import { theGreatDetectiveBook } from "./theGreatDetectiveTemplate";
import { underwaterKingdomBook } from "./underwaterKingdomTemplate";
import type { ChildProfile, PageKind, PageLayout, StoryTemplate } from "./types";

export const DEFAULT_BOOK_ID = "dream-big";

export const STORY_BOOKS: StoryTemplate[] = [
  dreamBigBook,
  greatAdventureBook,
  theGreatDetectiveBook,
  kindnessGardenBook,
  dinosaurDiscoveryBook,
  spaceExplorerBook,
  rainbowKingdomBook,
  safariFriendshipBook,
  underwaterKingdomBook,
  bedtimeDreamBook,
];

export function listBooks(): StoryTemplate[] {
  return STORY_BOOKS;
}

/** Resolve a book by id, falling back to the default if unknown. */
export function getBook(id: string = DEFAULT_BOOK_ID): StoryTemplate {
  return STORY_BOOKS.find((b) => b.id === id) ?? STORY_BOOKS[0];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A download filename for a child's book, e.g. "aarav-great-adventure.pdf". */
export function bookFilename(childName: string, bookId?: string): string {
  const name = slugify(childName) || "storybook";
  const title = slugify(getBook(bookId).title) || "book";
  return `${name}-${title}.pdf`;
}

/** A template page personalized for a specific child. */
export interface BuiltPage {
  index: number;
  kind: PageKind;
  role?: string;
  prompt: string;
  text: string;
  spread: boolean;
  pageLayout?: PageLayout;
  /** Optional verse ink/panel override carried from the template. */
  ink?: "light" | "dark";
}

const SPREAD_NOTE =
  " IMPORTANT COMPOSITION — this is an extra-wide illustration that will be " +
  "printed across two facing pages and folded down the exact vertical center. " +
  "Place the child, and especially the child's full face and head, entirely " +
  "within the RIGHT half of the image and well clear of that center line, so the " +
  "fold never crosses the face or body. Keep the whole LEFT half and the central " +
  "strip as calm, open background scenery (sky, soft landscape) with no important " +
  "subject, leaving the lower-left clear for a few lines of text.";

/**
 * Personalize an already-resolved book object for a child. Split out from
 * `buildPages()` (which resolves a book by id from the registry) so callers
 * that already have a `StoryTemplate` in hand — notably `validateStory.ts`,
 * which needs to validate a story regardless of whether it's registered —
 * can build its pages directly instead of round-tripping through an id
 * lookup that would silently substitute the registered version.
 */
export function buildPagesFor(
  child: ChildProfile,
  book: StoryTemplate,
  profileId?: string,
): BuiltPage[] {
  return book.pages.map((spec, index) => {
    const isSpread = spec.pageLayout ? spec.pageLayout === "spread" : (spec.spread ?? false);
    const layout: PageLayout = isSpread ? "spread" : "single";
    const legacySpreadNote = spec.layout ? "" : isSpread ? SPREAD_NOTE : "";
    return {
      index,
      kind: spec.kind,
      role: spec.role,
      prompt: spec.illustrationPrompt(child, profileId) + legacySpreadNote,
      text: spec.text(child),
      spread: isSpread,
      pageLayout: layout,
      ink: spec.ink,
    };
  });
}

/** Personalize a whole book for a child, resolved by id from the registry. */
export function buildPages(
  child: ChildProfile,
  bookId: string = DEFAULT_BOOK_ID,
  profileId?: string,
): BuiltPage[] {
  return buildPagesFor(child, getBook(bookId), profileId);
}
