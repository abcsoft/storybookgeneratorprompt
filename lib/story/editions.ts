/**
 * Story -> PrintEdition -> PhysicalLeaves abstraction layer.
 *
 * Separates STORY ILLUSTRATIONS / STORY SCENES from PHYSICAL INTERIOR PAGES.
 * Print profiles requiring a fixed interior page count (e.g. Printify 8x8 requiring 24 pages)
 * look up an explicit PrintEdition mapping.
 */

import type { ChildProfile, PageKind, PageLayout } from "./types";
import type { PrintProfile } from "../print/types";

export interface IllustrationSpec {
  /** 0-based illustration index (0, 1, 2...). */
  index: number;
  /** 1-based illustration number (1, 2, 3... matching filename 01.png, 02.png). */
  number: number;
  /** Save filename, e.g. "01.png". */
  filename: string;
  kind: PageKind;
  role?: string;
  prompt: (child: ChildProfile) => string;
  text: (child: ChildProfile) => string;
  spread: boolean;
  pageLayout?: PageLayout;
  recommendedAspect: string;
}

export interface PhysicalPageMapping {
  /** 1-based physical interior page number (1 to 24 for Printify 8x8). */
  physicalPageNumber: number;
  /** 0-based illustration index used on this physical page. */
  illustrationIndex: number;
  /** 1-based illustration number (1 for 01.png). */
  illustrationNumber: number;
  /** Save filename, e.g. "02.png". */
  filename: string;
  /** Framing side: "full" for single page, "left" or "right" for wide spread. */
  side: "full" | "left" | "right";
  /** Personalized copy shown on this physical leaf (function or null). */
  text: ((child: ChildProfile) => string) | string | null;
  ink?: "light" | "dark";
}

export function resolvePhysicalPageText(
  mapping: PhysicalPageMapping,
  child: ChildProfile,
): string | null {
  if (typeof mapping.text === "function") {
    return mapping.text(child);
  }
  return mapping.text;
}

export interface PrintEdition {
  id: string;
  storyId: string;
  profileId: string;
  /** Interior physical page count (e.g. 24 for Printify 8x8). */
  interiorPageCount: number;
  /** The set of story illustration specs to generate. */
  illustrations: IllustrationSpec[];
  /** The ordered physical interior page mapping (1 to interiorPageCount). */
  physicalPages: PhysicalPageMapping[];
  /** 0-based index of illustration used for front cover. */
  coverIllustrationIndex: number;
  /** 0-based index of illustration used for back cover. */
  backCoverIllustrationIndex: number;
}

const editionRegistry = new Map<string, PrintEdition>();

export function registerPrintEdition(edition: PrintEdition): void {
  const key = `${edition.storyId}:${edition.profileId}`;
  editionRegistry.set(key, edition);
}

export function getPrintEdition(
  storyId: string,
  profileId: string,
): PrintEdition | null {
  const key = `${storyId}:${profileId}`;
  return editionRegistry.get(key) ?? null;
}

export function getEditionForProfile(
  storyId: string,
  profile: PrintProfile,
): PrintEdition | null {
  if (!profile.interiorPageCount) {
    return null;
  }
  return getPrintEdition(storyId, profile.id);
}
