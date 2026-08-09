/**
 * Companion continuity — turns a `CompanionSpec` into one canonical continuity
 * instruction, stated once per prompt instead of being re-described by hand on
 * every scene. Returns "" when a story has no companion, or a page overrides it
 * to `null` (see item 4: not every story needs a pet/sidekick, and books that
 * have one shouldn't redefine it differently page to page).
 */

import type { CompanionSpec } from "../types";

export function companionRules(companion?: CompanionSpec | null): string {
  if (!companion) return "";
  return (
    `COMPANION CONTINUITY — ${companion.name}, ${companion.description}, ` +
    `appears in this scene exactly as always: ${companion.consistencyRules}. ` +
    `Exactly one ${companion.name} — never duplicated, never a different animal.`
  );
}
