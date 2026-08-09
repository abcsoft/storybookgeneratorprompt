/**
 * The "Rainbow Kingdom" storybook template.
 *
 * A child follows a glowing ribbon through a hidden garden gateway into an
 * enchanted kingdom, where a gentle unicorn named Luma explains that the
 * kingdom's rainbow has faded. Through small acts of courage and kindness —
 * crossing a cloud bridge, helping a shy creature, braving a waterfall of
 * light — the child finds each missing color and restores the rainbow for
 * one joyful celebration.
 *
 * Built entirely on the shared prompt engine (lib/story/prompt) — same as
 * greatAdventureTemplate.ts. This file defines ONLY story metadata, scene
 * text, layout, scene-specific composition notes, and its own wardrobe/
 * companion — every identity, style, composition-safety, and negative rule
 * is inherited from buildIllustrationPrompt(), never repeated here. Print
 * geometry comes from whichever PrintProfile the manual workflow has
 * selected — this template has no opinion on it.
 *
 * Kept premium, not overly pink or cluttered: soft pastels and gold accents,
 * one elegant, visually consistent unicorn.
 *
 * 14 page specs — cover, opening, 10 kingdom scenes, closing, back cover.
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

/** Luma, kept consistent page-to-page via the shared companion-rules block
 *  instead of being re-described by hand in every scene. */
const LUMA: CompanionSpec = {
  name: "Luma",
  description:
    "an elegant unicorn with a pearl-white coat, a flowing pastel mane and " +
    "tail streaked softly with rainbow colors, and one spiraled golden horn",
  consistencyRules:
    "same pearl-white coat, same pastel rainbow-streaked mane and tail, same " +
    "single spiraled golden horn and gentle eyes, same size and body " +
    "proportions on every page — a single unicorn only, never duplicated, " +
    "never a different color or a second horn",
};

/** The standard adventure outfit, worn on every page unless a scene opts into
 *  the bedtime variant below. */
const DEFAULT_OUTFIT =
  "a soft lavender long-sleeve top, a pale gold pinafore dress or overalls, " +
  "white leggings, and simple soft ankle boots";

const SPECIAL_OUTFITS: Record<string, string> = {
  pajamas: "cozy pajamas with a small star pattern — no pinafore or boots",
};

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: LUMA };

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

