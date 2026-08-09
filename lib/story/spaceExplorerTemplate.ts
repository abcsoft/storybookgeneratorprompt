/**
 * The "Journey to the Stars" storybook template.
 *
 * A curious child finds a glowing star map through the bedroom telescope,
 * launches into space, and — after coasting past the Moon, a calm asteroid
 * field, and a swirling nebula — meets Orbit, a small lost robot who needs
 * help finding home. Together they visit a glittering crystal planet, solve
 * Orbit's problem, and fly home together beneath the real night sky.
 *
 * Built entirely on the shared prompt engine (lib/story/prompt) — same as
 * greatAdventureTemplate.ts. This file defines ONLY story metadata, scene
 * text, layout, scene-specific composition notes, and its own wardrobe/
 * companion — every identity, style, composition-safety, and negative rule
 * is inherited from buildIllustrationPrompt(), never repeated here. Print
 * geometry comes from whichever PrintProfile the manual workflow has
 * selected — this template has no opinion on it.
 *
 * The spacesuit is deliberately open-collar / open-helmet in every scene so
 * the child's face stays clearly visible — never a bulky helmet obscuring it
 * (see DEFAULT_OUTFIT below).
 *
 * 14 page specs — cover, opening, 10 space scenes, closing, back cover.
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

/** Orbit, kept consistent page-to-page via the shared companion-rules block
 *  instead of being re-described by hand in every scene. */
const ORBIT: CompanionSpec = {
  name: "Orbit",
  description:
    "a small friendly round robot, about knee-height, with a smooth white-and" +
    "-silver shell and a glowing soft-blue light on its chest",
  consistencyRules:
    "same round white-and-silver shell, same glowing soft-blue chest light, " +
    "same two small round eye-lights and short stubby arms, same size on " +
    "every page — a single robot only, never duplicated, never a different " +
    "shape or color",
};

/** The standard kid-friendly spacesuit — deliberately open-collar/open-helmet
 *  so the child's face stays clearly visible in every scene, worn on every
 *  page unless a scene opts into the bedtime variant below. */
const DEFAULT_OUTFIT =
  "a snug white-and-blue kid-size spacesuit with soft rounded shoulder pads " +
  "and a small glowing chest control panel; the round helmet is fully " +
  "transparent and worn open/back like a hood, or removed and tucked under " +
  "one arm, so the child's whole face stays clearly visible and unobscured, " +
  "with a small backpack-style life-support pack";

const SPECIAL_OUTFITS: Record<string, string> = {
  pajamas: "cozy pajamas with a small star-and-rocket pattern — no spacesuit or backpack",
};

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: ORBIT };

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

