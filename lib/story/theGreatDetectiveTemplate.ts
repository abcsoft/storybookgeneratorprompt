/**
 * The "Great Detective" storybook template.
 *
 * Like "Great Adventure", this is ONE connected story (not standalone scenes):
 * the child is a clever little detective who tracks a trail of muddy footprints
 * across a sunny playground to find a friend's lost yellow ball — and, under a
 * shady willow tree, discovers a shy new kid, Meera, holding it. The detective
 * chooses kindness over blame, and a lost ball turns into a new friendship.
 * Themes: observation, problem-solving, courage, and kindness/inclusion.
 *
 * The narrative thread lives in the copy (continuous prose) plus the recurring
 * magnifying glass, footprint trail, and side characters (Rohan, Meera); each
 * illustration prompt is still fully self-contained so it generates independently.
 *
 * Pure data + pure functions, so it is trivially unit-testable with no Gemini or
 * PDF involved.
 *
 * 26 page specs → 30 print pages (four two-page spreads: puddle, willow, sunshine
 * walk, three friends). Spreads all begin on even print pages and the total is
 * even, so the back cover lands on the back of the book (see lib/pdf/imposition.ts).
 * Layout: cover, opening, investigation scenes, and a merged closing/back cover.
 */

import { ART_STYLE } from "../config";
import { cap, childNoun, pronouns, type Pronouns } from "./textHelpers";
import type { ChildProfile, PageSpec, StoryTemplate, LayoutType, PageKind } from "./types";

/** The detective's signature tool — kept consistent page-to-page. */
const MAGNIFIER = "a child-sized brass magnifying glass";

/** The hero's fixed outfit, repeated verbatim on every page so the clothing
 *  stays identical throughout the book (the engine anchors the child's face/hair,
 *  not their clothes, so the outfit must be pinned in the prompt). */
const HERO_OUTFIT =
  "wearing the SAME outfit in every single illustration — an open light-blue " +
  "denim jacket over a plain white t-shirt, a colourful floral skirt, white " +
  "socks, and red canvas sneakers, with a small rainbow heart charm clipped to " +
  "the jacket; keep this exact same outfit, unchanged, on every page";

/** Appended to standing two-shots so nobody gets cropped at the shins. The shared
 *  FRAMING note prefers a medium shot (to protect face likeness), which otherwise
 *  cuts off feet when two children stand together. */
const FULL_FIGURE =
  " Frame this as a full-figure shot: show every child from head to toe with their " +
  "legs and feet completely inside the frame and a little ground/footroom below — " +
  "do not crop anyone at the legs, knees, or ankles.";

/** Fixed descriptions + pinned outfits of the side characters so they stay
 *  consistent page-to-page. The engine only anchors the HERO's likeness (from the
 *  reference photos) — the other kids have no anchor, so their whole look and
 *  outfit must be fully described and locked here or they drift between pages. */
const ROHAN =
  "Rohan, exactly one cheerful young Indian boy with warm brown skin, dark brown " +
  "eyes, short dark hair, and a round friendly face, wearing the SAME outfit on " +
  "every page — a plain blue t-shirt, grey trousers, and grey-and-white sneakers — " +
  "kept exactly the same and unchanged wherever he appears (a single boy only — no " +
  "other boys in the scene)";
const MEERA =
  "Meera, exactly one shy young Indian girl who looks CLEARLY DIFFERENT from the " +
  "hero — the two girls must never look alike or like twins: Meera is a little " +
  "younger and shorter, with a rounder face, warm brown skin, dark brown eyes, and " +
  "hair in two short braided pigtails (NOT long loose hair). She wears the SAME " +
  "outfit on every page — a mustard-yellow t-shirt, teal shorts, and scuffed muddy " +
  "white sneakers, kept exactly the same and unchanged wherever she appears — and " +
  "must NOT wear the hero's denim jacket, floral skirt, or red sneakers (a single " +
  "girl only — no other girls besides the hero)";
const BALL = "a bright yellow bouncy ball";

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

/** Sign-only exception to the global no-text rule, used for the back cover so a
 *  hand-painted "CASE CLOSED" sign can carry legible text. */
