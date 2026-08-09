/**
 * The one-time master "character reference" portrait prompt — Step 0 of the
 * manual workflow. Lives here (not inside any one story template) because it's
 * shared by every book: `manifest.ts`, `orchestrator.ts`, and the prompts API
 * route all need it regardless of which story is selected.
 *
 * Kept simple on purpose (item 2): a plain head-and-shoulders identity shot,
 * not an artistic composition, so it's a reliable likeness anchor to attach
 * alongside every other page's prompt.
 */

import { childNoun } from "../textHelpers";
import type { ChildProfile } from "../types";

/** Prompt for the one-time master "character reference" portrait. */
export const CHARACTER_ANCHOR_STYLE =
  "Photorealistic, head-and-shoulders portrait of THIS specific real child, " +
  "facing forward or at a slight three-quarter angle, with a natural, relaxed " +
  "expression, evenly lit against a simple plain background. This is the MASTER " +
  "CHARACTER REFERENCE — its only job is facial likeness, not artistic " +
  "composition: capture the child's exact real face, skin tone, eye color, and " +
  "hair from the photos exactly as they are. No props, no costume, no exaggerated " +
  "storybook environment or background scenery. Do not cartoonify, stylize, age " +
  "up, or beautify. Square 1:1. No text, logos, or borders.";

/** The one-time master character-reference portrait prompt for a child. */
export function characterAnchorPrompt(c: ChildProfile): string {
  return (
    `${CHARACTER_ANCHOR_STYLE} This is ${c.name}, a ${c.age}-year-old ` +
    `${childNoun(c.gender)}.`
  );
}
