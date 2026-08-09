/**
 * Wardrobe continuity — turns a plain-English outfit description into a "wear
 * the SAME outfit every page" instruction. The generic engine never hardcodes
 * any one book's outfit (see item 3): a story opts in via `defaultOutfit` /
 * `specialOutfits` on its `StoryTemplate`, or a page overrides it for a
 * scene-specific costume via `optionalOutfit`.
 */

export function wardrobeRules(outfit?: string): string {
  if (!outfit) return "";
  return (
    `WARDROBE CONTINUITY — the child wears the SAME outfit as every other page ` +
    `unless this scene calls for a different one: ${outfit}. Keep this exact ` +
    `outfit, unchanged, in this picture.`
  );
}
