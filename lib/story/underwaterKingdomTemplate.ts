/**
 * The "Secret Under the Sea" storybook template.
 *
 * A child finds a glowing shell on the beach and is carried into a
 * magical underwater kingdom — meeting Coral the dolphin, exploring a
 * glowing coral reef and a swaying kelp garden, and discovering that the
 * kingdom's guiding pearl has gone missing. Through gentle courage and
 * kindness, the pearl is found and returned, lighting the whole reef.
 *
 * Built entirely on the shared prompt engine (lib/story/prompt) — same as
 * greatAdventureTemplate.ts. This file defines ONLY story metadata, scene
 * text, layout, scene-specific composition notes, and its own wardrobe/
 * companion — every identity, style, composition-safety, and negative rule
 * is inherited from buildIllustrationPrompt(), never repeated here. Print
 * geometry comes from whichever PrintProfile the manual workflow has
 * selected — this template has no opinion on it.
 *
 * Each underwater location is deliberately visually distinct (reef, kelp
 * garden, grotto) rather than repeating the same coral-reef backdrop.
 *
 * 14 page specs — cover, opening, 10 undersea scenes, closing, back cover.
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

/** Coral, kept consistent page-to-page via the shared companion-rules block
 *  instead of being re-described by hand in every scene. */
const CORAL: CompanionSpec = {
  name: "Coral",
  description:
    "a small friendly bottlenose dolphin with smooth grey-blue skin and a " +
    "playful curved smile",
  consistencyRules:
    "same smooth grey-blue skin, same curved dorsal fin and playful smile, " +
    "same size and body proportions on every page — a single dolphin only, " +
    "never duplicated, never a different species",
};

/** The beach outfit, worn on land (cover, intro, backcover). */
const DEFAULT_OUTFIT =
  "a bright turquoise swimsuit with a small starfish-shaped clip, and bare feet";

const SPECIAL_OUTFITS: Record<string, string> = {
  underwater:
    "the same turquoise swimsuit, now surrounded by a soft shimmering " +
    "magical glow like a gentle bubble that lets them breathe and swim " +
    "freely, hair flowing gently in the water",
};

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: CORAL };

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

/** One beat of the undersea journey: the scene to illustrate and the verse. */
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
      "Kneeling on warm golden sand at the tideline, brushing away wet sand " +
      "from a smooth glowing shell, eyes wide with wonder as gentle waves " +
      "roll in behind them.",
    copy: (c) =>
      `Half-buried at the tideline, ${c.name} found a shell that glowed ` +
      `softly, warm as sunlight, even though it had come from the cool sea.`,
    light:
      "Bright warm midday sun over the beach, sparkling on the waves; eye-level camera at the tideline.",
    companionOverride: null,
  },
  {
    scene:
      "Wading into the shallows holding the glowing shell up as it brightens, " +
      "a soft shimmering magical glow beginning to wrap around them like a " +
      "gentle bubble, feet lifting gently off the sandy bottom.",
    copy: (c) =>
      `The shell glowed brighter with every step into the water — until a ` +
      `soft, shimmering glow wrapped around ${c.name}, and the sea welcomed ` +
      `${c.name} in.`,
    light:
      "Cool turquoise light filtering down through the shallows mixing with the shell's warm glow; eye-level camera at the water's surface.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
    companionOverride: null,
  },
  {
    scene:
      "Floating in wide-eyed wonder above a vibrant coral reef bursting with " +
      "color — pink and orange coral towers, schools of bright fish " +
      "swirling past, sunbeams streaming down from the surface above.",
    copy: (c) =>
      `And there it was — a reef bursting with color, fish swirling past ` +
      `like ribbons of light. ${c.name} had never seen anything so alive.`,
    spread: true,
    ink: "dark",
    light:
      "Bright sunbeams streaming down through clear blue water, warm and sparkling; wide eye-level underwater camera at the reef.",
    compositionNotes:
      "wide establishing shot — keep the whole child comfortably inside the " +
      "safe region with nothing crossing the center gutter; keep fins, " +
      "hands, and feet fully inside the frame.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Swimming alongside Coral the dolphin for the first time, both " +
      "circling playfully through a swirl of bubbles, delighted smiles all " +
      "around.",
    copy: (c) =>
      `A friendly shape glided close — Coral the dolphin, circling ${c.name} ` +
      `in a swirl of happy bubbles. A new friendship, sealed instantly.`,
    light:
      "Cool bright blue light with dancing sunbeam patterns; eye-level underwater camera.",
    compositionNotes: "keep Coral's fins and tail fully inside the frame.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Following a gentle old sea turtle who glides ahead calmly, pointing " +
      "the way with a slow wave of its flipper, past a sloping field of " +
      "gently swaying sea fans.",
    copy: (c) =>
      `A wise old sea turtle glided by and gave a slow, knowing wave — this ` +
      `way, it seemed to say. ${c.name} and Coral followed, curious.`,
    light:
      "Soft blue-green light filtering through swaying sea fans; eye-level underwater camera.",
    compositionNotes: "keep the turtle's flippers and shell fully inside the frame.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Drifting through a glowing underwater garden of tall swaying kelp and " +
      "soft glowing anemones in gentle pastel colors, hands trailing through " +
      "the glow, Coral weaving playfully between the kelp stalks.",
    copy: (c) =>
      `The kelp garden glowed soft pink and gold, swaying like a slow, quiet ` +
      `dance. ${c.name} trailed a hand through the light as Coral wove ` +
      `between the stalks.`,
    light:
      "Soft glowing pastel light from the anemones themselves, gentle and even; eye-level underwater camera.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Floating before a grand coral archway at the kingdom's heart, " +
      "noticing the usually-bright center is dim and grey, a look of gentle " +
      "concern as Coral nudges closer, worried too.",
    copy: (c) =>
      `At the kingdom's heart stood a grand coral archway — but its center, ` +
      `usually glowing bright, sat dim and grey. "The pearl is missing," ` +
      `Coral seemed to say with a worried nudge.`,
    ink: "dark",
    light:
      "Cool, dim, slightly muted light around the darkened archway; eye-level underwater camera.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Exploring a shimmering, gentle underwater grotto lit by glowing " +
      "crystals in the walls, peering carefully into a quiet alcove, Coral " +
      "close behind for company.",
    copy: (c) =>
      `Inside a glowing grotto, crystals lit the walls like soft lanterns. ` +
      `${c.name} searched every quiet alcove, Coral close behind.`,
    light:
      "Warm glow from crystal-lit walls mixing with cool ambient blue water; eye-level underwater camera inside the grotto.",
    compositionNotes:
      "keep the child's fins/limbs and Coral's tail fully inside the safe " +
      "area — no cropping at the frame edges.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Kneeling gently before a shy, small glowing pearl guarded by a circle " +
      "of tiny curious fish, offering an open, patient hand instead of " +
      "reaching for it, earning the fish's trust.",
    copy: (c) =>
      `The pearl glowed shyly, guarded by a ring of tiny curious fish. ` +
      `${c.name} waited, patient and gentle, until the little fish trusted ` +
      `them enough to let it go.`,
    light:
      "Soft warm glow from the pearl itself, gentle against the blue water; eye-level underwater camera.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Placing the glowing pearl back into the heart of the coral archway as " +
      "brilliant light floods outward across the whole reef, Coral leaping " +
      "joyfully through the light, fish swirling in celebration all around.",
    copy: (c) =>
      `${c.name} placed the pearl gently back into place — and light flooded ` +
      `the whole reef at once. Coral leapt for joy as the kingdom sparkled ` +
      `back to life.`,
    spread: true,
    ink: "dark",
    light:
      "Bright, warm, radiant light flooding outward from the restored pearl; wide eye-level underwater camera at the archway.",
    compositionNotes:
      "keep the child and Coral safely inside the frame with roughly a " +
      "10-12% margin from the outer edge — a wide celebratory shot; keep " +
      "fins, tails, and limbs fully inside the safe area.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
];

