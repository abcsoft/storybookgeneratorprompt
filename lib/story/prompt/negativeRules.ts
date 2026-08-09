/**
 * Negative rules — one centralized "don't" list appended to the end of every
 * prompt built through `buildIllustrationPrompt`, instead of being restated
 * (inconsistently) inline by each story template.
 */

export function negativeRules(): string {
  return (
    "DO NOT: crop the head, hair, hands, or feet; let any partial limb enter " +
    "from an image edge; duplicate the child or the companion; draw extra " +
    "fingers, missing limbs, or distorted hands; change the outfit at random " +
    "from what's specified above; render any text, typography, logo, or " +
    "watermark anywhere in the image; place any important subject in the center " +
    "fold/gutter; or use an extreme close-up unless this scene explicitly asks " +
    "for one."
  );
}
