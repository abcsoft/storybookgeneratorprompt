/**
 * The "Kindness Garden" storybook template.
 *
 * A brave little explorer finds a hidden, sleepy garden behind their house —
 * and, with a small rabbit friend named Pip, wakes it back to life one act of
 * kindness at a time: freeing a friend from brambles, watering wilted
 * flowers, sheltering from rain, and sharing seeds — until the whole garden
 * blooms for one big celebration.
 *
 * This story is built entirely on the shared prompt engine
 * (lib/story/prompt) — same as greatAdventureTemplate.ts. It defines ONLY
 * story metadata, scene text, scene layout/composition notes, and its own
 * wardrobe/companion — every identity, style, composition-safety, and
 * negative rule is inherited from buildIllustrationPrompt(), never repeated
 * here. Print geometry (aspect ratios, safe areas) comes from whichever
 * PrintProfile the manual workflow has selected — this template has no
 * opinion on it.
 *
 * Pure data + pure functions, so it is trivially unit-testable with no Gemini
 * or PDF involved.
 *
 * 14 page specs — cover, opening, 10 garden scenes, closing, back cover.
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

/** Pip, kept consistent page-to-page via the shared companion-rules block
 *  instead of being re-described by hand in every scene. */
const PIP: CompanionSpec = {
  name: "Pip",
  description: "a small fluffy grey-and-white rabbit with one floppy ear",
  consistencyRules:
    "same grey-and-white fur pattern, same one floppy ear, same size and " +
    "body proportions on every page — a single rabbit only, never " +
    "duplicated, never a different animal",
};

/** The standard garden-explorer outfit, worn on every page unless a scene
 *  opts into one of the special outfits below. */
const DEFAULT_OUTFIT =
  "a light yellow T-shirt, green cotton overalls, brown gardening gloves " +
  "tucked in one pocket, and light-brown ankle boots";

const SPECIAL_OUTFITS: Record<string, string> = {
  rain: "a bright yellow raincoat and matching yellow rain boots over the same green overalls",
  pajamas: "cozy pajamas — no overalls, gloves, or boots",
};

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: PIP };

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
  return (c: ChildProfile, profileId?: string): string =>
    buildIllustrationPrompt({
      child: c,
      story: STORY_META,
      scene,
      layout,
      profileId,
      compositionNotes: opts.compositionNotes,
      light: opts.light,
      outfitOverride: opts.outfitOverride,
      companionOverride: opts.companionOverride,
    });
}

