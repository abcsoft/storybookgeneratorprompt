/**
 * Story content validation (item 15 of the Phase 4 spec). Pure, reusable
 * across every registered book — including any future story #N — so adding
 * a new story automatically gets checked by the same rules with zero new
 * validation code required.
 *
 * This is a content-quality gate, not a type system: `StoryTemplate` and
 * `PageSpec` already make most of this structurally impossible (TypeScript
 * won't let you omit `id`/`title`/an unsupported `layout` value), but a
 * template can still supply an *empty* string, a companion with a blank
 * field, or a page whose built prompt/text ends up empty — none of which
 * TypeScript catches. Run this against `listBooks()` in a test and any
 * malformed story fails clearly at `npm test` time (item 15's "fail clearly
 * during development").
 */

import { assertSpreadsAligned } from "../pdf/imposition";
import { buildPagesFor } from "./registry";
import type { ChildProfile, CompanionSpec, LayoutType, StoryTemplate } from "./types";

const VALID_LAYOUTS: ReadonlySet<LayoutType> = new Set([
  "single-page",
  "text-left-subject-right",
  "subject-left-text-right",
  "balanced-spread",
  "full-art-no-text",
]);

/** Phrases that only ever come from the shared prompt engine
 *  (lib/story/prompt). A story should never push one of these past 1
 *  occurrence in a single built prompt — that would mean the story copied a
 *  global rule block into its own scene text instead of letting
 *  buildIllustrationPrompt() supply it once. Some legacy (pre-Phase-1)
 *  templates don't use the shared engine at all and legitimately show 0 —
 *  that's fine; only "more than once" is a real violation. */
const GLOBAL_RULE_MARKERS = ["IDENTITY FIRST", "DO NOT:", "PHOTOREALISTICALLY"];

/** Validate a `CompanionSpec` (story-level or a page's override). Returns
 *  `[]` for `null`/`undefined` — no companion is always valid. */
export function validateCompanion(
  companion: CompanionSpec | null | undefined,
  context: string,
): string[] {
  if (!companion) return [];
  const issues: string[] = [];
  if (!companion.name?.trim()) issues.push(`${context}: companion name is empty.`);
  if (!companion.description?.trim()) {
    issues.push(`${context}: companion description is empty.`);
  }
  if (!companion.consistencyRules?.trim()) {
    issues.push(`${context}: companion consistencyRules is empty.`);
  }
  return issues;
}

/**
 * Validate one registered story for a sample child. Returns an empty array
 * when the story is valid, otherwise a list of human-readable issues.
 */
export function validateStoryTemplate(
  book: StoryTemplate,
  sampleChild: ChildProfile,
): string[] {
  const issues: string[] = [];
  const ctx = `Story "${book.id || "(missing id)"}"`;

  if (!book.id?.trim()) issues.push(`${ctx}: id is empty.`);
  if (!book.title?.trim()) issues.push(`${ctx}: title is empty.`);
  if (!book.subtitle?.trim()) issues.push(`${ctx}: subtitle is empty.`);
  if (!Array.isArray(book.pages) || book.pages.length === 0) {
    issues.push(`${ctx}: has no pages.`);
    return issues; // nothing further can be safely checked
  }

  if (book.defaultOutfit !== undefined && !book.defaultOutfit.trim()) {
    issues.push(`${ctx}: defaultOutfit is set but empty.`);
  }
  if (book.specialOutfits) {
    for (const [name, outfit] of Object.entries(book.specialOutfits)) {
      if (!outfit?.trim()) issues.push(`${ctx}: specialOutfits.${name} is empty.`);
    }
  }
  issues.push(...validateCompanion(book.companion, `${ctx} (story companion)`));

  const covers = book.pages.filter((p) => p.kind === "cover");
  if (covers.length !== 1) {
    issues.push(`${ctx}: expected exactly 1 cover page, found ${covers.length}.`);
  }
  const backCovers = book.pages.filter((p) => p.kind === "backcover");
  if (backCovers.length !== 1) {
    issues.push(`${ctx}: expected exactly 1 back-cover page, found ${backCovers.length}.`);
  }

  for (const spec of book.pages) {
    if (spec.layout && !VALID_LAYOUTS.has(spec.layout)) {
      issues.push(
        `${ctx}: page kind "${spec.kind}" has an unsupported layout "${spec.layout}".`,
      );
    }
    if (spec.optionalOutfit !== undefined && !spec.optionalOutfit.trim()) {
      issues.push(`${ctx}: a page's optionalOutfit is set but empty.`);
    }
    issues.push(
      ...validateCompanion(spec.optionalCompanionOverride, `${ctx} (page companion override)`),
    );
  }

  // Scene "id" uniqueness/sequentiality — the pipeline's de facto scene
  // identifier is the 0-based page index (it drives filenames, review
  // ordering, and image-import matching throughout), so its uniqueness is
  // what actually matters, not a separate id field.
  const built = buildPagesFor(sampleChild, book);
  built.forEach((page, i) => {
    if (page.index !== i) {
      issues.push(`${ctx}: page index ${page.index} is out of sequence at position ${i}.`);
    }
  });

  for (const page of built) {
    const label = page.role ?? page.kind;
    if (!page.prompt.trim()) {
      issues.push(`${ctx}: page ${page.index} ("${label}") has an empty illustration prompt.`);
    }
    // "backcover" is the one page kind allowed to have no text by design —
    // lib/pdf/page-template.ts / hasVerse() intentionally omit the verse
    // panel there so an image-only closing page can stay clean. Every other
    // kind (cover's text doubles as the title; scene/intro/closing always
    // carry the verse) must have real text.
    if (page.kind !== "backcover" && !page.text.trim()) {
      issues.push(`${ctx}: page ${page.index} ("${label}") has empty story text.`);
    }
    for (const marker of GLOBAL_RULE_MARKERS) {
      const count = page.prompt.split(marker).length - 1;
      if (count > 1) {
        issues.push(
          `${ctx}: page ${page.index} ("${label}") repeats the global "${marker}" rule ` +
            `${count} times — it should come from the shared prompt engine exactly once, ` +
            `not be duplicated inline by the story.`,
        );
      }
    }
  }

  // Spread/imposition validity — reuse the exact check the print pipeline
  // relies on, so a story can never register with a spread that would split
  // across a page-turn.
  try {
    assertSpreadsAligned(built);
  } catch (err) {
    issues.push(`${ctx}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return issues;
}
