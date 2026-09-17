/**
 * The "Starlit Dream" storybook template.
 *
 * A gentle bedtime story for younger children. One glowing star drifts
 * through the bedroom window and leads the child on a soft, calm journey
 * across a dream sky — past a sleepy moon and friendly night animals, to a
 * quiet star garden — to help a tiny lost star named Twinkle find its way
 * back to its constellation family, before flying home to a cozy bed.
 *
 * Built entirely on the shared prompt engine (lib/story/prompt) — same as
 * greatAdventureTemplate.ts. This file defines ONLY story metadata, scene
 * text, layout, scene-specific composition notes, and its own wardrobe/
 * companion — every identity, style, composition-safety, and negative rule
 * is inherited from buildIllustrationPrompt(), never repeated here. Print
 * geometry comes from whichever PrintProfile the manual workflow has
 * selected — this template has no opinion on it.
 *
 * Deliberately softer and calmer than the other books: wide, gentle
 * compositions, warm low light, no dramatic action or peril, in every scene.
 *
 * 14 page specs — cover, opening, 10 dream-sky scenes, closing, back cover.
 */

import { buildIllustrationPrompt } from "./prompt/buildIllustrationPrompt";
import { cap, pronouns, type Pronouns } from "./textHelpers";
import type {
  ChildProfile,
  CompanionSpec,
  FramingMode,
  LayoutType,
  PageKind,
  PageSpec,
  StoryTemplate,
} from "./types";

/** Twinkle, kept consistent page-to-page via the shared companion-rules
 *  block instead of being re-described by hand in every scene. */
const TWINKLE: CompanionSpec = {
  name: "Twinkle",
  description:
    "a tiny glowing star with a soft warm golden-white glow, a gentle " +
    "friendly face, and five soft rounded points",
  consistencyRules:
    "same soft warm golden-white glow, same gentle friendly face and five " +
    "rounded points, same small size on every page — a single little star " +
    "only, never duplicated, never a different color",
};

/** The bedtime outfit, worn on every page — this story never leaves pajamas,
 *  which fits its calm, cozy tone. */
const DEFAULT_OUTFIT =
  "soft blue pajamas with a small star pattern, and cozy slippers";

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: TWINKLE };

/** Build a full illustration prompt through the shared prompt engine. */
function illustration(
  scene: string,
  opts: {
    light?: string;
    spread?: boolean;
    kind?: PageKind;
    compositionNotes?: string;
    companionOverride?: CompanionSpec | null;
    framing?: FramingMode;
    outfitOverride?: string;
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
      framing?: FramingMode;
      outfitOverride?: string;
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
      framing: overrides?.framing ?? opts.framing,
      profileId,
      compositionNotes: opts.compositionNotes,
      light: opts.light,
      companionOverride: opts.companionOverride,
      outfitOverride: overrides?.outfitOverride ?? opts.outfitOverride,
    });
}

/** One beat of the dream-sky journey: the scene to illustrate and the verse. */
interface Beat {
  scene: string;
  copy: (c: ChildProfile, p: Pronouns) => string;
  spread?: boolean;
  ink?: "light" | "dark";
  light?: string;
  framing?: FramingMode;
  compositionNotes?: string;
  companionOverride?: CompanionSpec | null;
}

