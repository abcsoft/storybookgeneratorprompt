/**
 * Deterministic semantic lint for a resolved Dream Big / manual-flow prompt
 * manifest, run before returning or downloading it. Each check here guards
 * against a specific, previously-reproduced defect class rather than being
 * a speculative general-purpose linter:
 *
 * - a backcover (or any non-front-cover) prompt leaking front-cover
 *   composition/title-safe-area text
 * - a single-page prompt with spread composition language, or vice versa
 * - the per-page aspect heading contradicting the "closest provider preset"
 *   the prompt body itself states
 * - a career-scene prompt claiming both a costume change AND an unchanged
 *   outfit in the same prompt
 * - a filename whose leading page number doesn't match its own
 *   `physicalPages`
 * - a duplicate slot id or a physical page claimed by more than one slot
 *
 * A manifest that fails any of these is not safe to hand to the user — it
 * would download self-contradictory instructions. Callers should treat a
 * non-empty `issues` array as a hard failure, not a warning.
 */

import type { ManualPage } from "../manual/manifest";

export interface PromptContractLintResult {
  ok: boolean;
  issues: string[];
}

export function lintPromptContract(manifest: ManualPage[]): PromptContractLintResult {
  const issues: string[] = [];

  const seenSlotIds = new Set<string>();
  const pageOwner = new Map<number, string>();

  for (const m of manifest) {
    const label = m.slotId ?? m.filename;

    // Front-cover text must never appear outside the actual front cover.
    if (m.kind !== "cover" && /front cover/i.test(m.prompt)) {
      issues.push(`${label}: prompt contains front-cover composition text but this is not the front cover (kind="${m.kind}").`);
    }

    // Single vs spread composition language must match the asset's own kind.
    const hasSpreadComposition = /COMPOSITION \(two-page continuous spread\)/.test(m.prompt);
    const hasSingleComposition = /COMPOSITION \(single page\)/.test(m.prompt);
    if (m.spread && !hasSpreadComposition) {
      issues.push(`${label}: is a spread but its prompt lacks two-page spread composition rules.`);
    }
    if (m.spread && hasSingleComposition) {
      issues.push(`${label}: is a spread but its prompt contains single-page composition rules.`);
    }
    if (!m.spread && hasSpreadComposition) {
      issues.push(`${label}: is a single page but its prompt contains two-page spread composition rules.`);
    }

    // The aspect heading must match the "closest provider preset" the
    // prompt body itself states — they describe the same fact twice.
    const presetInPrompt = m.prompt.match(/closest provider preset: (\S+)\)/)?.[1];
    if (presetInPrompt && m.aspect && presetInPrompt !== m.aspect) {
      issues.push(
        `${label}: aspect heading "${m.aspect}" contradicts the prompt body's own "closest provider preset: ${presetInPrompt}".`,
      );
    }

    // A career costume change must not coexist with an "unchanged outfit" claim.
    const claimsCostumeChange = /outfit changes to match the .* career uniform/.test(m.prompt);
    const claimsUnchangedOutfit = /Keep this exact outfit, unchanged/.test(m.prompt);
    if (claimsCostumeChange && claimsUnchangedOutfit) {
      issues.push(`${label}: prompt claims both a career costume change and an unchanged outfit — contradictory wardrobe instructions.`);
    }

    // Filename must encode this slot's own physical page, not a stale one.
    const firstPage = m.physicalPages?.[0];
    if (firstPage !== undefined) {
      const leading = m.filename.match(/^(\d+)/)?.[1];
      if (leading !== undefined && leading !== String(firstPage).padStart(2, "0")) {
        issues.push(`${label}: filename "${m.filename}" does not start with its own physical page ${firstPage}.`);
      }
    }

    // No duplicate slot ids.
    const slotKey = m.slotId ?? m.filename;
    if (seenSlotIds.has(slotKey)) {
      issues.push(`Duplicate slot id "${slotKey}" appears more than once in the manifest.`);
    }
    seenSlotIds.add(slotKey);

    // No physical page claimed by more than one slot.
    for (const page of m.physicalPages ?? []) {
      const owner = pageOwner.get(page);
      if (owner && owner !== slotKey) {
        issues.push(`Physical page ${page} is claimed by both "${owner}" and "${slotKey}".`);
      } else {
        pageOwner.set(page, slotKey);
      }
    }
  }

  // Physical pages must be gapless and start at 1 — no page mapping beyond
  // (or with holes inside) the resolved book's own boundary.
  const allPages = Array.from(pageOwner.keys()).sort((a, b) => a - b);
  if (allPages.length > 0) {
    const expected = Array.from({ length: allPages.length }, (_, i) => i + 1);
    if (JSON.stringify(allPages) !== JSON.stringify(expected)) {
      issues.push(
        `Physical pages are not a gapless 1..${allPages.length} sequence: got [${allPages.join(", ")}].`,
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Compares the customSpreads the caller submitted against the spreads the
 * planner actually resolved, so a spread can never silently vanish (or a
 * spread can never silently appear that nobody selected).
 */
export function lintSubmittedSpreadsMatchResolved(
  submitted: Array<{ startPage: number; endPage: number }>,
  manifest: ManualPage[],
): PromptContractLintResult {
  const issues: string[] = [];
  const submittedKeys = new Set(submitted.map((s) => `${s.startPage}-${s.endPage}`));
  const resolvedKeys = new Set(
    manifest
      .filter((m) => m.spread && (m.physicalPages?.length ?? 0) === 2)
      .map((m) => `${m.physicalPages![0]}-${m.physicalPages![1]}`),
  );

  for (const key of submittedKeys) {
    if (!resolvedKeys.has(key)) {
      issues.push(`Spread ${key.replace("-", "–")} was submitted but is missing from the resolved output.`);
    }
  }
  for (const key of resolvedKeys) {
    if (!submittedKeys.has(key)) {
      issues.push(`Spread ${key.replace("-", "–")} appears in the resolved output but was never submitted.`);
    }
  }

  return { ok: issues.length === 0, issues };
}
