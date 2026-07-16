/**
 * The "Dream Big" storybook template.
 *
 * One ordered array of page definitions is the single source of truth for the
 * whole book. Each entry builds (a) a Gemini illustration prompt and (b) the
 * personalized story copy, given a ChildProfile. This is pure data + pure
 * functions, so it is trivially unit-testable with no Gemini or PDF involved.
 *
 * 24 pages: front cover, dedication, 20 career scenes, a "dream big" closing,
 * and a back cover.
 */

import { ART_STYLE, CHARACTER_ANCHOR_STYLE } from "../config";
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

/** "a" or "an" depending on the following word. */
function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? "an" : "a";
}

/** Build a full illustration prompt: shared art style + the personalized scene. */
function illustration(role: string, scene: string) {
  return (c: ChildProfile): string =>
    `${ART_STYLE} This is ${c.name}, a ${c.age}-year-old ${childNoun(c.gender)}, ` +
    `as ${article(role)} ${role}: ${scene} Keep ${c.name} looking exactly like ` +
    `the attached character reference and photos — same real face and hair.`;
}

/** The one-time master character-reference portrait prompt for a child. */
export function characterAnchorPrompt(c: ChildProfile): string {
  return (
    `${CHARACTER_ANCHOR_STYLE} This is ${c.name}, a ${c.age}-year-old ` +
    `${childNoun(c.gender)}.`
  );
}

/** One career scene: the badge label, the illustration scene, and the copy. */
interface Role {
  role: string; // used in the prompt, e.g. "airplane pilot"
  badge: string; // short label shown on the page, e.g. "PILOT"
  scene: string;
  copy: (c: ChildProfile, p: Pronouns) => string;
  spread?: boolean; // render as a two-page spread
}

