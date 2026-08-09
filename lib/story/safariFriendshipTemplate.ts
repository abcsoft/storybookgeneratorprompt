/**
 * The "Safari Friendship" storybook template.
 *
 * A young explorer receives a field journal and sets out across a warm,
 * golden savanna — past giraffes, elephants, and zebras — until a small
 * lost elephant calf, calling for its herd, needs a friend. Following safe,
 * gentle clues from a mud wallow to a watering hole, the child helps guide
 * the calf home for a joyful sunset reunion.
 *
 * Built entirely on the shared prompt engine (lib/story/prompt) — same as
 * greatAdventureTemplate.ts. This file defines ONLY story metadata, scene
 * text, layout, scene-specific composition notes, and its own wardrobe —
 * every identity, style, composition-safety, and negative rule is inherited
 * from buildIllustrationPrompt(), never repeated here. Print geometry comes
 * from whichever PrintProfile the manual workflow has selected — this
 * template has no opinion on it.
 *
 * This story has no ongoing companion (a lost animal is reunited with its
 * own family, rather than adopted) — the calf is a consistent named side
 * character described directly in its scenes, the same pattern
 * theGreatDetectiveTemplate.ts uses for Rohan and Meera. Every transition
 * stays within one coherent savanna — no jungle/Arctic/ocean jumps.
 *
 * 14 page specs — cover, opening, 10 savanna scenes, closing, back cover.
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

/** The lost elephant calf — a fixed description repeated identically
 *  wherever it appears, the same way theGreatDetectiveTemplate.ts pins down
 *  Rohan and Meera. Not a `companion`: it's reunited with its own family by
 *  the story's end rather than staying with the child. */
const CALF =
  "a small young elephant calf, exactly one, with soft grey skin, big " +
  "gentle ears, and a short curious trunk — always this same single calf, " +
  "never a different animal or age";

/** The standard safari outfit, worn on every page. */
const DEFAULT_OUTFIT =
  "a sage-green short-sleeve safari shirt with rolled cuffs, a canvas " +
  "wide-brimmed sun hat, khaki cargo shorts, light tan lace-up ankle boots, " +
  "and a small pair of binoculars on a strap across the chest";

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT };

/** Build a full illustration prompt through the shared prompt engine. */
function illustration(
  scene: string,
  opts: {
    light?: string;
    spread?: boolean;
    compositionNotes?: string;
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
    });
}

/** One beat of the savanna journey: the scene to illustrate and the verse. */
interface Beat {
  scene: string;
  copy: (c: ChildProfile, p: Pronouns) => string;
  spread?: boolean;
  ink?: "light" | "dark";
  light?: string;
  compositionNotes?: string;
}

