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
    compositionNotes?: string;
    outfitOverride?: string;
    companionOverride?: CompanionSpec | null;
  } = {},
) {
  const layout: LayoutType = opts.spread ? "text-left-subject-right" : "single-page";
  return (c: ChildProfile): string =>
    buildIllustrationPrompt({
      child: c,
      story: STORY_META,
      scene,
      layout,
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
      "Kneeling in a sunny backyard garden, brushing soil away from a smooth, " +
      "fossil-shaped stone that glows faintly, eyes wide with wonder; a garden " +
      "trowel resting nearby.",
    copy: (c) =>
      `Half-buried by the old garden wall, ${c.name} found a smooth stone ` +
      `shaped like a footprint. It felt warm — and for just a moment, it ` +
      `seemed to glow.`,
    light:
      "Warm mid-morning sunlight from the upper right, clear and gentle; eye-level camera at kneeling height in the garden.",
  },
  {
    scene:
      "Following the glowing stone's soft light toward a gap behind a mossy " +
      "old rockery, where a hidden path now stands open, misty green light " +
      "spilling out; one hand holding the stone up, the other pushing aside a " +
      "curtain of ivy.",
    copy: (c, p) =>
      `The glow led ${p.obj} straight to the garden wall — where a path ` +
      `${p.subj} had never noticed before now stood open, curling away into ` +
      `misty green light.`,
    light:
      "Soft, cool, misty green-tinted light glowing from the hidden path ahead; eye-level camera at the garden wall.",
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
      "Following a trail of ancient fossil footprints pressed into a long flat " +
      "stone path, Sprout hopping happily from print to print, arriving " +
      "together at a tall rock wall etched with a carved marking that matches " +
      "the shape of the glowing stone from home, tracing it with one finger; " +
      "Sprout looking up at the same marking with recognition.",
    copy: (c) =>
      `Now brave again, Sprout hopped from footprint to footprint along an ` +
      `old stone trail — straight to a wall carved with the very same shape ` +
      `as ${c.name}'s glowing fossil. This was the way home.`,
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
      "Standing on a high ridge at sunset overlooking the whole valley, " +
      "silhouettes of peaceful long-neck dinosaurs grazing far below against " +
      "a glowing golden-orange sky, Sprout beside them nuzzling their hand in " +
      "thanks before returning to its family.",
    copy: (c, p) =>
      `From the ridge, ${c.name} looked out over the whole golden valley one ` +
      `last time. The real treasure, ${p.subj} realized, wasn't gold at all ` +
      `— it was the friend standing right beside them.`,
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
        "viewer with a big joyful smile, holding up a glowing fossil stone, " +
        "with Sprout at their side and giant ferns and distant waterfalls " +
        "softly visible beyond. Frame the child from about the waist up so the " +
        "FACE IS LARGE, clear, and front-facing (or a gentle three-quarter " +
        "angle) toward the camera — the face is the focal point and must " +
        "unmistakably look like the real child in the reference photos, with " +
        "their hair exactly as in those photos.",
      {
        light:
          "Warm golden-hour light from the low sun, soft and glowing, lighting the child from the front; eye-level camera at the valley entrance.",
        compositionNotes:
          "keep the entire LEFT side and the lower-left calm and open — soft " +
          "misty valley scenery with no part of the child there — so a large " +
          "title can sit in the lower-left without covering the child.",
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
      "In a sunny backyard, kneeling beside a garden wall with a small trowel " +
        "and a glowing fossil-shaped stone held up to the light, a look of " +
        "pure curiosity; a garden gate and flower beds in the background.",
      {
        spread: true,
        light:
          "Warm midday sunlight from the upper right, clear and bright; eye-level camera at kneeling height in the garden.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} always looked closer than everyone else — under rocks, ` +
        `behind bushes, into every curious corner. ${cap(p.subj)} never ` +
        `expected to find a real, glowing piece of the past.`
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
      "Tucked cozily in bed at night in a warm bedroom, gently turning the " +
        "small fossil stone over in one hand as it glows softly on the " +
        "nightstand, a peaceful happy smile; soft moonlight through the window.",
      {
        spread: true,
        light:
          "Soft cool blue moonlight from the window plus the fossil stone's warm glow; eye-level camera beside the bed.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
        companionOverride: null,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} was home, safe and warm.\n\n` +
        `On the nightstand, the little fossil stone glowed on, a quiet ` +
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
        "fossil stone, against a soft simple pastel sky with the faint " +
        "silhouette of gentle long-neck dinosaurs in the far distance.",
      { companionOverride: null },
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
