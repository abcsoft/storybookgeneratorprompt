import { buildIllustrationPrompt } from "./prompt/buildIllustrationPrompt";
import { getHero } from "../hero/registry";
import type { ChildProfile, LayoutType, PageSpec, StoryTemplate } from "./types";

const DEFAULT_OUTFIT =
  "a deep navy zip hoodie, a light grey T-shirt, charcoal trousers, and simple white sneakers";

const WORLD =
  "ONE CONTINUOUS NIGHT in the same original riverside city: a rain-wet apartment rooftop with a metal railing and cylindrical water tank, a curved pedestrian bridge over the river, a small market street, a fenced construction area, and distant glass towers. Keep these landmarks spatially consistent from scene to scene. Cool moonlight, warm amber streetlights, wet reflections, light wind, no day/night changes.";

function heroPrompt(
  child: ChildProfile,
  scene: string,
  state: "civilian" | "awakening" | "transforming" | "canonical" | "hero",
  profileId?: string,
): string {
  const hero = getHero(child.heroId);
  const stateRule =
    state === "civilian"
      ? "HERO STATE — CIVILIAN ONLY. The hero suit, emblem and hero powers must NOT appear yet."
      : state === "awakening"
        ? "HERO STATE — AWAKENING. Show only subtle power signs over the unchanged civilian outfit; do not form the hero suit yet."
        : state === "transforming"
          ? `HERO STATE — TRANSFORMING. Show a gradual physical transformation, never an instant costume swap: ${hero.transformation}. Civilian clothes remain visible wherever the transformation has not reached.`
          : state === "canonical"
            ? `HERO STATE — CANONICAL HERO REVEAL. This frame defines the permanent design for all later pages. Exact suit: ${hero.suit}. Exact emblem: ${hero.emblem}. Exact palette: ${hero.palette}. Powers: ${hero.powers}. Power effects: ${hero.powerFx}. The child keeps the exact same real face, age and body proportions. No mask may hide the child's identity.`
            : `HERO STATE — LOCKED HERO. Use the EXACT canonical ${hero.name} design with no redesign: ${hero.suit}; emblem: ${hero.emblem}; palette: ${hero.palette}. Effects: ${hero.powerFx}. Keep the exact same child identity and six-year-old proportions.`;

  return buildIllustrationPrompt({
    child,
    story: { defaultOutfit: state === "civilian" || state === "awakening" || state === "transforming" ? DEFAULT_OUTFIT : undefined },
    scene:
      `ORIGINAL HERO PRODUCTION. ${WORLD} ${stateRule} HERO IDENTITY: ${hero.name}, an original ${hero.archetype}. ` +
      `Do not imitate or reference any existing franchise superhero, costume, logo, symbol, city, vehicle, weapon, supporting character or trademark. ` +
      `CURRENT SCENE: ${scene}`,
    layout: "single-page" as LayoutType,
    profileId,
    light:
      "cinematic night lighting: cool moonlight from above and camera-left, warm amber practical city lights from below, realistic wet-surface reflections, physically consistent shadows; live-action feature-film camera",
  });
}

function page(
  state: "civilian" | "awakening" | "transforming" | "canonical" | "hero",
  scene: (c: ChildProfile) => string,
  copy: (c: ChildProfile) => string,
  kind: PageSpec["kind"] = "scene",
  role?: string,
): PageSpec {
  return {
    kind,
    role,
    pageLayout: "single",
    layout: "single-page",
    illustrationPrompt: (c, profileId) => heroPrompt(c, scene(c), state, profileId),
    text: copy,
  };
}

