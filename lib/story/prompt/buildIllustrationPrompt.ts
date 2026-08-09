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
  buildTargetFormatBlock,
  singlePageCompositionRules,
  spreadCompositionRules,
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
  const { child, story, scene, kind, layout, profileId, compositionNotes, light } = opts;

  const outfit = opts.outfitOverride ?? story.defaultOutfit;
  const companion =
    opts.companionOverride !== undefined
      ? opts.companionOverride
      : story.companion;

  const continuity = [wardrobeRules(outfit), companionRules(companion)]
    .filter(Boolean)
    .join(" ");

  const targetFormatBlock = buildTargetFormatBlock(profileId, layout, kind ?? "scene");

  const compositionRulesBlock =
    layout === "single-page"
      ? singlePageCompositionRules()
      : spreadCompositionRules(layout);

  const sceneBlock =
    `This is ${child.name}, a ${child.age}-year-old ${childNoun(child.gender)}. ` +
    `${scene}` +
    (light ? ` ${lightingClause(child.name, light)}` : "");

  const compositionNotesBlock = compositionNotes
    ? `SCENE-SPECIFIC COMPOSITION — ${compositionNotes}`
    : "";

  return [
    identityRules(),
    styleRules(),
    continuity,
    targetFormatBlock,
    compositionRulesBlock,
    sceneBlock,
    compositionNotesBlock,
    negativeRules(),
  ]
    .filter(Boolean)
    .join(" ");
}