const SIGN_TEXT_POLICY =
  "TEXT POLICY FOR THIS PAGE ONLY: the single exception to the usual no-text rule " +
  "is the hand-painted wooden sign described in the scene — render THAT sign's " +
  "text crisply, clearly, and correctly spelled. No other letters, words, " +
  "captions, gibberish, watermarks, signatures, logos, frames, or borders appear " +
  "anywhere else in the image. ";

/** ART_STYLE with its blanket "no text in the image" ban swapped for the
 *  sign-only exception above, so the closing page can show a legible painted sign
 *  while every other page stays text-free. Falls back to appending the policy if
 *  the ban paragraph can't be located (e.g. config wording changed). */
const ART_STYLE_WITH_SIGN = ((): string => {
  const start = ART_STYLE.indexOf("ABSOLUTELY NO TEXT IN THE IMAGE:");
  const endMark = "No watermarks, signatures, logos, frames, or borders. ";
  const end = ART_STYLE.indexOf(endMark);
  if (start === -1 || end === -1) return `${ART_STYLE} ${SIGN_TEXT_POLICY}`;
  return ART_STYLE.slice(0, start) + SIGN_TEXT_POLICY + ART_STYLE.slice(end + endMark.length);
})();

/** Build a full illustration prompt: identity-first header + shared art style +
 *  an identity-over-style reminder + the fixed outfit + the personalized scene.
 *  `light` (optional) describes the scene's own light + camera so the child can be
 *  matched to it — the single biggest lever against a "pasted-on" composite
 *  (mismatched light direction/temperature and camera angle are why composites
 *  read as fake). `style` overrides the art-style block (e.g. to allow sign text
 *  on the back cover). */
import { buildTargetFormatBlock } from "./prompt/compositionRules";

function illustration(
  scene: string,
  light?: string,
  style: string = ART_STYLE,
  layout: LayoutType = "single-page",
  kind: PageKind = "scene",
) {
  return (c: ChildProfile, profileId?: string): string => {
    const lighting = light
      ? ` LIGHTING & CAMERA — match the child to the scene so the composite never ` +
        `looks pasted-on: ${light} Light ${c.name} with exactly this light (same ` +
        `direction, color temperature, and softness) and matching shadows, and frame ` +
        `${c.name} at this same camera angle and horizon line.`
      : "";
    const targetFormat = buildTargetFormatBlock(profileId, layout, kind);
    return (
      `${IDENTITY_FIRST} ${style} ${IDENTITY_OVER_STYLE} ${targetFormat} This is ${c.name}, a ` +
      `${c.age}-year-old ${childNoun(c.gender)}, a clever little detective solving ` +
      `the mystery of a missing yellow ball, ${HERO_OUTFIT}. ${scene}${lighting} ` +
      `Keep ${c.name} looking exactly like the attached character reference and ` +
      `photos — same real face and hair.`
    );
  };
}

