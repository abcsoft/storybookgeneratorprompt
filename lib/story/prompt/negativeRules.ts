/**
 * Negative rules — one centralized "don't" list appended to the end of every
 * prompt built through `buildIllustrationPrompt`, scene-aware and internally consistent.
 */

import type { FramingMode } from "./compositionRules";

export function negativeRules(isSpread?: boolean, framing: FramingMode = "medium"): string {
  const gutterRule = isSpread ? "place any focal subject in the center fold/gutter; " : "";

  let croppingConstraint = "";
  let anatomyConstraint = "duplicate the child or companion; draw extra fingers, distorted hands, or distorted anatomy; ";
  if (framing === "sleeping/bed-covered" || framing === "bed-covered" || framing === "seated-in-bed") {
    croppingConstraint = "crop visible head, hair, or visible hands at the frame edge; ";
    anatomyConstraint = "duplicate the child or companion; draw extra fingers or distorted visible anatomy; ";
  } else if (framing === "waist-up portrait" || framing === "close portrait") {
    croppingConstraint = "crop the head, hair, or visible hands/arms at the frame edge; ";
  } else if (framing === "vehicle/cockpit") {
    croppingConstraint = "crop visible head, hair, or active hands at the frame edge; ";
  } else {
    croppingConstraint = "crop the head, hair, hands, or feet; let any partial limb enter from an image edge; ";
  }

  const noTextConstraint =
    "ABSOLUTELY NO TEXT IN THE IMAGE: no captions, names, titles, letters, words, numbers, typography, gibberish " +
    "lettering, name patches, brand names or logos (including on instruments, guitars, or equipment), shirt/clothing " +
    "typography, decorative pseudo-writing, or signage anywhere in the picture, including on maps, scrolls, banners, " +
    "signs, patches, placards, boards, or clothing — render every such surface as a clean, blank surface with no " +
    "marks on it. No watermarks, signatures, logos, frames, or borders.";

  const noAccessoryConstraint =
    "Do not add jewelry, necklaces, or any identity-changing accessory that is not explicitly part of the " +
    "specified outfit above.";

  return (
    "DO NOT: " +
    croppingConstraint +
    anatomyConstraint +
    "change the outfit at random from what's specified above; " +
    "use an extreme close-up unless specified; " +
    gutterRule +
    "or apply independent horizontal/vertical stretching. " +
    noAccessoryConstraint +
    " " +
    noTextConstraint
  );
}
