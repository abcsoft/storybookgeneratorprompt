/**
 * Machine-readable regeneration manifest for existing generated artwork.
 *
 * Per the repair task's regeneration policy: prompt/contract changes affect
 * future generations only — existing artwork is never auto-discarded. Each
 * page is classified from a direct visual audit of the currently-rendered
 * draft PDF (storybook-out/ihan_13/ihan-great-adventure.pdf, generated via
 * the already-wired standard-24 StoryEdition pipeline), not inferred from
 * the prompt text. A page whose prompt changed but whose artwork was never
 * re-examined must NOT be marked KEEP_EXISTING by default — it stays
 * REGENERATION_REQUIRED (or is left out of this manifest) until someone
 * actually looks at it.
 */

export type RegenerationDecision = "KEEP_EXISTING" | "REFRAME_ONLY" | "RENDER_OVERLAY_ONLY" | "REGENERATION_REQUIRED";

export interface RegenerationManifestEntry {
  sceneId: string;
  decision: RegenerationDecision;
  /** Why this decision was made, citing the specific visual defect (if any). */
  reason: string;
}

/**
 * Audited against storybook-out/ihan_13/ihan-great-adventure.pdf (26 pages:
 * cover, 24 standard-24 interior pages, back cover), generated 2026-09-17.
 * Pages not explicitly called out below as defective are KEEP_EXISTING —
 * confirmed present, on-model, and narratively correct on direct visual
 * inspection of that PDF.
 */
