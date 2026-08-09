/**
 * The "Great Adventure" storybook template.
 *
 * Unlike "Dream Big" (a list of standalone career scenes), this is ONE connected
 * story: the child finds a glowing treasure map and, with a little puppy named
 * Scout, journeys across jungle, desert, ocean, ice, and the starry sky to find
 * "the treasure at the end of the world." The narrative thread lives in the copy
 * (continuous flowing prose) plus the recurring map + Scout; each illustration
 * prompt is still fully self-contained so it generates independently.
 *
 * This is the first book migrated onto the reusable prompt engine
 * (lib/story/prompt) — wardrobe and companion continuity are declared once as
 * story metadata below instead of being spelled out by hand in every scene, and
 * every page routes through `buildIllustrationPrompt` for its identity/style/
 * composition/negative rules instead of a bespoke local prompt builder.
 *
 * Pure data + pure functions, so it is trivially unit-testable with no Gemini or
 * PDF involved.
 *
 * ~21 pages: cover, opening, 17 journey scenes, a closing, and a back cover.
 */

import { buildIllustrationPrompt } from "./prompt/buildIllustrationPrompt";
import { pronouns, cap, type Pronouns } from "./textHelpers";
import type {
  ChildProfile,
  CompanionSpec,
  LayoutType,
  PageSpec,
  StoryTemplate,
} from "./types";

/** Scout, kept consistent page-to-page via the shared companion-rules block
 *  instead of being re-described by hand in every scene (see item 4). */
const SCOUT: CompanionSpec = {
  name: "Scout",
  description: "a small fluffy light-brown puppy",
  consistencyRules:
    "same floppy ears, same fur color and length, same size and body " +
    "proportions on every page — a single puppy only, never duplicated, " +
    "never a different breed",
};

/** The standard adventure outfit, worn on every page unless a scene opts into
 *  one of the special outfits below (see item 3 — configurable per story, not
 *  hardcoded into the generic prompt engine). */
const DEFAULT_OUTFIT =
  "a light neutral T-shirt, a khaki explorer vest, khaki shorts, dark outdoor " +
  "shoes, and a small brown explorer backpack";

const SPECIAL_OUTFITS: Record<string, string> = {
  winter:
    "a warm padded winter coat, hat, and mittens over the same explorer shorts " +
    "and dark boots, with the same small brown explorer backpack",
  underwater: "swim shorts and a snorkel mask — no vest or backpack",
  pajamas: "cozy pajamas — no vest, backpack, or shoes",
};

const STORY_META = { defaultOutfit: DEFAULT_OUTFIT, companion: SCOUT };

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

/** One beat of the journey: the scene to illustrate and the verse on the page. */
interface Beat {
  scene: string;
  copy: (c: ChildProfile, p: Pronouns) => string;
  spread?: boolean; // render as a two-page spread
  ink?: "light" | "dark"; // force the verse ink/panel (else auto-detected)
  /** The scene's own light + camera, so the child is lit/framed to match (kills
   *  the "pasted-on" look). Direction + color temperature + softness + camera. */
  light?: string;
  /** Scene-specific composition guidance for problem-prone shots (item 6). */
  compositionNotes?: string;
  /** Temporary costume override (winter/underwater/pajamas) — see SPECIAL_OUTFITS. */
  outfitOverride?: string;
  /** Explicitly drop the companion for a scene that doesn't include Scout. */
  companionOverride?: CompanionSpec | null;
}

