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
  LayoutType,
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
    compositionNotes?: string;
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
      companionOverride: opts.companionOverride,
    });
}

/** One beat of the dream-sky journey: the scene to illustrate and the verse. */
interface Beat {
  scene: string;
  copy: (c: ChildProfile, p: Pronouns) => string;
  spread?: boolean;
  ink?: "light" | "dark";
  light?: string;
  compositionNotes?: string;
  companionOverride?: CompanionSpec | null;
}

const STORY: Beat[] = [
  {
    scene:
      "Sitting up gently in bed as one small glowing star drifts in through " +
      "the open window, reaching out a curious hand toward the soft light, " +
      "a warm sleepy smile.",
    copy: (c) =>
      `Just as ${c.name} was drifting off to sleep, one small star drifted ` +
      `in through the window — soft, warm, and glowing gently.`,
    light:
      "Soft warm golden glow from the little star mixing with cool moonlight; eye-level camera beside the bed.",
    companionOverride: null,
  },
  {
    scene:
      "Floating gently out through the open window into a soft dream sky, " +
      "calm and weightless, arms out like gentle wings, a peaceful smile, " +
      "the bedroom glowing warmly behind them.",
    copy: (c) =>
      `The star led the way, and ${c.name} floated softly out into the ` +
      `night — calm and light as a held breath, never falling, only ` +
      `drifting.`,
    light:
      "Soft cool blue night light with warm starlight, calm and even; eye-level camera drifting beside the window.",
    companionOverride: null,
  },
  {
    scene:
      "Drifting gently along a wide, soft cloud path under an enormous, calm " +
      "starry sky, resting comfortably on a cloud as if it were a cushion, " +
      "utterly peaceful.",
    copy: (c) =>
      `A wide, soft cloud path stretched out beneath a sky full of stars. ` +
      `${c.name} settled onto it as gently as settling onto a cushion.`,
    spread: true,
    ink: "dark",
    light:
      "Soft, even, warm starlight over the cloud path, calm and dreamlike; wide eye-level camera among the clouds.",
    compositionNotes:
      "use a wide, calm composition with a gentle, level camera angle — " +
      "avoid any dramatic or steep perspective; keep the whole child " +
      "comfortably inside the safe region with nothing crossing the center " +
      "gutter.",
  },
  {
    scene:
      "Kneeling gently on a soft cloud beside Twinkle, a tiny lost star " +
      "sitting alone and a little dim, offering a warm, comforting smile.",
    copy: (c) =>
      `Sitting alone on the cloud path was a tiny star, dimmer than the ` +
      `rest. "I can't find my way home," it said softly. ${c.name} sat ` +
      `down right beside it.`,
    light:
      "Soft warm glow from Twinkle mixing with cool starlight; eye-level camera on the cloud path.",
  },
  {
    scene:
      "Floating peacefully past a huge, gentle, smiling crescent moon, " +
      "listening as it hums a soft, sleepy tune, Twinkle glowing a little " +
      "brighter nearby.",
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
      "fireflies glowing quietly — waving hello without waking them.",
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
      `Twinkle glowed a little brighter just being there.`,
    light:
      "Soft, even glow from the star-flowers all around, calm and gentle; eye-level camera in the star garden.",
  },
  {
    scene:
      "Sitting together with Twinkle, gently tracing a pattern of five soft " +
      "stars in the sky that matches Twinkle's own shape, both looking up " +
      "with quiet, growing recognition.",
    copy: (c) =>
      `${c.name} looked up and traced five soft stars in the sky — the same ` +
      `shape as Twinkle. "That's your family," ${c.name} whispered gently.`,
    light:
      "Soft warm starlight from the matching constellation above; eye-level camera looking upward.",
    compositionNotes:
      "wide, calm composition with a gentle, level camera angle — avoid any " +
      "dramatic or steep perspective.",
  },
  {
    scene:
      "Watching softly as Twinkle drifts up to nestle gently among four " +
      "other soft glowing stars, completing the constellation, a warm quiet " +
      "smile of happiness, no loud celebration, just peace.",
    copy: (c) =>
      `Twinkle drifted up, soft and slow, and settled gently among four ` +
      `waiting stars. The little constellation glowed warm and whole again.`,
    ink: "dark",
    light:
      "Soft warm glow from the now-complete constellation; eye-level camera looking upward.",
  },
  {
    scene:
      "Flying gently home together across the peaceful night sky, arms open " +
      "in a calm, happy glide, Twinkle's whole constellation twinkling " +
      "softly alongside as the bedroom window glows warmly ahead.",
    copy: (c) =>
      `Home ${c.name} drifted, calm and happy, the little constellation ` +
      `twinkling softly alongside all the way to the window.`,
    spread: true,
    ink: "dark",
    light:
      "Soft warm glow from the window ahead mixing with gentle starlight; wide eye-level camera drifting toward home.",
    compositionNotes:
      "keep this wide and calm — a gentle glide, not a dramatic swoop; " +
      "nothing crossing the center gutter, the child comfortably inside " +
      "the safe region.",
  },
];

/** The full ordered book: cover + opening + dream-sky scenes + closing + back. */
const bedtimeDreamPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
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
        light:
          "Soft warm starlight, calm and even, lighting the child gently from the front; eye-level camera among the clouds.",
        compositionNotes:
          "keep the entire LEFT side and the lower-left calm and open — " +
          "soft night sky with no part of the child there — so a large " +
          "title can sit in the lower-left without covering the child; " +
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
    illustrationPrompt: illustration(
      "In a cozy bedroom at night, sitting up gently in bed, reaching a " +
        "curious hand toward one small glowing star drifting in through the " +
        "open window, warm and sleepy.",
      {
        spread: true,
        light:
          "Soft warm glow from the little star mixing with cool moonlight through the window; eye-level camera beside the bed.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `Every night, ${c.name} watched the stars from bed until ${p.poss} ` +
        `eyes grew heavy. Tonight, one small star came to visit — and to ` +
        `ask for a little help.`
      );
    },
  },
  // 10 dream-sky scenes
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
      "Tucked cozily and deeply asleep in a warm bedroom, a peaceful smile, " +
        "the little constellation glowing softly just outside the window, " +
        "soft moonlight over the quiet room.",
      {
        spread: true,
        light:
          "Soft cool blue moonlight from the window mixing with the constellation's gentle glow; eye-level camera beside the bed.",
        companionOverride: null,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} slept soundly, safe and warm.\n\n` +
        `Outside the window, a little constellation twinkled on, whole and ` +
        `happy again. And somewhere in ${p.poss} dreams, a tiny star was ` +
        `still waving thank you.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Sleeping peacefully with a soft, contented smile, against a simple " +
        "pastel night sky with a few gentle twinkling stars, calm and quiet.",
      { companionOverride: null },
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
