/**
 * Explicit, per-scene semantic contracts for the Great Adventure standard-24
 * edition — what MUST be true of each interior page's illustration and text,
 * derived from a direct visual audit of the rendered draft PDF (not assumed
 * from the prompt text alone; see the regeneration manifest for the audit
 * findings). Each contract is deliberately narrow and checkable by a
 * deterministic lint test (greatAdventureSemanticContracts.test.ts) that
 * inspects the compiled prompt string — it does NOT and cannot prove the
 * generated image visually matches; only a human/automated visual review of
 * the actual rendered artwork can do that (see regenerationManifest.ts).
 */

import type { TextPanelPosition } from "./layoutGeometry";

export interface SceneSemanticContract {
  sceneId: string;
  /** Characters that must be present/mentioned in the scene. */
  requiredCharacters: string[];
  /** The one required narrative action for this page. */
  requiredAction: string;
  requiredLocation: string;
  requiredProps: string[];
  /** Cross-scene continuity this scene depends on (e.g. reusing the same marker). */
  continuityReferences: string[];
  /** Substitutions/omissions that would silently break the contract. */
  forbiddenSubstitutions: string[];
  /** Where the application-rendered story-text panel must sit. */
  textSafeRegion: TextPanelPosition;
  /** Rough half of frame the main subject/action occupies — the panel must
   *  never land on this side AND cover the subject at the same time; used
   *  only as a documentation cross-check against textSafeRegion, not
   *  independently enforced by the lint test. */
  subjectSafeRegion: "left" | "right" | "center";
}

