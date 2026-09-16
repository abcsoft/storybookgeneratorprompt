/**
 * Identity rules — the single place that says "match the real child" for any
 * prompt built through `buildIllustrationPrompt`. Stated once, strongly, and
 * identically on every page of a given child's book, so a costume, prop, or
 * lighting change on any one page can never redefine who the child is.
 *
 * `characterIdentityContract()` also derives a short, deterministic
 * fingerprint from the child's profile so cross-page identity consistency is
 * independently checkable (see dreamBigIdentityStyleContract.test.ts):
 * every page built for the same (name, age, gender) carries the exact same
 * fingerprint and block text, byte for byte.
 */

import type { ChildProfile } from "../types";

export interface CharacterIdentityContract {
  /** Short, deterministic per-(name, age, gender) tag, e.g. "ID-9F2A1C". Not
   *  a security token — just a traceable marker proving every page's
   *  identity block came from the same resolved child profile. */
  fingerprint: string;
  /** The full immutable-identity prompt block, fingerprint included. */
  block: string;
}

/** Deterministic (non-cryptographic) short fingerprint for a child profile. */
export function characterIdentityFingerprint(child: ChildProfile): string {
  const raw = `${child.name}|${child.age}|${child.gender}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (Math.imul(hash, 31) + raw.charCodeAt(i)) >>> 0;
  }
  return `ID-${hash.toString(36).toUpperCase()}`;
}

/**
 * The full immutable-identity contract for a child, to be included verbatim
 * (same fingerprint, same block text) in every illustration prompt for that
 * child's book. Separates IMMUTABLE identity (never changes page to page)
 * from MUTABLE scene state (costume, pose, lighting, location — handled by
 * wardrobeRules/companionRules/framing elsewhere in the assembled prompt).
 */
export function characterIdentityContract(child: ChildProfile): CharacterIdentityContract {
  const fingerprint = characterIdentityFingerprint(child);
  const block =
    `CHARACTER IDENTITY CONTRACT [${fingerprint}] — IDENTITY FIRST — this exact identity is locked for ` +
    `every page of this book and must never be redrawn: match the real child in the attached reference ` +
    `photos (and the approved 00-character.png anchor portrait, when attached) exactly, keeping the ` +
    `likeness clear even when the child is small in the scene. Identity and likeness take priority over ` +
    `every other instruction in this prompt — never sacrifice the child's real identity for styling, ` +
    `costume, or scene composition. ` +
    `IMMUTABLE across every page regardless of costume, helmet, hairstyle arrangement, pose, expression, or lighting: ` +
    `apparent age ${child.age} with age-appropriate child body proportions (never older, never younger, never adult or teenage proportions); ` +
    `gender presentation; skin tone; face shape; eye color and eye shape; eyebrow shape; nose shape; lip shape; ` +
    `hair color; hair texture; hair length; and the child's other stable identifying facial features. ` +
    `Do not drift the apparent age, do not drift ethnicity or skin tone, and do not redesign facial anatomy for any reason. ` +
    `Mutable scene state (clothing/costume, safety equipment, pose, expression, lighting, location, and props) may vary ` +
    `freely per scene, but none of it may alter the immutable identity above. ` +
    `Visual identity anchor: the approved 00-character.png reference portrait and the attached real photos are ` +
    `authoritative; if no approved reference image has been attached yet, this text block is the anchor and visual ` +
    `likeness remains UNVERIFIED until the user approves it.`;
  return { fingerprint, block };
}
