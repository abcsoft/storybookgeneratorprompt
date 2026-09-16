/**
 * Identity rules — the single place that says "match the real child" for any
 * prompt built through `buildIllustrationPrompt`. Stated once, strongly, up
 * front; nothing else in the assembled prompt repeats it (see styleRules.ts).
 */

export function identityRules(): string {
  return (
    "IDENTITY FIRST — match the real child in the attached reference photos " +
    "exactly: the same face, the same facial proportions, the same eye color, and " +
    "the same hair (its real style, length, texture, and color); do not reshape " +
    "the face, change its proportions, or change the hair, and keep the likeness " +
    "clear even when the child is small in the scene. Identity and likeness take " +
    "priority over the art style below — never sacrifice the child's real face or " +
    "hair for the styling. Distinguish immutable identity traits (facial anatomy, eyes, skin tone, hair texture/color) from mutable scene states: the child's lighting angle, illumination brightness, clothing/costume, and location change naturally per scene without altering the child's underlying facial identity or permanent features."
  );
}
