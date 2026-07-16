/** Shared domain types for the storybook pipeline. */

export type Gender = "boy" | "girl" | "neutral";

/** The child the book is about — collected from the upload form. */
export interface ChildProfile {
  name: string;
  age: number;
  gender: Gender;
}

/** A reference photo, already downscaled and base64-encoded for Gemini. */
export interface ReferencePhoto {
  mimeType: string;
  /** base64-encoded image bytes (no data: prefix). */
  base64: string;
}

export type PageKind = "cover" | "intro" | "scene" | "closing" | "backcover";

/**
 * A single page definition in a story template. `illustrationPrompt` and `text`
 * are functions so the same template personalizes for any child.
 */
export interface PageSpec {
  kind: PageKind;
  /** e.g. "astronaut" — used for the page's role badge on scene pages. */
  role?: string;
  /** Builds the Gemini prompt for this page's illustration. */
  illustrationPrompt: (child: ChildProfile) => string;
  /** Builds the personalized story copy shown on the page. */
  text: (child: ChildProfile) => string;
  /** Render as a two-page spread (one wide illustration across both leaves). */
  spread?: boolean;
  /** Force the verse ink/panel instead of auto-detecting from the art:
   *  "dark" = dark text on a light translucent panel (best over light or busy
   *  scenes), "light" = plain white text. Omit to auto-pick during PDF assembly. */
  ink?: "light" | "dark";
}

/**
 * A complete, named storybook: metadata plus its ordered pages. New books are
 * added by exporting one of these and registering it in `registry.ts`.
 */
export interface StoryTemplate {
  /** Stable id used in URLs/APIs/CLI, e.g. "dream-big". */
  id: string;
  /** Display name, e.g. "Dream Big". */
  title: string;
  /** One-line description shown in the book picker. */
  subtitle: string;
  /** The ordered pages of the book. */
  pages: PageSpec[];
}

/** A page after its illustration has been generated. */
export interface GeneratedPage {
  index: number;
  kind: PageKind;
  role?: string;
  text: string;
  /** PNG bytes of the illustration, or null if generation failed. */
  image: Buffer | null;
  imageMimeType: string;
  failed: boolean;
  /** Render as a two-page spread (wide illustration across both leaves). */
  spread?: boolean;
  /** Verse text color picked from the art behind it: "dark" on light scenes,
   *  "light" (default) on dark scenes. Set during PDF assembly. */
  verseInk?: "light" | "dark";
  /** Why this page failed to generate (surfaced to the user). */
  error?: string;
}
