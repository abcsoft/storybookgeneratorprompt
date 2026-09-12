/**
 * The central prompt builder — the one place that assembles a full Gemini
 * illustration prompt out of the reusable rule blocks, so no story template
 * has to hand-write (and re-repeat) the full identity/style/wardrobe/companion/
 * composition/negative stack itself.
 *
 * Assembly order: identity -> continuity (wardrobe + companion) -> style ->
 * print composition rules -> the story-specific scene (kept prominent, its own
 * paragraph, stated verbatim) -> scene-specific composition notes -> negative
 * rules. Each block function already returns "" when it doesn't apply, so
 * empty blocks disappear rather than leaving stray whitespace/joins.
 */

import { childNoun } from "../textHelpers";
import type { ChildProfile, CompanionSpec, LayoutType, PageKind } from "../types";
import { companionRules } from "./companionRules";
import {
  buildFramingBlock,
  buildTargetFormatBlock,
  inferFramingMode,
  singlePageCompositionRules,
  spreadCompositionRules,
  type FramingMode,
} from "./compositionRules";
import { identityRules } from "./identityRules";
import { negativeRules } from "./negativeRules";
import { styleRules } from "./styleRules";
import { wardrobeRules } from "./wardrobeRules";

export interface BuildIllustrationPromptOptions {
  child: ChildProfile;
  /** The story's continuity defaults — outfit and companion. */
  story: {
    defaultOutfit?: string;
    companion?: CompanionSpec;
  };
  /** The scene description. Stays prominent and verbatim — this is what Gemini
   *  should follow most closely. */
  scene: string;
  kind?: PageKind;
  layout: LayoutType;
  /** Explicit framing mode override if desired */
  framing?: FramingMode;
  /** Optional text side placement for spreads ("left" | "right" | "none"). */
  textSide?: "left" | "right" | "none";
  /** Optional subject side placement for spreads ("left" | "right" | "centered"). */
  subjectSide?: "left" | "right" | "centered";
  /** Optional print profile ID to generate profile-specific target format guidance. */
  profileId?: string;
  /** Scene-specific composition guidance (e.g. "keep the pointing hand fully
   *  inside frame"), appended right after the scene. */
  compositionNotes?: string;
  /** This scene's own light + camera, so the child is lit/framed to match it
   *  (kills the "pasted-on" composite look). */
  light?: string;
  /** Overrides `story.defaultOutfit` for this page only (e.g. winter gear). */
  outfitOverride?: string;
  /** Overrides `story.companion` for this page only; `null` = no companion here. */
  companionOverride?: CompanionSpec | null;
  /** Optional override for the entire art style block (e.g. for sign text exceptions on back cover). */
  styleOverride?: string;
}

/** "match the child's light" clause — the biggest lever against a pasted-on
 *  composite is matching light direction/temperature and camera angle. */
function lightingClause(name: string, light: string): string {
  return (
    `LIGHTING & CAMERA — match the child to the scene so the composite never ` +
    `looks pasted-on: ${light} Light ${name} with exactly this light (same ` +
    `direction, color temperature, and softness) and matching shadows, and frame ` +
    `${name} at this same camera angle and horizon line.`
  );
}

export function buildIllustrationPrompt(
  opts: BuildIllustrationPromptOptions,
): string {
  const { child, story, scene, kind, layout, textSide, profileId, compositionNotes, light, styleOverride } = opts;

  const companion =
    opts.companionOverride !== undefined
      ? opts.companionOverride
      : story.companion;

  // 1. Identity / reference contract
  const identityBlock = identityRules();

  // 2. Exact resolved output contract
  const targetFormatBlock = buildTargetFormatBlock(profileId, layout, kind ?? "scene");

  // 3. Scene action and required objects
  const sceneBlock = `This is ${child.name}, a ${child.age}-year-old ${childNoun(child.gender)}. ${scene}`;

  // 6. One framing block
  const framing = inferFramingMode(scene, kind, opts.framing);
  const framingBlock = buildFramingBlock(framing);

  let outfit = opts.outfitOverride ?? story.defaultOutfit;
  if (
    (framing === "sleeping/bed-covered" || framing === "bed-covered" || framing === "seated-in-bed") &&
    outfit
  ) {
    if (/slippers|shoes|boots/i.test(outfit) && !/beside the bed|not worn|without/i.test(outfit)) {
      outfit = outfit
        .replace(/,?\s*and cozy slippers/gi, " (slippers are placed beside the bed on the floor and are not worn or visible under the covers)")
        .replace(/,?\s*and slippers/gi, " (slippers are placed beside the bed on the floor and are not worn or visible under the covers)");
    }
  }

  // 4. Outfit / prop state
  const outfitBlock = wardrobeRules(outfit);

  // 5. Companion state (entities)
  const companionBlock = companionRules(companion);

  // 7. One composition block (safe areas, margins, gutter, crop safety)
  const compositionRulesBlock =
    layout === "single-page"
      ? singlePageCompositionRules(framing)
      : spreadCompositionRules(layout, textSide, opts.subjectSide, framing);

  const sanitizedNotes =
    layout === "single-page" && compositionNotes
      ? compositionNotes
          .replace(/with nothing crossing the center gutter[;, —-]*/gi, "")
          .replace(/, nothing crossing the center gutter if rendered as a[;, —-]*/gi, "")
          .replace(/or the center gutter[;, —-]*/gi, "")
          .replace(/the center gutter[;, —-]*/gi, "")
          .trim()
      : compositionNotes;

  const compositionNotesBlock = sanitizedNotes
    ? `SCENE-SPECIFIC COMPOSITION — ${sanitizedNotes}`
    : "";

  const compositionBlock = [compositionRulesBlock, compositionNotesBlock]
    .filter(Boolean)
    .join(" ");

  // 8. Visual style and lighting
  const styleBlock = [
    styleOverride ?? styleRules(),
    light ? lightingClause(child.name, light) : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 9. One concise negative block (containing the single typography / no-text prohibition)
  const hasCustomSignPolicy = Boolean(
    styleOverride &&
      (styleOverride.includes("TYPOGRAPHY EXCEPTION") ||
        styleOverride.includes("SIGN ONLY") ||
        styleOverride.includes("ABSOLUTELY NO TEXT IN THE ARTWORK")),
  );

  let negativeBlock = negativeRules(layout !== "single-page", framing);
  if (hasCustomSignPolicy) {
    negativeBlock = negativeBlock.replace(
      /ABSOLUTELY NO TEXT IN THE IMAGE:[\s\S]*$/,
      "",
    ).trim();
  }

  return [
    identityBlock,
    targetFormatBlock,
    sceneBlock,
    outfitBlock,
    companionBlock,
    framingBlock,
    compositionBlock,
    styleBlock,
    negativeBlock,
  ]
    .filter(Boolean)
    .join(" ");
}

