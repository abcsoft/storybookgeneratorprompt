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

import { buildIllustrationPrompt } from "./prompt/buildIllustrationPrompt";
import { childNoun, pronouns, type Pronouns } from "./textHelpers";
import type { ChildProfile, PageKind, PageSpec, StoryTemplate, LayoutType } from "./types";

/** "a" or "an" depending on the following word. */
function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? "an" : "a";
}

/** Build a full illustration prompt using the central prompt engine. */
function illustration(
  role: string,
  scene: string,
  layout: LayoutType = "single-page",
  kind: PageKind = "scene",
  compositionNotes?: string,
) {
  return (c: ChildProfile, profileId?: string): string =>
    buildIllustrationPrompt({
      child: c,
      story: {},
      scene: `as ${article(role)} ${role}: ${scene}`,
      layout,
      kind,
      profileId,
      compositionNotes,
    });
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
      "clinic with plain clinic walls, simple unlabeled medical props, and no posters, " +
      "charts, labels, or readable documents, holding a clipboard and giving a warm, reassuring smile.",
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
      "bubbling, colorful liquids in simple unlabeled glass beakers with wide-eyed wonder. " +
      "Clean background with no text labels, charts, or formulas.",
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
      "Standing at a chalkboard in a sunny classroom, pointing to simple non-text " +
      "geometric shapes on a blank chalkboard with a warm smile. Absolutely no letters, " +
      "words, numbers, or handwriting on the board.",
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
    layout: "single-page",
    illustrationPrompt: illustration(
      "dreamer",
      "A cover scene at golden hour: place the child in the RIGHT portion of " +
        "the frame, looking up in wonder at a vast sky full of dreamy clouds shaped " +
        "like a rocket, an airplane, and stars. Keep the entire LEFT side and the " +
        "lower-left calm and open — soft sky, clouds, and gentle hills with no part " +
        "of the child there — so a large title can sit in the lower-left without " +
        "covering the child.",
      "single-page",
      "cover",
    ),
    text: (c) => `${c.name}'s Dream Big Adventure`,
  },
  // Dedication / intro
  {
    kind: "intro",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "cozy reader",
      "Snuggled up reading a glowing storybook in a cozy bedroom at night, with " +
        "soft warm lamplight and dreamy stars drifting from the open book.",
      "text-left-subject-right",
      "intro",
    ),
    text: (c) =>
      `Once upon a time there was a ${childNoun(c.gender)} named ${c.name}, ` +
      `who could be anything ${pronouns(c.gender).subj} dreamed. ` +
      `Turn the page and let's find out who ${c.name} can be!`,
  },
  // 20 career scenes
  ...ROLES.map(
    (r): PageSpec => {
      const layout: LayoutType = r.spread ? "text-left-subject-right" : "single-page";
      return {
        kind: "scene",
        role: r.badge,
        spread: r.spread,
        layout,
        illustrationPrompt: illustration(r.role, r.scene, layout, "scene"),
        text: (c) => r.copy(c, pronouns(c.gender)),
      };
    },
  ),
  // Closing
  {
    kind: "closing",
    spread: true,
    layout: "text-left-subject-right",
    illustrationPrompt: illustration(
      "dreamer",
      "Standing on a hilltop at sunset with arms open wide, looking up at a sky " +
        "full of glowing silhouettes of a rocket, a plane, musical notes, and stars.",
      "text-left-subject-right",
      "closing",
    ),
    text: (c) =>
      `No matter how big you dream, ${c.name}, you can be anything.\n\n` +
      `The sky is just the beginning — so dream big, little one.`,
  },
  // Back cover
  {
    kind: "backcover",
    layout: "single-page",
    illustrationPrompt: illustration(
      "happy dreamer",
      "Waving cheerfully with a big joyful smile against a soft, simple pastel " +
        "background with a few gentle stars.",
      "single-page",
      "backcover",
    ),
    text: () => `Dream big.`,
  },
];

import { registerPrintEdition, type PrintEdition } from "./editions";

/** The "Dream Big" book, ready to register in `registry.ts`. */
export const dreamBigBook: StoryTemplate = {
  id: "dream-big",
  title: "Dream Big",
  subtitle: "Your child as a pilot, astronaut, explorer and more.",
  pages: dreamBigPages,
};