const ROLES: Role[] = [
  {
    role: "airplane pilot",
    badge: "PILOT",
    scene:
      "Flying a small airplane through fluffy white clouds in a bright blue sky, " +
      "wearing a pilot's cap and aviator goggles, beaming with confidence.",
    copy: (c) =>
      `Up, up, and away! ${c.name} the pilot soars through the clouds, ` +
      `steering the plane with a brave and happy heart.`,
  },
  // Racer comes before Astronaut so the Astronaut spread begins on an even page
  // (see lib/pdf/imposition.ts — spreads must land on a facing pair).
  {
    role: "race car driver",
    badge: "RACER",
    scene:
      "Sitting in a shiny red race car on a sunny racetrack, wearing a racing " +
      "helmet and suit, checkered flags waving in the background.",
    copy: (c) =>
      `Vroom, vroom! ${c.name} zooms around the track, fast and fearless, ` +
      `racing all the way to the finish line.`,
  },
  {
    role: "astronaut",
    badge: "ASTRONAUT",
    spread: true,
    scene:
      "Floating in outer space in a white astronaut suit and helmet, with " +
      "glittering stars, colorful planets, and Earth glowing softly behind.",
    copy: (c) =>
      `Among the stars and far-off moons, ${c.name} the astronaut explores the ` +
      `galaxy, dreaming as big as the whole universe.`,
  },
  {
    role: "doctor",
    badge: "DOCTOR",
    scene:
      "Wearing a white doctor's coat with a stethoscope in a friendly, sunny " +
      "clinic, holding a clipboard and giving a warm, reassuring smile.",
    copy: (c) =>
      `With a gentle heart and a caring touch, Doctor ${c.name} helps everyone ` +
      `feel better, one kind smile at a time.`,
  },
  {
    role: "firefighter",
    badge: "FIREFIGHTER",
    scene:
      "Dressed in firefighter gear and a red helmet beside a big red fire truck, " +
      "holding a hose, looking brave and ready to help.",
    copy: (c, p) =>
      `Brave and strong, ${c.name} the firefighter races to the rescue and ` +
      `gives it ${p.poss} all to keep the whole town safe.`,
  },
  {
    role: "scientist in a laboratory",
    badge: "SCIENTIST",
    scene:
      "Wearing a lab coat and safety goggles in a bright laboratory, mixing " +
      "bubbling, colorful potions in glass beakers with wide-eyed wonder.",
    copy: (c) =>
      `Mixing, testing, full of wonder — ${c.name} the scientist discovers how ` +
      `the world works, one big idea at a time.`,
  },
  {
    role: "army officer",
    badge: "ARMY OFFICER",
    scene:
      "In a smart army officer uniform and beret, standing tall and proud on a " +
      "grassy field as a flag gently waves in the breeze.",
    copy: (c, p) =>
      `Standing tall and proud, ${c.name} the officer leads with honor and ` +
      `courage, protecting the people ${p.subj} loves.`,
  },
  {
    role: "soccer star athlete",
    badge: "SOCCER STAR",
    scene:
      "Kicking a soccer ball in a stadium wearing a colorful sports jersey, mid-" +
      "action with a joyful grin and a cheering crowd behind.",
    copy: (c) =>
      `On the field and on the ball, ${c.name} the soccer star scores the ` +
      `winning goal as the whole crowd cheers!`,
  },
  {
    role: "karate champion in a white martial-arts uniform",
    badge: "KARATE CHAMPION",
    scene:
      "Wearing a white karate uniform with a colorful belt, striking a strong, " +
      "focused pose in a dojo with soft morning light.",
    copy: (c) =>
      `Focused and fearless, ${c.name} the karate champion is strong, kind, and ` +
      `always ready to do the right thing.`,
  },
  {
    role: "detective",
    badge: "DETECTIVE",
    scene:
      "Wearing a detective coat and cap, holding a magnifying glass and following " +
      "footprints, with a curious, clever expression.",
    copy: (c) =>
      `Clue by clue and step by step, Detective ${c.name} solves the mystery ` +
      `with a sharp eye and a clever mind.`,
  },
  {
    role: "stage magician",
    badge: "MAGICIAN",
    scene:
      "Wearing a magician's cape and top hat, pulling a rabbit from the hat as " +
      "sparkles and stars swirl around on a glowing stage.",
    copy: (c) =>
      `Abracadabra! ${c.name} the magician fills the room with wonder and ` +
      `giggles, one sparkling trick at a time.`,
  },
  {
    role: "chef cooking in a kitchen",
    badge: "CHEF",
    scene:
      "Wearing a white chef's hat and apron in a cozy kitchen, happily stirring " +
      "a pot and tasting a delicious dish.",
    copy: (c) =>
      `A pinch of this, a dash of that — Chef ${c.name} cooks up yummy treats ` +
      `to share with everyone.`,
  },
  {
    role: "rockstar musician playing electric guitar",
    badge: "ROCKSTAR",
    scene:
      "Playing an electric guitar on a bright concert stage with colorful lights, " +
      "mid-song with a huge happy grin and a cheering audience.",
    copy: (c) =>
      `Strum and sing, let the music ring — ${c.name} the rockstar lights up the ` +
      `stage and everybody dances!`,
  },
  {
    role: "painter and artist",
    badge: "ARTIST",
    scene:
      "Standing at an easel with a paintbrush and palette, painting a bright, " +
      "colorful picture, surrounded by splashes of cheerful color.",
    copy: (c) =>
      `With every brushstroke and bright color, ${c.name} the artist paints a ` +
      `world full of imagination.`,
  },
  {
    role: "school teacher",
    badge: "TEACHER",
    scene:
      "Standing at a chalkboard in a sunny classroom, pointing to friendly " +
      "drawings of letters and numbers with a warm smile.",
    copy: (c) =>
      `Patient and kind, ${c.name} the teacher helps everyone learn something ` +
      `new and believe in themselves.`,
  },
  {
    role: "jungle explorer",
    badge: "EXPLORER",
    scene:
      "Wearing an explorer hat and backpack, trekking through a lush green jungle " +
      "with a map, discovering colorful birds and butterflies.",
    copy: (c) =>
      `Over rivers and through the trees, ${c.name} the explorer discovers ` +
      `amazing places no one has seen before.`,
  },
  {
    role: "photographer",
    badge: "PHOTOGRAPHER",
    scene:
      "Holding a camera up to one eye, capturing a beautiful golden-hour landscape, " +
      "with a satchel of lenses and a delighted expression.",
    copy: (c) =>
      `Click! ${c.name} the photographer captures the most beautiful moments and ` +
      `keeps them forever.`,
  },
  // Deep-sea Diver is a two-page spread placed before Vet so it begins on an
  // even page; this also makes the closing spread land on a facing pair (see
  // lib/pdf/imposition.ts).
  {
    role: "deep-sea diver",
    badge: "DEEP-SEA DIVER",
    spread: true,
    scene:
      "Wearing a diving suit underwater among colorful coral reefs, friendly " +
      "fish, and a smiling sea turtle in sparkling blue water.",
    copy: (c) =>
      `Down in the deep blue sea, ${c.name} the diver swims with turtles and ` +
      `discovers a world of wonder.`,
  },
  {
    role: "veterinarian caring for animals",
    badge: "VET",
    scene:
      "Wearing a vet's coat, gently caring for a happy puppy and a kitten in a " +
      "friendly animal clinic full of cuddly creatures.",
    copy: (c) =>
      `Gentle and caring, ${c.name} the vet looks after every furry, feathered, ` +
      `and wiggly friend.`,
  },
  {
    role: "inventor",
    badge: "INVENTOR",
    scene:
      "In a workshop full of gears and gadgets, proudly holding up a clever, " +
      "whimsical invention with lightbulbs glowing overhead.",
    copy: (c) =>
      `Tinkering and dreaming, ${c.name} the inventor builds wonderful machines ` +
      `that make the world a little brighter.`,
  },
];