const STORY: Beat[] = [
  {
    scene:
      "Sitting up gently in bed in soft pajamas as a friendly silver guiding " +
      "star drifts in through the open window, reaching out a curious hand " +
      "toward the gentle light, a warm sleepy smile.",
    copy: (c) =>
      `Just as ${c.name} was drifting off to sleep, a soft silver guiding ` +
      `star drifted in through the window — glowing gently, like an ` +
      `invitation to a dream.`,
    light:
      "Soft warm glow from the silver star mixing with cool moonlight; eye-level camera beside the bed.",
    companionOverride: null,
  },
  {
    scene:
      "Floating gently out through the open window into a soft dream sky " +
      "following the silver guiding star, calm and weightless, arms out like " +
      "gentle wings, a peaceful smile, the bedroom glowing warmly behind them.",
    copy: (c) =>
      `The silver star led the way, and ${c.name} floated softly out into ` +
      `the night — calm and light as a held breath, never falling, only ` +
      `drifting.`,
    light:
      "Soft cool blue night light with warm starlight, calm and even; eye-level camera drifting beside the window.",
    companionOverride: null,
  },
  {
    scene:
      "Drifting gently along a wide, soft cloud path led by the silver " +
      "guiding star under an enormous, calm starry sky, resting comfortably " +
      "on a cloud as if it were a cushion, utterly peaceful.",
    copy: (c) =>
      `A wide, soft cloud path stretched out beneath a sky full of stars. ` +
      `Following the silver star, ${c.name} settled onto it as gently as ` +
      `settling onto a cushion.`,
    spread: true,
    ink: "dark",
    light:
      "Soft, even, warm starlight over the cloud path, calm and dreamlike; wide eye-level camera among the clouds.",
    compositionNotes:
      "use a wide, calm composition with a gentle, level camera angle — " +
      "avoid any dramatic or steep perspective; keep the whole child " +
      "comfortably inside the safe region with nothing crossing the center " +
      "gutter.",
    companionOverride: null,
  },
  {
    scene:
      "Kneeling gently on a soft cloud beside Twinkle, a tiny lost golden " +
      "star sitting alone and glowing dim and tired, offering a warm, " +
      "comforting smile as the silver guide star twinkles softly above.",
    copy: (c) =>
      `There on the cloud path sat Twinkle, a tiny golden star, dimmer ` +
      `than the rest. "I can't find my constellation family," it whispered. ` +
      `${c.name} sat down right beside it with a comforting smile.`,
    light:
      "Soft warm glow from Twinkle mixing with cool starlight; eye-level camera on the cloud path.",
  },
  {
    scene:
      "Floating peacefully past a huge, gentle, smiling crescent moon, " +
      "listening as it hums a soft, sleepy tune, Twinkle glowing a little " +
      "brighter with hope nearby.",
    copy: (c) =>
      `A great sleepy moon smiled as they passed, humming a slow, soft tune. ` +
      `"Follow the quiet path," it yawned, "and you'll find the way."`,
    light:
      "Soft warm moonlight glowing gently from the huge crescent moon; eye-level camera near the moon.",
  },
  {
    scene:
      "Drifting past a cluster of friendly night animals resting peacefully " +
      "on the cloud path — a soft owl, a gentle fox, and a few calm " +
      "fireflies glowing quietly — waving hello without waking them, Twinkle " +
      "floating gently beside the child.",
    copy: (c) =>
      `Along the path, an owl blinked slowly, a fox curled up snug, and ` +
      `fireflies glowed like tiny lanterns. ${c.name} waved softly, careful ` +
      `not to wake them.`,
    light:
      "Soft warm firefly-glow mixed with cool moonlight, gentle and dim; eye-level camera on the cloud path.",
  },
  {
    scene:
      "Arriving at a quiet star garden where little stars grow softly like " +
      "flowers among the clouds, walking slowly among them with Twinkle, " +
      "both glowing a little brighter in the peaceful hush.",
    copy: (c) =>
      `They reached a quiet garden where stars grew soft as flowers. ` +
      `Twinkle glowed brighter and warmer just being there.`,
    light:
      "Soft, even glow from the star-flowers all around, calm and gentle; eye-level camera in the star garden.",
  },
  {
    scene:
      "Sitting together with Twinkle on a soft cloud, looking up as the " +
      "child gently traces a constellation of four glowing stars in the sky " +
      "that leaves one empty spot matching Twinkle; Twinkle looks up with " +
      "quiet, joyful recognition.",
    copy: (c) =>
      `${c.name} looked up and traced four waiting stars in the sky with ` +
      `one open spot — the exact match for Twinkle. "That's your family," ` +
      `${c.name} whispered gently.`,
    light:
      "Soft warm starlight from the matching constellation above; eye-level camera looking upward.",
    compositionNotes:
      "wide, calm composition with a gentle, level camera angle — avoid any " +
      "dramatic or steep perspective.",
  },
  {
    scene:
      "Watching softly from a cloud as Twinkle drifts up to settle gently " +
      "into the empty fifth position among the four waiting stars, completing " +
      "the five-star constellation; all five stars glow warmly together in " +
      "the sky while the child smiles in quiet peace below.",
    copy: (c) =>
      `Twinkle drifted up, soft and slow, and settled gently into the open ` +
      `spot among the four waiting stars. Now five bright stars shone ` +
      `together, and the little constellation glowed warm and whole again.`,
    ink: "dark",
    light:
      "Soft warm glow from the now-complete five-star constellation; eye-level camera looking upward.",
    companionOverride: null,
  },
  {
    scene:
      "Flying gently home across the peaceful night sky, arms open in a calm, " +
      "happy glide, while Twinkle's complete five-star constellation twinkles " +
      "softly in the sky above; the bedroom window glows warmly ahead.",
    copy: (c) =>
      `Home ${c.name} drifted, calm and happy, the little five-star ` +
      `constellation twinkling softly in the sky above all the way to the window.`,
    spread: true,
    ink: "dark",
    light:
      "Soft warm glow from the window ahead mixing with gentle starlight; wide eye-level camera drifting toward home.",
    compositionNotes:
      "keep this wide and calm — a gentle glide, not a dramatic swoop; " +
      "nothing crossing the center gutter, the child comfortably inside " +
      "the safe region.",
    companionOverride: null,
  },
];

