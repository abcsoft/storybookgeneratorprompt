/**
 * Great Adventure's identity/companion/style contract.
 *
 * The heavy lifting already lives in the book-agnostic shared prompt engine
 * (lib/story/prompt/identityRules.ts, styleRules.ts, negativeRules.ts,
 * companionRules.ts, composed by buildIllustrationPrompt.ts) — every Great
 * Adventure page already routes through that engine, so identity/style/
 * negative blocks are already byte-identical across every scene by
 * construction, not by convention. This module does NOT re-implement that
 * engine or fork a second copy of its rules (that would be the real risk:
 * two slightly-different identity blocks silently drifting apart). It:
 *
 *  1. Documents, field by field, which immutable traits the shared identity
 *     block is responsible for locking (age, face shape, skin tone, eye
 *     color/shape, eyebrows, nose, mouth, hair color/texture/length/style,
 *     body proportions) — the shared engine locks all of these via
 *     "match the real child in the attached reference photos exactly," a
 *     single photo-anchored instruction rather than restating each trait in
 *     prose (an AI illustration model has no way to independently verify an
 *     itemized text description of a real child's face against the
 *     attached photos — the photo IS the ground truth for all of these
 *     fields, so re-describing them in words would be redundant at best and
 *     a second, driftable source of truth at worst).
 *  2. Names Scout's own immutable companion contract explicitly (species,
 *     coat color/length/texture, face/muzzle, ears, eyes, size/proportions,
 *     markings) — Scout has no reference photo, so unlike the child, Scout'
 *     description below IS the full identity source of truth and matters
 *     as literal prose. It's already threaded through
 *     `lib/story/greatAdventureTemplate.ts`'s `SCOUT: CompanionSpec` into
 *     every scene via `companionRules()`.
 *  3. Computes a stable fingerprint over the assembled identity+style+
 *     negative+companion blocks, so a parity test can assert byte-identical
 *     output across every scene without re-deriving the prose (see
 *     greatAdventureIdentityContract.test.ts).
 */

import crypto from "node:crypto";
import { identityRules } from "./prompt/identityRules";
import { styleRules } from "./prompt/styleRules";
import { negativeRules } from "./prompt/negativeRules";
import { companionRules } from "./prompt/companionRules";
import type { CompanionSpec } from "./types";

/** Immutable child-identity fields the shared, photo-anchored identityRules()
 *  block is responsible for locking. Documentation only — see module header
 *  for why these aren't independently re-stated in prose. */
export const GREAT_ADVENTURE_CHILD_IDENTITY_FIELDS = [
  "age",
  "gender presentation",
  "face shape",
  "skin tone",
  "eye color and shape",
  "eyebrows",
  "nose",
  "mouth",
  "hair color, texture, length, and style",
  "body proportions",
] as const;

/** Scout's own immutable companion contract — the literal prose source of
 *  truth (Scout has no reference photo), reused via SCOUT in
 *  greatAdventureTemplate.ts. Kept here too as the named, itemized,
 *  documented contract this task asks for. */
export const GREAT_ADVENTURE_SCOUT_CONTRACT: CompanionSpec = {
  name: "Scout",
  description: "a small fluffy light-brown golden puppy",
  consistencyRules:
    "the exact same golden coat color (never white, pale, or cream), the same fluffy coat length and texture, " +
    "the same floppy ears, the same face and muzzle shape, the same dark brown eyes, and the same small puppy " +
    "size and body proportions on every page — never an adult dog, never a different breed, a single puppy " +
    "only, never duplicated",
};

/** Every distinct trait Scout's contract locks — documentation/testability,
 *  mirrors GREAT_ADVENTURE_CHILD_IDENTITY_FIELDS above. */
export const GREAT_ADVENTURE_SCOUT_IDENTITY_FIELDS = [
  "species/breed (golden retriever-type puppy)",
  "coat color (golden, never white/pale/cream)",
  "coat length and texture (fluffy)",
  "face and muzzle shape",
  "ear shape (floppy)",
  "eye color (dark brown)",
  "body size and proportions (puppy, never adult)",
  "single, never duplicated",
] as const;

/** The book-wide style lock, itemized for documentation — actual enforcement
 *  is the single shared styleRules() + negativeRules() blocks below. */
export const GREAT_ADVENTURE_STYLE_LOCK_FIELDS = [
  "premium children's storybook illustration medium (photoreal child, painterly surroundings)",
  "consistent realism/stylization level (never mixed with cartoon/anime/vector/3D-Pixar rendering)",
  "consistent facial rendering (photographic, never smoothed or cartoonish)",
  "consistent color treatment (true-to-life, no garish saturation)",
  "consistent soft cinematic/directional lighting behavior, matched per scene",
  "consistent line/brush treatment (painterly surroundings, no hard outlines/flat shading)",
  "consistent character proportions (true-to-life child proportions, no big-head/chibi look)",
] as const;

/** Assembles the exact identity+style+negative+companion blocks used for
 *  every Great Adventure scene (single-page, non-spread), for fingerprinting
 *  and for direct prose inspection. Scene-specific text (the scene
 *  description, lighting, composition notes) is deliberately excluded —
 *  those legitimately vary per page; this fingerprint only covers the parts
 *  that must NOT vary. */
export function assembleGreatAdventureIdentityStyleBlocks(companion: CompanionSpec | null = GREAT_ADVENTURE_SCOUT_CONTRACT): string {
  return [identityRules(), styleRules(), companionRules(companion), negativeRules(false, "medium")].join(" | ");
}

/** Deterministic SHA-256 fingerprint of the identity/style/negative/companion
 *  blocks. Two scenes with the same fingerprint are provably using the
 *  same locked identity + style + companion contract. */
export function greatAdventureIdentityStyleFingerprint(companion: CompanionSpec | null = GREAT_ADVENTURE_SCOUT_CONTRACT): string {
  return crypto.createHash("sha256").update(assembleGreatAdventureIdentityStyleBlocks(companion)).digest("hex");
}
