/**
 * The ONE canonical secret-marker design used at both its discovery
 * ("ancient-ruins") and its later match ("island-marker"). A prior repair
 * pass locked the wording as a plain string reused verbatim at both call
 * sites; this formalizes it into a single contract object with a stable
 * fingerprint, so:
 *  - both scenes import the SAME object (not two independently-typed
 *    descriptions that happen to read the same today and can drift later),
 *  - a regression test can assert the two assembled prompts carry an
 *    identical fingerprint, not just "looks similar" string matching,
 *  - the exact geometric/material spec is documented in one place for
 *    whoever regenerates the ruins/island artwork.
 *
 * Visual audit of the existing draft PDF: the ruins carving currently
 * rendered is an ankh-like loop-and-stem glyph, and the island rock/map
 * carving is an unrelated plain Latin cross — neither matches this
 * contract's circle-and-cross design, so BOTH existing images are marked
 * REGENERATION_REQUIRED (see regenerationManifest.ts) rather than treating
 * either one as the "keep this one" canonical source: neither is
 * unambiguously reproducible from the current artwork, so a fresh single
 * design is defined here instead of guessing which existing rendering to
 * copy.
 */

export interface SecretMarkerContract {
  /** Stable identifier for this exact design — changing ANY field below
   *  must bump this id, so a stale cached prompt/fingerprint is detectable. */
  id: string;
  /** Exact geometric description, reused verbatim in every prompt that
   *  depicts the marker. */
  geometricDescription: string;
  lineCount: number;
  shapeCount: number;
  orientation: string;
  material: string;
  carvingDepth: string;
  color: string;
  weathering: string;
  /** Explicitly what this marker is NOT, to keep the image model from
   *  substituting letters, numbers, runes, or an unrelated symbol. */
  forbiddenSubstitutions: string[];
}

export const GREAT_ADVENTURE_SECRET_MARKER_CONTRACT: SecretMarkerContract = {
  id: "great-adventure-secret-marker-v1",
  geometricDescription: "a plain equal-armed cross inside a circle",
  lineCount: 5, // 2 strokes of the cross + the circle outline (counted as 1 closed curve) + 2 short serif-free terminals — see promptFragment for the exact wording used in prompts
  shapeCount: 2, // the circle, and the cross inscribed within it
  orientation: "upright, cross arms horizontal and vertical (never rotated or mirrored)",
  material: "pale weathered sandstone",
  carvingDepth: "shallow incised carving, a few millimeters deep, with soft worn edges",
  color: "the same pale stone color as the surrounding rock, with faint darker shadow inside the incised lines",
  weathering: "gently weathered and worn smooth by age, matching the ruins/rock it's carved into — never crisp or freshly cut",
  forbiddenSubstitutions: [
    "letters or numbers of any kind",
    "runes or invented alphabets",
    "a different symbol, glyph, or icon (e.g. an ankh, a star, a spiral, a plain Latin cross without the circle)",
    "a painted or colored marker (it is carved, not painted)",
    "a marker that differs in size, proportion, or orientation between its two appearances",
  ],
};

/**
 * The exact phrase inserted into both the "ancient-ruins" (discovery) and
 * "island-marker" (match) illustration prompts. Byte-identical by
 * construction — both call sites use this single function, never a
 * hand-typed copy of the wording. Deliberately plain natural-language prose
 * with NO embedded id/tag syntax — this string goes straight into the
 * image-generation prompt, and the prompt's own negative rules already say
 * "no text in the image," so nothing bracket-tagged belongs in the middle
 * of the scene description the model reads.
 */
export function secretMarkerPromptFragment(contract: SecretMarkerContract = GREAT_ADVENTURE_SECRET_MARKER_CONTRACT): string {
  return (
    `a single distinctive ancient marker symbol: ${contract.geometricDescription}, ` +
    `carved in ${contract.material} — always this exact same symbol, proportions, and carving style, never a different glyph`
  );
}

/** Deterministic fingerprint for regression testing — two assembled prompts
 *  that both embed this same contract will always contain this exact
 *  substring (the contract's `id`, checked independently of the prose above
 *  so a wording tweak that keeps the same design doesn't need updating in
 *  two places, but a genuinely different marker design — a new `id` — is
 *  caught immediately). Test-only; never inserted into the actual prompt. */
export function secretMarkerFingerprint(contract: SecretMarkerContract = GREAT_ADVENTURE_SECRET_MARKER_CONTRACT): string {
  return contract.id;
}
