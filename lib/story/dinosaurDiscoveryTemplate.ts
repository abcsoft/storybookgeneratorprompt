/**
 * The "Dinosaur Discovery" storybook template.
 *
 * A curious child finds a glowing fossil stone in the garden and follows it
 * through a hidden path into a lush, misty prehistoric valley — where a baby
 * dinosaur named Sprout needs a friend. Together they explore waterfalls and
 * giant ferns, watch gentle giants drink at a quiet pool, and follow an old
 * trail of fossil markings to Sprout's nesting ground, where the child
 * discovers the real treasure was the friendship all along.
 *
 * Built entirely on the shared prompt engine (lib/story/prompt) — same as
 * greatAdventureTemplate.ts and kindnessGardenTemplate.ts. This file defines
 * ONLY story metadata, scene text, layout, scene-specific composition notes,
 * and its own wardrobe/companion — every identity, style, composition-safety,
 * and negative rule is inherited from buildIllustrationPrompt(), never
 * repeated here. Print geometry comes from whichever PrintProfile the manual
 * workflow has selected — this template has no opinion on it.
 *
 * Dinosaurs are majestic and gentle, never predatory or frightening — large
 * dinosaurs always stay a safe, calm distance away (see compositionNotes
 * below), matching the "no threatening predator attacks" brief.
 *
 * 14 page specs — cover, opening, 10 valley scenes, closing, back cover.
 */

import { buildIllustrationPrompt } from "./prompt/buildIllustrationPrompt";
import { cap, pronouns, type Pronouns } from "./textHelpers";
import type {
  ChildProfile,
  CompanionSpec,
  LayoutType,
  PageKind,
  PageSpec,
  StoryTemplate,
} from "./types";

/** Sprout, kept consistent page-to-page via the shared companion-rules block
 *  instead of being re-described by hand in every scene. */
const SPROUT: CompanionSpec = {
  name: "Sprout",
  description:
    "a small friendly baby long-neck dinosaur with soft green-and-yellow " +
    "speckled skin and big gentle eyes",
  consistencyRules:
    "same green-and-yellow speckled skin pattern, same short stubby tail, " +
    "same size (about knee-height to the child) and body proportions on " +
    "every page — a single baby dinosaur only, never duplicated, never a " +
    "different species or a fully grown dinosaur",
};

/** The standard explorer outfit, worn on every page unless a scene opts into
 *  the keepsake-night variant below. */
const DEFAULT_OUTFIT =
  "a mustard-yellow T-shirt, an olive-green explorer vest with lots of little " +
  "pockets, brown cargo shorts, sturdy brown lace-up boots, and a small " +
  "canvas satchel across one shoulder";

const SPECIAL_OUTFITS: Record<string, string> = {
  pajamas: "cozy pajamas — no vest, satchel, or boots",
};

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: SPROUT };

/** Build a full illustration prompt through the shared prompt engine. */
function illustration(
  scene: string,
  opts: {
    light?: string;
    spread?: boolean;
    kind?: PageKind;
    compositionNotes?: string;
    outfitOverride?: string;
    companionOverride?: CompanionSpec | null;
  } = {},
) {
  const baseLayout: LayoutType = opts.spread ? "text-left-subject-right" : "single-page";
  return (
    c: ChildProfile,
    profileId?: string,
    overrides?: {
      layout?: LayoutType;
      textSide?: "left" | "right" | "none";
      subjectSide?: "left" | "right" | "centered";
    },
  ): string =>
    buildIllustrationPrompt({
      child: c,
      story: STORY_META,
      scene,
      kind: opts.kind ?? "scene",
      layout: overrides?.layout ?? baseLayout,
      textSide: overrides?.textSide,
      subjectSide: overrides?.subjectSide,
      profileId,
      compositionNotes: opts.compositionNotes,
      light: opts.light,
      outfitOverride: opts.outfitOverride,
      companionOverride: opts.companionOverride,
    });
}