const storyPages: PageSpec[] = [
  page("hero",
    (c) => {
      const h = getHero(c.heroId);
      return `Premium cover image. ${c.name} fully transformed into ${h.name}, standing confidently on the rain-wet rooftop, original city and bridge behind, power effect moving around the hands and boots, clean negative space for title added later by layout software. No text inside artwork.`;
    },
    (c) => `${c.name} and the ${getHero(c.heroId).name}`,
    "cover",
    "COVER",
  ),

  page("civilian",
    (c) => `${c.name} stands beside the rooftop railing after dinner, quietly looking over the moonlit city and stars. Peaceful opening; no strange effects yet.`,
    (c) => `After dinner, ${c.name} climbed to the rooftop. The rain had stopped, and tiny drops sparkled on the railing. Far below, the city lights shimmered across the river. ${c.name} loved this quiet place. Tonight, one tiny light in the sky seemed brighter than all the others.`,
    "intro",
    "THE ROOFTOP",
  ),

  page("civilian",
    (c) => `${c.name} notices a small unfamiliar light moving between clouds above the same river and curved bridge; the child follows it with curious eyes.`,
    (c) => `The bright light moved. It was not a star. It slipped between the clouds, curved above the river, and vanished behind a building. A soft whistle passed through the night air. ${c.name} leaned closer to the railing. Whatever it was, it seemed to be coming nearer.`,
    "scene",
    "THE MOVING LIGHT",
  ),

  page("civilian",
    (c) => `A small original glowing prism-like seed of light lands softly on the wet rooftop several steps from ${c.name}; it is abstract and unbranded, not shaped like any famous symbol.`,
    (c) => `Something bright floated down from the sky. It looked like a tiny crystal seed made of light. It landed softly on the wet rooftop. When ${c.name} stepped closer, it lifted again and circled once, leaving a faint glowing trail behind.`,
    "scene",
    "THE LIGHT SEED",
  ),

  page("awakening",
    (c) => `${c.name} slowly raises one hand toward the hovering light seed; a subtle version of ${getHero(c.heroId).powerFx} curls around the fingers while the civilian outfit remains completely unchanged.`,
    (c) => `${c.name} raised one hand. The strange light turned toward the fingers. A tiny wave of energy answered. Leaves moved. Rain droplets lifted from the ground. ${c.name} pulled back, and everything became still. One more careful try—and the energy followed again.`,
    "scene",
    "THE FIRST RESPONSE",
  ),

  page("awakening",
    (c) => `A distant city warning begins near the curved bridge and construction area while ${c.name} looks toward it; the light seed glows brighter beside the unchanged civilian child.`,
    (c) => `A deep warning siren rolled across the river. Near the bridge, strong wind rattled the construction barriers and traffic slowed. The glowing seed beside ${c.name} became brighter. Something was wrong, and the city needed help.`,
    "scene",
    "DANGER IN THE CITY",
  ),

  page("awakening",
    (c) => `The floating seed opens into harmless abstract geometric light around ${c.name}; the child understands it is offering a choice, with determined expression and unchanged clothes.`,
    (c) => `The little light opened like a tiny floating map. ${c.name} could not read its shapes, but somehow understood the question: Would you help? ${c.name} looked toward the bridge, took a breath, and nodded. “I'll try.”`,
    "scene",
    "THE CHOICE",
  ),

  page("awakening",
    (c) => `The light touches ${c.name}'s wrist. A faint version of ${getHero(c.heroId).powerFx} travels over one sleeve without replacing clothing; the child senses the new power for the first time.`,
    (c) => `Warm energy touched ${c.name}'s wrist. It did not hurt. Instead, the whole world suddenly felt clearer. ${c.name} could sense the new power moving nearby, waiting to be guided instead of forced.`,
    "scene",
    "FIRST CONTACT",
  ),

  page("awakening",
    (c) => `A small rooftop hazard begins to fall over the edge; ${c.name}, still fully in civilian clothes, instinctively uses a weak first version of ${getHero(c.heroId).powers} to stop it safely.`,
    (c) => `A metal bucket rolled toward the edge. ${c.name} reached out without thinking. The new power flashed—and the bucket stopped before it could fall. Slowly, carefully, ${c.name} guided it back to safety. The power was real.`,
    "scene",
    "THE FIRST SAVE",
  ),

  page("transforming",
    (c) => `Transformation begins visibly at ${c.name}'s shoes and lower legs according to this exact mechanism: ${getHero(c.heroId).transformation}. Upper body remains in the navy hoodie and grey T-shirt. Show wonder, not fear.`,
    (c) => `The energy moved toward ${c.name}'s shoes. New material formed piece by piece, then climbed slowly over the legs. The change was not a flash. It was building something carefully around ${c.name}, layer by layer.`,
    "scene",
    "THE CHANGE BEGINS",
  ),

  page("canonical",
    (c) => {
      const h = getHero(c.heroId);
      return `Complete transformation peak. ${c.name} is now fully transformed into the ORIGINAL hero ${h.name}. Permanent suit: ${h.suit}. Permanent emblem: ${h.emblem}. Palette: ${h.palette}. Show ${h.powerFx} reacting to the rooftop environment. Confident, child-appropriate hero reveal.`;
    },
    (c) => {
      const h = getHero(c.heroId);
      return `The transformation reached ${c.name}'s shoulders and clicked into place. The last glow faded, revealing a brand-new hero suit. ${c.name} looked down in amazement. The same child was still there—but now the power had a name. ${h.name} had awakened.`;
    },
    "scene",
    "HERO REVEAL",
  ),

  page("hero",
    (c) => `${c.name} carefully tests ${getHero(c.heroId).powers} on the same rooftop, slightly unsteady at first, with a childlike smile as control improves.`,
    (c) => `${c.name} tried the new power carefully. The first attempt was wobbly. The second was better. On the third try, the movement felt smooth and natural. ${c.name} laughed. The power was not about showing off. It was about learning control.`,
    "scene",
    "LEARNING THE POWER",
  ),

  page("hero",
    (c) => `${c.name} performs one controlled practice move around the rooftop water tank using ${getHero(c.heroId).powers}, returning to the starting point with the exact suit unchanged.`,
    (c) => `One careful move became another. ${c.name} practiced around the water tank, stopped exactly where intended, and tried again. Each time, the power became easier to understand. Then a sharp metallic crack echoed from the bridge.`,
    "scene",
    "READY",
  ),

  page("hero",
    (c) => `From the rooftop edge, ${c.name} sees a large loose construction panel near the curved bridge swinging dangerously above a stopped delivery van; people move to safety below.`,
    (c) => `A large construction panel had broken loose beside the bridge. It swung over the road while cars stopped below. Most people had moved away—but one small delivery van was trapped. ${c.name}'s practice time was over.`,
    "scene",
    "TROUBLE AT THE BRIDGE",
  ),

  page("hero",
    (c) => `${c.name} leaves the rooftop and moves toward the bridge using ${getHero(c.heroId).powers}; dynamic rear three-quarter tracking composition, same original skyline and river.`,
    (c) => `${c.name} took one deep breath and moved toward the danger. The wet city rushed past below. The bridge grew larger ahead, and the loose panel twisted in the storm. “Hold on,” ${c.name} whispered.`,
    "scene",
    "TOWARD THE DANGER",
  ),

  page("hero",
    (c) => `The metal construction panel breaks free above the trapped van. ${c.name} attempts the first rescue using ${getHero(c.heroId).rescueMove}, but the effort is not yet enough. No injuries.`,
    (c) => `The last support snapped. The heavy panel began to fall. ${c.name} used the new power with everything learned so far. The fall slowed—but did not stop. The danger was still moving, and the first plan was not enough.`,
    "scene",
    "THE FIRST ATTEMPT",
  ),

  page("hero",
    (c) => `A sudden gust or secondary hazard disrupts ${c.name}'s first rescue attempt; the child loses position briefly but remains safe, exact suit unchanged, action intense but child-friendly.`,
    (c) => `A sudden gust knocked ${c.name} off balance. For one scary moment, the rescue slipped away. Instead of panicking, ${c.name} remembered the rooftop: the power worked best when it was guided with care, not forced.`,
    "scene",
    "A HARD MOMENT",
  ),

  page("hero",
    (c) => `${c.name} studies the moving hazard and discovers a smarter use of ${getHero(c.heroId).powers}; show the power effect becoming controlled, precise and geometrically clear around the panel.`,
    (c) => `${c.name} watched the danger carefully. There was a pattern in the movement. A new idea appeared. Instead of fighting everything at once, ${c.name} guided the power exactly where it was needed. The heavy panel began to turn away from the road.`,
    "scene",
    "THE NEW IDEA",
  ),

  page("hero",
    (c) => `Peak heroic action: ${c.name} performs the signature rescue—${getHero(c.heroId).rescueMove}. The van escapes below while the child remains visibly six years old, brave and focused. No gore, no collision.`,
    (c) => `The panel swung back one last time. ${c.name} moved underneath, focused, and gave the rescue one final controlled push. The power answered. The heavy panel lifted clear just long enough for the delivery van to escape. Everyone was safe.`,
    "scene",
    "THE BIGGEST SAVE",
  ),

  page("hero",
    (c) => `${c.name} carefully guides the damaged panel into the empty fenced construction area, using ${getHero(c.heroId).powers} gently rather than throwing it. Calm begins returning.`,
    (c) => `${c.name} still had one job left. Slowly and carefully, the damaged panel was guided into the empty construction yard. It landed safely. Nothing crashed into the road. No one was hurt.`,
    "scene",
    "SAFE GROUND",
  ),

  page("hero",
    (c) => `Emergency workers and the delivery driver wave gratefully from a safe distance. ${c.name} responds with a small humble smile, exact hero suit unchanged.`,
    (c) => `Emergency workers checked the bridge. The driver stepped from the van and waved. A few people cheered. ${c.name} smiled back—but the best feeling was not being noticed. It was seeing everyone safe.`,
    "scene",
    "THANK YOU",
  ),

  page("hero",
    (c) => `${c.name} returns peacefully through the same city toward the original rooftop. The storm has softened, river reflections calm, moon visible through thinning clouds.`,
    (c) => `The storm slowly moved away. ${c.name} returned across the quiet city, no longer rushing. The river settled. The same rooftop appeared ahead, waiting beneath the moon.`,
    "closing",
    "HOME AGAIN",
  ),

  page("hero",
    (c) => `Visual echo of the first rooftop scene. ${c.name}, in the exact locked hero suit, stands beside the same railing looking at the same stars. Gentle ${getHero(c.heroId).powerFx}; peaceful emotional ending.`,
    (c) => `${c.name} looked at the stars again. Being powerful did not make someone a hero. A hero noticed when somebody needed help—and chose to act. The city lights glowed below as ${c.name} smiled. The hero had been inside all along.`,
    "closing",
    "THE HERO INSIDE",
  ),

  page("hero",
    (c) => `Premium back-cover artwork only: the same moonlit riverside city and rooftop after the adventure, with a very subtle trace of ${getHero(c.heroId).powerFx} crossing the sky. Keep a large calm area for optional synopsis and barcode added later. ${c.name} may appear only as a tiny distant silhouette if at all. No text in artwork.`,
    () => "",
    "backcover",
    "BACK COVER",
  ),
];

export const heroAdventureBook: StoryTemplate = {
  id: "hero-adventure",
  title: "Original Hero Adventure",
  subtitle: "A 22-page cinematic transformation-and-rescue story with an original hero you choose.",
  pages: storyPages,
  defaultOutfit: DEFAULT_OUTFIT,
};