export const GREAT_ADVENTURE_SEMANTIC_CONTRACTS: SceneSemanticContract[] = [
  {
    sceneId: "greeting",
    requiredCharacters: ["the child"],
    requiredAction: "a calm portrait moment at the harbour before the journey begins",
    requiredLocation: "sunny harbour at golden hour",
    requiredProps: ["rolled treasure map"],
    continuityReferences: [],
    forbiddenSubstitutions: ["rendering the greeting text inside the image"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "intro",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "unrolling the glowing treasure map in the bedroom at dawn",
    requiredLocation: "cozy bedroom",
    requiredProps: ["glowing treasure map", "packed explorer backpack"],
    continuityReferences: [],
    forbiddenSubstitutions: [],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "harbour-departure",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "pointing out to sea from the boat as the journey begins",
    requiredLocation: "small wooden sailboat leaving the harbour",
    requiredProps: ["rolled-up treasure map"],
    continuityReferences: [],
    forbiddenSubstitutions: [],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "jungle-trail",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "trekking along the jungle trail",
    requiredLocation: "lush green jungle",
    requiredProps: [],
    continuityReferences: [],
    forbiddenSubstitutions: [],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "rope-bridge",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "crossing the wobbly rope bridge over the waterfall",
    requiredLocation: "jungle waterfall gorge",
    requiredProps: ["rope bridge", "treasure map"],
    continuityReferences: [],
    forbiddenSubstitutions: ["cropping either of the child's hands at the frame edge"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "desert-camel",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "riding the camel across the dunes toward the oasis",
    requiredLocation: "golden desert dunes",
    requiredProps: ["camel", "treasure map"],
    continuityReferences: [],
    forbiddenSubstitutions: ["cropping the camel or rider at the frame edge"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "ancient-ruins",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "kneeling to study the secret marker carved into the ruin wall",
    requiredLocation: "ancient sandstone ruins",
    requiredProps: ["the secret marker", "treasure map"],
    continuityReferences: ["Must use the identical SECRET_MARKER description reused verbatim in \"island-marker\" — first discovery of the marker."],
    forbiddenSubstitutions: ["a different symbol/glyph than the one later matched at the island"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "savanna-riverbank",
    requiredCharacters: ["the child", "giraffes", "elephants"],
    requiredAction: "waving to the giraffes and elephants at the riverbank",
    requiredLocation: "grassy savanna riverbank at sunset",
    requiredProps: [],
    continuityReferences: ["Scout is named in the page copy (\"Scout barked, Hello!\") and must be visibly present in the illustration, not merely implied by the text."],
    forbiddenSubstitutions: ["omitting Scout from the illustration"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "snowy-mountain",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "climbing the snowy mountain path toward the eagle's ledge",
    requiredLocation: "snowy, rocky mountain path",
    requiredProps: ["eagle"],
    continuityReferences: ["Winter outfit override — same explorer shorts/boots, warm coat added."],
    forbiddenSubstitutions: [],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "arctic-arrival",
    requiredCharacters: ["the child", "Scout", "polar bears"],
    requiredAction: "laughing with the polar bears tumbling on the ice",
    requiredLocation: "frozen Arctic shore",
    requiredProps: ["little wooden boat"],
    continuityReferences: [
      "Scout must render with the SAME golden/light-brown coat color declared in the SCOUT companion spec — a known artwork defect (regeneration manifest) shows Scout drifting to a white/pale coat in this scene.",
    ],
    forbiddenSubstitutions: ["Scout depicted as a white or pale-coated dog", "Scout depicted as a different breed"],
    textSafeRegion: "top-right",
    subjectSafeRegion: "left",
  },
  {
    sceneId: "arctic-aurora",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "looking up at the aurora beside the waiting boat",
    requiredLocation: "Arctic shore at night",
    requiredProps: ["little wooden boat"],
    continuityReferences: [
      "Scout must render with the SAME golden/light-brown coat color as every other scene — same known defect as arctic-arrival.",
    ],
    forbiddenSubstitutions: ["Scout depicted as a white or pale-coated dog"],
    textSafeRegion: "top-right",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "coral-reef",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "snorkelling through the coral reef inside the shared air bubble",
    requiredLocation: "bright coral reef",
    requiredProps: ["diving mask", "air bubble"],
    continuityReferences: [],
    forbiddenSubstitutions: ["cropping any arm, hand, or fin at the frame edge"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "blue-whale",
    requiredCharacters: ["the child", "Scout", "the whale"],
    requiredAction: "riding the whale past the glowing jellyfish",
    requiredLocation: "deep ocean",
    requiredProps: ["air bubble", "ancient stone archway"],
    continuityReferences: [],
    forbiddenSubstitutions: ["cropping the whale, the child, or Scout at the frame edge"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "ocean-storm",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "holding the mast through the storm, just after surfacing from underwater",
    requiredLocation: "small wooden boat in an ocean storm",
    requiredProps: ["mast", "treasure map tucked in the backpack"],
    continuityReferences: [
      "Must visually continue from the immediately preceding underwater scene (blue-whale) — dripping wet hair/clothes required, per the storm-transition contract.",
    ],
    forbiddenSubstitutions: ["the child appearing fully dry with perfectly styled hair, with no visual link to having just been underwater"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "island-arrival",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "stepping off the boat onto the sandy cove",
    requiredLocation: "tropical island cove",
    requiredProps: ["little boat"],
    continuityReferences: [],
    forbiddenSubstitutions: ["Scout obscured by the text panel while splashing ashore"],
    textSafeRegion: "top-right",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "island-marker",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "pointing at the rock marker that matches the map",
    requiredLocation: "tropical island cove",
    requiredProps: ["the secret marker", "treasure map"],
    continuityReferences: ["Must use the identical SECRET_MARKER description reused verbatim from \"ancient-ruins\" — the later match of the marker."],
    forbiddenSubstitutions: ["a different symbol/glyph than the one discovered earlier at the ruins"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "crystal-cave",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "exploring deeper into the glittering crystal cave",
    requiredLocation: "crystal cave",
    requiredProps: ["glowing crystals"],
    continuityReferences: ["Must remain inside the established crystal cave — never silently relocate to a forest or other setting."],
    forbiddenSubstitutions: ["a forest or outdoor setting"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "treasure-chest-reach",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "actively lifting the treasure-chest lid with both hands",
    requiredLocation: "hidden stone chamber, crystal cave",
    requiredProps: ["the treasure chest", "the lid, visibly raised/open, not resting closed"],
    continuityReferences: ["Must remain inside the crystal-cave chamber established by the preceding scene."],
    forbiddenSubstitutions: ["the chest shown fully closed with no lifting gesture", "the chest, lid, or hands covered by the text panel"],
    textSafeRegion: "top-right",
    subjectSafeRegion: "left",
  },
  {
    sceneId: "chest-bursts-open",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "the chest bursting open in a swirl of golden starlight",
    requiredLocation: "hidden stone chamber, crystal cave",
    requiredProps: ["the treasure chest"],
    continuityReferences: [],
    forbiddenSubstitutions: ["the chest or its open lid covered by the text panel"],
    textSafeRegion: "top-right",
    subjectSafeRegion: "left",
  },
  {
    sceneId: "star-friend",
    requiredCharacters: ["the child", "Scout", "glowing star"],
    requiredAction: "meeting the floating star that will guide them home",
    requiredLocation: "forest path at dusk",
    requiredProps: [],
    continuityReferences: [],
    forbiddenSubstitutions: [],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "star-trail-departure",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "lifting off from the hilltop, waving goodbye to the crystal cave below",
    requiredLocation: "quiet hilltop at night",
    requiredProps: ["the glowing star", "star-trail"],
    continuityReferences: [],
    forbiddenSubstitutions: [],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "star-trail-homeward-flight",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "soaring home along the glowing star-trail",
    requiredLocation: "night sky above the clouds",
    requiredProps: ["star-trail"],
    continuityReferences: ["Exactly two arms/two hands total — never a third arm."],
    forbiddenSubstitutions: ["a third arm or extra hand", "the reaching arm crossing into the text-safe region"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "right",
  },
  {
    sceneId: "closing",
    requiredCharacters: ["the child", "Scout"],
    requiredAction: "falling asleep at home, adventure complete",
    requiredLocation: "warm bedroom at night",
    requiredProps: ["treasure map on the windowsill", "the glowing star"],
    continuityReferences: [],
    forbiddenSubstitutions: ["the text panel covering most of the sleeping child's face or body"],
    textSafeRegion: "bottom-left",
    subjectSafeRegion: "center",
  },
  {
    sceneId: "video-qr",
    requiredCharacters: [],
    requiredAction: "a character-free background reserving a QR-safe area",
    requiredLocation: "continuation of the closing bedroom's moonlit scene",
    requiredProps: [],
    continuityReferences: ["Visually connects to the immediately preceding closing scene (same moonlight, same window-and-star motif)."],
    forbiddenSubstitutions: [
      "the child or any person depicted in this background",
      "an AI-rendered QR code, barcode, URL, or link text baked into the artwork",
    ],
    textSafeRegion: "bottom-right",
    subjectSafeRegion: "right",
  },
];

export function getSemanticContract(sceneId: string): SceneSemanticContract | undefined {
  return GREAT_ADVENTURE_SEMANTIC_CONTRACTS.find((c) => c.sceneId === sceneId);
}