/** Printify Hardcover Square 8x8 Edition — maps 24 illustrations/pages to exactly 24 physical interior pages. */
export const dreamBigPrintify24Edition: PrintEdition = {
  id: "dream-big-printify-24",
  storyId: "dream-big",
  profileId: "printify-hardcover-square-8x8",
  interiorPageCount: 24,
  coverIllustrationIndex: 0,
  backCoverIllustrationIndex: 23,
  illustrations: dreamBigPages.map((p, i) => ({
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
    // Pages 1-2: Intro Spread (Illustration Index 1, 02.png)
    { physicalPageNumber: 1, illustrationIndex: 1, illustrationNumber: 2, filename: "02.png", side: "left", storyTextLeaf: "left", text: dreamBigPages[1].text },
    { physicalPageNumber: 2, illustrationIndex: 1, illustrationNumber: 2, filename: "02.png", side: "right", storyTextLeaf: "none", text: null },
    // Pages 3 to 22: 20 Career Scenes (Single-page interior)
    { physicalPageNumber: 3, illustrationIndex: 2, illustrationNumber: 3, filename: "03.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[2].text },
    { physicalPageNumber: 4, illustrationIndex: 3, illustrationNumber: 4, filename: "04.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[3].text },
    { physicalPageNumber: 5, illustrationIndex: 4, illustrationNumber: 5, filename: "05.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[4].text },
    { physicalPageNumber: 6, illustrationIndex: 5, illustrationNumber: 6, filename: "06.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[5].text },
    { physicalPageNumber: 7, illustrationIndex: 6, illustrationNumber: 7, filename: "07.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[6].text },
    { physicalPageNumber: 8, illustrationIndex: 7, illustrationNumber: 8, filename: "08.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[7].text },
    { physicalPageNumber: 9, illustrationIndex: 8, illustrationNumber: 9, filename: "09.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[8].text },
    { physicalPageNumber: 10, illustrationIndex: 9, illustrationNumber: 10, filename: "10.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[9].text },
    { physicalPageNumber: 11, illustrationIndex: 10, illustrationNumber: 11, filename: "11.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[10].text },
    { physicalPageNumber: 12, illustrationIndex: 11, illustrationNumber: 12, filename: "12.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[11].text },
    { physicalPageNumber: 13, illustrationIndex: 12, illustrationNumber: 13, filename: "13.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[12].text },
    { physicalPageNumber: 14, illustrationIndex: 13, illustrationNumber: 14, filename: "14.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[13].text },
    { physicalPageNumber: 15, illustrationIndex: 14, illustrationNumber: 15, filename: "15.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[14].text },
    { physicalPageNumber: 16, illustrationIndex: 15, illustrationNumber: 16, filename: "16.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[15].text },
    { physicalPageNumber: 17, illustrationIndex: 16, illustrationNumber: 17, filename: "17.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[16].text },
    { physicalPageNumber: 18, illustrationIndex: 17, illustrationNumber: 18, filename: "18.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[17].text },
    { physicalPageNumber: 19, illustrationIndex: 18, illustrationNumber: 19, filename: "19.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[18].text },
    { physicalPageNumber: 20, illustrationIndex: 19, illustrationNumber: 20, filename: "20.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[19].text },
    { physicalPageNumber: 21, illustrationIndex: 20, illustrationNumber: 21, filename: "21.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[20].text },
    { physicalPageNumber: 22, illustrationIndex: 21, illustrationNumber: 22, filename: "22.png", side: "full", storyTextLeaf: "left", text: dreamBigPages[21].text },
    // Pages 23-24: Closing Spread (Illustration Index 22, 23.png)
    { physicalPageNumber: 23, illustrationIndex: 22, illustrationNumber: 23, filename: "23.png", side: "left", storyTextLeaf: "left", text: dreamBigPages[22].text },
    { physicalPageNumber: 24, illustrationIndex: 22, illustrationNumber: 23, filename: "23.png", side: "right", storyTextLeaf: "none", text: null },
  ],
};

registerPrintEdition(dreamBigPrintify24Edition);
