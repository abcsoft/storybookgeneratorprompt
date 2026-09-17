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
  PageKind,
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
      "a patch of dry earth, and gently watering the tiny glowing seed planted safely " +
      "in a small clay pot to take home, watching hopefully as a single drop catches the " +
      "light, with Pip sitting attentively beside them.",
    copy: (c) =>
      `The garden was full of sleepy, thirsty flowers. ${c.name} planted the ` +
      `glowing seed in a warm little pot of earth to take home, and gave the tallest sunflower a careful drink.`,
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
      "Now back in familiar green overalls after the rain clears, crouching by a " +
      "cluster of hedgehogs at the base of a hedge, opening a small cloth pouch " +
      "to share seeds and berries, with Pip nibbling a berry of its own; warm " +
      "late-afternoon light filtering through damp leaves.",
    copy: (c) =>
      `The rain cleared, leaving the air fresh and sweet. Near the hedge, a family of ` +
      `hedgehogs peeked out, hungry and shy. ${c.name} knelt down and shared a pouch of ` +
      `seeds and berries with every one of them.`,
    light:
      "Warm golden late-afternoon sunlight from the low sun behind, soft and glowing on damp leaves; eye-level camera at hedgehog height.",
  },
  {
    scene:
      "Sitting peacefully beneath a big blossoming tree at sunset, drawing " +
      "picture sketches of the garden animals in a small notebook with a stubby " +
      "pencil, a quiet moment of rest with a contented smile; golden sunset light " +
      "through the blossoms above.",
    copy: (c, p) =>
      `As the sun dipped low, ${c.name} sat quietly beneath the blossoming ` +
      `tree, sketching picture portraits of every new garden friend ${p.subj} had met that day.`,
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
      "the new friend too; soft warm dusk light settling over the grass.",
    copy: (c) =>
      `One last visitor came shyly out of the ferns at dusk — a baby fox. ${c.name} ` +
      `knelt down slowly and offered the very last of the seeds.`,
    light:
      "Soft, warm dusk light from the low horizon, gentle and diffuse; eye-level camera at kneeling height.",
  },
  {
    scene:
      "Standing in the center of the now fully bloomed meadow at twilight, " +
      "arms raised in joy as flowers burst open in every color all around, " +
      "surrounded at a comfortable distance by the squirrel, sparrow, " +
      "hedgehogs, and baby fox, with Pip bouncing at their feet in delight.",
    copy: (c) =>
      `Every flower in the meadow burst into color at once! ${c.name}'s new ` +
      `friends gathered all around, and the whole garden sparkled with life.`,
    spread: true,
    ink: "dark", // bright golden bloom — dark text on a panel reads better than white
    light:
      "Radiant twilight glow as the whole blooming meadow sparkles with magical evening color; eye-level camera among the flowers.",
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
        kind: "cover",
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
        "glowing seed resting in one open hand; soft warm daylight.",
      {
        kind: "intro",
        spread: true,
        companionOverride: null,
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
    ink: "dark", // verse sits on the pale bedroom (left leaf) — dark text on a panel reads better
    illustrationPrompt: illustration(
      "Tucked cozily in bed at night in a warm bedroom, with the same little clay pot " +
        "carried home from the garden now holding a single glowing flower resting on the " +
        "windowsill and Pip asleep at the foot of the bed; soft moonlight and a peaceful, happy smile.",
      {
        kind: "closing",
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
        `On the windowsill, the same little clay pot carried home from the garden ` +
        `now bloomed with a soft, glowing flower — a quiet reminder of ${p.poss} ` +
        `kindness. Pip curled up close by, and with a warm smile, ${c.name} drifted ` +
        `off to sleep, dreaming of tomorrow's garden friends.`
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
      {
        kind: "backcover",
      },
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

// ---------------------------------------------------------------------------
// standard-24 StoryEdition: each of the 10 original beats becomes two
// sequential, visually distinct moments (setup/discovery, then
// action/result) — 20 scenes total. Pip is not introduced until the first
// split beat (matching the original: absent from cover/intro), every prop
// (the glowing seed/pot, the notebook) and outfit swap (rain, pajamas)
// carries forward at the same point in the story, and cause-and-effect
// order is unchanged — nothing is duplicated, each half shows a distinct
// action.
// ---------------------------------------------------------------------------

import { registerStoryEdition, type StoryEdition, type StoryEditionScene } from "./storyEdition";
import { buildGreetingScene, buildVideoQrScene } from "./standardEditionScenes";

function reuseKGSpec(spec: PageSpec, sceneId: string): StoryEditionScene {
  return { sceneId, kind: spec.kind, role: spec.role, illustrationPrompt: spec.illustrationPrompt, text: spec.text, legacyFilenames: [] };
}

function kgScene(
  sceneId: string,
  scene: string,
  copy: (c: ChildProfile, p: Pronouns) => string,
  opts: { light?: string; compositionNotes?: string; outfitOverride?: string; companionOverride?: CompanionSpec | null } = {},
): StoryEditionScene {
  return {
    sceneId,
    kind: "scene",
    illustrationPrompt: illustration(scene, { kind: "scene", ...opts }),
    text: (c) => copy(c, pronouns(c.gender)),
    legacyFilenames: [],
  };
}

const kgScenes: StoryEditionScene[] = [
  kgScene(
    "brambles-discovery",
    "Crouching beside a tangle of brambles behind an old wooden garden gate, peering in with soft concern at " +
      "a small rabbit caught by one paw, reaching a gentle hand toward it; dappled morning light through " +
      "overgrown leaves.",
    (c) => `Just behind the gate, ${c.name} heard a tiny frightened squeak — a little rabbit, caught in the brambles!`,
    { light: "Soft dappled morning light filtering through overgrown leaves from the upper left; eye-level camera at kneeling height.", companionOverride: null },
  ),
  kgScene(
    "brambles-freed",
    "Kneeling in the same spot, now happily cradling the freed rabbit against their chest with a warm smile, " +
      "as it nuzzles close, one floppy ear flopping over; the brambles now empty behind them.",
    (c) => `With gentle hands, ${c.name} freed the small friend. "There you go!" Pip nuzzled close, safe at last.`,
    { light: "Soft dappled morning light, now warmer as the sun climbs; eye-level camera at kneeling height." },
  ),
  kgScene(
    "seed-planted",
    "Kneeling in dry garden earth, carefully planting a tiny glowing seed into a small clay pot, patting the " +
      "soil gently with both hands and a hopeful expression, with Pip sniffing the pot curiously beside them.",
    (c) => `${c.name} found a tiny glowing seed and planted it carefully in a little clay pot to take home.`,
    { light: "Warm early-morning sun from the right, soft and golden over dry earth; eye-level camera at ground height." },
  ),
  kgScene(
    "sunflower-watered",
    "Tipping a small green watering can over a wilted, drooping sunflower, watching hopefully as a single drop " +
      "catches the light and the sunflower begins to lift its head, with Pip sitting attentively beside them.",
    (c) => `Nearby, a tall sunflower drooped, thirsty and sad. ${c.name} gave it a careful drink — and watched it slowly lift its head.`,
    { light: "Warm early-morning sun from the right, soft and golden; eye-level camera at flower height." },
  ),
  kgScene(
    "meadow-discovery",
    "Standing at the edge of a wide wildflower meadow, eyes wide in wonder at dozens of sleepy, closed flower " +
      "buds waiting in the grass as far as the eye can see, with Pip hopping ahead into the grass.",
    (c, p) => `Beyond the brambles lay a whole meadow of sleepy buds. ${cap(p.subj)} could hardly believe how big the garden really was.`,
    { light: "Bright open mid-morning daylight from above, warm and clear; eye-level camera at the meadow's edge.", compositionNotes: "a wide establishing shot — keep the whole meadow readable, not a close-up." },
  ),
  kgScene(
    "meadow-resolve",
    "Walking further into the meadow with arms spread wide, brushing fingertips gently over the sleepy flower " +
      "buds as if greeting each one, a determined, joyful expression, with Pip bounding happily through the grass ahead.",
    (c) => `${c.name} stepped into the meadow, ready to help every sleepy bud wake up, one at a time.`,
    { light: "Bright open mid-morning daylight, warm and clear; eye-level camera in the meadow grass." },
  ),
  kgScene(
    "ladybugs-discovery",
    "Standing at the near bank of a small garden stream, noticing a little family of ladybugs stranded on a " +
      "leaf at the water's edge, looking concerned, with Pip watching curiously from beside them.",
    (c) => `A family of ladybugs had lost their way home, stranded at the edge of a garden stream.`,
    { light: "Cool, dappled streamside light from the upper left; eye-level camera at the stream's bank." },
  ),
  kgScene(
    "ladybugs-crossed",
    "Carefully balancing across a wide, mossy fallen log over the stream, arms out for balance, guiding the " +
      "little ladybug family walking along the same log toward the far bank, with Pip watching from the near side.",
    (c) => `${c.name} balanced carefully along a mossy log, showing the ladybugs the way home, step by step.`,
    { light: "Cool, dappled streamside light, gently diffuse; eye-level camera at the log's height.", compositionNotes: "keep both of the child's hands and their head fully visible while balancing — no arm or foot may leave the frame." },
  ),
  kgScene(
    "birdhouse-setup",
    "Kneeling in the grass beside a cheerful squirrel and a sparrow who are struggling with scattered wooden " +
      "birdhouse pieces, looking over with a helpful, curious expression, with Pip sniffing a pile of wood shavings nearby.",
    (c) => `Next, a squirrel and a sparrow were struggling to build a new home. ${c.name} knelt down to help.`,
    { light: "Warm dappled afternoon light through the branches from the right; eye-level camera at kneeling height." },
  ),
  kgScene(
    "birdhouse-built",
    "Kneeling in the same spot, now happily holding a little wooden peg steady as the squirrel and sparrow " +
      "nail the finished birdhouse together, all three working as a team with proud smiles.",
    (c) => `Together, they held the little wooden pieces steady until the new birdhouse was finished.`,
    { light: "Warm dappled afternoon light, golden as the sun lowers; eye-level camera at kneeling height." },
  ),
  kgScene(
    "rain-begins",
    "Looking up in surprise as the sky turns soft grey and the first raindrops begin to fall, one hand raised " +
      "to feel the rain, already reaching for a giant leaf overhead, with Pip ducking close beside them.",
    (c) => `Then the sky turned soft and grey, and rain began to fall!`,
    { outfitOverride: SPECIAL_OUTFITS.rain, light: "Soft overcast grey daylight, cool and even, with the first raindrops streaking through the air; eye-level camera in the open." },
  ),
  kgScene(
    "rain-sheltered",
    "Sheltering snugly under a giant leaf held overhead like an umbrella, smiling out at the falling raindrops " +
      "and giggling, with Pip tucked close beside them; soft grey rain and a few puddles reflecting the sky.",
    (c) => `${c.name} and Pip ducked beneath a giant leaf, giggling as the raindrops pattered all around.`,
    { outfitOverride: SPECIAL_OUTFITS.rain, light: "Soft overcast grey daylight, cool and even, rain streaking gently through the air; eye-level camera under the leaf." },
  ),
  kgScene(
    "hedgehogs-discovery",
    "Now back in familiar green overalls after the rain clears, crouching by a cluster of hedgehogs peeking " +
      "out shyly from the base of a hedge, offering a warm, welcoming smile, with Pip peeking out too.",
    (c) => `The rain cleared, leaving the air fresh and sweet. Near the hedge, a family of hedgehogs peeked out, hungry and shy.`,
    { light: "Warm golden late-afternoon sunlight from the low sun behind, soft and glowing on damp leaves; eye-level camera at hedgehog height." },
  ),
  kgScene(
    "hedgehogs-shared",
    "Kneeling by the hedge, opening a small cloth pouch and sharing seeds and berries with each hedgehog in " +
      "turn, gentle and patient, with Pip nibbling a berry of its own beside them.",
    (c) => `${c.name} knelt down and shared a pouch of seeds and berries with every one of them.`,
    { light: "Warm golden late-afternoon sunlight, soft and glowing; eye-level camera at hedgehog height." },
  ),
  kgScene(
    "sketching-setup",
    "Sitting down beneath a big blossoming tree at sunset, opening a small notebook and picking up a stubby " +
      "pencil, looking around thoughtfully at the day's new garden friends; golden sunset light through the blossoms above.",
    (c) => `As the sun dipped low, ${c.name} settled beneath the blossoming tree with a notebook and pencil.`,
    { light: "Warm golden sunset light filtering down through blossoms from above; eye-level camera beneath the tree.", companionOverride: null },
  ),
  kgScene(
    "sketching-done",
    "Still seated beneath the blossoming tree, holding up a finished notebook page filled with small sketches " +
      "of the day's garden friends, admiring the drawings with a contented, happy smile.",
    (c, p) => `${cap(p.subj)} sketched picture portraits of every new garden friend ${p.subj} had met that day.`,
    { light: "Warm golden sunset light, deepening toward dusk; eye-level camera beneath the tree.", companionOverride: null },
  ),
  kgScene(
    "fox-discovery",
    "Kneeling low at the edge of the meadow at dusk, noticing a wide-eyed baby fox peeking shyly out of the " +
      "ferns, offering a calm, gentle smile, with Pip peeking around them curiously.",
    (c) => `One last visitor peeked shyly out of the ferns at dusk — a baby fox.`,
    { light: "Soft, warm dusk light from the low horizon, gentle and diffuse; eye-level camera at kneeling height." },
  ),
  kgScene(
    "fox-shared",
    "Still kneeling at the meadow's edge, gently offering the very last handful of seeds to the now-close baby " +
      "fox, who nibbles trustingly from an open palm, with Pip hopping over to greet the new friend too.",
    (c) => `${c.name} knelt down slowly and offered the very last of the seeds — and the little fox came close.`,
    { light: "Soft, warm dusk light, deepening toward twilight; eye-level camera at kneeling height." },
  ),
  kgScene(
    "bloom-begins",
    "Standing at the center of the meadow at twilight as the very first flowers burst open in bright color " +
      "around their feet, arms lifting in delighted surprise, with the squirrel, sparrow, hedgehogs, and baby " +
      "fox beginning to gather at a comfortable distance and Pip bouncing at their feet.",
    (c) => `And then — the very first flowers burst into color, right at ${c.name}'s feet!`,
    { light: "Radiant twilight glow as the meadow begins to sparkle with magical evening color; eye-level camera among the flowers." },
  ),
  kgScene(
    "bloom-celebration",
    "Standing in the center of the now fully bloomed meadow at twilight, arms raised high in joy as every " +
      "flower bursts open in every color all around, surrounded at a comfortable distance by the squirrel, " +
      "sparrow, hedgehogs, and baby fox, with Pip bouncing at their feet in delight.",
    (c) => `Every flower in the meadow burst into color at once! ${c.name}'s new friends gathered all around, and the whole garden sparkled with life.`,
    { light: "Radiant twilight glow as the whole blooming meadow sparkles with magical evening color; eye-level camera among the flowers.", compositionNotes: "keep the child, Pip, and every garden friend safely inside the frame with roughly a 10-12% margin from the outer edge — a wide celebratory shot, never a close-up crop of any one animal." },
  ),
];

export const kindnessGardenStandard24Edition: StoryEdition = {
  id: "standard-24",
  storyId: "kindness-garden",
  interiorPageCount: 24,
  greeting: buildGreetingScene(
    STORY_META,
    "A calm, dreamy portrait moment in a sunny backyard at soft morning light, sitting comfortably beside an " +
      "old wooden garden gate and looking toward the viewer with a warm, gentle smile, a small glowing seed " +
      "resting in cupped hands.",
    (c) => `A special adventure created just for ${c.name}.`,
  ),
  intro: reuseKGSpec(kindnessGardenPages[1], "intro"),
  scenes: kgScenes,
  closing: reuseKGSpec(kindnessGardenPages[12], "closing"),
  videoQr: buildVideoQrScene(
    STORY_META,
    "A calm, low-detail twilight garden background with soft blurred flowers and gentle fireflies, echoing the " +
      "meadow's magical bloom.",
  ),
  cover: {
    front: reuseKGSpec(kindnessGardenPages[0], "cover"),
    back: reuseKGSpec(kindnessGardenPages[13], "backcover"),
  },
};

registerStoryEdition(kindnessGardenStandard24Edition);