/** One beat of the kingdom's journey: the scene to illustrate and the verse. */
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
      "Kneeling in a garden at dusk, discovering a single glowing ribbon " +
      "caught on a rosebush, holding it up to the light with a look of pure " +
      "curiosity; soft golden dusk light settling over the flower beds.",
    copy: (c) =>
      `Caught on a rosebush, ${c.name} found a ribbon that shimmered like ` +
      `starlight. It seemed to want to lead somewhere.`,
    light:
      "Soft golden dusk light from the low sun, warm over the flower beds; eye-level camera at kneeling height in the garden.",
    companionOverride: null,
  },
  {
    scene:
      "Following the glowing ribbon's trail to an ivy-covered stone archway " +
      "at the back of the garden that wasn't there before, gently pushing " +
      "aside trailing ivy to reveal a soft golden light beyond.",
    copy: (c, p) =>
      `The ribbon led ${p.obj} to an old stone archway, wrapped in ivy — one ` +
      `${p.subj} was certain had never been there before. Beyond it glowed a ` +
      `soft golden light.`,
    light:
      "Warm golden light glowing from beyond the archway; eye-level camera at the garden's edge.",
    companionOverride: null,
  },
  {
    scene:
      "Stepping through the archway into a breathtaking enchanted forest of " +
      "tall silver-barked trees and floating soft lights, meeting Luma the " +
      "unicorn for the first time, both looking at each other with gentle " +
      "wonder.",
    copy: (c) =>
      `On the other side stood a forest unlike any ${c.name} had seen — and ` +
      `beneath the silver trees waited a unicorn with a mane like a soft ` +
      `rainbow.`,
    spread: true,
    ink: "dark",
    light:
      "Soft magical glow from floating lights through the silver forest canopy; wide eye-level camera at the forest entrance.",
    compositionNotes:
      "wide magical reveal — keep the whole child and Luma comfortably " +
      "inside the safe region with nothing crossing the center gutter; keep " +
      "Luma's horn and ears fully inside the frame.",
  },
  {
    scene:
      "Walking together through a meadow of giant glowing flowers taller " +
      "than themselves, laughing as petals drift softly down like snow, " +
      "Luma trotting playfully alongside.",
    copy: (c) =>
      `Through a meadow of giant glowing flowers they wandered, petals ` +
      `drifting down like soft, shining snow.`,
    light:
      "Soft warm glow from the giant flowers themselves, gentle and even; eye-level camera in the meadow.",
    compositionNotes: "keep Luma's horn and ears fully inside the frame.",
  },
  {
    scene:
      "Kneeling at the edge of a sparkling crystal-clear stream, cupping " +
      "glowing water in both hands as Luma bends to drink beside them, a " +
      "quiet moment of friendship.",
    copy: (c) =>
      `At a stream of clear, glowing water, ${c.name} cupped a handful and ` +
      `Luma drank beside ${c.name}. It was the start of a real friendship.`,
    light:
      "Cool sparkling light reflecting off the stream; eye-level camera at the streambank.",
    compositionNotes: "keep Luma's horn and ears fully inside the frame.",
  },
  {
    scene:
      "Standing with Luma on a wide cloud bridge overlook, both looking up " +
      "at a pale, colorless sky where a rainbow should be, expressions " +
      "turning thoughtful and a little sad.",
    copy: (c, p) =>
      `From the cloud bridge, Luma looked up at a pale, empty sky. "Our ` +
      `rainbow has faded," ${p.subj} said softly. "Without it, the kingdom ` +
      `grows quiet."`,
    ink: "dark",
    light:
      "Soft, pale, overcast light with gentle diffuse cloud glow; eye-level camera on the cloud bridge.",
    compositionNotes:
      "keep Luma's horn and ears fully inside the frame; wide calm " +
      "composition, nothing crossing the center gutter if rendered as a " +
      "spread.",
  },
  {
    scene:
      "Bravely crossing a narrow, glowing cloud path high above the kingdom, " +
      "one hand steady on Luma's mane for balance, reaching the far side " +
      "where a single ribbon of red-gold light now curls into the sky.",
    copy: (c) =>
      `Step by careful step, ${c.name} crossed the narrow cloud path — and ` +
      `on the far side, one ribbon of golden-red light curled back into the ` +
      `sky.`,
    light:
      "Warm golden-red glow from the returning color mixing with soft cloud light; eye-level camera on the cloud path.",
    compositionNotes:
      "keep both of the child's hands and their head fully visible while " +
      "crossing — no arm or foot may leave the frame; keep Luma's horn and " +
      "ears fully inside the frame.",
  },
  {
    scene:
      "Kneeling beside a shy, small glowing creature tangled in silver vines " +
      "at the edge of a glade, gently helping it free, Luma watching warmly " +
      "as a ribbon of green light rises into the sky.",
    copy: (c) =>
      `In a quiet glade, a shy little creature was tangled in vines. ${c.name} ` +
      `freed it with gentle hands — and a ribbon of green light rose into ` +
      `the sky.`,
    light:
      "Soft green-tinted glow from the glade mixing with the rising light; eye-level camera at kneeling height.",
  },
  {
    scene:
      "Standing bravely at the edge of a gentle waterfall of shimmering " +
      "light, reaching a hand through it with a determined smile as the last " +
      "ribbon of blue-violet color swirls free, Luma close beside them.",
    copy: (c) =>
      `At last, one color remained. ${c.name} took a breath and reached ` +
      `through a waterfall of shimmering light — and the final ribbon of ` +
      `blue-violet swirled free.`,
    light:
      "Cool shimmering light from the waterfall of light, softly glowing; eye-level camera at the waterfall.",
    compositionNotes: "keep Luma's horn and ears fully inside the frame.",
  },
  {
    scene:
      "Standing together beneath a magnificent full rainbow arching across " +
      "the whole kingdom sky, arms raised in joy, Luma rearing gently in " +
      "celebration, soft magical sparkles drifting all around.",
    copy: (c) =>
      `Color by color, the rainbow returned — until it arched whole and ` +
      `bright across the entire sky. The kingdom sparkled with joy, and so ` +
      `did ${c.name}.`,
    spread: true,
    ink: "dark",
    light:
      "Bright, warm, magical light from the restored rainbow glowing across the sky; wide eye-level camera in the meadow.",
    compositionNotes:
      "keep the child and Luma safely inside the frame with roughly a " +
      "10-12% margin from the outer edge — a wide celebratory shot; keep " +
      "Luma's horn and ears fully inside the frame, never cropped.",
  },
];

