/**
 * Shared, story-agnostic builders for the two new universal page kinds every
 * `standard-24` StoryEdition needs: the personalized greeting (Page 1) and
 * the video-QR background (Page 24). Both route through the exact same
 * `buildIllustrationPrompt` engine as every other page — no new shared
 * identity/style/negative rules, no new global style lock.
 */

import { buildIllustrationPrompt } from "./prompt/buildIllustrationPrompt";
import type { ChildProfile } from "./types";
import type { StoryEditionScene } from "./storyEdition";

export interface StandardEditionStoryMeta {
  defaultOutfit?: string;
}

/**
 * Page 1 — a calm, theme-specific background or portrait composition with a
 * reserved text-safe area. The image model is NEVER asked to render the
 * greeting text itself; the application overlays personalized vector text
 * (see `greetingCopy`, kept fully configurable per call site).
 */
export function buildGreetingScene(
  storyMeta: StandardEditionStoryMeta,
  themeSceneDescription: string,
  greetingCopy: (child: ChildProfile) => string,
): StoryEditionScene {
  return {
    sceneId: "greeting",
    kind: "greeting",
    illustrationPrompt: (child, profileId) =>
      buildIllustrationPrompt({
        child,
        story: storyMeta,
        scene:
          `${themeSceneDescription} Reserve a calm, low-detail, uncluttered area in the lower portion of the ` +
          `frame as a text-safe region — the application will add a personalized greeting there later; do not ` +
          `render any words, letters, or greeting text in the image yourself.`,
        kind: "greeting",
        layout: "single-page",
        profileId,
      }),
    text: greetingCopy,
    legacyFilenames: [],
  };
}

/**
 * Page 24 — a story-themed, low-detail background reserving a large, clean
 * area for a QR code. The image model is NEVER asked to render a QR code or
 * any URL/link text — the application composites a deterministically
 * generated QR (see lib/story/qr.ts) over this background afterward.
 */
export function buildVideoQrScene(
  storyMeta: StandardEditionStoryMeta,
  themeSceneDescription: string,
): StoryEditionScene {
  return {
    sceneId: "video-qr",
    kind: "video-qr",
    illustrationPrompt: (child, profileId) =>
      buildIllustrationPrompt({
        child,
        story: storyMeta,
        scene:
          `${themeSceneDescription} This is a character-free background scene — do not include the child or any ` +
          `person in this image. Reserve a large, clean, plain, low-detail area in the RIGHT portion of the frame ` +
          `as a QR-safe region, kept well away from the trim and bleed edges — the application will add a scannable ` +
          `QR code there later. Do not render a QR code, barcode, or any URL, web address, or link text yourself.`,
        kind: "video-qr",
        layout: "single-page",
        profileId,
        outfitOverride: "",
      }),
    text: () => "",
    legacyFilenames: [],
  };
}
