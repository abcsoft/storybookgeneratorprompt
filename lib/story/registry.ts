/**
 * Story-book registry.
 *
 * The one place that knows about every book. To add a new storybook later:
 * create a file that exports a `StoryTemplate` and add it to `STORY_BOOKS`.
 * Everything else (generation, prompts, PDF, UI picker) works off this list.
 */

import { dreamBigBook } from "./dreamBigTemplate";
import { greatAdventureBook } from "./greatAdventureTemplate";
import { theGreatDetectiveBook } from "./theGreatDetectiveTemplate";
import type { ChildProfile, PageKind, StoryTemplate } from "./types";

export const DEFAULT_BOOK_ID = "dream-big";

export const STORY_BOOKS: StoryTemplate[] = [
  dreamBigBook,
  greatAdventureBook,
  theGreatDetectiveBook,
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
  /** Optional verse ink/panel override carried from the template. */
  ink?: "light" | "dark";
}

/** Personalize a whole book for a child. */
export function buildPages(
  child: ChildProfile,
  bookId: string = DEFAULT_BOOK_ID,
): BuiltPage[] {
  const SPREAD_NOTE =
    " IMPORTANT COMPOSITION — this is an extra-wide illustration that will be " +
    "printed across two facing pages and folded down the exact vertical center. " +
    "Place the child, and especially the child's full face and head, entirely " +
    "within the RIGHT half of the image and well clear of that center line, so the " +
    "fold never crosses the face or body. Keep the whole LEFT half and the central " +
    "strip as calm, open background scenery (sky, soft landscape) with no important " +
    "subject, leaving the lower-left clear for a few lines of text.";

  return getBook(bookId).pages.map((spec, index) => {
    const spread = spec.spread ?? false;
    return {
      index,
      kind: spec.kind,
      role: spec.role,
      prompt: spec.illustrationPrompt(child) + (spread ? SPREAD_NOTE : ""),
      text: spec.text(child),
      spread,
      ink: spec.ink,
    };
  });
}