/** One beat of the space journey: the scene to illustrate and the verse. */
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
      "Standing at a bedroom window at dusk, looking through a small telescope " +
      "as a glowing star map unfolds across the night sky like soft golden " +
      "constellations, eyes wide with wonder; the telescope catching the last " +
      "light.",
    copy: (c) =>
      `Through the telescope, ${c.name} saw the stars begin to move — ` +
      `tracing themselves into a glowing map, twinkling a path across the sky.`,
    light:
      "Soft golden-blue dusk light through the window mixing with the star map's glow; eye-level camera at the windowsill.",
    outfitOverride: SPECIAL_OUTFITS.pajamas,
    companionOverride: null,
  },
  {
    scene:
      "Standing beside a small friendly rocket ship on a backyard launch pad " +
      "at night, giving a thumbs-up while checking the glowing chest panel of " +
      "the spacesuit, star map tucked under one arm; the rocket's windows " +
      "glowing warmly.",
    copy: (c) =>
      `${c.name} climbed into the little rocket, checked every glowing dial, ` +
      `and gave a thumbs-up to the waiting stars. It was time to go.`,
    light:
      "Warm glow from the rocket's lights against a deep blue night sky; eye-level camera on the launch pad.",
    companionOverride: null,
  },
  {
    scene:
      "A small friendly rocket blasting off into a brilliant starry sky, " +
      "trailing a bright glowing exhaust plume, the child visible through the " +
      "rocket's round window with a huge excited grin.",
    copy: (c) =>
      `Three, two, one — liftoff! The little rocket soared up through the ` +
      `clouds and into the stars, and ${c.name} laughed with pure delight.`,
    spread: true,
    light:
      "Bright glowing rocket exhaust against a deep starry night sky; wide eye-level camera tracking the rocket.",
    compositionNotes:
      "keep the rocket at a scale where it clearly reads as a small ship " +
      "against the vast sky — the child, visible through the window, stays " +
      "recognizable and never shrinks to an unreadable speck.",
    companionOverride: null,
  },
  {
    scene:
      "Floating gently inside a cozy, colorful spaceship cockpit, both hands " +
      "on the window as the glowing blue Earth shrinks softly below, an " +
      "expression of pure wonder; soft control-panel lights all around.",
    copy: (c) =>
      `Inside the cockpit, ${c.name} pressed close to the window. Far below, ` +
      `Earth glowed like a soft blue marble, smaller and smaller.`,
    light:
      "Soft blue glow from Earth below mixing with warm cockpit control lights; eye-level camera inside the cockpit.",
    companionOverride: null,
  },
  {
    scene:
      "Bouncing gently across the pale grey Moon's surface in low gravity, " +
      "arms out for balance, discovering Orbit sitting alone and still beside " +
      "a small crater, one round eye-light flickering weakly.",
    copy: (c) =>
      `On the quiet Moon, ${c.name} bounced from crater to crater — until a ` +
      `small, still robot came into view, one light flickering weakly, all ` +
      `alone.`,
    light:
      "Bright, stark, high-contrast sunlight against the grey lunar surface; eye-level camera on the Moon.",
  },
  {
    scene:
      "Gliding gently through a calm asteroid field aboard the little " +
      "spaceship, large slow-drifting asteroids visible at a safe distance " +
      "through the window, Orbit's chest light now glowing steady and bright " +
      "beside them.",
    copy: (c) =>
      `With Orbit's light glowing bright again, they glided together past ` +
      `slow, tumbling asteroids, drifting like quiet giants in the dark.`,
    light:
      "Cool starlight with soft warm highlights from Orbit's chest light; eye-level camera inside the ship.",
    compositionNotes:
      "keep the asteroids calmly drifting in the background at a safe " +
      "distance — never crowding or looming toward the ship's window; the " +
      "child and Orbit stay the clear, comfortable foreground focus.",
  },
  {
    scene:
      "Flying together through a swirling, colorful nebula full of soft " +
      "pink, purple, and gold clouds of light, arms spread wide in delight, " +
      "Orbit tumbling playfully alongside.",
    copy: (c) =>
      `Next came a nebula of swirling color — soft pinks and golds like a ` +
      `painting brought to life. ${c.name} laughed as Orbit tumbled ` +
      `playfully through the light.`,
    ink: "dark",
    light:
      "Soft, colorful glow from the surrounding nebula clouds, pink-gold-purple tones; eye-level camera among the clouds.",
  },
  {
    scene:
      "Standing on a glittering crystal planet's surface, surrounded by " +
      "tall, glowing crystal formations in every color, reaching out gently " +
      "to touch one as it chimes softly, Orbit's chest light reflecting in " +
      "the crystal facets.",
    copy: (c) =>
      `The crystal planet chimed like tiny bells with every step. ${c.name} ` +
      `reached out and touched a glowing crystal — it rang a soft, sweet ` +
      `note in reply.`,
    light:
      "Cool, sparkling multicolor light reflecting off the crystal formations; eye-level camera on the crystal surface.",
  },
  {
    scene:
      "Kneeling beside Orbit, who points sadly at a small cracked star-shaped " +
      "medallion on its chest panel, then watches hopefully as the child " +
      "gently presses it back into place, both looking up together as it " +
      "begins to glow like a tiny compass.",
    copy: (c) =>
      `Orbit's little star-shaped compass had cracked — that was why it got ` +
      `lost. With careful hands, ${c.name} pressed it gently back into ` +
      `place, and it began to glow.`,
    light:
      "Warm glow from the repaired compass mixing with cool planet light; eye-level camera at kneeling height.",
  },
  {
    scene:
      "The little spaceship soaring joyfully back toward a glowing blue " +
      "Earth ahead, trailing a bright starlit path, the child at the " +
      "controls with Orbit safely beside them, both smiling at the view " +
      "growing closer.",
    copy: (c) =>
      `With Orbit's compass glowing the way, the little ship turned toward ` +
      `home. Earth grew brighter and closer with every star they passed.`,
    spread: true,
    light:
      "Warm glow from Earth ahead mixing with cool deep-space starlight; wide eye-level camera behind the ship.",
    compositionNotes:
      "keep the ship at a readable scale against the vast starfield, Earth " +
      "glowing softly ahead in the distance — the child at the controls " +
      "stays the large, clear foreground focus, comfortably inside the safe " +
      "region.",
  },
];