/** The full ordered book: cover + opening + kingdom scenes + closing + back. */
const rainbowKingdomPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "A wide cover hero scene at golden hour: standing on the RIGHT side of " +
        "the frame beside Luma the unicorn at the edge of an enchanted " +
        "forest, turned toward the viewer with a big joyful smile, holding a " +
        "glowing ribbon, with a soft magical kingdom visible beyond. Frame " +
        "the child from about the waist up so the FACE IS LARGE, clear, and " +
        "front-facing (or a gentle three-quarter angle) toward the camera — " +
        "the face is the focal point and must unmistakably look like the " +
        "real child in the reference photos, with their hair exactly as in " +
        "those photos. Keep Luma's horn and ears fully inside the frame.",
      {
        light:
          "Warm golden-hour light from the low sun, soft and glowing, lighting the child from the front; eye-level camera at the forest edge.",
        compositionNotes:
          "keep the entire LEFT side and the lower-left calm and open — soft " +
          "magical scenery with no part of the child there — so a large " +
          "title can sit in the lower-left without covering the child.",
      },
    ),
    text: (c) => `${c.name}'s Rainbow Kingdom`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "In a sunny garden at dusk, kneeling beside a rosebush, holding up a " +
        "single glowing ribbon caught on the thorns, an old ivy-covered stone " +
        "archway just visible in the background.",
      {
        spread: true,
        light:
          "Soft golden dusk light over the garden; eye-level camera at kneeling height by the rosebush.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `One quiet evening, ${c.name} found a ribbon that shimmered like ` +
        `starlight, caught on a rosebush at the edge of the garden. ` +
        `${cap(p.poss)} most magical adventure was about to begin.`
      );
    },
  },
  // 10 kingdom scenes
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
      "Tucked cozily in bed at night in a warm bedroom, with the glowing " +
        "ribbon resting on the windowsill, now shimmering with every color of " +
        "the rainbow, soft moonlight and a peaceful, happy smile.",
      {
        spread: true,
        light:
          "Soft cool blue moonlight from the window plus the ribbon's gentle rainbow glow; eye-level camera beside the bed.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
        companionOverride: null,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} was home, safe and warm.\n\n` +
        `On the windowsill, the little ribbon still shimmered with every ` +
        `color of the rainbow — a quiet reminder of a kingdom, a gentle ` +
        `unicorn, and just how much courage ${p.poss} kindness could hold.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile, holding the shimmering " +
        "rainbow ribbon, against a soft simple pastel sky with a faint gentle " +
        "rainbow arc in the far distance.",
      { companionOverride: null },
    ),
    text: (c) =>
      `The End…\n...but somewhere, a kingdom still sparkles because of ${c.name}.`,
  },
];

/** The "Rainbow Kingdom" book, ready to register in `registry.ts`. */
export const rainbowKingdomBook: StoryTemplate = {
  id: "rainbow-kingdom",
  title: "Rainbow Kingdom",
  subtitle: "A gentle unicorn and a missing rainbow, restored through kindness.",
  pages: rainbowKingdomPages,
  defaultOutfit: DEFAULT_OUTFIT,
  specialOutfits: SPECIAL_OUTFITS,
  companion: LUMA,
};