/** One beat of the case: the scene to illustrate and the verse on the page. */
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
  // 1 — notices a sad friend (no magnifying glass / no ball in this scene)
  {
    scene:
      "Walking across a sunny neighbourhood playground toward Rohan, who sits " +
      "slumped and sad on a wooden bench, with a caring, concerned expression; " +
      "swings, a slide, and a merry-go-round softly behind. No ball and no " +
      "magnifying glass anywhere in this scene.",
    copy: (c, p) =>
      `One sunny morning at the playground, ${c.name} noticed something was wrong. ` +
      `${cap(p.poss)} friend Rohan was sitting on a bench, looking very sad. ` +
      `${cap(p.subj)} walked over. "Why are you so sad, Rohan?" ${p.subj} asked.`,
    light:
      "Bright, cheerful morning sunlight from the upper right across the playground, warm and clear; eye-level camera near the bench.",
  },
  // 2 — the lost ball, and a brave promise
  {
    scene:
      "Kneeling beside Rohan on the bench and resting a comforting hand on his " +
      "shoulder, with a brave, kind face; the empty spot where his ball should be.",
    copy: (c, p) =>
      `"I lost my favourite bouncy yellow ball," Rohan sniffled. ${c.name} knew how ` +
      `hard it was to lose something special. "Don't worry," ${p.subj} said bravely. ` +
      `"I will find it!"`,
    light:
      "Soft, warm morning light from the right, gentle and comforting; eye-level camera at bench height.",
  },
  // 3 — the detective's method
  {
    scene:
      "Standing tall and determined in the middle of the playground, lifting " +
      `${MAGNIFIER} up toward one eye and scanning the ground with sharp, clever ` +
      "eyes.",
    copy: (c, p) =>
      `${c.name} lifted ${p.poss} magnifying glass up to ${p.poss} eye. "Every ` +
      `mystery leaves clues," ${p.subj} said. "And a good detective always finds them."`,
    light:
      "Bright, clear late-morning daylight from above, crisp and even; eye-level camera in the middle of the playground.",
  },
  // 4 — search under the swings
  {
    scene:
      "Crouching low to peek under the playground swings with " +
      `${MAGNIFIER}, searching carefully in the shadows.`,
    copy: (c, p) =>
      `First, ${c.name} looked under the swings. ${cap(p.subj)} checked every shadow ` +
      `and every corner. No ball.`,
    light:
      "Bright daylight with soft cool shadows under the swings; slightly low eye-level camera near the ground.",
  },
  // 5 — search the sandbox and slide
  {
    scene:
      "Peeking inside a sandy sandbox and then up into the mouth of a curvy tunnel " +
      `slide with ${MAGNIFIER}, looking determined.`,
    copy: (c, p) =>
      `Next ${p.subj} peeked inside the sandbox, then climbed up to look down the ` +
      `slide. Still no ball — but ${c.name} did not give up.`,
    light:
      "Bright midday sun from above, warm and clear; eye-level camera by the sandbox and slide.",
  },
  // 6 — Aha! the footprint clue (kid sneaker prints, wiggly tread)
  {
    scene:
      "Crouched on the ground with eyes wide in discovery, holding " +
      `${MAGNIFIER} over a trail of little muddy child's sneaker footprints — ` +
      "clearly HUMAN kid footprints, NOT animal paw prints — that have wiggly " +
      "tread lines on the bottom.",
    copy: (c) =>
      `Then ${c.name} looked down at the ground. Aha — a clue! A trail of little ` +
      `muddy footprints, with wiggly lines on the bottom.`,
    light:
      "Bright, clear daylight raking low from the upper left across the ground so the footprints stand out; low eye-level camera near the trail.",
  },
  // 7 — a close-up deduction (kid footprint, wiggly tread)
  {
    scene:
      "An over-the-shoulder detective close-up: peering through " +
      `${MAGNIFIER} at a single muddy child's sneaker footprint — a human kid ` +
      "footprint, not an animal paw print — the wiggly tread pattern magnified, " +
      "thinking hard with a focused face.",
    copy: (c, p) =>
      `${cap(p.subj)} looked closely through ${p.poss} glass. "Wiggly lines… ` +
      `little feet… these are sneaker prints, about my size!"`,
    light:
      "Bright, focused daylight from above with crisp detail on the single footprint; close over-the-shoulder camera near the ground.",
  },
  // 8 — following past the slide
  {
    scene:
      "Following the trail of muddy footprints past a bright playground slide, " +
      `focused and careful, with ${MAGNIFIER} in hand.`,
    copy: (c, p) =>
      `"I can track these," said ${c.name}. ${cap(p.subj)} followed the footprints ` +
      `past the slide, step by step.`,
    light:
      "Bright, cheerful afternoon sun from the right; eye-level camera following the trail past the slide.",
  },
  // 9 — behind the bush (footprint points forward, away from the hero)
  {
    scene:
      "Gently parting the leaves of a low garden bush with both hands to reveal " +
      "another muddy child's sneaker footprint on the far side; the footprint " +
      "clearly points FORWARD and away, toe pointing off into the direction the " +
      "trail continues; peeking through with curiosity.",
    copy: (c) =>
      `The trail led behind a leafy bush. ${c.name} gently parted the leaves — ` +
      `and there was another print, pointing the way ahead.`,
    light:
      "Soft dappled daylight filtering through the leafy bush from the upper right; eye-level camera at the bush.",
  },
  // 10 — the puddle problem (SPREAD)
  {
    scene:
      "Standing at the edge of a big puddle of water where the muddy trail suddenly " +
      "vanishes, one hand on the chin, thinking hard with a slightly puzzled look.",
    copy: (c) =>
      `But suddenly, the footprints stopped! A big puddle of water had washed the ` +
      `mud away. ${c.name} had a problem — but detectives never give up.`,
    spread: true,
    light:
      "Bright open daylight from above reflecting off the puddle; eye-level camera at the puddle's edge.",
  },
  // 11 — thinking it through
  {
    scene:
      "Walking carefully around the edge of the puddle and bending down to study " +
      `the grass and dirt closely through ${MAGNIFIER}, determined.`,
    copy: (c, p) =>
      `"If I were a muddy footprint, where would I go next?" ${p.subj} wondered. ` +
      `${c.name} walked all the way around the puddle and looked closely at the grass.`,
    light:
      "Bright, even daylight from the upper left; eye-level camera around the puddle.",
  },
  // 12 — Aha! the trail resumes
  {
    scene:
      "Pointing happily at fresh muddy footprints reappearing in soft brown dirt " +
      "just past the puddle, with a big triumphant, delighted expression.",
    copy: (c, p) =>
      `Aha! There they were — the footprints started again in the soft dirt! ` +
      `${cap(p.poss)} eyes lit up. ${cap(p.subj)} had solved the puzzle.`,
    light:
      "Bright, warm daylight from the right catching the fresh footprints in the soft dirt; low eye-level camera on the ground.",
  },
  // 13 — the shady willow tree (SPREAD)
  {
    scene:
      "Peering with bright, happy curiosity toward a big, friendly willow tree with " +
      "soft green branches swaying gently in the breeze, holding up " + MAGNIFIER +
      " and eagerly searching along the muddy trail that leads under the tree; a warm, " +
      "cheerful, inviting mood — playful and safe, NOT scary or spooky, with a bright " +
      "curious smile.",
    copy: (c, p) =>
      `The trail led to a big, friendly willow tree, its soft green branches swaying in ` +
      `the breeze. "The clues go right under here!" ${c.name} said, peeking eagerly ` +
      `beneath the leaves to search for the ball.`,
    spread: true,
    ink: "dark",
    light:
      "Warm, bright dappled sunlight streaming through the willow's soft green branches, cheerful and inviting; eye-level camera before the willow.",
  },
  // 14 — peeping into the shadow, a flash of yellow
  {
    scene:
      "Pushing the willow's hanging leaves aside and peeping into the cool shadow, " +
      `catching sight of a flash of bright yellow — ${BALL} resting on a mossy tree ` +
      "root — with a look of surprise and discovery.",
    copy: (c, p) =>
      `${c.name} pushed the leaves aside and stepped into the shadow. A flash of ` +
      `yellow caught ${p.poss} eye. It was the missing ball!`,
    ink: "dark",
    light:
      "Cool willow-shadow light with one warm shaft of sunlight catching the bright yellow ball on the root; eye-level camera stepping into the shadow.",
  },
  // 15 — the ball isn't alone
  {
    scene:
      `Discovering ${MEERA} sitting quietly under the willow, holding ${BALL} and ` +
      "looking up with wide, shy eyes; the young detective pausing gently and kindly " +
      "so as not to scare her. Draw the girl with correct, natural anatomy — exactly " +
      "two arms and two legs.",
    copy: () =>
      `But the ball wasn't alone. A girl with muddy sneakers was holding it. She ` +
      `looked up, her eyes wide and shy.`,
    ink: "dark",
    light:
      "Soft, cool dappled willow light from above, dim and gentle; eye-level camera under the tree.",
  },
  // 16 — a reassuring smile (NEW — keeps the story kind and the layout aligned)
  {
    scene:
      `Crouching down gently to ${MEERA}'s level under the willow with a warm, ` +
      "reassuring smile and open, friendly body language so she feels safe; " +
      `${BALL} held softly between them. Both children drawn with correct, natural ` +
      "anatomy — exactly two arms and two legs each.",
    copy: (c, p) =>
      `${c.name} could see the girl was frightened. So ${p.subj} gave ${p.poss} ` +
      `kindest smile. "It's okay," ${p.subj} said softly. "I'm not upset."`,
    light:
      "Soft, cool dappled willow light from above, calm and gentle; eye-level camera at the children's height.",
  },
  // 17 — a kind, soft voice (fix any anatomy — well-drawn girls)
  {
    scene:
      `Kneeling down to ${MEERA}'s level with a warm, gentle smile, speaking softly ` +
      `and kindly; ${BALL} on the ground between them. Draw both children clearly ` +
      "and well, with correct natural anatomy — exactly two arms and two legs each, " +
      "no extra, missing, or merged limbs.",
    copy: (c, p) =>
      `${c.name} remembered how to be kind. ${cap(p.subj)} didn't yell. In a soft, ` +
      `gentle voice ${p.subj} said, "Hi. I'm ${c.name}. That's my friend's ball."`,
    light:
      "Soft dappled willow light with a warm hint of sun; eye-level camera at kneeling height.",
  },
  // 18 — Meera introduces herself
  {
    scene:
      `${MEERA} looking up shyly while holding ${BALL} close, as the young detective ` +
      "listens with a caring, patient face under the willow.",
    copy: () => `"I'm Meera," the girl said in a small, shaky voice.`,
    light:
      "Soft, gentle dappled willow light from above; eye-level camera at the children's height.",
  },
  // 19 — the ball handed over (both girls standing)
  {
    scene:
      `Both girls standing under the willow as ${MEERA} holds out ${BALL} and hands ` +
      "it back to the young detective with a tiny hopeful smile, while the detective " +
      "smiles warmly — the start of a new friendship. Both girls drawn well with " +
      "correct natural anatomy — exactly two arms and two legs each." +
      FULL_FIGURE,
    copy: (c, p) =>
      `${c.name} understood. Being new is hard. "You don't have to take things to ` +
      `make a friend," ${p.subj} said gently. "You can just say hello." Meera smiled ` +
      `a tiny smile and handed over the ball.`,
    light:
      "Soft dappled willow light warming as they step toward the edge of the shade; eye-level camera at child height.",
  },
  // 20 — out of the shadows, into the sunshine (SPREAD)
  {
    scene:
      `The young detective and ${MEERA} holding hands and walking together out from ` +
      "under the willow's cool shadow toward the bright sunlight of the playground " +
      "ahead; both happy." +
      FULL_FIGURE,
    copy: (c, p) => `"Yes!" said ${c.name}, holding out ${p.poss} hand.`,
    spread: true,
    light:
      "A bright, warm burst of golden sunshine from ahead as they leave the willow's cool shadow; eye-level camera facing the sunlit playground.",
  },
  // 21 — a happy reunion (Rohan's face lights up)
  {
    scene:
      `${ROHAN}'s face lighting up with pure joy as he sees his bright yellow ball ` +
      "again, jumping up from the bench with a huge happy smile as the young " +
      "detective hands it back to him in the sunny playground." +
      FULL_FIGURE,
    copy: () =>
      `Rohan was so happy to have his ball back — and even happier to meet Meera!`,
    light:
      "Warm, bright afternoon sunlight from the upper right, joyful and clear; eye-level camera by the bench.",
  },
  // 22 — introducing a new friend (NEW — keeps the story warm and the layout aligned)
  {
    scene:
      `In the bright sunny playground, the young detective happily introducing ` +
      `${MEERA} to ${ROHAN}, gesturing between the two new friends with a big ` +
      "welcoming smile; Meera smiling shyly and Rohan waving hello." +
      FULL_FIGURE,
    copy: (c) =>
      `"Rohan, this is my new friend, Meera!" said ${c.name}. Rohan smiled and ` +
      `waved. "Do you want to play with us?" he asked. Meera nodded happily.`,
    light:
      "Warm, bright afternoon sunlight from the upper right, cheerful and clear; eye-level camera in the playground.",
  },
  // 23 — three friends playing catch (SPREAD)
  {
    scene:
      `Three children — the young detective, ${ROHAN}, and ${MEERA} — laughing and ` +
      `playing catch together on the grass, tossing ${BALL} between them in warm, ` +
      "golden afternoon light; joyful and full of friendship." +
      FULL_FIGURE,
    copy: () =>
      `Soon, the three friends were laughing and playing catch together. The lost ` +
      `ball was found—and a new friendship began.`,
    spread: true,
    light:
      "Warm, golden late-afternoon light from the right, soft and happy; eye-level camera on the grass.",
  },
];

