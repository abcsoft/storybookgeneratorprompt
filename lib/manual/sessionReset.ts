/**
 * Session/state-reset logic for the manual production workflow. Centralized
 * here (item 9) rather than scattered across click handlers, so
 * "clear images", "reset review", and "start new book" are each one
 * well-named, pure, unit-testable function — `ManualFlow.tsx` only wires
 * them to buttons and to `URL.revokeObjectURL` (an unavoidable side effect,
 * kept out of these pure functions on purpose).
 *
 * `IllustrationEntry` lives here (not in ManualFlow.tsx) because it's the
 * type every one of these functions operates on; `app/ManualFlow.tsx`
 * re-exports it so existing sibling-component imports
 * (`IllustrationCard.tsx`, `BookReview.tsx`) are unaffected.
 */

import type { ClientImageCheckResult } from "./clientImageCheck";
import type { IllustrationStatus } from "./illustrationStatus";
import type { ArtworkTransform } from "../print/artworkTransform";

/** One illustration's session-scoped state. Never becomes "approved"
 *  automatically — see illustrationStatus.ts. */
export interface IllustrationEntry {
  status: IllustrationStatus;
  needsRegeneration?: boolean;
  file: File | null;
  objectUrl: string | null;
  clientCheck: ClientImageCheckResult | null;
  transform?: ArtworkTransform;
}

export function emptyEntry(): IllustrationEntry {
  return { status: "missing", file: null, objectUrl: null, clientCheck: null };
}

/** A fresh, all-"missing" illustration map for a given set of page indices —
 *  used both for a brand-new manifest and after a destructive reset. */
export function freshIllustrations(
  indices: number[],
): Record<number, IllustrationEntry> {
  const next: Record<number, IllustrationEntry> = {};
  for (const index of indices) next[index] = emptyEntry();
  return next;
}

/** Every non-null objectUrl currently held. Call `URL.revokeObjectURL` on
 *  each of these BEFORE swapping to a new illustrations map, so no browser
 *  memory is leaked across many Etsy orders in one session (item 10). */
export function collectObjectUrls(
  illustrations: Record<number, IllustrationEntry>,
): string[] {
  return Object.values(illustrations)
    .map((e) => e.objectUrl)
    .filter((u): u is string => Boolean(u));
}

/**
 * "Clear all images" (item 2): every page goes back to "missing" — no file,
 * no object URL, no client-side validation warning. Keeps the exact same set
 * of page indices (child details, story, profile, and prompts are untouched
 * by this — the caller just doesn't touch those setters).
 */
export function clearedIllustrations(
  illustrations: Record<number, IllustrationEntry>,
): Record<number, IllustrationEntry> {
  return freshIllustrations(Object.keys(illustrations).map(Number));
}

/**
 * "Reset review" (item 3): every image/file/objectUrl is kept exactly as-is.
 * Only rolls "approved" and "needs-regeneration" back to "added"; "missing"
 * stays "missing".
 */
export function reviewResetIllustrations(
  illustrations: Record<number, IllustrationEntry>,
): Record<number, IllustrationEntry> {
  const next: Record<number, IllustrationEntry> = {};
  for (const [key, entry] of Object.entries(illustrations)) {
    next[Number(key)] =
      entry.status === "approved" || entry.status === "needs-regeneration" || entry.needsRegeneration
        ? { ...entry, status: "added", needsRegeneration: false }
        : { ...entry, needsRegeneration: false };
  }
  return next;
}

/** Whether the session has any imported/generated image at all — the signal
 *  used to decide whether switching story/book needs a destructive-reset
 *  confirmation (item 5). */
export function hasSessionWork(
  illustrations: Record<number, IllustrationEntry>,
): boolean {
  return Object.values(illustrations).some((e) => e.status !== "missing");
}

/** Whether any page has an approval/regeneration decision worth confirming
 *  before "Reset review" discards it (item 3: "confirmation only if
 *  needed"). */
export function hasReviewDecisions(
  illustrations: Record<number, IllustrationEntry>,
): boolean {
  return Object.values(illustrations).some(
    (e) => e.status === "approved" || e.status === "needs-regeneration",
  );
}

/**
 * A tiny "generation" counter that guards against a stale async operation
 * (the client-side image/aspect check, which runs in the background after
 * every import) writing its result back after the session has since been
 * reset. Bump it on every destructive reset (Clear images, Start new book/
 * New child, a confirmed story change, a profile change that invalidates
 * the page layout); tag each async operation with the generation that was
 * current when it started; before committing its result, check that
 * generation against the CURRENT one — a mismatch means a reset happened
 * while the operation was in flight, so its result must be discarded rather
 * than written back into the (now different) session.
 */
export function createGenerationGuard() {
  let generation = 0;
  return {
    /** Call on every destructive reset. Invalidates every operation still
     *  tagged with an older generation. */
    bump(): number {
      generation += 1;
      return generation;
    },
    /** The generation currently in effect — tag an async operation with
     *  this when it starts. */
    current(): number {
      return generation;
    },
    /** True if `startedAt` (a generation captured at the start of an async
     *  operation) is no longer the current one — i.e. its result is stale
     *  and must not be committed. */
    isStale(startedAt: number): boolean {
      return startedAt !== generation;
    },
  };
}
