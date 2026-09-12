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
  PageKind,
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
      "from a smooth spiral conch shell that glows with warm golden light, " +
      "eyes wide with wonder as gentle waves roll in behind them.",
    copy: (c) =>
      `Half-buried at the tideline, ${c.name} found a smooth spiral shell ` +
      `that glowed softly, warm as sunlight, even though it had come from ` +
      `the cool sea.`,
    light:
      "Bright warm midday sun over the beach, sparkling on the waves; eye-level camera at the tideline.",
    companionOverride: null,
  },
  {
    scene:
      "Wading into the shallows holding the glowing spiral shell up as it " +
      "brightens, a soft shimmering magical bubble of light enveloping the " +
      "child, allowing free breathing and swimming as feet lift gently off " +
      "the sandy bottom.",
    copy: (c) =>
      `The shell glowed brighter with every step into the water — until a ` +
      `soft, shimmering bubble of light wrapped around ${c.name}, and the sea ` +
      `welcomed ${c.name} in.`,
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
      "safe region with nothing crossing the center gutter; keep the child's " +
      "hands and feet fully inside the frame.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
    companionOverride: null,
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
      "noticing the central pedestal where the guiding pearl rests is empty " +
      "and dim, a look of gentle concern as Coral nudges closer, worried too.",
    copy: (c) =>
      `At the kingdom's heart stood a grand coral archway — but its central ` +
      `pedestal sat empty and dark. "The guiding pearl is missing," Coral ` +
      `seemed to say with a worried nudge.`,
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
      "keep the child's limbs and Coral's tail fully inside the safe area " +
      "— no cropping at the frame edges.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Hovering gently in a low swim pose before a shy, luminous round " +
      "pearl nestled in a soft anemone and guarded by a ring of tiny curious " +
      "fish, offering an open, patient hand to earn the fish's trust.",
    copy: (c) =>
      `The luminous pearl glowed shyly, guarded by a ring of tiny curious ` +
      `fish. ${c.name} waited, patient and gentle, until the little fish ` +
      `trusted ${c.name} enough to let it go.`,
    light:
      "Soft warm glow from the pearl itself, gentle against the blue water; eye-level underwater camera.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
  },
  {
    scene:
      "Placing the luminous round pearl gently back onto the coral " +
      "archway pedestal as radiant light floods outward across the entire " +
      "reef, Coral leaping joyfully through the water, fish swirling in " +
      "celebration all around.",
    copy: (c, p) =>
      `${c.name} placed the pearl gently back into the archway pedestal — ` +
      `and brilliant light flooded the entire reef! Coral leapt with joy, ` +
      `and the warm current guided ${c.name} safely up to the golden beach ` +
      `as ${p.subj} waved a happy goodbye.`,
    spread: true,
    ink: "dark",
    light:
      "Bright, warm, radiant light flooding outward from the restored pearl; wide eye-level underwater camera at the archway.",
    compositionNotes:
      "keep the child and Coral safely inside the frame with roughly a " +
      "10-12% margin from the outer edge — a wide celebratory shot; keep " +
      "all limbs and Coral's fins fully inside the safe area.",
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
      "A wide cover hero scene: swimming gracefully on the RIGHT side of the " +
        "frame near a colorful coral reef entrance, enveloped in a soft " +
        "shimmering magical breathing bubble, turned toward the viewer with " +
        "a big joyful smile, holding the glowing spiral shell, with Coral " +
        "the dolphin swimming playfully at their side. Frame the child from " +
        "about the waist up so the FACE IS LARGE, clear, and front-facing " +
        "(or a gentle three-quarter angle) toward the camera — the face is " +
        "the focal point and must unmistakably look like the real child in " +
        "the reference photos, with their hair exactly as in those photos.",
      {
        kind: "cover",
        light:
          "Bright sunbeams streaming down through clear blue water, warm and sparkling, lighting the child from the front; eye-level underwater camera.",
        compositionNotes:
          "keep the lower portion calm and open — soft " +
          "blue water with no part of the child there — so a large title " +
          "can sit in the lower area without covering the child.",
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
      "Walking along the edge of a sunny sandy beach barefoot, looking down " +
        "at the sparkling water and colorful pebbles with bright, curious " +
        "eyes, gentle turquoise waves lapping at the shore.",
      {
        kind: "intro",
        spread: true,
        companionOverride: null,
        light:
          "Bright warm midday sun sparkling on the ocean waves; eye-level camera at the beach.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} loved the rhythm of the ocean — running barefoot along ` +
        `the warm tide and searching for ocean treasures. Today, the sea ` +
        `had a secret waiting just for ${p.obj}.`
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
      "Sitting wrapped comfortably in a warm fluffy towel on the sandy " +
        "beach at sunset, holding the smooth spiral shell quietly in cupped " +
        "hands as it gives off a faint gentle shimmer, a peaceful happy " +
        "smile, gentle dusk waves rolling onto the sand.",
      {
        kind: "closing",
        spread: true,
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
        "shimmering spiral shell, against a soft simple pastel sky with the ocean " +
        "and a gentle dolphin fin silhouette in the far distance.",
      { kind: "backcover", companionOverride: null },
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
