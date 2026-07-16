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
 * Pure data + pure functions, so it is trivially unit-testable with no Gemini or
 * PDF involved.
 *
 * ~21 pages: cover, opening, 17 journey scenes, a closing, and a back cover.
 */

import { ART_STYLE } from "../config";
import type { ChildProfile, Gender, PageSpec, StoryTemplate } from "./types";

interface Pronouns {
  subj: string; // he / she / they
  obj: string; // him / her / them
  poss: string; // his / her / their
}

function pronouns(gender: Gender): Pronouns {
  switch (gender) {
    case "boy":
      return { subj: "he", obj: "him", poss: "his" };
    case "girl":
      return { subj: "she", obj: "her", poss: "her" };
    default:
      return { subj: "they", obj: "them", poss: "their" };
  }
}

function childNoun(gender: Gender): string {
  if (gender === "boy") return "boy";
  if (gender === "girl") return "girl";
  return "child";
}

/** Capitalize the first letter — for a pronoun at the start of a sentence. */
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Fixed description of the companion so it stays roughly consistent page-to-page
 *  (the engine only anchors the child's likeness, not the puppy). */
const SCOUT =
  "Scout, exactly one small fluffy light-brown puppy (a single puppy only — no " +
  "other dogs anywhere in the scene)";

/** Lead with identity and reaffirm it after the style block. Nano Banana 2 keeps
 *  a child's likeness best when "match the real face" comes FIRST and style is
 *  explicitly subordinated to it. Kept generic — hair/eyes defer to each child's
 *  reference photos — so the template works for any kid. */
const IDENTITY_FIRST =
  "IDENTITY FIRST — match the real child in the attached reference photos " +
  "exactly: the same face, the same facial proportions, the same eye color, and " +
  "the same hair (its real style, length, texture, and color); do not reshape " +
  "the face, change its proportions, or change the hair, and keep the likeness " +
  "clear even when the child is small in the scene.";

const IDENTITY_OVER_STYLE =
  "Identity and likeness take priority over the art style — never sacrifice the " +
  "child's real face or hair for the styling.";

/** Build a full illustration prompt: identity-first header + shared art style +
 *  an identity-over-style reminder + the personalized scene. `light` (optional)
 *  describes the scene's own light + camera so the child can be matched to it —
 *  the single biggest lever against a "pasted-on" composite (see research notes:
 *  mismatched light direction/temperature and camera angle are why composites read
 *  as fake). */
function illustration(scene: string, light?: string) {
  return (c: ChildProfile): string => {
    const lighting = light
      ? ` LIGHTING & CAMERA — match the child to the scene so the composite never ` +
        `looks pasted-on: ${light} Light ${c.name} with exactly this light (same ` +
        `direction, color temperature, and softness) and matching shadows, and frame ` +
        `${c.name} at this same camera angle and horizon line.`
      : "";
    return (
      `${IDENTITY_FIRST} ${ART_STYLE} ${IDENTITY_OVER_STYLE} This is ${c.name}, a ` +
      `${c.age}-year-old ${childNoun(c.gender)}, a brave little explorer on a grand ` +
      `treasure-hunt adventure. ${scene}${lighting} Keep ${c.name} looking exactly ` +
      `like the attached character reference and photos — same real face and hair.`
    );
  };
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
}

const STORY: Beat[] = [
  {
    scene:
      "Standing proudly at the front of a small wooden sailboat leaving a sunny " +
      "little harbour, holding a rolled-up treasure map and pointing out toward " +
      `the open sea, with ${SCOUT} beside them; gentle waves, soft clouds, and a ` +
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
      `${SCOUT} trots alongside with a wagging tail.`,
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
      `with ${SCOUT} tucked safely in the backpack; misty spray and a little ` +
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
  },
  {
    scene:
      "Riding atop a friendly camel across rolling golden desert dunes toward a " +
      "green palm oasis shimmering in the distance, shading their eyes to read the " +
      `map, with ${SCOUT} riding happily along; warm sunset sky.`,
    copy: (c) =>
      `Leaving the jungle behind, the air grew warm as they stepped into a ` +
      `golden desert. Over the rolling sandy dunes, ${c.name} and Scout rode a ` +
      `friendly camel, as if a tiny star were already lighting the way.`,
    spread: true,
    light:
      "Warm low golden sunset light from the right casting long soft shadows over the dunes; slightly low camera across the desert.",
  },
  {
    scene:
      "Exploring ancient sandstone ruins with tall carved pillars, kneeling to " +
      "study a mysterious symbol carved into a stone wall that matches the map, " +
      `with ${SCOUT} sniffing curiously nearby; warm dusty light and climbing vines.`,
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
      `${SCOUT} at their heels; a glowing golden-orange sky.`,
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
      `sea sparkles far below, with ${SCOUT} climbing close behind.`,
    copy: (c) =>
      `But the map pointed higher, leading them up a towering snowy mountain. ` +
      `${c.name} climbed so high that the air grew chilly. At the peak, a great ` +
      `eagle spread its wings and pointed its beak toward the sparkling sea.`,
    light:
      "Bright, cold, high-altitude daylight from the upper left, crisp and slightly blue; slightly low camera on the snowy ledge.",
  },
  {
    scene:
      "Standing on a frozen, snowy Arctic shore beneath shimmering green-and-pink " +
      "northern lights, smiling at two friendly polar bears on the ice, with " +
      `${SCOUT} bouncing in the snow; a little wooden boat waiting at the water's edge.`,
    copy: (c) =>
      `Before they reached the water, they crossed a land of snowy ice where ` +
      `fluffy polar bears played all around. As night fell, ${c.name} looked up ` +
      `and saw green and pink lights dancing across the sky. The magical lights ` +
      `guided them right to the shore.`,
    light:
      "Dark Arctic night lit by the green-and-pink aurora glow from above and cool moonlight on the snow; eye-level camera on the ice.",
  },
  {
    scene:
      "Snorkelling happily underwater in a bright coral reef while wearing a diving " +
      "mask, surrounded by colourful fish as a smiling dolphin and a sea turtle " +
      `guide them gently downward toward a softly glowing passage, with ${SCOUT} ` +
      "paddling happily alongside wearing its own little diving mask; sparkling " +
      "sunbeams through clear blue water.",
    copy: (c) =>
      `Taking a deep breath, ${c.name} and Scout dove beneath the waves, ` +
      `swimming through the sparkling sea. Colorful fish darted by, and friendly ` +
      `dolphins showed them the way.`,
    spread: true,
    light:
      "Cool blue underwater light with bright sunbeams streaming down from the surface above; eye-level underwater camera.",
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
  },
  {
    scene:
      "Holding tight to the mast of a small wooden boat in a splashy ocean storm, " +
      "clutching the treasure map and looking determined and brave, with " +
      `${SCOUT} sheltered under one arm; big rolling waves and dramatic clouds, but ` +
      "a hopeful break of golden light ahead.",
    copy: (c, p) =>
      `But suddenly, they burst up to the surface to find a storm! The waves ` +
      `splashed high, and the wind blew strong. ${c.name} held the map tight, ` +
      `and Scout stayed by ${p.poss} side all along.`,
    light:
      "Dramatic stormy grey overcast light with a hopeful warm break of sun from the upper right; eye-level camera amid the waves.",
  },
  {
    scene:
      "Arriving at a sunny tropical treasure island, stepping onto a sandy " +
      "palm-lined cove and pointing excitedly at a tall X-shaped rock, with " +
      `${SCOUT} splashing happily in the shallows; turquoise water and swaying palms.`,
    copy: (c) =>
      `Just as the storm cleared, they spotted land—a little island with tall, ` +
      `swaying palm trees. ${c.name} looked at the map, then up at a tall rock ` +
      `shaped just like its big red X.\n` +
      `"Look, Scout—X marks the spot!" shouted ${c.name}. Scout's tail wagged. ` +
      `"We found it! Our treasure is waiting!"`,
    light:
      "Bright tropical midday sun from above, warm and clear over turquoise water; eye-level camera on the sandy cove.",
  },
  {
    scene:
      "Exploring a glittering crystal cave lit by the warm glow of the sparkling " +
      "gems themselves, eyes wide at walls of colourful crystals, following a trail " +
      `deeper inside, with ${SCOUT} sniffing the path ahead.`,
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
      `thrilled expression, with ${SCOUT} beside them; shafts of golden light from above.`,
    copy: (c, p) =>
      `Deeper inside, the map's X glowed on the cave floor—and right on top sat ` +
      `the treasure chest at last! ${c.name} took a deep breath, reached out ` +
      `${p.poss} hand, and slowly lifted the lid…`,
    ink: "dark",
    light:
      "Dramatic warm golden shafts of light from above into a dim stone chamber; eye-level camera.",
  },
  {
    scene:
      "The big wooden treasure chest bursting open in a magnificent swirl of " +
      "golden, sparkling starlight that fills the chamber, the child's face lit " +
      `with wonder and joy, with ${SCOUT} bouncing with excitement; magical glowing ` +
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
      `${SCOUT} gazing up in wonder; a soft magical glow all around.`,
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
      `forward with pure delight while the other arm cradles ${SCOUT} securely ` +
      "against the chest — exactly TWO arms and two hands total, never a third arm " +
      "or an extra hand; the moon and twinkling stars all around.",
    copy: (c) =>
      `With the star glowing brightly to guide them, ${c.name} and Scout flew ` +
      `home through the twinkling night sky. Far below them, the world was fast ` +
      `asleep, glowing in the soft moonlight.`,
    spread: true,
    light:
      "Soft cool moonlight and starlight from above with a magical glowing star-trail; slightly low camera against the night sky.",
  },
];

/** The full ordered book: cover + opening + journey scenes + closing + back. */
const greatAdventurePages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    illustrationPrompt: illustration(
      "A wide cover hero scene at golden hour: standing on a grassy clifftop on " +
        "the RIGHT side of the frame and turned toward the viewer with a big " +
        "joyful smile, holding up a rolled treasure map, with a vast world of " +
        `distant mountains, sea, and sky behind them and ${SCOUT} at their side. ` +
        "Frame the child from about the waist up so the FACE IS LARGE, clear, and " +
        "front-facing (or a gentle three-quarter angle) toward the camera — the " +
        "face is the focal point and must unmistakably look like the real child " +
        "in the reference photos, with their hair exactly as in those photos. " +
        "Keep the entire LEFT side and the lower-left " +
        "calm and open — soft sky and gentle scenery with no part of the child " +
        "there — so a large title can sit in the lower-left without covering the " +
        "child.",
      "Warm golden-hour light from the low sun, soft and glowing, lighting the child from the front; eye-level camera on the grassy clifftop.",
    ),
    text: (c) => `${c.name}'s Great Adventure`,
  },
  // Opening / dedication
  {
    kind: "intro",
    spread: true,
    illustrationPrompt: illustration(
      "In a cozy bedroom at dawn, kneeling on the floor unrolling a glowing old " +
        "treasure map with a big excited smile, a packed explorer's backpack beside " +
        `them and ${SCOUT} wagging happily nearby; warm golden morning light through ` +
        "the window.",
      "Warm golden morning light streaming from the window on the right plus the map's soft glow; eye-level camera at floor height.",
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
      illustrationPrompt: illustration(b.scene, b.light),
      text: (c) => b.copy(c, pronouns(c.gender)),
    }),
  ),
  // Closing
  {
    kind: "closing",
    spread: true,
    ink: "dark", // verse sits on the pale bedroom (left leaf) — dark text on a panel reads better
    illustrationPrompt: illustration(
      "Tucked cozily in bed at night in a warm bedroom, with the treasure map and a " +
        `tiny glowing star resting on the windowsill and ${SCOUT} asleep at the foot ` +
        "of the bed; soft moonlight and a peaceful, happy smile.",
      "Soft cool blue moonlight from the window plus the tiny star's warm glow; eye-level camera beside the bed.",
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
    illustrationPrompt: illustration(
      "Waving cheerfully with a big joyful smile and a little explorer's backpack, " +
        `with ${SCOUT} beside them, against a soft simple pastel sky with a few ` +
        "gentle stars.",
    ),
    text: (c) =>
      `The End…\n...or maybe it's just the beginning of ${c.name}'s next adventure!`,
  },
];

/** The "Great Adventure" book, ready to register in `registry.ts`. */
export const greatAdventureBook: StoryTemplate = {
  id: "great-adventure",
  title: "Great Adventure",
  subtitle: "A brave little explorer's quest across the wild, wide world.",
  pages: greatAdventurePages,
};
