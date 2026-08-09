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

export type PageLayout = "single" | "spread";

/**
 * How a two-page spread's subject/text are arranged. Only "single-page" and
 * "text-left-subject-right" are currently backed by real, renderer-accurate
 * composition rules (see lib/story/prompt/compositionRules.ts) — the print
 * template (lib/pdf/page-template.ts) always overlays the verse on the LEFT
 * leaf, so that's the only two-leaf arrangement that actually renders
 * correctly today. The other variants are reserved for a future page-template
 * update and should not yet be relied on to render as named.
 */
export type LayoutType =
  | "single-page"
  | "text-left-subject-right"
  | "subject-left-text-right"
  | "balanced-spread"
  | "full-art-no-text";

/** A recurring companion character (e.g. a pet) kept consistent page-to-page. */
export interface CompanionSpec {
  /** e.g. "Scout" */
  name: string;
  /** Short physical description used to introduce the companion. */
  description: string;
  /** Explicit continuity rules (fur/color/size/etc.) repeated identically every page. */
  consistencyRules: string;
}

/**
 * A single page definition in a story template. `illustrationPrompt` and `text`
 * are functions so the same template personalizes for any child.
 */
export interface PageSpec {
  kind: PageKind;
  /** e.g. "astronaut" — used for the page's role badge on scene pages. */
  role?: string;
  /** Builds the Gemini prompt for this page's illustration. */
  illustrationPrompt: (child: ChildProfile, profileId?: string) => string;
  /** Builds the personalized story copy shown on the page. */
  text: (child: ChildProfile) => string;
  /** Render as a two-page spread (one wide illustration across both leaves). */
  spread?: boolean;
  /** Explicit page layout model ("single" or "spread"). */
  pageLayout?: PageLayout;
  /** Force the verse ink/panel instead of auto-detecting from the art:
   *  "dark" = dark text on a light translucent panel (best over light or busy
   *  scenes), "light" = plain white text. Omit to auto-pick during PDF assembly. */
  ink?: "light" | "dark";
  /** Composition arrangement for this page, used by the prompt engine to pick
   *  the right composition-rules block. Optional — templates that don't set
   *  this keep the legacy generic spread note (see registry.ts). */
  layout?: LayoutType;
  /** Scene-specific composition guidance (e.g. "keep the pointing hand fully
   *  inside frame") appended after the scene description. */
  compositionNotes?: string;
  /** Overrides the story's defaultOutfit for this page only (e.g. winter gear). */
  optionalOutfit?: string;
  /** Overrides the story's companion for this page only; null = no companion here. */
  optionalCompanionOverride?: CompanionSpec | null;
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
  /** The child's standard outfit for this book, repeated on every page unless a
   *  page sets `optionalOutfit`. Omit for books that don't pin an outfit. */
  defaultOutfit?: string;
  /** Named costume variants a page can opt into via `optionalOutfit`. */
  specialOutfits?: Record<string, string>;
  /** A recurring companion character for this book. Omit for no companion. */
  companion?: CompanionSpec;
}

import type { ArtworkTransform } from "../print/artworkTransform";

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
  /** Explicit page layout model ("single" or "spread"). */
  pageLayout?: PageLayout;
  /** Verse text color picked from the art behind it: "dark" on light scenes,
   *  "light" (default) on dark scenes. Set during PDF assembly. */
  verseInk?: "light" | "dark";
  /** Optional framing transformation saved by the user. */
  transform?: ArtworkTransform;
  /** Why this page failed to generate (surfaced to the user). */
  error?: string;
}
