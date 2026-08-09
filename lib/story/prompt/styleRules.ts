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
    "shown PHOTOREALISTICALLY — like an actual photograph of the real child placed " +
    "into a softly painted scene. Render the child with fully photographic skin " +
    "(real texture and fine detail), eyes, and hair; the child must NEVER look " +
    "drawn, painted, illustrated, smoothed, or cartoonish, and only the surrounding " +
    "scenery may be softly painterly. This is NOT a flat cartoon, vector, clip-art, " +
    "coloring-book, anime, cel-shaded, or 3D-animated (Pixar-style) illustration: " +
    "avoid hard outlines, flat shading, and garish saturated colors. Light, " +
    "realistic painterly brushwork is fine for the SURROUNDINGS, but the child " +
    "stays crisply photographic; use realistic directional lighting, gentle " +
    "natural shadows, and true-to-life color. The child must be lit by the " +
    "scene's own light and cast shadows that match it, so they genuinely belong " +
    "in the scene and never look pasted-on or like a realistic head on a cartoon " +
    "body. Use a shallow depth of field: the child is the sharp, crisp, " +
    "photographic focal point seen from a natural angle, while the background " +
    "falls gently into soft, painterly focus. FRAMING: show the child as a " +
    "natural medium shot from a slight distance — head TOGETHER WITH the upper " +
    "body and arms visible and active within the scene, at a believable scale " +
    "(like a real young child playing in the scene). Do NOT crop in tight on the " +
    "face. PROPORTIONS: use realistic, true-to-life body proportions for a young " +
    "child — the head is roughly one-fifth to one-sixth of the standing height " +
    "and sits naturally on a correctly sized body; no big-head, bobblehead, " +
    "chibi, funko, or caricature look. ANATOMY: correct human anatomy only — " +
    "exactly two arms and two hands (five fingers each) and two legs; never add " +
    "a third arm or hand, and never duplicate, merge, or distort limbs or " +
    "fingers. Composition that leaves some calm, softly-focused background " +
    "space where a short line of text will be added later by the layout software. " +
    "ABSOLUTELY NO TEXT IN THE IMAGE: no captions, names, titles, letters, " +
    "words, numbers, or gibberish lettering anywhere in the picture, including " +
    "on maps, scrolls, banners, signs, or clothing — leave every such surface " +
    "blank. No watermarks, signatures, logos, frames, or borders. Warm, " +
    "friendly, and safe for young children."
  );
}