const STORY: Beat[] = [
  {
    scene:
      "Standing proudly at the front of a small wooden sailboat leaving a sunny " +
      "little harbour, holding a rolled-up treasure map and pointing out toward " +
      "the open sea, with Scout beside them; gentle waves, soft clouds, and a " +
      "few friendly seagulls.",
    copy: (c, p) =>
      `${c.name} held the map up high and pointed across the bay.\n` +
      `"Come on, Scout!" ${p.subj} said. "Our adventure begins today!"`,
    light:
      "Bright open mid-morning daylight from the upper right, warm and clear over the water; eye-level camera on the boat deck.",
  },
  {
    scene:
      "Trekking along a leafy trail deep in a lush green jungle, pushing aside big " +
      "leaves, as cheeky monkeys swing overhead and bright toucans point the way; " +
      "Scout trots alongside with a wagging tail.",
    copy: (c) =>
      `Their journey first led them into a deep, green jungle. Through the ` +
      `tangled vines, ${c.name} and Scout followed the track. Monkeys swung ` +
      `from the trees, while colorful toucans chattered back!`,
    ink: "dark",
    light:
      "Soft dappled green light filtering through the jungle canopy from above, gently cool and diffuse; eye-level camera on the leafy trail.",
  },
  {
    scene:
      "Carefully crossing a wobbly rope bridge over a thundering jungle waterfall, " +
      "holding the rope with one hand and the map in the other, looking brave, " +
      "with Scout tucked safely in the backpack; misty spray and a little " +
      "rainbow in the air.",
    copy: (c) =>
      `Soon, the path ended at a rushing river, with a wobbly wooden bridge ` +
      `swaying high above the water. Brave ${c.name} held on tight, and Scout ` +
      `stayed close. Step by step, they made it across together.`,
    // Spread — placed so every spread starts on an even page (see lib/pdf/imposition.ts).
    spread: true,
    ink: "dark", // misty light jungle — dark text on a panel reads better than white
    light:
      "Cool, misty, diffuse daylight from the upper left with overcast sky and waterfall spray; eye-level camera looking across the gorge.",
    compositionNotes:
      "keep both of the child's hands and their head fully visible — one hand on " +
      "the rope, the other holding the map — with nothing crossing the center gutter.",
  },
  {
    scene:
      "Riding atop a friendly camel across rolling golden desert dunes toward a " +
      "green palm oasis shimmering in the distance, shading their eyes to read the " +
      "map, with Scout riding happily along; warm sunset sky.",
    copy: (c) =>
      `Leaving the jungle behind, the air grew warm as they stepped into a ` +
      `golden desert. Over the rolling sandy dunes, ${c.name} and Scout rode a ` +
      `friendly camel, as if a tiny star were already lighting the way.`,
    spread: true,
    light:
      "Warm low golden sunset light from the right casting long soft shadows over the dunes; slightly low camera across the desert.",
    compositionNotes:
      "show enough of the camel to clearly read as a ride, but keep the whole " +
      "child and Scout comfortably inside the safe region — don't crop the camel " +
      "or its rider at the frame edge.",
  },
  {
    scene:
      "Exploring ancient sandstone ruins with tall carved pillars, kneeling to " +
      "study a mysterious symbol carved into a stone wall that matches the map, " +
      "with Scout sniffing curiously nearby; warm dusty light and climbing vines.",
    copy: (c, p) =>
      `The camel brought them to ancient stone ruins, where ${c.name} found ` +
      `${p.poss} next clue—a secret carving on the wall that showed ${p.obj} ` +
      `exactly what to do.`,
    light:
      "Warm, dusty late-afternoon light slanting from the right between the tall stone pillars; eye-level camera at kneeling height.",
  },
  {
    scene:
      "Walking along a wide grassy savanna riverbank at sunset, waving up at gentle " +
      "tall giraffes and a herd of elephants drinking at the water, with " +
      "Scout at their heels; a glowing golden-orange sky.",
    copy: (c) =>
      `Following the clue, they traveled to a wide, sunny river valley. ` +
      `${c.name} waved to giraffes standing so tall in the grass. The ` +
      `elephants trumpeted a grand greeting, and Scout barked, "Hello!" to ` +
      `them all!`,
    light:
      "Golden-hour backlight from the low sun behind, warm orange rim light on the grass and animals; eye-level camera on the riverbank.",
  },
  {
    scene:
      "Climbing a snowy, rocky mountain path bundled in a warm coat and little " +
      "backpack, reaching a high ledge where a great eagle soars and the far-off " +
      "sea sparkles far below, with Scout climbing close behind.",
    copy: (c) =>
      `But the map pointed higher, leading them up a towering snowy mountain. ` +
      `${c.name} climbed so high that the air grew chilly. At the peak, a great ` +
      `eagle spread its wings and pointed its beak toward the sparkling sea.`,
    light:
      "Bright, cold, high-altitude daylight from the upper left, crisp and slightly blue; slightly low camera on the snowy ledge.",
    outfitOverride: SPECIAL_OUTFITS.winter,
  },
  {
    scene:
      "Standing on a frozen, snowy Arctic shore beneath shimmering green-and-pink " +
      "northern lights, smiling at two friendly polar bears on the ice, with " +
      "Scout bouncing in the snow; a little wooden boat waiting at the water's edge.",
    copy: (c) =>
      `Before they reached the water, they crossed a land of snowy ice where ` +
      `fluffy polar bears played all around. As night fell, ${c.name} looked up ` +
      `and saw green and pink lights dancing across the sky. The magical lights ` +
      `guided them right to the shore.`,
    light:
      "Dark Arctic night lit by the green-and-pink aurora glow from above and cool moonlight on the snow; eye-level camera on the ice.",
    outfitOverride: SPECIAL_OUTFITS.winter,
  },
  {
    scene:
      "Snorkelling happily underwater in a bright coral reef while wearing a diving " +
      "mask, surrounded by colourful fish as a smiling dolphin and a sea turtle " +
      "guide them gently downward toward a softly glowing passage, with Scout " +
      "paddling happily alongside, wearing its own little diving mask; sparkling " +
      "sunbeams through clear blue water.",
    copy: (c) =>
      `Taking a deep breath, ${c.name} and Scout dove beneath the waves, ` +
      `swimming through the sparkling sea. Colorful fish darted by, and friendly ` +
      `dolphins showed them the way.`,
    spread: true,
    light:
      "Cool blue underwater light with bright sunbeams streaming down from the surface above; eye-level underwater camera.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
    compositionNotes:
      "frame wide enough that no arm, hand, or fin is cut at the edge of the " +
      "frame — keep the whole child and Scout comfortably inside the safe region.",
  },
  {
    scene:
      "Riding gently on the back of a huge friendly blue whale deep in the ocean, " +
      "drifting past glowing jellyfish and a quiet ancient stone archway " +
      "half-buried in the sand; soft beams of light and tiny bubbles in the deep " +
      "blue water.",
    copy: (c) =>
      `When they needed rest, a gentle whale swam by and offered ${c.name} a ` +
      `ride. Glowing jellyfish floated all around, lighting up the dark water ` +
      `like little lanterns.`,
    ink: "dark",
    // Spread — keeps the spreads on even-page starts (see lib/pdf/imposition.ts).
    spread: true,
    light:
      "Dim, deep-blue underwater light from above with a soft glow from the jellyfish; wide eye-level underwater camera.",
    outfitOverride: SPECIAL_OUTFITS.underwater,
    companionOverride: null, // Scout isn't part of this scene — a solo rest moment for the child.
    compositionNotes:
      "show enough of the whale AND the child's complete body — never enlarge " +
      "the child so much that the rider crops at the frame edge; widen the shot " +
      "instead of zooming in.",
  },
  {
    scene:
      "Holding tight to the mast of a small wooden boat in a splashy ocean storm, " +
      "clutching the treasure map and looking determined and brave, with " +
      "Scout sheltered under one arm; big rolling waves and dramatic clouds, but " +
      "a hopeful break of golden light ahead.",
    copy: (c, p) =>
      `But suddenly, they burst up to the surface to find a storm! The waves ` +
      `splashed high, and the wind blew strong. ${c.name} held the map tight, ` +
      `and Scout stayed by ${p.poss} side all along.`,
    light:
      "Dramatic stormy grey overcast light with a hopeful warm break of sun from the upper right; eye-level camera amid the waves.",
    compositionNotes:
      "keep the child's mast-holding arm and hand fully inside the frame — no " +
      "hand, rope, or rigging may cross the edge of the page.",
  },
  {
    scene:
      "Arriving at a sunny tropical treasure island, stepping onto a sandy " +
      "palm-lined cove and pointing excitedly at a tall X-shaped rock, with " +
      "Scout splashing happily in the shallows; turquoise water and swaying palms.",
    copy: (c) =>
      `Just as the storm cleared, they spotted land—a little island with tall, ` +
      `swaying palm trees. ${c.name} looked at the map, then up at a tall rock ` +
      `shaped just like its big red X.\n` +
      `"Look, Scout—X marks the spot!" shouted ${c.name}. Scout's tail wagged. ` +
      `"We found it! Our treasure is waiting!"`,
    light:
      "Bright tropical midday sun from above, warm and clear over turquoise water; eye-level camera on the sandy cove.",
    compositionNotes:
      "the pointing hand and arm must stay fully inside the frame — do not crop " +
      "the pointing gesture at the edge of the page.",
  },
  {
    scene:
      "Exploring a glittering crystal cave lit by the warm glow of the sparkling " +
      "gems themselves, eyes wide at walls of colourful crystals, following a trail " +
      "deeper inside, with Scout sniffing the path ahead.",
    copy: (c) =>
      `Hidden in the rocks was a sparkling crystal cave, where shiny gems ` +
      `glowed all around. ${c.name} and Scout tiptoed inside, following the ` +
      `gems' warm, glittering glow.`,
    ink: "dark", // bright glowing crystals — dark text on a panel reads better than white
    light:
      "Dim cave interior lit by the warm, colourful glow of the crystals themselves and the lantern; eye-level camera inside the cave.",
  },
  {
    scene:
      "Standing in a hidden stone chamber before a big old wooden treasure chest " +
      "that sits on a glowing X marked on the floor, reaching out a hand with a " +
      "thrilled expression, with Scout beside them; shafts of golden light from above.",
    copy: (c, p) =>
      `Deeper inside, the map's X glowed on the cave floor—and right on top sat ` +
      `the treasure chest at last! ${c.name} took a deep breath, reached out ` +
      `${p.poss} hand, and slowly lifted the lid…`,
    ink: "dark",
    light:
      "Dramatic warm golden shafts of light from above into a dim stone chamber; eye-level camera.",
    compositionNotes:
      "the reaching hand and arm must stay fully inside the frame — do not crop " +
      "the reach at the edge of the page.",
  },
  {
    scene:
      "The big wooden treasure chest bursting open in a magnificent swirl of " +
      "golden, sparkling starlight that fills the chamber, the child's face lit " +
      "with wonder and joy, with Scout bouncing with excitement; magical glowing " +
      "particles everywhere.",
    copy: () =>
      `The lid popped open! Golden light sparkled everywhere. Tiny, twinkling ` +
      `stars danced through the cave, making the whole room shine with magic.`,
    // Single page (was a spread) — its facing pair would otherwise be misaligned.
    ink: "dark", // bright golden swirl — dark text on a panel reads better than white
    light:
      "Bright warm golden light radiating outward from the open chest, lighting the child's face, dim cave around; eye-level camera.",
  },
  {
    scene:
      "A single friendly glowing star floating in the air beside the smiling child, " +
      "lighting a sparkling path that points the way home, with " +
      "Scout gazing up in wonder; a soft magical glow all around.",
    copy: (c) =>
      `To their surprise, the greatest treasure wasn't gold or jewels. It was a ` +
      `little shining star—a forever friend who promised to show ${c.name} and ` +
      `Scout the way back home.`,
    ink: "dark", // pale forest path — dark text on a panel reads better than white
    light:
      "Dim dusk forest lit by the soft warm glow of the floating star and fireflies; eye-level camera on the path.",
  },
  {
    scene:
      "Soaring joyfully through a beautiful starry night sky high above the clouds, " +
      "carried along a glowing trail of stars back toward home; one arm reaches " +
      "forward with pure delight while the other arm cradles Scout securely " +
      "against the chest — exactly TWO arms and two hands total, never a third arm " +
      "or an extra hand; the moon and twinkling stars all around.",
    copy: (c) =>
      `With the star glowing brightly to guide them, ${c.name} and Scout flew ` +
      `home through the twinkling night sky. Far below them, the world was fast ` +
      `asleep, glowing in the soft moonlight.`,
    spread: true,
    light:
      "Soft cool moonlight and starlight from above with a magical glowing star-trail; slightly low camera against the night sky.",
    compositionNotes:
      "the forward-reaching arm must stay fully within the safe art page — it " +
      "must never cross into the left (text) page or the center gutter, and " +
      "no hand may enter from any edge.",
  },
];