/** One beat of the valley journey: the scene to illustrate and the verse. */
interface Beat {
  scene: string;
  copy: (c: ChildProfile, p: Pronouns) => string;
  spread?: boolean;
  ink?: "light" | "dark";
  light?: string;
  compositionNotes?: string;
  outfitOverride?: string;
  companionOverride?: CompanionSpec | null;
}

const STORY: Beat[] = [
  {
    scene:
      "Kneeling in a sunny backyard garden, brushing soil away from a smooth " +
      "stone embossed with a distinct three-toed dinosaur footprint fossil " +
      "that glows faintly with warm golden light, eyes wide with wonder; a " +
      "garden trowel resting nearby on the soil.",
    copy: (c) =>
      `Half-buried by the old garden wall, ${c.name} found a smooth stone ` +
      `embossed with an ancient three-toed footprint. It felt warm — and ` +
      `for just a moment, it seemed to glow with a gentle golden light.`,
    light:
      "Warm mid-morning sunlight from the upper right, clear and gentle; eye-level camera at kneeling height in the garden.",
    companionOverride: null,
  },
  {
    scene:
      "Following the glowing three-toed fossil stone's soft light toward a " +
      "gap behind a mossy old rockery, where a hidden path now stands open, " +
      "misty green light spilling out; one hand holding the stone up, the " +
      "other pushing aside a curtain of ivy.",
    copy: (c, p) =>
      `The glow led ${p.obj} straight to the garden wall — where a path ` +
      `${p.subj} had never noticed before now stood open, curling away into ` +
      `misty green light.`,
    light:
      "Soft, cool, misty green-tinted light glowing from the hidden path ahead; eye-level camera at the garden wall.",
    companionOverride: null,
  },
  {
    scene:
      "Stepping through the hidden path into a breathtaking, lush prehistoric " +
      "valley full of towering ferns, dripping moss, and distant waterfalls " +
      "tumbling down green cliffs, arms slightly open in amazement at the " +
      "sheer size and beauty of it all.",
    copy: (c) =>
      `And then — a whole hidden world! Giant ferns swayed overhead, and far ` +
      `away, waterfalls tumbled down green cliffs into a valley more ` +
      `beautiful than ${c.name} could have dreamed.`,
    spread: true,
    ink: "dark",
    light:
      "Bright, soft midday light filtering through mist and canopy, fresh and green; wide eye-level camera at the valley entrance.",
    compositionNotes:
      "wide establishing shot — keep the whole child comfortably inside the " +
      "safe region with nothing crossing the center gutter; the valley scale " +
      "should feel vast without shrinking the child to a speck.",
    companionOverride: null,
  },
  {
    scene:
      "Gently lifting a giant fallen fern leaf off Sprout, a small baby " +
      "dinosaur tangled underneath, freeing it with careful hands; Sprout's " +
      "big eyes blinking up gratefully.",
    copy: (c) =>
      `A soft chirp came from beneath a fallen fern leaf. Underneath was a ` +
      `small dinosaur, tangled and scared. ${c.name} lifted the leaf away, ` +
      `gentle and slow, until the little dinosaur was free.`,
    light:
      "Soft dappled forest light through the fern canopy from above; eye-level camera at ground height.",
  },
  {
    scene:
      "Trotting happily alongside Sprout along a winding fern-lined trail, " +
      "both looking back and forth with playful curiosity, brushing past " +
      "giant curling fern fronds taller than themselves.",
    copy: (c) =>
      `From then on, Sprout would not leave ${c.name}'s side. Together they ` +
      `trotted down the fern trail, ducking under giant curling leaves ` +
      `twice as tall as they were.`,
    light:
      "Bright, fresh green midday light filtering through fern fronds; eye-level camera on the trail.",
  },
  {
    scene:
      "Standing at the edge of a clear waterfall pool, pointing up in delight " +
      "at a family of huge, gentle long-neck dinosaurs drinking peacefully " +
      "far across the water, Sprout pressed close beside them.",
    copy: (c) =>
      `Across the pool, enormous long-necked dinosaurs bent to drink, calm ` +
      `and gentle as old friends. ${c.name} watched, amazed at how such huge ` +
      `giants could be so peaceful.`,
    ink: "dark",
    light:
      "Cool, bright, misty light near the waterfall spray, soft blue-green tones; eye-level camera at the pool's edge.",
    compositionNotes:
      "keep the large dinosaurs safely in the background, calm and distant " +
      "across the pool — the child and Sprout stay the clear, readable " +
      "foreground focus; no dinosaur crowds or looms over them.",
  },
  {
    scene:
      "Crouching to comfort Sprout, who has backed away nervously from the " +
      "waterfall's spray and mist with its stubby tail tucked low, offering " +
      "a reassuring hand; the waterfall roaring softly in the background.",
    copy: (c, p) =>
      `But the waterfall's roar frightened Sprout, who backed away, shaking. ` +
      `"It's alright," ${p.subj} said softly, and knelt down until Sprout's ` +
      `shaking stopped.`,
    light:
      "Soft cool light with a faint rainbow in the waterfall's mist; eye-level camera at crouching height near the falls.",
  },
  {
    scene:
      "Standing together before a tall mossy rock wall at the end of an " +
      "ancient stone path, gently tracing an etched three-toed footprint " +
      "marking on the rock surface with one finger while holding the " +
      "matching glowing fossil stone in the other hand; Sprout stands " +
      "quietly beside the child, looking up at the wall carving with " +
      "recognized delight. The stone trail winds away into the background.",
    copy: (c) =>
      `Now brave again, Sprout hopped along an old stone trail — straight ` +
      `to a wall carved with the very same three-toed footprint as ` +
      `${c.name}'s glowing fossil stone. This was the secret gateway to ` +
      `Sprout's family nesting ground.`,
    light:
      "Warm, dusty late-afternoon light slanting across the stone trail and wall; eye-level camera on the path.",
  },
  {
    scene:
      "Arriving at a wide, warm nesting ground tucked among the rocks, full of " +
      "large gentle nests and dinosaur parents greeting Sprout with soft " +
      "rumbling sounds, Sprout bounding joyfully toward its family while the " +
      "child watches with a warm, happy smile.",
    copy: (c) =>
      `Beyond the wall lay a wide, warm nesting ground — Sprout's family, ` +
      `waiting all along. Sprout bounded toward them, and ${c.name}'s heart ` +
      `felt as full as the whole valley.`,
    light:
      "Warm golden-hour light settling over the nesting ground; eye-level camera at the nesting ground.",
    compositionNotes:
      "keep the parent dinosaurs calm, gentle, and at a comfortable middle " +
      "distance — a warm family gathering, not a crowd looming over the " +
      "child; Sprout stays the clear foreground focus.",
  },
  {
    scene:
      "Standing on a high ridge at sunset overlooking the whole golden " +
      "valley, waving a fond farewell as Sprout nuzzles the child's hand " +
      "in thanks before rejoining its dinosaur family below; the child holds " +
      "the glowing three-toed fossil stone, ready to follow the path back " +
      "toward the garden gate.",
    copy: (c, p) =>
      `From the ridge at sunset, ${c.name} waved a fond farewell to Sprout ` +
      `and the gentle herd. Following the fossil stone's warm glow back ` +
      `through the secret path to the garden gate, ${p.subj} knew the real ` +
      `treasure was the friendship they had shared.`,
    spread: true,
    ink: "dark",
    light:
      "Warm golden sunset light glowing across the whole valley from the low sun; wide eye-level camera on the ridge.",
    compositionNotes:
      "the distant grazing dinosaurs stay small silhouettes in the deep " +
      "background — Sprout and the child remain the large, clear foreground " +
      "focus on the right side of the spread, comfortably inside the safe " +
      "region.",
  },
];