/** The full ordered book: cover + dedication + scenes + closing + back cover. */
const dreamBigPages: PageSpec[] = [
  // Front cover
  {
    kind: "cover",
    illustrationPrompt: illustration(
      "dreamer",
      "A wide cover scene at golden hour: place the child in the RIGHT portion of " +
        "the frame, looking up in wonder at a vast sky full of dreamy clouds shaped " +
        "like a rocket, an airplane, and stars. Keep the entire LEFT side and the " +
        "lower-left calm and open — soft sky, clouds, and gentle hills with no part " +
        "of the child there — so a large title can sit in the lower-left without " +
        "covering the child.",
    ),
    text: (c) => `${c.name}'s Dream Big Adventure`,
  },
  // Dedication / intro
  {
    kind: "intro",
    spread: true,
    illustrationPrompt: illustration(
      "cozy reader",
      "Snuggled up reading a glowing storybook in a cozy bedroom at night, with " +
        "soft warm lamplight and dreamy stars drifting from the open book.",
    ),
    text: (c) =>
      `Once upon a time there was a ${childNoun(c.gender)} named ${c.name}, ` +
      `who could be anything ${pronouns(c.gender).subj} dreamed. ` +
      `Turn the page and let's find out who ${c.name} can be!`,
  },
  // 20 career scenes
  ...ROLES.map(
    (r): PageSpec => ({
      kind: "scene",
      role: r.badge,
      spread: r.spread,
      illustrationPrompt: illustration(r.role, r.scene),
      text: (c) => r.copy(c, pronouns(c.gender)),
    }),
  ),
  // Closing
  {
    kind: "closing",
    spread: true,
    illustrationPrompt: illustration(
      "dreamer",
      "Standing on a hilltop at sunset with arms open wide, looking up at a sky " +
        "full of glowing silhouettes of a rocket, a plane, musical notes, and stars.",
    ),
    text: (c) =>
      `No matter how big you dream, ${c.name}, you can be anything.\n\n` +
      `The sky is just the beginning — so dream big, little one.`,
  },
  // Back cover
  {
    kind: "backcover",
    illustrationPrompt: illustration(
      "happy dreamer",
      "Waving cheerfully with a big joyful smile against a soft, simple pastel " +
        "background with a few gentle stars.",
    ),
    text: () => `Dream big.`,
  },
];

/** The "Dream Big" book, ready to register in `registry.ts`. */
export const dreamBigBook: StoryTemplate = {
  id: "dream-big",
  title: "Dream Big",
  subtitle: "Your child as a pilot, astronaut, explorer and more.",
  pages: dreamBigPages,
};