/** One beat of the garden's awakening: the scene to illustrate and the verse. */
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
      "Kneeling beside a tangle of brambles behind an old wooden garden gate, " +
      "gently freeing Pip who is stuck by one paw, with a look of soft concern " +
      "turning to a happy smile; dappled morning light through overgrown leaves.",
    copy: (c) =>
      `Just behind the gate, ${c.name} heard a tiny frightened squeak. Caught ` +
      `in the brambles was a little rabbit — and with gentle hands, ${c.name} ` +
      `set the small friend free.`,
    light:
      "Soft dappled morning light filtering through overgrown leaves from the upper left, gently cool and diffuse; eye-level camera at kneeling height.",
  },
  {
    scene:
      "Tipping a small green watering can over a wilted, drooping sunflower in " +
      "a patch of dry earth, watching hopefully as a single drop catches the " +
      "light, with Pip sitting attentively beside them.",
    copy: (c) =>
      `The garden was full of sleepy, thirsty flowers. ${c.name} filled a ` +
      `little watering can and gave the tallest sunflower a careful drink.`,
    light:
      "Warm early-morning sun from the right, soft and golden over dry earth; eye-level camera at flower height.",
  },
  {
    scene:
      "Standing in a wide, wildflower meadow at the heart of the garden where " +
      "dozens of sleepy, closed flower buds wait in the grass, arms spread " +
      "wide in wonder at how much there still is to wake up, with Pip hopping " +
      "happily through the grass.",
    copy: (c, p) =>
      `Beyond the brambles lay a whole meadow of sleepy buds, waiting for ` +
      `${p.poss} kindness to help them bloom. ${cap(p.subj)} could hardly ` +
      `believe how big the garden really was.`,
    // Spread — placed so every spread starts on an even page (see lib/pdf/imposition.ts).
    spread: true,
    ink: "dark", // bright open meadow — dark text on a panel reads better than white
    light:
      "Bright open mid-morning daylight from above, warm and clear over the wildflowers; eye-level camera in the meadow grass.",
    compositionNotes:
      "keep the whole child and Pip comfortably inside the safe region with " +
      "nothing crossing the center gutter — this is a wide establishing shot, " +
      "not a close-up.",
  },
  {
    scene:
      "Carefully balancing across a wide, mossy fallen log over a small garden " +
      "stream, arms out for balance, guiding a little family of ladybugs " +
      "walking along the same log toward home, with Pip watching from the " +
      "near bank.",
    copy: (c) =>
      `A family of ladybugs had lost their way home across the stream. ` +
      `${c.name} balanced carefully along a mossy log, showing them the way, ` +
      `step by step.`,
    light:
      "Cool, dappled streamside light from the upper left, gently diffuse; eye-level camera at the log's height.",
    compositionNotes:
      "keep both of the child's hands and their head fully visible while " +
      "balancing — no arm or foot may leave the frame.",
  },
  {
    scene:
      "Kneeling in the grass helping a cheerful squirrel and a sparrow nail " +
      "together a small wooden birdhouse, holding a little wooden peg steady, " +
      "with Pip curiously sniffing a pile of wood shavings nearby.",
    copy: (c) =>
      `Next, a squirrel and a sparrow needed a hand building a new home. ` +
      `${c.name} held the little wooden pieces steady while they worked ` +
      `together.`,
    light:
      "Warm dappled afternoon light through the branches from the right; eye-level camera at kneeling height.",
  },
  {
    scene:
      "Sheltering from a gentle rain shower under a giant leaf held overhead " +
      "like an umbrella, smiling out at the falling raindrops with Pip tucked " +
      "close beside them; soft grey rain and a few puddles reflecting the sky.",
    copy: (c) =>
      `Then the sky turned soft and grey, and rain began to fall. ${c.name} ` +
      `and Pip ducked beneath a giant leaf, giggling as the raindrops pattered ` +
      `all around.`,
    outfitOverride: SPECIAL_OUTFITS.rain,
    light:
      "Soft overcast grey daylight, cool and even, with rain streaking gently through the air; eye-level camera under the leaf.",
  },
  {
    scene:
      "Crouching by a cluster of hedgehogs at the base of a hedge, opening a " +
      "small cloth pouch to share seeds and berries, with Pip nibbling a berry " +
      "of its own; warm dusk light settling over the garden.",
    copy: (c) =>
      `Near the hedge, a family of hedgehogs peeked out, hungry and shy. ` +
      `${c.name} knelt down and shared a pouch of seeds and berries with ` +
      `every one of them.`,
    light:
      "Warm golden dusk light from the low sun behind, soft and glowing; eye-level camera at hedgehog height.",
  },
  {
    scene:
      "Sitting alone and peaceful beneath a big blossoming tree at sunset, " +
      "writing happily in a small notebook with a stubby pencil, a quiet " +
      "moment of rest with a contented smile; golden light through the " +
      "blossoms above.",
    copy: (c, p) =>
      `As the sun dipped low, ${c.name} sat quietly beneath the blossoming ` +
      `tree, jotting down every new garden friend ${p.subj} had met that day.`,
    ink: "dark", // golden blossom light — dark text on a panel reads better than white
    light:
      "Warm golden sunset light filtering down through blossoms from above; eye-level camera beneath the tree.",
    // Pip is off napping nearby — a deliberate quiet solo beat, not every
    // scene needs the companion (see lib/story/prompt/companionRules.ts).
    companionOverride: null,
  },
  {
    scene:
      "Sharing the last handful of seeds with a wide-eyed baby fox at the edge " +
      "of the meadow, kneeling low and gentle, with Pip hopping over to greet " +
      "the new friend too; soft late-afternoon light.",
    copy: (c) =>
      `One last visitor came shyly out of the ferns — a baby fox. ${c.name} ` +
      `knelt down slowly and offered the very last of the seeds.`,
    light:
      "Soft, warm late-afternoon light from the right, gentle and diffuse; eye-level camera at kneeling height.",
  },
  {
    scene:
      "Standing in the center of the now fully bloomed meadow at golden hour, " +
      "arms raised in joy as flowers burst open in every color all around, " +
      "surrounded at a comfortable distance by the squirrel, sparrow, " +
      "hedgehogs, and baby fox, with Pip bouncing at their feet in delight.",
    copy: (c) =>
      `Every flower in the meadow burst into color at once! ${c.name}'s new ` +
      `friends gathered all around, and the whole garden sparkled with life.`,
    spread: true,
    ink: "dark", // bright golden bloom — dark text on a panel reads better than white
    light:
      "Bright warm golden-hour light from the low sun, glowing across the blooming meadow; eye-level camera among the flowers.",
    compositionNotes:
      "keep the child, Pip, and every garden friend safely inside the frame " +
      "with roughly a 10-12% margin from the outer edge — a wide celebratory " +
      "shot, never a close-up crop of any one animal.",
  },
];