/** The full ordered book: cover + opening + undersea scenes + closing + back. */
const underwaterKingdomPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "A wide cover hero scene: standing on the RIGHT side of the frame " +
        "mid-swim near a colorful coral reef entrance, wrapped in a soft " +
        "shimmering magical glow, turned toward the viewer with a big " +
        "joyful smile, holding the glowing shell, with Coral the dolphin at " +
        "their side. Frame the child from about the waist up so the FACE IS " +
        "LARGE, clear, and front-facing (or a gentle three-quarter angle) " +
        "toward the camera — the face is the focal point and must " +
        "unmistakably look like the real child in the reference photos, " +
        "with their hair exactly as in those photos.",
      {
        light:
          "Bright sunbeams streaming down through clear blue water, warm and sparkling, lighting the child from the front; eye-level underwater camera.",
        compositionNotes:
          "keep the entire LEFT side and the lower-left calm and open — soft " +
          "blue water with no part of the child there — so a large title " +
          "can sit in the lower-left without covering the child.",
        outfitOverride: SPECIAL_OUTFITS.underwater,
      },
    ),
    text: (c) => `${c.name}'s Secret Under the Sea`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "On a sunny beach at the tideline, kneeling in the wet sand with a " +
        "glowing shell held in both hands, gentle waves rolling in, a look " +
        "of pure curiosity.",
      {
        spread: true,
        light:
          "Bright warm midday sun sparkling on the waves; eye-level camera at the tideline.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} always collected the best shells at the tideline. This ` +
        `one felt different — warm, glowing, and humming with a secret ` +
        `only ${p.subj} could hear.`
      );
    },
  },
  // 10 undersea scenes
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
      "Sitting wrapped in a warm towel on the beach at sunset, the glowing " +
        "shell now resting quietly in cupped hands with just a faint " +
        "shimmer, a peaceful happy smile, gentle waves at dusk.",
      {
        light:
          "Soft warm sunset light over the beach mixing with the shell's faint glow; eye-level camera on the sand.",
        companionOverride: null,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} sat wrapped in a warm towel as the sun went down.\n\n` +
        `The little shell had gone quiet now, its glow just a soft shimmer ` +
        `— a secret kept safe. Somewhere below, a whole kingdom sparkled ` +
        `because of ${p.poss} kindness.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile, holding the softly " +
        "shimmering shell, against a soft simple pastel sky with the ocean " +
        "and a gentle dolphin fin silhouette in the far distance.",
      { companionOverride: null },
    ),
    text: (c) =>
      `The End…\n...but somewhere under the waves, a kingdom still glows because of ${c.name}.`,
  },
];

/** The "Secret Under the Sea" book, ready to register in `registry.ts`. */
export const underwaterKingdomBook: StoryTemplate = {
  id: "underwater-kingdom",
  title: "Secret Under the Sea",
  subtitle: "A magical shell leads to a glowing coral kingdom and a new friend.",
  pages: underwaterKingdomPages,
  defaultOutfit: DEFAULT_OUTFIT,
  specialOutfits: SPECIAL_OUTFITS,
  companion: CORAL,
};