const STORY: Beat[] = [
  {
    scene:
      "Sitting on a porch step at sunrise, carefully opening a worn leather " +
      "field journal handed down with a small hand-drawn savanna map tucked " +
      "inside, eyes bright with excitement.",
    copy: (c) =>
      `On the porch at sunrise, ${c.name} opened a worn field journal — ` +
      `inside, a hand-drawn map pointed straight into the golden grass ` +
      `beyond the gate.`,
    light:
      "Warm early-morning sunrise light from the low sun; eye-level camera on the porch.",
  },
  {
    scene:
      "Walking through a wooden savanna gate onto a wide golden grassland " +
      "path, one hand shading their eyes as they look out across the endless " +
      "gold, journal held ready in the other hand.",
    copy: (c) =>
      `Through the gate, the savanna opened up wide and golden as far as ` +
      `${c.name} could see. The real adventure had begun.`,
    light:
      "Bright warm mid-morning light over the golden grassland; eye-level camera at the gate.",
  },
  {
    scene:
      "Standing in golden grass among scattered acacia trees, looking up in " +
      "delight at a small gentle herd of giraffes grazing peacefully on the " +
      "high leaves, journal open to sketch them.",
    copy: (c) =>
      `Beneath the acacia trees, a herd of giraffes stretched their long ` +
      `necks to the leaves. ${c.name} sketched them quickly, trying to catch ` +
      `every detail.`,
    spread: true,
    ink: "dark",
    light:
      "Bright warm midday sunlight over the acacia trees and golden grass; wide eye-level camera on the savanna.",
    compositionNotes:
      "wide establishing shot — keep the giraffes' heads and necks fully " +
      "inside the frame, no cropping at the top edge; keep the whole child " +
      "comfortably inside the safe region with nothing crossing the center " +
      "gutter.",
  },
  {
    scene:
      "Crouching at the edge of a muddy watering hole, watching a small " +
      "group of elephants splash and cool themselves playfully, a big smile " +
      "at the gentle chaos.",
    copy: (c) =>
      `At a muddy wallow, a family of elephants splashed and sprayed water, ` +
      `cooling off together. ${c.name} laughed at their happy splashing.`,
    light:
      "Warm midday light reflecting off the muddy water; eye-level camera at the wallow's edge.",
    compositionNotes:
      "keep every elephant trunk and ear fully inside the frame, away from " +
      "the crop edges.",
  },
  {
    scene:
      "Standing still and watching with wide eyes as a long line of striped " +
      "zebras crosses the dirt path just ahead, journal pressed to their " +
      "chest in quiet awe.",
    copy: (c) =>
      `A whole line of zebras crossed right in front of ${c.name} — stripe ` +
      `after stripe after stripe, like a moving puzzle.`,
    light:
      "Bright, clear afternoon sunlight over the dirt path; eye-level camera on the path.",
  },
  {
    scene:
      `Pausing near tall grass at the sound of a small worried cry, ` +
      `discovering ${CALF} standing alone, ears drooping, calling out for ` +
      `its family.`,
    copy: (c) =>
      `A small worried cry came from the tall grass. There stood a lost ` +
      `elephant calf, all alone, calling for a family that couldn't hear.`,
    light:
      "Soft warm late-afternoon light through the tall grass; eye-level camera at the calf's height.",
  },
  {
    scene:
      `Kneeling beside ${CALF}, gently checking a trail of small round ` +
      "footprints leading off through the grass, journal open to compare " +
      "them with a sketch, the calf staying close and trusting.",
    copy: (c, p) =>
      `${c.name} knelt beside the calf and found fresh footprints leading ` +
      `onward. "Let's find your family together," ${p.subj} said gently.`,
    light:
      "Warm late-afternoon light slanting across the grass; eye-level camera at kneeling height.",
  },
  {
    scene:
      `Wading carefully through the shallow edge of a watering hole ` +
      `alongside ${CALF}, one hand resting gently on its side to guide it ` +
      "safely across, golden late-afternoon reflections on the water.",
    copy: (c) =>
      `At a shallow watering hole, ${c.name} walked carefully alongside the ` +
      `calf, one hand steady on its side, guiding it safely across.`,
    light:
      "Warm golden late-afternoon light reflecting off the water; eye-level camera at the water's edge.",
    compositionNotes:
      "keep the calf's trunk, legs, and the child's limbs fully inside the " +
      "safe area — no cropping at the frame edges.",
  },
  {
    scene:
      `Standing together at sunset scanning the golden horizon with ${CALF} ` +
      "close beside them, a hand cupped to their mouth calling out, hope and " +
      "quiet worry on their face.",
    copy: (c) =>
      `As the sun dipped low, ${c.name} called out across the golden grass. ` +
      `For a long moment, only silence answered — then, far away, a deep, ` +
      `low trumpet call.`,
    ink: "dark",
    light:
      "Warm golden sunset light low on the horizon; eye-level camera on the savanna.",
  },
  {
    scene:
      `A joyful reunion at golden sunset as ${CALF} runs to meet a gentle ` +
      "herd of elephants gathering peacefully nearby, trunks reaching out " +
      "warmly, the child watching with a big happy smile a comfortable " +
      "distance away.",
    copy: (c) =>
      `The herd had heard! ${c.name} watched, smiling, as the little calf ` +
      `ran to meet them, trunks reaching out in a warm and happy reunion.`,
    spread: true,
    ink: "dark",
    light:
      "Warm golden-hour light glowing across the savanna at sunset; wide eye-level camera on the grassland.",
    compositionNotes:
      "keep the elephant herd calm and at a comfortable middle distance — a " +
      "warm gathering, not a crowd looming over the child; keep every trunk " +
      "and ear fully inside the frame, with the child safely inside the " +
      "safe region on their own side of the scene.",
  },
];

/** The full ordered book: cover + opening + savanna scenes + closing + back. */
const safariFriendshipPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "A wide cover hero scene at golden hour: standing on the RIGHT side of " +
        "the frame in the golden savanna grass, turned toward the viewer " +
        "with a big joyful smile, holding a field journal, with gentle " +
        "giraffe silhouettes and acacia trees softly visible beyond. Frame " +
        "the child from about the waist up so the FACE IS LARGE, clear, and " +
        "front-facing (or a gentle three-quarter angle) toward the camera — " +
        "the face is the focal point and must unmistakably look like the " +
        "real child in the reference photos, with their hair exactly as in " +
        "those photos.",
      {
        light:
          "Warm golden-hour light from the low sun, soft and glowing, lighting the child from the front; eye-level camera in the savanna grass.",
      },
    ),
    text: (c) => `${c.name}'s Safari Friendship`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "On a wooden porch at sunrise, sitting cross-legged with a worn leather " +
        "field journal open on their lap, a small hand-drawn map tucked " +
        "inside, golden grassland stretching out beyond the porch railing.",
      {
        spread: true,
        light:
          "Warm early-morning sunrise light from the low sun; eye-level camera on the porch.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} had always loved watching the animals from the porch. ` +
        `This morning, a field journal appeared with ${p.poss} name inside — ` +
        `and a map leading straight into the golden grass.`
      );
    },
  },
  // 10 savanna scenes
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
      "Tucked cozily in bed at night in a warm bedroom, the field journal " +
        "open on the nightstand full of little sketches of giraffes, " +
        "elephants, and zebras, soft moonlight and a peaceful, happy smile.",
      {
        spread: true,
        light:
          "Soft cool blue moonlight from the window; eye-level camera beside the bed.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} was home, tired and happy.\n\n` +
        `The journal on the nightstand was full now — giraffes, elephants, ` +
        `zebras, and one small calf found safely with its family. ${cap(p.subj)} ` +
        `drifted off to sleep, dreaming in gold and grass.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile, holding the well-loved " +
        "field journal, against a soft simple pastel sky with gentle acacia " +
        "tree silhouettes in the far distance.",
    ),
    text: (c) =>
      `The End…\n...but ${c.name}'s field journal still has plenty of blank pages left.`,
  },
];

/** The "Safari Friendship" book, ready to register in `registry.ts`. */
export const safariFriendshipBook: StoryTemplate = {
  id: "safari-friendship",
  title: "Safari Friendship",
  subtitle: "A young explorer helps a lost elephant calf find its way home.",
  pages: safariFriendshipPages,
  defaultOutfit: DEFAULT_OUTFIT,
};