/** The full ordered book: cover + opening + valley scenes + closing + back. */
const dinosaurDiscoveryPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "A wide cover hero scene at golden hour: standing on the RIGHT side of the " +
        "frame at the misty entrance to a prehistoric valley, turned toward the " +
        "viewer with a big joyful smile, holding up a glowing three-toed fossil stone, " +
        "with Sprout at their side and giant ferns and distant waterfalls " +
        "softly visible beyond. Frame the child from about the waist up so the " +
        "FACE IS LARGE, clear, and front-facing (or a gentle three-quarter " +
        "angle) toward the camera — the face is the focal point and must " +
        "unmistakably look like the real child in the reference photos, with " +
        "their hair exactly as in those photos.",
      {
        kind: "cover",
        light:
          "Warm golden-hour light from the low sun, soft and glowing, lighting the child from the front; eye-level camera at the valley entrance.",
        compositionNotes:
          "keep the lower portion calm and open — soft " +
          "misty valley scenery with no part of the child there — so a large " +
          "title can sit in the lower area without covering the child.",
      },
    ),
    text: (c) => `${c.name}'s Dinosaur Discovery`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "In a sunny backyard, kneeling on the green lawn beside an old stone garden " +
        "wall with a small trowel in hand, curiously inspecting leafy green plants " +
        "and peering under flowerbeds with lively wonder; a garden gate and flower " +
        "beds in the soft background.",
      {
        kind: "intro",
        spread: true,
        companionOverride: null,
        light:
          "Warm midday sunlight from the upper right, clear and bright; eye-level camera at kneeling height in the garden.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} always looked closer than everyone else — under rocks, ` +
        `behind bushes, into every curious corner. ${cap(p.subj)} never ` +
        `expected that a quiet afternoon in the garden would lead to a ` +
        `real, glowing adventure from the past.`
      );
    },
  },
  // 10 valley scenes
  ...STORY.map(
    (b): PageSpec => ({
      kind: "scene",
      spread: b.spread,
      ink: b.ink,
      layout: b.spread ? "text-left-subject-right" : "single-page",
      illustrationPrompt: illustration(b.scene, {
        kind: "scene",
        light: b.light,
        spread: b.spread,
        compositionNotes: b.compositionNotes,
        outfitOverride: b.outfitOverride,
        companionOverride: b.companionOverride,
      }),
      text: (c) => b.copy(c, pronouns(c.gender)),
    }),
  ),
  // Closing
  {
    kind: "closing",
    spread: true,
    layout: "text-left-subject-right",
    ink: "dark",
    illustrationPrompt: illustration(
      "Tucked cozily in bed at night in a warm bedroom with hands resting " +
        "peacefully on top of the folded quilt, smiling softly toward the " +
        "wooden bedside table where the smooth three-toed fossil stone rests and " +
        "glows with a gentle golden warmth; soft blue moonlight filters through " +
        "the bedroom window.",
      {
        kind: "closing",
        spread: true,
        light:
          "Soft cool blue moonlight from the window plus the fossil stone's warm glow on the nightstand; eye-level camera beside the bed.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
        companionOverride: null,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} was home, safe and warm.\n\n` +
        `On the nightstand, the little three-toed fossil stone glowed on, a quiet ` +
        `reminder of a hidden valley and a small green friend far away. ` +
        `With a smile, ${c.name} closed ${p.poss} eyes, already dreaming of ` +
        `the next great discovery.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile, holding up the small glowing " +
        "three-toed fossil stone, against a soft simple pastel sky with the faint " +
        "silhouette of gentle long-neck dinosaurs in the far distance.",
      { kind: "backcover", companionOverride: null },
    ),
    text: (c) =>
      `The End…\n...but somewhere, a hidden valley remembers a friend named ${c.name}.`,
  },
];

/** The "Dinosaur Discovery" book, ready to register in `registry.ts`. */
export const dinosaurDiscoveryBook: StoryTemplate = {
  id: "dinosaur-discovery",
  title: "Dinosaur Discovery",
  subtitle: "A curious explorer finds a hidden valley and a small dinosaur friend.",
  pages: dinosaurDiscoveryPages,
  defaultOutfit: DEFAULT_OUTFIT,
  specialOutfits: SPECIAL_OUTFITS,
  companion: SPROUT,
};