export const GREAT_ADVENTURE_REGENERATION_MANIFEST: RegenerationManifestEntry[] = [
  { sceneId: "greeting", decision: "KEEP_EXISTING", reason: "Harbour portrait with Scout asleep beside the child — on-model, no defect observed." },
  { sceneId: "intro", decision: "KEEP_EXISTING", reason: "Bedroom map-unrolling scene — on-model, no defect observed." },
  { sceneId: "harbour-departure", decision: "KEEP_EXISTING", reason: "No defect observed." },
  { sceneId: "jungle-trail", decision: "KEEP_EXISTING", reason: "No defect observed." },
  { sceneId: "rope-bridge", decision: "KEEP_EXISTING", reason: "No defect observed." },
  { sceneId: "desert-camel", decision: "KEEP_EXISTING", reason: "No defect observed." },
  {
    sceneId: "ancient-ruins",
    decision: "REGENERATION_REQUIRED",
    reason:
      "The carved wall symbol in the existing render is an ankh-like loop-and-stem glyph. The prompt now " +
      "specifies SECRET_MARKER (a circle-and-cross) reused verbatim at \"island-marker\", so this page's " +
      "existing artwork no longer matches the corrected, continuity-locked marker and must be regenerated.",
  },
  {
    sceneId: "savanna-riverbank",
    decision: "REGENERATION_REQUIRED",
    reason: "Scout is not visibly depicted anywhere in the existing frame, despite the page copy naming Scout by name (\"Scout barked, Hello!\").",
  },
  { sceneId: "snowy-mountain", decision: "KEEP_EXISTING", reason: "No defect observed." },
  {
    sceneId: "arctic-arrival",
    decision: "REGENERATION_REQUIRED",
    reason: "Scout renders as a white/pale-coated dog in this scene, drifting from the golden/light-brown coat established everywhere else in the book.",
  },
  {
    sceneId: "arctic-aurora",
    decision: "REGENERATION_REQUIRED",
    reason: "Same Scout coat-color drift as arctic-arrival (white/pale instead of golden/light-brown).",
  },
  { sceneId: "coral-reef", decision: "KEEP_EXISTING", reason: "No defect observed." },
  { sceneId: "blue-whale", decision: "KEEP_EXISTING", reason: "No defect observed." },
  {
    sceneId: "ocean-storm",
    decision: "REGENERATION_REQUIRED",
    reason:
      "The child appears fully dry with neatly styled hair immediately after \"bursting up from underwater\" — " +
      "no visual transition cue (wet hair/clothes, dripping water). The prompt now requires this explicitly.",
  },
  { sceneId: "island-arrival", decision: "REFRAME_ONLY", reason: "Content is correct; only the text-panel position needs to move (now top-right) so it stops crowding Scout at lower frame center — no re-generation of the artwork itself is required." },
  {
    sceneId: "island-marker",
    decision: "REGENERATION_REQUIRED",
    reason: "Existing rock/map carving is a plain Latin cross, which does not match the corrected SECRET_MARKER (circle-and-cross) now locked at \"ancient-ruins\" — regenerate so both marker appearances are identical.",
  },
  { sceneId: "crystal-cave", decision: "KEEP_EXISTING", reason: "Correctly stays inside the established crystal cave; no defect observed." },
  {
    sceneId: "treasure-chest-reach",
    decision: "REGENERATION_REQUIRED",
    reason:
      "The chest is shown closed with a hand merely hovering nearby (no visible lifting action), and the " +
      "existing bottom-left text panel covers a large portion of the chest. The prompt now requires an " +
      "actively-lifted lid, and the panel position has moved to top-right.",
  },
  { sceneId: "chest-bursts-open", decision: "REFRAME_ONLY", reason: "Artwork (golden starlight swirl) is correct; only the text-panel position needs to move to top-right so it no longer sits over the now-open chest." },
  {
    sceneId: "star-friend",
    decision: "REGENERATION_REQUIRED",
    reason:
      "Existing artwork depicts the star reveal on an outdoor forest path at dusk with fireflies, breaking " +
      "location continuity from the crystal cave established in the three preceding scenes. The prompt now " +
      "requires the star to rise out of the open treasure chest inside the same cave chamber — regenerate to match.",
  },
  // Flight-scene identity review (PDF pages 22-23 / interior pages 21-22):
  // both scenes were split from one former combined "flying home" spread, so
  // neither has a single existing image that corresponds to it 1:1 — a
  // visual identity comparison (face/age/hair/Scout-contract drift) isn't
  // possible against artwork that was never generated for this exact scene.
  // REGENERATION_REQUIRED here is "nothing to compare yet," not "compared
  // and found drifted." Both already receive the new immutable identity +
  // Scout + style-lock contracts (via the shared prompt engine) for
  // whenever they ARE generated.
  {
    sceneId: "star-trail-departure",
    decision: "REGENERATION_REQUIRED",
    reason: "New scene (split from the former combined flying-home spread) with no prior matching artwork — nothing exists yet to keep or compare identity against.",
  },
  {
    sceneId: "star-trail-homeward-flight",
    decision: "REGENERATION_REQUIRED",
    reason: "New scene (split from the former combined flying-home spread) with no prior matching artwork — nothing exists yet to keep or compare identity against.",
  },
  {
    sceneId: "closing",
    decision: "KEEP_EXISTING",
    reason:
      "Visually inspected against the bottom-left text panel: the child's face (top of frame), Scout (bottom-right, " +
      "beyond the panel), the glowing star, and the window (top-right) all remain fully visible past the panel — " +
      "the panel covers only the blanket/torso area. Meets the 'must not cover face/most of body/Scout/star/window' " +
      "requirement as currently positioned, so REFRAME_ONLY/RENDER_OVERLAY_ONLY is not needed here.",
  },
  {
    sceneId: "video-qr",
    decision: "RENDER_OVERLAY_ONLY",
    reason:
      "Existing background art (or its equivalent once regenerated with the corrected scene prompt) is reused as-is; " +
      "the QR code, CTA, and fallback URL are always application-rendered vector/raster overlays, never part of " +
      "the generated image itself, so no image regeneration is needed purely for the QR fix.",
  },
  { sceneId: "cover", decision: "KEEP_EXISTING", reason: "No defect observed." },
  {
    sceneId: "backcover",
    decision: "RENDER_OVERLAY_ONLY",
    reason:
      "Artwork (waving farewell scene) is correct and distinct from the front cover, and child/Scout identity " +
      "in it matches every other page on visual inspection — no regeneration needed. Fixed instead: (1) the " +
      "duplicated-ellipsis copy bug (was \"The End…\\n...or maybe...\", now the single required line); " +
      "(2) the wrap-cover pipeline (printifyExport.ts -> composeCover) never rendered generic back-cover copy " +
      "at all — only a book-specific \"detective sign\" special case existed — now wired to render it as real " +
      "vector text; (3) a profile-derived (percentage-based, never hardcoded) barcode-safe region is now " +
      "reserved on the back-cover zone, and the copy's position is computed to clear it.",
  },
];

export function getRegenerationDecision(sceneId: string): RegenerationManifestEntry | undefined {
  return GREAT_ADVENTURE_REGENERATION_MANIFEST.find((e) => e.sceneId === sceneId);
}

/** Human-readable report grouped by decision, for the proof directory. */
export function renderRegenerationReport(): string {
  const groups: Record<RegenerationDecision, RegenerationManifestEntry[]> = {
    KEEP_EXISTING: [],
    REFRAME_ONLY: [],
    RENDER_OVERLAY_ONLY: [],
    REGENERATION_REQUIRED: [],
  };
  for (const entry of GREAT_ADVENTURE_REGENERATION_MANIFEST) {
    groups[entry.decision].push(entry);
  }
  const lines: string[] = [
    "Great Adventure — Artwork Regeneration Manifest",
    "=".repeat(48),
    `Audited against: storybook-out/ihan_13/ihan-great-adventure.pdf (2026-09-17)`,
    "",
  ];
  for (const decision of ["REGENERATION_REQUIRED", "REFRAME_ONLY", "RENDER_OVERLAY_ONLY", "KEEP_EXISTING"] as RegenerationDecision[]) {
    lines.push(`${decision} (${groups[decision].length}):`);
    for (const entry of groups[decision]) {
      lines.push(`  - ${entry.sceneId}: ${entry.reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