/** The full ordered book: cover + opening + dream-sky scenes + closing + back. */
const bedtimeDreamPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    framing: "waist-up portrait",
    illustrationPrompt: illustration(
      "A wide, calm cover scene: sitting gently on a soft cloud on the RIGHT " +
        "side of the frame under a peaceful starry sky, turned toward the " +
        "viewer with a warm sleepy smile, Twinkle glowing softly beside " +
        "them. Frame the child from about the waist up so the FACE IS " +
        "LARGE, clear, and front-facing (or a gentle three-quarter angle) " +
        "toward the camera — the face is the focal point and must " +
        "unmistakably look like the real child in the reference photos, " +
        "with their hair exactly as in those photos.",
      {
        kind: "cover",
        framing: "waist-up portrait",
        light:
          "Soft warm starlight, calm and even, lighting the child gently from the front; eye-level camera among the clouds.",
        compositionNotes:
          "keep the lower portion calm and open — " +
          "soft night sky with no part of the child there — so a large " +
          "title can sit in the lower area without covering the child; " +
          "avoid any dramatic or steep perspective.",
      },
    ),
    text: (c) => `${c.name}'s Starlit Dream`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    framing: "bed-covered",
    illustrationPrompt: illustration(
      "In a cozy bedroom at night, tucked under soft bedcovers in blue " +
        "pajamas, looking peacefully through the bedroom window at the quiet " +
        "starry sky with sleepy, gentle eyes.",
      {
        kind: "intro",
        framing: "bed-covered",
        spread: true,
        companionOverride: null,
        outfitOverride:
          "soft blue pajamas with a small star pattern (slippers are placed beside the bed on the floor and are not worn or visible under the covers)",
        light:
          "Soft cool moonlight through the window; eye-level camera beside the bed.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `Every night, ${c.name} watched the quiet stars from bed until ` +
        `${p.poss} eyes grew heavy. Tonight, the starlight had a magical ` +
        `bedtime journey in store.`
      );
    },
  },
  // 10 dream-sky scenes
  ...STORY.map(
    (b): PageSpec => ({
      kind: "scene",
      spread: b.spread,
      ink: b.ink,
      framing: b.framing,
      layout: b.spread ? "text-left-subject-right" : "single-page",
      illustrationPrompt: illustration(b.scene, {
        kind: "scene",
        light: b.light,
        spread: b.spread,
        framing: b.framing,
        compositionNotes: b.compositionNotes,
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
    framing: "sleeping/bed-covered",
    illustrationPrompt: illustration(
      "Tucked cozily and deeply asleep in a warm bedroom under soft " +
        "bedcovers, a peaceful smile, while the five-star constellation " +
        "twinkles softly outside in the quiet night sky; soft moonlight fills " +
        "the quiet room.",
      {
        kind: "closing",
        framing: "sleeping/bed-covered",
        spread: true,
        outfitOverride:
          "soft blue pajamas with a small star pattern (slippers are placed beside the bed on the floor and are not worn or visible under the covers)",
        light:
          "Soft cool blue moonlight from the window mixing with the constellation's gentle glow; eye-level camera beside the bed.",
        companionOverride: null,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} slept soundly, safe and warm.\n\n` +
        `Outside the window, a little five-star constellation twinkled on, ` +
        `whole and happy again. And somewhere in ${p.poss} dreams, a tiny ` +
        `star was still waving thank you.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    framing: "sleeping/bed-covered",
    illustrationPrompt: illustration(
      "Sleeping peacefully with a soft, contented smile, against a simple " +
        "pastel night sky with a few gentle twinkling stars, calm and quiet.",
      {
        kind: "backcover",
        framing: "sleeping/bed-covered",
        companionOverride: null,
        outfitOverride:
          "soft blue pajamas with a small star pattern (no footwear in bed)",
      },
    ),
    text: (c) =>
      `The End…\n...sleep tight, ${c.name}. The stars are watching over you.`,
  },
];

/** The "Starlit Dream" book, ready to register in `registry.ts`. */
export const bedtimeDreamBook: StoryTemplate = {
  id: "bedtime-dream",
  title: "Starlit Dream",
  subtitle: "A gentle bedtime journey to help a tiny lost star find its way home.",
  pages: bedtimeDreamPages,
  defaultOutfit: DEFAULT_OUTFIT,
  companion: TWINKLE,
};

// ---------------------------------------------------------------------------
// standard-24 StoryEdition: each of the 10 original beats becomes two
// sequential, visually distinct moments. Twinkle's presence pattern is
// preserved exactly: absent (companionOverride: null) before meeting her
// (beats 0-2), present through beats 3-7, then absent again once she joins
// the constellation and is no longer beside the child (beats 8-9).
// ---------------------------------------------------------------------------

import { registerStoryEdition, type StoryEdition, type StoryEditionScene } from "./storyEdition";
import { buildGreetingScene, buildVideoQrScene } from "./standardEditionScenes";

function reuseBDSpec(spec: PageSpec, sceneId: string): StoryEditionScene {
  return { sceneId, kind: spec.kind, role: spec.role, illustrationPrompt: spec.illustrationPrompt, text: spec.text, legacyFilenames: [] };
}

function bdScene(
  sceneId: string,
  scene: string,
  copy: (c: ChildProfile, p: Pronouns) => string,
  opts: {
    light?: string;
    spread?: boolean;
    framing?: FramingMode;
    compositionNotes?: string;
    companionOverride?: CompanionSpec | null;
  } = {},
): StoryEditionScene {
  const { spread: _spread, ...promptOpts } = opts;
  return {
    sceneId,
    kind: "scene",
    illustrationPrompt: illustration(scene, { kind: "scene", ...promptOpts }),
    text: (c) => copy(c, pronouns(c.gender)),
    legacyFilenames: [],
  };
}

const bdScenes: StoryEditionScene[] = [
  bdScene(
    "star-arrives",
    "Sitting up gently in bed in soft pajamas as a friendly silver guiding star drifts in through the open " +
      "window, a warm sleepy smile.",
    (c) => `Just as ${c.name} was drifting off to sleep, a soft silver guiding star drifted in through the window.`,
    { light: "Soft warm glow from the silver star mixing with cool moonlight; eye-level camera beside the bed.", companionOverride: null },
  ),
  bdScene(
    "star-invites",
    "Reaching out a curious hand toward the gentle silver light hovering just past the window, a warm sleepy " +
      "smile.",
    (c) => `Glowing gently, it seemed like an invitation to a dream.`,
    { light: "Soft warm glow from the silver star mixing with cool moonlight; eye-level camera beside the bed.", companionOverride: null },
  ),
  bdScene(
    "floating-out",
    "Floating gently out through the open window into a soft dream sky following the silver guiding star, " +
      "calm and weightless, arms out like gentle wings.",
    (c) => `The silver star led the way, and ${c.name} floated softly out into the night.`,
    { light: "Soft cool blue night light with warm starlight, calm and even; eye-level camera drifting beside the window.", companionOverride: null },
  ),
  bdScene(
    "night-flight",
    "Drifting peacefully through the open night sky, calm and light as a held breath, a peaceful smile, the " +
      "bedroom glowing warmly behind them.",
    (c) => `Calm and light as a held breath, ${c.name} never fell, only drifted.`,
    { light: "Soft cool blue night light with warm starlight, calm and even; eye-level camera drifting beside the window.", companionOverride: null },
  ),
  bdScene(
    "cloud-path",
    "Drifting gently along a wide, soft cloud path led by the silver guiding star under an enormous, calm " +
      "starry sky.",
    (c) => `A wide, soft cloud path stretched out beneath a sky full of stars.`,
    {
      spread: true,
      light: "Soft, even, warm starlight over the cloud path, calm and dreamlike; wide eye-level camera among the clouds.",
      compositionNotes: "use a wide, calm composition with a gentle, level camera angle — avoid any dramatic or steep perspective; keep the whole child comfortably inside the safe region with nothing crossing the center gutter.",
      companionOverride: null,
    },
  ),
  bdScene(
    "cloud-rest",
    "Resting comfortably on a soft cloud as if it were a cushion, utterly peaceful, following the silver " +
      "guiding star's glow just ahead.",
    (c) => `Following the silver star, ${c.name} settled onto it as gently as settling onto a cushion.`,
    {
      spread: true,
      light: "Soft, even, warm starlight over the cloud path, calm and dreamlike; wide eye-level camera among the clouds.",
      companionOverride: null,
    },
  ),
  bdScene(
    "twinkle-discovered",
    "Kneeling gently on a soft cloud, noticing Twinkle, a tiny lost golden star sitting alone and glowing dim " +
      "and tired nearby.",
    (c) => `There on the cloud path sat Twinkle, a tiny golden star, dimmer than the rest.`,
    { light: "Soft warm glow from Twinkle mixing with cool starlight; eye-level camera on the cloud path." },
  ),
  bdScene(
    "twinkle-comforted",
    "Sitting down right beside Twinkle with a warm, comforting smile, listening gently as the little star " +
      "whispers its worry.",
    (c) => `"I can't find my constellation family," it whispered. ${c.name} sat down right beside it with a comforting smile.`,
    { light: "Soft warm glow from Twinkle mixing with cool starlight; eye-level camera on the cloud path." },
  ),
  bdScene(
    "moon-passing",
    "Floating peacefully past a huge, gentle, smiling crescent moon, listening as it hums a soft, sleepy " +
      "tune, Twinkle glowing a little brighter with hope nearby.",
    (c) => `A great sleepy moon smiled as they passed, humming a slow, soft tune.`,
    { light: "Soft warm moonlight glowing gently from the huge crescent moon; eye-level camera near the moon." },
  ),
  bdScene(
    "moon-guidance",
    "Listening close to the huge sleepy moon as it yawns a gentle direction, Twinkle glowing softly beside " +
      "them.",
    (c) => `"Follow the quiet path," it yawned, "and you'll find the way."`,
    { light: "Soft warm moonlight glowing gently from the huge crescent moon; eye-level camera near the moon." },
  ),
  bdScene(
    "animals-passing",
    "Drifting past a cluster of friendly night animals resting peacefully on the cloud path — a soft owl, a " +
      "gentle fox, and a few calm fireflies glowing quietly.",
    (c) => `Along the path, an owl blinked slowly, a fox curled up snug, and fireflies glowed like tiny lanterns.`,
    { light: "Soft warm firefly-glow mixed with cool moonlight, gentle and dim; eye-level camera on the cloud path." },
  ),
  bdScene(
    "animals-waved",
    "Waving hello softly to the sleeping night animals without waking them, Twinkle floating gently beside " +
      "the child.",
    (c) => `${c.name} waved softly, careful not to wake them.`,
    { light: "Soft warm firefly-glow mixed with cool moonlight, gentle and dim; eye-level camera on the cloud path." },
  ),
  bdScene(
    "garden-arrival",
    "Arriving at a quiet star garden where little stars grow softly like flowers among the clouds, Twinkle " +
      "glowing a little brighter in the peaceful hush.",
    (c) => `They reached a quiet garden where stars grew soft as flowers.`,
    { light: "Soft, even glow from the star-flowers all around, calm and gentle; eye-level camera in the star garden." },
  ),
  bdScene(
    "garden-wonder",
    "Walking slowly among the soft glowing star-flowers with Twinkle, both glowing a little brighter, quiet " +
      "wonder on their face.",
    (c) => `Twinkle glowed brighter and warmer just being there.`,
    { light: "Soft, even glow from the star-flowers all around, calm and gentle; eye-level camera in the star garden." },
  ),
  bdScene(
    "constellation-sighted",
    "Sitting together with Twinkle on a soft cloud, looking up thoughtfully at the quiet night sky above.",
    (c) => `${c.name} looked up at the quiet night sky, thinking hard.`,
    { light: "Soft warm starlight from the matching constellation above; eye-level camera looking upward.", compositionNotes: "wide, calm composition with a gentle, level camera angle — avoid any dramatic or steep perspective." },
  ),
  bdScene(
    "constellation-traced",
    "Gently tracing a constellation of four glowing stars in the sky that leaves one empty spot matching " +
      "Twinkle, who looks up with quiet, joyful recognition.",
    (c) => `${c.name} traced four waiting stars in the sky with one open spot — the exact match for Twinkle. "That's your family," ${c.name} whispered gently.`,
    { light: "Soft warm starlight from the matching constellation above; eye-level camera looking upward.", compositionNotes: "wide, calm composition with a gentle, level camera angle — avoid any dramatic or steep perspective." },
  ),
  bdScene(
    "twinkle-rises",
    "Watching softly from a cloud as Twinkle drifts up toward the empty fifth position among the four " +
      "waiting stars, a quiet, hopeful smile.",
    (c) => `Twinkle drifted up, soft and slow, toward the open spot among the four waiting stars.`,
    { light: "Soft warm glow from the now-complete five-star constellation; eye-level camera looking upward.", companionOverride: null },
  ),
  bdScene(
    "constellation-complete",
    "Watching from a cloud in quiet peace as all five stars glow warmly together, the constellation now " +
      "complete overhead, a soft happy smile.",
    (c) => `Now five bright stars shone together, and the little constellation glowed warm and whole again.`,
    { light: "Soft warm glow from the now-complete five-star constellation; eye-level camera looking upward.", companionOverride: null },
  ),
  bdScene(
    "flying-home",
    "Flying gently home across the peaceful night sky, arms open in a calm, happy glide, while the complete " +
      "five-star constellation twinkles softly above.",
    (c) => `Home ${c.name} drifted, calm and happy, the little five-star constellation twinkling softly in the sky above.`,
    {
      spread: true,
      light: "Soft warm glow from the window ahead mixing with gentle starlight; wide eye-level camera drifting toward home.",
      compositionNotes: "keep this wide and calm — a gentle glide, not a dramatic swoop; nothing crossing the center gutter, the child comfortably inside the safe region.",
      companionOverride: null,
    },
  ),
  bdScene(
    "window-arrival",
    "Gliding gently toward the warmly glowing bedroom window, the five-star constellation twinkling softly " +
      "in the sky behind them, calm and happy.",
    (c) => `All the way to the window, the little constellation twinkled softly behind ${c.name}.`,
    {
      spread: true,
      light: "Soft warm glow from the window ahead mixing with gentle starlight; wide eye-level camera drifting toward home.",
      companionOverride: null,
    },
  ),
];

export const bedtimeDreamStandard24Edition: StoryEdition = {
  id: "standard-24",
  storyId: "bedtime-dream",
  interiorPageCount: 24,
  greeting: buildGreetingScene(
    STORY_META,
    "A calm, dreamy portrait moment sitting up gently in bed in soft blue pajamas, looking toward the viewer " +
      "with a warm sleepy smile, soft moonlight and a few gentle stars glowing through the window behind them.",
    (c) => `A special adventure created just for ${c.name}.`,
  ),
  intro: reuseBDSpec(bedtimeDreamPages[1], "intro"),
  scenes: bdScenes,
  closing: reuseBDSpec(bedtimeDreamPages[12], "closing"),
  videoQr: buildVideoQrScene(
    STORY_META,
    "A calm, low-detail deep-blue night sky background with soft blurred star silhouettes, echoing the " +
      "story's gentle starlight glow.",
  ),
  cover: {
    front: reuseBDSpec(bedtimeDreamPages[0], "cover"),
    back: reuseBDSpec(bedtimeDreamPages[13], "backcover"),
  },
};

registerStoryEdition(bedtimeDreamStandard24Edition);