/** The full ordered book: cover + opening + case scenes + merged closing/back. */
const theGreatDetectivePages: PageSpec[] = [
  // Front cover — dramatic movie-poster close-up through the magnifying glass.
  {
    kind: "cover",
    illustrationPrompt: illustration(
      "A dramatic movie-poster COVER close-up: leaning down and peering through " +
        `${MAGNIFIER} held up to one eye, studying a set of little muddy footprints ` +
        "pressed into the sandy playground ground, the other eye slightly narrowed " +
        "in concentration. The face and the magnifying glass are large and central, " +
        "the footprints magnified in the glass. A playground (swings, slide, " +
        "merry-go-round) is softly blurred behind at golden hour. Bold, cinematic " +
        "poster framing; the face must unmistakably look like the real child in the " +
        "reference photos, with their hair exactly as in those photos. Keep the " +
        "lower portion calmer and more open so a large title can sit across the " +
        "lower area without covering the face.",
      "Warm golden-hour side light from a low sun, cinematic and slightly dramatic, with soft rim light on the hair; eye-level close-up camera.",
    ),
    text: (c) => `${c.name}'s Great Detective`,
  },
  // Opening / introduction (single page)
  {
    kind: "intro",
    illustrationPrompt: illustration(
      "Standing confidently in a sunny neighbourhood playground holding " +
        `${MAGNIFIER}, looking down thoughtfully at something on the ground with ` +
        "sharp, curious eyes.",
      "Bright, cheerful morning light from the upper right across the playground; eye-level camera.",
    ),
    text: (c) => {
      const p = pronouns(c.gender);
      return (
        `${c.name} was not just a little ${childNoun(c.gender)}. ` +
        `${cap(p.subj)} was a detective! ${cap(p.subj)} noticed things that other ` +
        `people missed. She didn't Use magic - she used her sharp eyes, her clever brain, and her favourite magnifying glass.`
      );
    },
  },
  // Investigation scenes
  ...STORY.map(
    (b): PageSpec => ({
      kind: "scene",
      spread: b.spread,
      ink: b.ink,
      illustrationPrompt: illustration(b.scene, b.light),
      text: (c) => b.copy(c, pronouns(c.gender)),
    }),
  ),
  // Closing / back cover — the "CASE CLOSED" sign is painted INTO the art (this
  // one page opts out of the no-text rule via ART_STYLE_WITH_SIGN). Image-only:
  // no overlaid verse/title.
  {
    kind: "backcover",
    illustrationPrompt: (c) => {
      const scene =
        "In a sunny playground dappled with light beneath leafy trees, standing " +
        `and smiling warmly while handing the bright yellow ball back to ${ROHAN}, ` +
        `both looking happy, with ${MAGNIFIER} in the other hand; swings, a slide, ` +
        "a merry-go-round and a wooden bench softly behind, and a couple of children " +
        "playing in the distance; a cheerful, satisfying 'case solved' mood. In the " +
        "right-hand foreground — set fully inside the frame with a clear margin of " +
        "open background between the sign and the right edge — a hand-painted wooden " +
        "sign is posted in the ground with precise, clear, correctly-spelled text " +
        `that reads: "CASE CLOSED! ${c.name.toUpperCase()}'S DETECTIVE AGENCY". ` +
        "IMPORTANT COMPOSITION: keep the ENTIRE sign and all of its text within the " +
        "central area of the picture, well away from all four edges (leave generous " +
        "empty margins), because the outer edges are cropped when the book is printed." +
        FULL_FIGURE;
      const light =
        "Warm and golden, with sunlight filtering through the dense green tree " +
        "leaves, casting dappled light and a subtle rainbow arch in the upper trees; " +
        "eye-level camera by the bench.";
      return illustration(scene, light, ART_STYLE_WITH_SIGN)(c);
    },
    // Image-only: the closing text lives on the painted sign in the illustration.
    text: () => "",
  },
];

/** The "Great Detective" book, ready to register in `registry.ts`. */
export const theGreatDetectiveBook: StoryTemplate = {
  id: "the-great-detective",
  title: "The Great Detective",
  subtitle: "A clever little detective cracks the case of the missing yellow ball.",
  pages: theGreatDetectivePages,
};
