/**
 * Style rules — the shared art-direction block for every illustration built
 * through `buildIllustrationPrompt`. This is a trimmed, purpose-written sibling
 * of `config.ts`'s `ART_STYLE`: same substantive art direction (photoreal
 * child, painterly surroundings, framing, proportions, anatomy, no-text canvas,
 * tone), but with the likeness/identity paragraph removed — `identityRules()`
 * already owns that, so it isn't restated here. `config.ts`'s `ART_STYLE` is
 * left untouched for the templates that don't use this engine yet.
 */

export function styleRules(): string {
  return (
    "A high-end children's storybook picture in which THIS specific real child is " +
    "rendered PHOTOREALISTICALLY with authentic photographic realism. Render the child with fully photographic skin " +
    "(real texture and fine detail), eyes, and hair; the child must NEVER look " +
    "drawn, painted, illustrated, smoothed, or cartoonish, while the surrounding " +
    "environment features soft, painterly storybook artistry. This is NOT a flat cartoon, vector, clip-art, " +
    "coloring-book, anime, cel-shaded, or 3D-animated (Pixar-style) illustration: " +
    "avoid hard outlines, flat shading, and garish saturated colors. Light, " +
    "realistic painterly brushwork is fine for the SURROUNDINGS, but the child " +
    "stays crisply photographic; use realistic directional lighting, gentle " +
    "natural shadows, and true-to-life color. The child must be seamlessly integrated and lit by the " +
    "scene's own light with cast shadows that match the environment, so they genuinely belong " +
    "in the scene and never look pasted-on or like a realistic head on a cartoon " +
    "body. Use a shallow depth of field: the child is the sharp, crisp, " +
    "photographic focal point seen from a natural angle, while the background " +
    "falls gently into soft, painterly focus. " +
    "PROPORTIONS: use realistic, true-to-life body proportions for a young child — " +
    "the head is roughly one-fifth to one-sixth of standing height and sits naturally on a correctly sized body; " +
    "no big-head, bobblehead, chibi, funko, or caricature look. " +
    "Composition that leaves some calm, softly-focused background space. " +
    "Warm, friendly, and safe for young children."
  );
}

