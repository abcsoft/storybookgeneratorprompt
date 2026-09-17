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

export type PageKind =
  | "cover"
  | "backcover"
  | "greeting"
  | "intro"
  | "scene"
  | "closing"
  | "video-qr";

/** Whether an asset belongs to the separate cover wrap (front/spine/back —
 *  never assigned an interior physical page number) or the numbered
 *  interior page sequence. See lib/story/storyEdition.ts. */
export type DeliveryGroup = "cover" | "interior";

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

export type FramingMode =
  | "full-body"
  | "medium"
  | "waist-up portrait"
  | "close portrait"
  | "seated"
  | "seated-in-bed"
  | "bed-covered"
  | "sleeping/bed-covered"
  | "vehicle/cockpit"
  | "environmental wide";

/**
 * A single page definition in a story template. `illustrationPrompt` and `text`
 * are functions so the same template personalizes for any child.
 */
export interface PageSpec {
  kind: PageKind;
  /** e.g. "astronaut" — used for the page's role badge on scene pages. */
  role?: string;
  /** Builds the Gemini prompt for this page's illustration. */
  illustrationPrompt: (
    child: ChildProfile,
    profileId?: string,
    layoutOverrides?: {
      layout?: LayoutType;
      textSide?: "left" | "right" | "none";
      subjectSide?: "left" | "right" | "centered";
      framing?: FramingMode;
    },
  ) => string;
  /** Builds the personalized story copy shown on the page. */
  text: (child: ChildProfile) => string;
  /** Render as a two-page spread (one wide illustration across both leaves). */
  spread?: boolean;
  /** Explicit page layout model ("single" or "spread"). */
  pageLayout?: PageLayout;
  /** Explicit physical leaf where story text is positioned ("left", "right", or "none"). */
  storyTextLeaf?: "left" | "right" | "none";
  /** Force the verse ink/panel instead of auto-detecting from the art:
   *  "dark" = dark text on a light translucent panel (best over light or busy
   *  scenes), "light" = plain white text. Omit to auto-pick during PDF assembly. */
  ink?: "light" | "dark";
  /** Scene-aware framing override for the illustration prompt (e.g. "sleeping/bed-covered"). */
  framing?: FramingMode;
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
  /** Optional canonical slot ID (e.g. "01-cover", "page-03"). */
  slotId?: string;
  /** Why this page failed to generate (surfaced to the user). */
  error?: string;
  /** One of the six declared story-text-panel positions for this page's
   *  application-rendered verse (see TextPanelPosition in layoutGeometry.ts).
   *  Read by lib/pdf/page-template.ts so the panel is never hardcoded to a
   *  single corner. Defaults to "bottom-left" when unset. */
  textPanelPosition?: "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** For a "video-qr" page only: the deterministically application-rendered
   *  QR code + CTA/fallback-URL data. Never set from AI-generated content —
   *  see lib/story/qr.ts. When absent on a "video-qr" page, the page renders
   *  a clearly-labelled placeholder (draft only) or fails production export. */
  videoQr?: {
    /** data: URI of the rendered QR PNG, or null for the placeholder state.
     *  Used by the raster (screenshot-flattened) page pipelines, where a
     *  vector/raster distinction makes no difference — the whole page is
     *  always flattened to one image regardless. */
    dataUri: string | null;
    /** Raw `<svg>...</svg>` markup of the same QR, for the vector-PDF page
     *  pipeline (lib/pdf/page-template.ts / buildBook.ts) — kept as real
     *  vector paths in the output PDF rather than an extra embedded raster
     *  image, and scans just as reliably at any print resolution. */
    svgMarkup?: string | null;
    /** The exact URL encoded in the QR, or null for the placeholder state. */
    url: string | null;
    /** True when no real, production-valid video target is configured yet. */
    isPlaceholder: boolean;
  };
}
