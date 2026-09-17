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
  PageKind,
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

/** The standard kid-friendly spacesuit with a crystal-clear transparent bubble
 *  helmet so the child's face and hair remain fully visible and well-lit while
 *  maintaining physical coherence in exposed space environments. */
const DEFAULT_OUTFIT =
  "a snug white-and-blue kid-size spacesuit with soft rounded shoulder pads, " +
  "a glowing chest control panel, a crystal-clear fully transparent spherical " +
  "bubble helmet that keeps the child's entire face and hair completely visible " +
  "and well-lit from within, and a small backpack-style life-support pack";

const SPECIAL_OUTFITS: Record<string, string> = {
  pajamas: "cozy pajamas with a small star-and-rocket pattern — no spacesuit or backpack",
  cockpitSuit:
    "a snug white-and-blue kid-size spacesuit with soft rounded shoulder pads " +
    "and a glowing chest control panel, helmet removed so the child's face and hair " +
    "are completely open, and a small backpack-style life-support pack",
};

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: ORBIT };

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
      "Standing at a bedroom desk beside an open window at dusk, holding a " +
      "pencil and drawing a glowing constellation pattern onto a paper star " +
      "chart while looking through a small brass telescope at the twinkling " +
      "night sky, eyes wide with wonder.",
    copy: (c) =>
      `Through the telescope, ${c.name} saw the stars begin to move — ` +
      `tracing themselves into a glowing pattern across the sky. With quick ` +
      `strokes, ${c.name} sketched the stellar path into a paper star chart.`,
    light:
      "Soft golden-blue dusk light through the window mixing with the star chart's gentle glow; eye-level camera at the desk.",
    outfitOverride: SPECIAL_OUTFITS.pajamas,
    companionOverride: null,
  },
  {
    scene:
      "Sitting securely inside the brightly lit cockpit of the small friendly " +
      "rocket ship on a backyard launch pad, smiling warmly and giving a " +
      "confident thumbs-up through the clear rocket window while checking " +
      "glowing control dials; the sketched star chart rests beside the console.",
    copy: (c) =>
      `${c.name} climbed into the little rocket, tucked the star chart ` +
      `safely by the console, checked every glowing dial, and gave a ` +
      `thumbs-up to the waiting stars. It was time to go.`,
    light:
      "Warm interior glow from cockpit dials against a deep blue night sky; eye-level camera looking through the rocket window.",
    outfitOverride: SPECIAL_OUTFITS.cockpitSuit,
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
      "Floating gently inside a cozy, colorful spaceship cockpit without " +
      "helmet, both hands resting lightly on the forward observation window " +
      "as the glowing blue Earth shrinks softly below, an expression of " +
      "pure wonder; soft control-panel lights all around.",
    copy: (c) =>
      `Inside the cockpit, ${c.name} pressed close to the window. Far below, ` +
      `Earth glowed like a soft blue marble, smaller and smaller.`,
    light:
      "Soft blue glow from Earth below mixing with warm cockpit control lights; eye-level camera inside the cockpit.",
    outfitOverride: SPECIAL_OUTFITS.cockpitSuit,
    companionOverride: null,
  },
  {
    scene:
      "Kneeling gently on the pale grey Moon in low gravity wearing the " +
      "clear transparent bubble helmet, offering a small glowing solar power " +
      "cell to Orbit; Orbit sits beside a small crater as its eye-lights " +
      "flicker back to life with a grateful soft blue glow.",
    copy: (c) =>
      `On the quiet Moon, ${c.name} bounced from crater to crater until a ` +
      `small, still robot came into view. ${c.name} shared a warm solar ` +
      `battery from the ship, and Orbit's eye-lights blinked gratefully ` +
      `back to life!`,
    light:
      "Bright stark sunlight across the grey lunar craters with soft blue reflections on the clear bubble helmet; eye-level camera on the Moon.",
  },
  {
    scene:
      "Gliding gently through a calm asteroid field inside the cozy " +
      "spaceship cockpit without helmets, large slow-drifting asteroids " +
      "visible at a safe distance through the panoramic observation glass, " +
      "Orbit's chest light now glowing steady and bright beside the child.",
    copy: (c) =>
      `With Orbit's power humming strong again, they glided together past ` +
      `slow, tumbling asteroids, drifting like quiet giants in the dark.`,
    light:
      "Cool starlight with soft warm highlights from Orbit's chest light; eye-level camera inside the ship cockpit.",
    compositionNotes:
      "keep the asteroids calmly drifting in the background at a safe " +
      "distance — never crowding or looming toward the ship's window; the " +
      "child and Orbit stay the clear, comfortable foreground focus.",
    outfitOverride: SPECIAL_OUTFITS.cockpitSuit,
  },
  {
    scene:
      "Flying together through a swirling, colorful nebula full of soft " +
      "pink, purple, and gold clouds of light, wearing the clear bubble " +
      "helmet with arms spread wide in delight, Orbit tumbling playfully " +
      "alongside in the weightless glow.",
    copy: (c) =>
      `Next came a nebula of swirling color — soft pinks and golds like a ` +
      `painting brought to life. ${c.name} laughed as Orbit tumbled ` +
      `playfully through the light.`,
    ink: "dark",
    light:
      "Soft, colorful glow from the surrounding nebula clouds, pink-gold-purple tones reflecting off the clear bubble helmet; eye-level camera among the clouds.",
  },
  {
    scene:
      "Standing on a glittering crystal planet's surface wearing the clear " +
      "bubble helmet, surrounded by tall glowing crystal spires in every color, " +
      "reaching out gently to touch one as it chimes softly, Orbit's chest " +
      "light reflecting in the sparkling crystal facets.",
    copy: (c) =>
      `The crystal planet chimed like tiny bells with every step. ${c.name} ` +
      `reached out and touched a glowing crystal — it rang a soft, sweet ` +
      `note in reply.`,
    light:
      "Cool, sparkling multicolor light reflecting off the crystal formations; eye-level camera on the crystal surface.",
  },
  {
    scene:
      "Kneeling beside Orbit on the crystal planet, holding Orbit's small " +
      "star-shaped navigation compass as it clicks gently back into place " +
      "on Orbit's chest panel, both watching with joy as a bright green " +
      "homeward beam points toward the stars.",
    copy: (c) =>
      `Orbit was powered, but still needed to find home. On Orbit's chest, ` +
      `a little star-shaped navigation compass had slipped loose. With ` +
      `careful hands, ${c.name} clicked it into place, and it beamed a ` +
      `bright green course toward home.`,
    light:
      "Warm green beam from the repaired compass mixing with cool planet starlight; eye-level camera at kneeling height.",
  },
  {
    scene:
      "Inside the spaceship cockpit looking forward, the child sits at the " +
      "controls smiling warmly through the panoramic front viewport as the " +
      "glowing blue Earth looms large and beautiful directly ahead; outside " +
      "the side viewport, Orbit waves happily beside a flashing friendly " +
      "star beacon, flying toward home.",
    copy: (c) =>
      `Near Earth, Orbit's compass signaled a friendly beacon from home. ` +
      `With a joyful wave goodbye, Orbit turned toward its own constellation, ` +
      `and ${c.name}'s little ship steered smoothly down toward the glowing blue Earth.`,
    spread: true,
    light:
      "Warm atmospheric blue glow from Earth ahead mixing with interior control console lights; eye-level camera inside the cockpit looking past the child.",
    compositionNotes:
      "coherent cockpit view: the child at the controls is the clear " +
      "foreground focus on the right side of the spread, looking forward at " +
      "the magnificent glowing Earth filling the forward viewport.",
    outfitOverride: SPECIAL_OUTFITS.cockpitSuit,
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
        "spacesuit with a crystal-clear transparent bubble helmet so the whole " +
        "face shows clearly and well-lit from within, turned toward the viewer " +
        "with a big joyful smile, holding a glowing star chart, with Orbit at " +
        "their side and a starry sky and distant planets softly visible " +
        "beyond. Frame the child from about the waist up so the FACE IS LARGE, " +
        "clear, and front-facing (or a gentle three-quarter angle) toward the " +
        "camera — the face is the focal point and must unmistakably look like " +
        "the real child in the reference photos, with their hair exactly as in " +
        "those photos.",
      {
        kind: "cover",
        light:
          "Soft glowing starlight from above and around, gently lighting the child from the front; eye-level camera among the stars.",
        compositionNotes:
          "keep the lower portion calm and open — soft " +
          "starry sky with no part of the child there — so a large title can " +
          "sit in the lower area without covering the child.",
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
      "In a cozy bedroom at night, standing at an open window beside a small " +
        "telescope, sketching a glowing constellation path onto a paper star " +
        "chart with a pencil as the night sky twinkles outside, pajamas on, " +
        "pure wonder on their face.",
      {
        kind: "intro",
        spread: true,
        companionOverride: null,
        light:
          "Soft cool moonlight through the window mixing with the star chart's warm glow; eye-level camera at the windowsill.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `Every night, ${c.name} counted the stars from the bedroom window. ` +
        `Tonight, a glowing star trail appeared just for ${p.obj} — and a big ` +
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
      "Tucked cozily in bed at night in a warm bedroom, looking out the " +
        "window at the real night sky where one star seems to twinkle just a " +
        "little brighter, a small toy rocket glowing softly on the " +
        "nightstand, peaceful happy smile.",
      {
        kind: "closing",
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
      { kind: "backcover", companionOverride: null },
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

// ---------------------------------------------------------------------------
// standard-24 StoryEdition: each of the 10 original beats becomes two
// sequential, visually distinct moments. Orbit is not shown until its
// introduction beat (originally beat index 4, on the Moon) — every earlier
// split keeps companionOverride: null, matching the original.
// ---------------------------------------------------------------------------

import { registerStoryEdition, type StoryEdition, type StoryEditionScene } from "./storyEdition";
import { buildGreetingScene, buildVideoQrScene } from "./standardEditionScenes";

function reuseSETSpec(spec: PageSpec, sceneId: string): StoryEditionScene {
  return { sceneId, kind: spec.kind, role: spec.role, illustrationPrompt: spec.illustrationPrompt, text: spec.text, legacyFilenames: [] };
}

function setScene(
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

const setScenes: StoryEditionScene[] = [
  setScene(
    "stars-move",
    "Standing at a bedroom desk beside an open window at dusk, looking through a small brass telescope at the " +
      "twinkling night sky as the stars begin to trace themselves into a glowing constellation path, eyes wide with wonder.",
    (c) => `Through the telescope, ${c.name} saw the stars begin to move — tracing themselves into a glowing pattern across the sky.`,
    { light: "Soft golden-blue dusk light through the window mixing with starlight; eye-level camera at the desk.", outfitOverride: SPECIAL_OUTFITS.pajamas, companionOverride: null },
  ),
  setScene(
    "star-chart-sketched",
    "Still at the bedroom desk, holding a pencil and finishing the glowing constellation pattern onto a paper " +
      "star chart, holding it up with pride as it glows softly in the dusk light.",
    (c) => `With quick strokes, ${c.name} sketched the stellar path into a paper star chart.`,
    { light: "Soft golden-blue dusk light mixing with the star chart's gentle glow; eye-level camera at the desk.", outfitOverride: SPECIAL_OUTFITS.pajamas, companionOverride: null },
  ),
  setScene(
    "cockpit-boarding",
    "Climbing into the brightly lit cockpit of the small friendly rocket ship on a backyard launch pad, " +
      "tucking the sketched star chart safely beside the console, settling into the pilot's seat.",
    (c) => `${c.name} climbed into the little rocket and tucked the star chart safely by the console.`,
    { light: "Warm interior glow from cockpit dials against a deep blue night sky; eye-level camera looking through the rocket window.", outfitOverride: SPECIAL_OUTFITS.cockpitSuit, companionOverride: null },
  ),
  setScene(
    "cockpit-ready",
    "Sitting securely in the cockpit, smiling warmly and giving a confident thumbs-up through the clear rocket " +
      "window while checking glowing control dials, ready for launch.",
    (c) => `${c.name} checked every glowing dial and gave a thumbs-up to the waiting stars. It was time to go.`,
    { light: "Warm interior glow from cockpit dials against a deep blue night sky; eye-level camera looking through the rocket window.", outfitOverride: SPECIAL_OUTFITS.cockpitSuit, companionOverride: null },
  ),
  setScene(
    "liftoff-ignition",
    "The small friendly rocket's engines igniting in a brilliant burst of light on the launch pad, visible " +
      "through the round window with a huge excited grin, ready to rise.",
    (c) => `Three, two, one — liftoff! The little rocket's engines roared to life.`,
    { light: "Bright glowing rocket exhaust igniting against a deep starry night sky; wide eye-level camera tracking the rocket.", companionOverride: null },
  ),
  setScene(
    "liftoff-ascent",
    "The small friendly rocket soaring up into a brilliant starry sky, trailing a bright glowing exhaust " +
      "plume, the child visible through the rocket's round window laughing with pure delight.",
    (c) => `The little rocket soared up through the clouds and into the stars, and ${c.name} laughed with pure delight.`,
    {
      light: "Bright glowing rocket exhaust against a deep starry night sky; wide eye-level camera tracking the rocket.",
      compositionNotes: "keep the rocket at a scale where it clearly reads as a small ship against the vast sky — the child, visible through the window, stays recognizable and never shrinks to an unreadable speck.",
      companionOverride: null,
    },
  ),
  setScene(
    "window-approach",
    "Floating gently inside the cozy, colorful spaceship cockpit without helmet, drifting toward the forward " +
      "observation window, the glowing blue Earth just coming into view below.",
    (c) => `Inside the cockpit, ${c.name} drifted toward the window. Far below, Earth was just coming into view.`,
    { light: "Soft blue glow from Earth below mixing with warm cockpit control lights; eye-level camera inside the cockpit.", outfitOverride: SPECIAL_OUTFITS.cockpitSuit, companionOverride: null },
  ),
  setScene(
    "earth-shrinking",
    "Both hands resting lightly on the forward observation window as the glowing blue Earth shrinks softly " +
      "below, an expression of pure wonder; soft control-panel lights all around.",
    (c) => `Earth glowed like a soft blue marble, smaller and smaller.`,
    { light: "Soft blue glow from Earth below mixing with warm cockpit control lights; eye-level camera inside the cockpit.", outfitOverride: SPECIAL_OUTFITS.cockpitSuit, companionOverride: null },
  ),
  setScene(
    "orbit-spotted",
    "Kneeling gently on the pale grey Moon in low gravity wearing the clear transparent bubble helmet, " +
      "noticing a small, still robot resting quietly beside a crater, powered down.",
    (c) => `On the quiet Moon, ${c.name} bounced from crater to crater until a small, still robot came into view.`,
    { light: "Bright stark sunlight across the grey lunar craters with soft reflections on the clear bubble helmet; eye-level camera on the Moon." },
  ),
  setScene(
    "orbit-revived",
    "Kneeling beside the small robot, offering a small glowing solar power cell; Orbit's eye-lights flicker " +
      "back to life with a grateful soft blue glow.",
    (c) => `${c.name} shared a warm solar battery from the ship, and Orbit's eye-lights blinked gratefully back to life!`,
    { light: "Bright stark sunlight across the grey lunar craters with soft blue reflections; eye-level camera on the Moon." },
  ),
  setScene(
    "asteroids-entering",
    "Gliding into a calm asteroid field inside the cozy spaceship cockpit without helmets, the first large " +
      "slow-drifting asteroids coming into view through the panoramic observation glass.",
    (c) => `With Orbit's power humming strong again, they glided into a field of slow, tumbling asteroids.`,
    {
      light: "Cool starlight with soft warm highlights from Orbit's chest light; eye-level camera inside the ship cockpit.",
      compositionNotes: "keep the asteroids calmly drifting in the background at a safe distance — never crowding or looming toward the ship's window.",
      outfitOverride: SPECIAL_OUTFITS.cockpitSuit,
    },
  ),
  setScene(
    "asteroids-drifting",
    "Sitting together in the cockpit, watching large asteroids drift like quiet giants in the dark at a safe " +
      "distance, Orbit's chest light glowing steady and bright beside the child.",
    (c) => `They drifted together past the tumbling asteroids, quiet giants in the dark.`,
    {
      light: "Cool starlight with soft warm highlights from Orbit's chest light; eye-level camera inside the ship cockpit.",
      compositionNotes: "keep the asteroids calmly drifting in the background at a safe distance.",
      outfitOverride: SPECIAL_OUTFITS.cockpitSuit,
    },
  ),
  setScene(
    "nebula-entering",
    "Flying into a swirling, colorful nebula full of soft pink, purple, and gold clouds of light, wearing the " +
      "clear bubble helmet, eyes wide with wonder as the colors surround them.",
    (c) => `Next came a nebula of swirling color — soft pinks and golds like a painting brought to life.`,
    { light: "Soft, colorful glow from the surrounding nebula clouds, pink-gold-purple tones reflecting off the clear bubble helmet; eye-level camera among the clouds." },
  ),
  setScene(
    "nebula-play",
    "Laughing with arms spread wide in the swirling nebula clouds as Orbit tumbles playfully alongside in the " +
      "weightless glow, pure joy on both their faces.",
    (c) => `${c.name} laughed as Orbit tumbled playfully through the light.`,
    { light: "Soft, colorful glow from the surrounding nebula clouds; eye-level camera among the clouds." },
  ),
  setScene(
    "crystal-arrival",
    "Standing on a glittering crystal planet's surface wearing the clear bubble helmet, surrounded by tall " +
      "glowing crystal spires in every color, looking around in awe.",
    (c) => `The crystal planet sparkled with tall glowing spires in every color, chiming like tiny bells with every step.`,
    { light: "Cool, sparkling multicolor light reflecting off the crystal formations; eye-level camera on the crystal surface." },
  ),
  setScene(
    "crystal-chime",
    "Reaching out gently to touch a glowing crystal spire as it chimes softly in reply, Orbit's chest light " +
      "reflecting in the sparkling crystal facets beside them.",
    (c) => `${c.name} reached out and touched a glowing crystal — it rang a soft, sweet note in reply.`,
    { light: "Cool, sparkling multicolor light reflecting off the crystal formations; eye-level camera on the crystal surface." },
  ),
  setScene(
    "compass-problem",
    "Kneeling beside Orbit on the crystal planet, noticing Orbit's small star-shaped navigation compass has " +
      "slipped loose from its chest panel, looking at it thoughtfully.",
    (c) => `Orbit was powered, but still needed to find home — a little star-shaped navigation compass had slipped loose.`,
    { light: "Warm green beam glow mixing with cool planet starlight; eye-level camera at kneeling height." },
  ),
  setScene(
    "compass-fixed",
    "Kneeling beside Orbit, clicking the star-shaped navigation compass gently back into place on Orbit's " +
      "chest panel, both watching with joy as a bright green homeward beam points toward the stars.",
    (c) => `With careful hands, ${c.name} clicked it into place, and it beamed a bright green course toward home.`,
    { light: "Warm green beam from the repaired compass mixing with cool planet starlight; eye-level camera at kneeling height." },
  ),
  setScene(
    "orbit-farewell",
    "Inside the spaceship cockpit, looking out the side viewport as Orbit waves happily beside a flashing " +
      "friendly star beacon, ready to turn toward its own constellation.",
    (c) => `Near Earth, Orbit's compass signaled a friendly beacon from home. With a joyful wave goodbye, Orbit turned toward its own constellation.`,
    { light: "Warm atmospheric blue glow mixing with interior control console lights; eye-level camera inside the cockpit.", outfitOverride: SPECIAL_OUTFITS.cockpitSuit },
  ),
  setScene(
    "homeward-descent",
    "Sitting at the cockpit controls smiling warmly through the panoramic front viewport as the glowing blue " +
      "Earth looms large and beautiful directly ahead, steering smoothly downward.",
    (c) => `${c.name}'s little ship steered smoothly down toward the glowing blue Earth.`,
    {
      light: "Warm atmospheric blue glow from Earth ahead mixing with interior control console lights; eye-level camera inside the cockpit looking past the child.",
      compositionNotes: "coherent cockpit view: the child at the controls is the clear foreground focus, looking forward at the magnificent glowing Earth filling the forward viewport.",
      outfitOverride: SPECIAL_OUTFITS.cockpitSuit,
    },
  ),
];

export const spaceExplorerStandard24Edition: StoryEdition = {
  id: "standard-24",
  storyId: "space-explorer",
  interiorPageCount: 24,
  greeting: buildGreetingScene(
    STORY_META,
    "A calm, dreamy portrait moment in a cozy bedroom at dusk, sitting comfortably beside the window with the " +
      "small brass telescope nearby and looking toward the viewer with a warm, wondering smile, soft starlight glowing outside.",
    (c) => `A special adventure created just for ${c.name}.`,
  ),
  intro: reuseSETSpec(spaceExplorerPages[1], "intro"),
  scenes: setScenes,
  closing: reuseSETSpec(spaceExplorerPages[12], "closing"),
  videoQr: buildVideoQrScene(
    STORY_META,
    "A calm, low-detail starry night sky background with soft twinkling stars and a faint distant nebula glow, " +
      "echoing the journey's cosmic wonder.",
  ),
  cover: {
    front: reuseSETSpec(spaceExplorerPages[0], "cover"),
    back: reuseSETSpec(spaceExplorerPages[13], "backcover"),
  },
};

registerStoryEdition(spaceExplorerStandard24Edition);