/** The full ordered book: cover + opening + space scenes + closing + back. */
const spaceExplorerPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "A wide cover hero scene: standing on the RIGHT side of the frame in a " +
        "spacesuit with the helmet open/off so the whole face shows clearly, " +
        "turned toward the viewer with a big joyful smile, holding a glowing " +
        "star map, with Orbit at their side and a starry sky and distant " +
        "planets softly visible beyond. Frame the child from about the waist " +
        "up so the FACE IS LARGE, clear, and front-facing (or a gentle " +
        "three-quarter angle) toward the camera — the face is the focal " +
        "point and must unmistakably look like the real child in the " +
        "reference photos, with their hair exactly as in those photos.",
      {
        light:
          "Soft glowing starlight from above and around, gently lighting the child from the front; eye-level camera among the stars.",
        compositionNotes:
          "keep the entire LEFT side and the lower-left calm and open — soft " +
          "starry sky with no part of the child there — so a large title can " +
          "sit in the lower-left without covering the child.",
      },
    ),
    text: (c) => `${c.name}'s Journey to the Stars`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "In a cozy bedroom at night, standing at an open window with a small " +
        "telescope, a glowing star map unfolding softly across the night sky " +
        "outside, pajamas on, pure wonder on their face.",
      {
        spread: true,
        light:
          "Soft cool moonlight through the window mixing with the star map's warm glow; eye-level camera at the windowsill.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `Every night, ${c.name} counted the stars from the bedroom window. ` +
        `Tonight, one small star map unfolded just for ${p.obj} — and a big ` +
        `adventure was about to begin.`
      );
    },
  },
  // 10 space scenes
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
      "Tucked cozily in bed at night in a warm bedroom, looking out the " +
        "window at the real night sky where one star seems to twinkle just a " +
        "little brighter, a small toy rocket glowing softly on the " +
        "nightstand, peaceful happy smile.",
      {
        spread: true,
        light:
          "Soft cool blue moonlight from the window plus the toy rocket's warm glow; eye-level camera beside the bed.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
        companionOverride: null,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} was home, tucked in and warm.\n\n` +
        `Somewhere out there, Orbit was drifting safely toward its own ` +
        `stars, compass glowing bright. ${cap(p.poss)} eyes grew heavy, and ` +
        `${p.subj} drifted off to sleep beneath the same sky ${p.subj} had ` +
        `once flown through.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile, spacesuit helmet tucked " +
        "under one arm so the face shows clearly, against a soft simple " +
        "pastel night sky with a few gentle twinkling stars.",
      { companionOverride: null },
    ),
    text: (c) =>
      `The End…\n...but ${c.name}'s star map is still glowing, ready for the next journey.`,
  },
];

/** The "Journey to the Stars" book, ready to register in `registry.ts`. */
export const spaceExplorerBook: StoryTemplate = {
  id: "space-explorer",
  title: "Journey to the Stars",
  subtitle: "A brave little astronaut helps a lost robot find its way home.",
  pages: spaceExplorerPages,
  defaultOutfit: DEFAULT_OUTFIT,
  specialOutfits: SPECIAL_OUTFITS,
  companion: ORBIT,
};