/** The full ordered book: cover + opening + journey scenes + closing + back. */
const greatAdventurePages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "A wide cover hero scene at golden hour: standing on a grassy clifftop on " +
        "the RIGHT side of the frame and turned toward the viewer with a big " +
        "joyful smile, holding up a rolled treasure map, with a vast world of " +
        "distant mountains, sea, and sky behind them and Scout at their side. " +
        "Frame the child from about the waist up so the FACE IS LARGE, clear, and " +
        "front-facing (or a gentle three-quarter angle) toward the camera — the " +
        "face is the focal point and must unmistakably look like the real child " +
        "in the reference photos, with their hair exactly as in those photos.",
      {
        light:
          "Warm golden-hour light from the low sun, soft and glowing, lighting the child from the front; eye-level camera on the grassy clifftop.",
        compositionNotes:
          "keep the entire LEFT side and the lower-left calm and open — soft sky " +
          "and gentle scenery with no part of the child there — so a large title " +
          "can sit in the lower-left without covering the child.",
      },
    ),
    text: (c) => `${c.name}'s Great Adventure`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "In a cozy bedroom at dawn, kneeling on the floor unrolling a glowing old " +
        "treasure map with a big excited smile, a packed explorer's backpack beside " +
        "them and Scout wagging happily nearby; warm golden morning light through " +
        "the window.",
      {
        spread: true,
        light:
          "Warm golden morning light streaming from the window on the right plus the map's soft glow; eye-level camera at floor height.",
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `One bright morning, ${c.name} discovered a mysterious, old, glowing ` +
        `map. It showed the way to the greatest treasure in the world! ` +
        `${cap(p.subj)} packed ${p.poss} backpack, called for ${p.poss} brave ` +
        `puppy, Scout, and set off on a grand adventure!`
      );
    },
  },
  // 17 journey scenes
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
      "Tucked cozily in bed at night in a warm bedroom, with the treasure map and a " +
        "tiny glowing star resting on the windowsill and Scout asleep at the foot " +
        "of the bed; soft moonlight and a peaceful, happy smile.",
      {
        spread: true,
        light:
          "Soft cool blue moonlight from the window plus the tiny star's warm glow; eye-level camera beside the bed.",
        outfitOverride: SPECIAL_OUTFITS.pajamas,
      },
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} was home at last.\n\n` +
        `${cap(p.poss)} great adventure was over, but ${p.poss} little shining ` +
        `star still glowed softly by ${p.poss} bedroom window. Scout curled up ` +
        `beside ${p.obj}, warm and cozy. With a big smile, ${c.name} closed ` +
        `${p.poss} eyes and drifted off to sleep, dreaming about ${p.poss} next ` +
        `great adventure.`
      );
    },
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile and a little explorer's backpack, " +
        "with Scout beside them, against a soft simple pastel sky with a few " +
        "gentle stars.",
    ),
    text: (c) =>
      `The End…\n...or maybe it's just the beginning of ${c.name}'s next adventure!`,
  },
];

import { registerPrintEdition, type PrintEdition, type PhysicalPageMapping } from "./editions";

/** The "Great Adventure" book, ready to register in `registry.ts`. */
export const greatAdventureBook: StoryTemplate = {
  id: "great-adventure",
  title: "Great Adventure",
  subtitle: "A brave little explorer's quest across the wild, wide world.",
  pages: greatAdventurePages,
  defaultOutfit: DEFAULT_OUTFIT,
  specialOutfits: SPECIAL_OUTFITS,
  companion: SCOUT,
};

/** Printify Hardcover Square 8x8 Edition — maps 21 illustrations to exactly 24 physical interior pages. */
export const greatAdventurePrintify24Edition: PrintEdition = {
  id: "great-adventure-printify-24",
  storyId: "great-adventure",
  profileId: "printify-hardcover-square-8x8",
  interiorPageCount: 24,
  coverIllustrationIndex: 0,
  backCoverIllustrationIndex: 20,
  illustrations: greatAdventurePages.map((p, i) => ({
    index: i,
    number: i + 1,
    filename: `${String(i + 1).padStart(2, "0")}.png`,
    kind: p.kind,
    role: p.role,
    prompt: p.illustrationPrompt,
    text: p.text,
    spread: p.spread ?? false,
    recommendedAspect: p.spread ? "2:1" : "1:1",
  })),
  physicalPages: [
    // Page 1: Sailboat (Illus 3, 03.png)
    { physicalPageNumber: 1, illustrationIndex: 2, illustrationNumber: 3, filename: "03.png", side: "full", text: greatAdventurePages[2].text },
    // Pages 2-3: Intro (Illus 2, 02.png, spread)
    { physicalPageNumber: 2, illustrationIndex: 1, illustrationNumber: 2, filename: "02.png", side: "left", text: greatAdventurePages[1].text },
    { physicalPageNumber: 3, illustrationIndex: 1, illustrationNumber: 2, filename: "02.png", side: "right", text: null },
    // Pages 4-5: Waterfall (Illus 5, 05.png, spread)
    { physicalPageNumber: 4, illustrationIndex: 4, illustrationNumber: 5, filename: "05.png", side: "left", text: greatAdventurePages[4].text, ink: "dark" },
    { physicalPageNumber: 5, illustrationIndex: 4, illustrationNumber: 5, filename: "05.png", side: "right", text: null, ink: "dark" },
    // Pages 6-7: Desert Camel (Illus 6, 06.png, spread)
    { physicalPageNumber: 6, illustrationIndex: 5, illustrationNumber: 6, filename: "06.png", side: "left", text: greatAdventurePages[5].text },
    { physicalPageNumber: 7, illustrationIndex: 5, illustrationNumber: 6, filename: "06.png", side: "right", text: null },
    // Page 8: Jungle Trail (Illus 4, 04.png)
    { physicalPageNumber: 8, illustrationIndex: 3, illustrationNumber: 4, filename: "04.png", side: "full", text: greatAdventurePages[3].text, ink: "dark" },
    // Page 9: Ancient Ruins (Illus 7, 07.png)
    { physicalPageNumber: 9, illustrationIndex: 6, illustrationNumber: 7, filename: "07.png", side: "full", text: greatAdventurePages[6].text },
    // Page 10: Savanna (Illus 8, 08.png)
    { physicalPageNumber: 10, illustrationIndex: 7, illustrationNumber: 8, filename: "08.png", side: "full", text: greatAdventurePages[7].text },
    // Page 11: Snowy Mountain (Illus 9, 09.png)
    { physicalPageNumber: 11, illustrationIndex: 8, illustrationNumber: 9, filename: "09.png", side: "full", text: greatAdventurePages[8].text },
    // Pages 12-13: Coral Reef (Illus 11, 11.png, spread)
    { physicalPageNumber: 12, illustrationIndex: 10, illustrationNumber: 11, filename: "11.png", side: "left", text: greatAdventurePages[10].text },
    { physicalPageNumber: 13, illustrationIndex: 10, illustrationNumber: 11, filename: "11.png", side: "right", text: null },
    // Page 14: Polar Bears (Illus 10, 10.png)
    { physicalPageNumber: 14, illustrationIndex: 9, illustrationNumber: 10, filename: "10.png", side: "full", text: greatAdventurePages[9].text },
    // Page 15: Blue Whale (Illus 12, 12.png)
    { physicalPageNumber: 15, illustrationIndex: 11, illustrationNumber: 12, filename: "12.png", side: "full", text: greatAdventurePages[11].text, ink: "dark" },
    // Page 16: Stormy Boat (Illus 13, 13.png)
    { physicalPageNumber: 16, illustrationIndex: 12, illustrationNumber: 13, filename: "13.png", side: "full", text: greatAdventurePages[12].text },
    // Page 17: Tropical Island X (Illus 14, 14.png)
    { physicalPageNumber: 17, illustrationIndex: 13, illustrationNumber: 14, filename: "14.png", side: "full", text: greatAdventurePages[13].text },
    // Page 18: Crystal Cave (Illus 15, 15.png)
    { physicalPageNumber: 18, illustrationIndex: 14, illustrationNumber: 15, filename: "15.png", side: "full", text: greatAdventurePages[14].text, ink: "dark" },
    // Page 19: Stone Chamber (Illus 16, 16.png)
    { physicalPageNumber: 19, illustrationIndex: 15, illustrationNumber: 16, filename: "16.png", side: "full", text: greatAdventurePages[15].text, ink: "dark" },
    // Pages 20-21: Flying Home (Illus 19, 19.png, spread)
    { physicalPageNumber: 20, illustrationIndex: 18, illustrationNumber: 19, filename: "19.png", side: "left", text: greatAdventurePages[18].text },
    { physicalPageNumber: 21, illustrationIndex: 18, illustrationNumber: 19, filename: "19.png", side: "right", text: null },
    // Page 22: Chest Open (Illus 17, 17.png)
    { physicalPageNumber: 22, illustrationIndex: 16, illustrationNumber: 17, filename: "17.png", side: "full", text: greatAdventurePages[16].text, ink: "dark" },
    // Page 23: Star Friend (Illus 18, 18.png)
    { physicalPageNumber: 23, illustrationIndex: 17, illustrationNumber: 18, filename: "18.png", side: "full", text: greatAdventurePages[17].text, ink: "dark" },
    // Page 24: Closing Bedtime (Illus 20, 20.png)
    { physicalPageNumber: 24, illustrationIndex: 19, illustrationNumber: 20, filename: "20.png", side: "full", text: greatAdventurePages[19].text, ink: "dark" },
  ],
};

registerPrintEdition(greatAdventurePrintify24Edition);