/** The full ordered book: cover + opening + garden scenes + closing + back. */
const kindnessGardenPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "A wide cover hero scene at golden hour: standing on the RIGHT side of the " +
        "frame beside an old wooden garden gate, turned toward the viewer with a " +
        "big joyful smile, holding a small glowing seed in cupped hands, with a " +
        "glimpse of a blooming garden beyond the gate and Pip at their side. " +
        "Frame the child from about the waist up so the FACE IS LARGE, clear, and " +
        "front-facing (or a gentle three-quarter angle) toward the camera — the " +
        "face is the focal point and must unmistakably look like the real child " +
        "in the reference photos, with their hair exactly as in those photos.",
      {
        light:
          "Warm golden-hour light from the low sun, soft and glowing, lighting the child from the front; eye-level camera at the garden gate.",
        compositionNotes:
          "keep the entire LEFT side and the lower-left calm and open — soft sky " +
          "and gentle garden scenery with no part of the child there — so a " +
          "large title can sit in the lower-left without covering the child.",
      },
    ),
    text: (c) => `${c.name}'s Kindness Garden`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "In a sunny backyard, crouching to peer through a gap in an old wooden " +
        "fence at a hidden, overgrown garden gate glowing faintly, a small " +
        "glowing seed resting in one open hand, with Pip peeking through the " +
        "gap too; soft warm daylight.",
      {
        spread: true,
        light:
          "Soft warm midday light from the upper right, gentle and clear; eye-level camera at crouching height by the fence.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `One sunny afternoon, ${c.name} found a tiny glowing seed behind the ` +
        `garden fence — and just beyond it, an old gate ${p.subj} had never ` +
        `noticed before. ${cap(p.poss)} kindest adventure was about to begin!`
      );
    },
  },
  // 9 garden scenes
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
    ink: "dark", // verse sits on the pale bedroom (left leaf) — dark text on a panel reads better
    illustrationPrompt: illustration(
      "Tucked cozily in bed at night in a warm bedroom, with the small seed now " +
        "grown into a single glowing flower resting on the windowsill and Pip " +
        "asleep at the foot of the bed; soft moonlight and a peaceful, happy smile.",
      {
        spread: true,
        light:
          "Soft cool blue moonlight from the window plus the flower's warm glow; eye-level camera beside the bed.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} climbed into bed, tired and happy.\n\n` +
        `The little garden was wide awake now, all because of ${p.poss} ` +
        `kindness. Pip curled up close by, and with a warm smile, ${c.name} ` +
        `drifted off to sleep, dreaming of tomorrow's garden friends.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile and a small watering can, with " +
        "Pip beside them, against a soft simple pastel sky with a few gentle " +
        "flowers drifting by.",
    ),
    text: (c) =>
      `The End…\n...but ${c.name}'s garden will keep growing, one kindness at a time.`,
  },
];

/** The "Kindness Garden" book, ready to register in `registry.ts`. */
export const kindnessGardenBook: StoryTemplate = {
  id: "kindness-garden",
  title: "Kindness Garden",
  subtitle: "A gentle little explorer wakes a hidden garden with kindness.",
  pages: kindnessGardenPages,
  defaultOutfit: DEFAULT_OUTFIT,
  specialOutfits: SPECIAL_OUTFITS,
  companion: PIP,
};
