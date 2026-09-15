import { getPrintProfile } from "../../print/registry";
import type { LayoutType, PageKind } from "../types";

export type TextPlacementSide = "left" | "right" | "none";
export type SubjectPlacementSide = "left" | "right" | "centered";

export type { FramingMode } from "../types";
import type { FramingMode } from "../types";

export function buildFramingBlock(framing: FramingMode): string {
  if (framing === "sleeping/bed-covered") {
    return (
      "FRAMING (sleeping/bed-covered) — The child is tucked comfortably under soft blankets or bedcovers, resting peacefully or deeply asleep. " +
      "Bedding covers the lower body naturally. " +
      "Require natural visible anatomy only for body parts actually outside the bedding (face, hair, and any resting hand or arm above covers)."
    );
  }
  if (framing === "bed-covered") {
    return (
      "FRAMING (bed-covered) — The child is cozy in bed under blankets or bedcovers. " +
      "Bedding covers the lower body naturally. " +
      "Require natural visible anatomy only for body parts actually outside the bedding (face, hair, and any resting hand or arm above covers)."
    );
  }
  if (framing === "seated-in-bed") {
    return (
      "FRAMING (seated-in-bed) — The child is sitting comfortably in bed in cozy sleepwear, partially covered by blankets. " +
      "Lower body beneath bedding is naturally occluded. " +
      "Ensure natural visible anatomy for head, torso, and any visible arms or hands above the covers."
    );
  }
  if (framing === "waist-up portrait") {
    return (
      "FRAMING (waist-up portrait) — Frame naturally from the waist or chest up with ample headroom. " +
      "The child's face and upper body are the clear focal point. " +
      "Keep visible hands, arms, and head comfortably within safe margins without accidental edge amputations."
    );
  }
  if (framing === "vehicle/cockpit") {
    return (
      "FRAMING (vehicle/cockpit) — The child is seated naturally inside the vehicle, craft, boat, or cockpit. " +
      "Lower body portions seated behind consoles or railings are naturally occluded. " +
      "Ensure natural anatomy for visible head, arms, and hands on controls, keeping them well inside safe margins."
    );
  }
  if (framing === "seated") {
    return (
      "FRAMING (seated) — The child is sitting or kneeling comfortably within the scene. " +
      "Frame with generous margins so the entire seated pose is visible without touching edges."
    );
  }
  if (framing === "environmental wide") {
    return (
      "FRAMING (environmental wide) — Expansive, sweeping landscape or panoramic composition. " +
      "The child is placed in the environment at natural scale with ample surrounding landscape."
    );
  }
  if (framing === "close portrait") {
    return (
      "FRAMING (close portrait) — Head and shoulders portrait with generous headroom and clear focus on the child's likeness. " +
      "Do not crop the top of hair or chin at the frame edge."
    );
  }
  if (framing === "full-body") {
    return (
      "FRAMING (full-body) — Full-body shot showing the complete child from head to shoes with safety margins from all edges: " +
      "no head touching the top, no feet touching the bottom, and no hands touching side edges."
    );
  }
  return (
    "FRAMING (medium shot) — Natural medium composition showing head and torso comfortably inside safe margins without edge clipping."
  );
}

/**
 * Automatically infer appropriate framing mode from scene context and page kind
 * unless an explicit framing mode is supplied.
 */
export function inferFramingMode(
  scene: string,
  kind?: string,
  explicit?: FramingMode,
): FramingMode {
  if (explicit) return explicit;
  if (kind === "cover") return "waist-up portrait";

  const lower = scene.toLowerCase();

  // Sleeping / bed-covered: child resting in bed under covers/blankets
  if (
    /\b(tucked cozily|tucked under|under (the |soft )?bedcovers|under (the |soft )?blankets?|under (the )?covers|fast asleep|sound asleep|drifted off to sleep)\b/i.test(lower) ||
    (/\b(bed|bedtime)\b/i.test(lower) && /\b(sleep|asleep|blanket|bedcovers|pillow)\b/i.test(lower))
  ) {
    return "sleeping/bed-covered";
  }

  // Seated in bed
  if (/\b(sitting up (gently )?in bed|sitting in bed)\b/i.test(lower)) {
    return "seated-in-bed";
  }

  // Vehicle / cockpit: controls occlude lower body
  if (
    /\b(cockpit|spaceship controls|flight controls|instrument panel|steering wheel|driver'?s? seat)\b/i.test(lower)
  ) {
    return "vehicle/cockpit";
  }

  // Waist-up portrait
  if (
    /\b(waist-up|waist up|chest-up|chest up|bust portrait)\b/i.test(lower)
  ) {
    return "waist-up portrait";
  }

  // Close portrait
  if (/\b(close-up|tight on the face|head and shoulders)\b/i.test(lower)) {
    return "close portrait";
  }

  // Seated
  if (/\b(sitting|seated|kneeling|cross-legged)\b/i.test(lower)) {
    return "seated";
  }

  // Environmental wide
  if (
    /\b(panoramic|wide vista|aerial view|wide landscape|sweeping view)\b/i.test(lower)
  ) {
    return "environmental wide";
  }

  return "medium";
}

/**
 * Build mathematically exact target format block separating:
 * - trim aspect ratio (e.g. 11:8, 11:4, 1:1, 2:1)
 * - full-bleed target-canvas aspect ratio (e.g. 15:11, 89:33, 1:1, 2:1)
 * - provider-requested aspect-ratio preset (e.g. 4:3, 21:9, 1:1, 2:1)
 * - normalized production asset dimensions (e.g. 3375×2475 px, 6675×2475 px)
 * - deterministic non-stretch normalization transform contract
 */
export function buildTargetFormatBlock(
  profileId: string = "classic-landscape-11x8",
  layout: LayoutType = "single-page",
  kind: PageKind = "scene",
): string {
  const profile = getPrintProfile(profileId);
  const isFrontCover = kind === "cover";
  const isBackCover = kind === "backcover";
  const isCover = isFrontCover || isBackCover;
  const isSpread = layout !== "single-page";

  const singleWidth = profile.canvasPx.width;
  const singleHeight = profile.canvasPx.height;
  const trimW = profile.nominalSizeIn.width;
  const trimH = profile.nominalSizeIn.height;
  const spreadTrimW = trimW * 2;
  const spreadTrimH = trimH;
  const bleed =
    profile.bleedIn !== undefined
      ? profile.bleedIn
      : Math.max(0, (profile.canvasPx.width / profile.dpi - profile.nominalSizeIn.width) / 2);
  const singleBleedW = trimW + bleed * 2;
  const singleBleedH = trimH + bleed * 2;
  const spreadBleedW = spreadTrimW + bleed * 2;
  const spreadBleedH = spreadTrimH + bleed * 2;

  const continuousSpreadWidth = Math.round(spreadBleedW * profile.dpi);
  const continuousSpreadHeight = Math.round(spreadBleedH * profile.dpi);

  const targetWidth = isSpread ? continuousSpreadWidth : singleWidth;
  const targetHeight = isSpread ? continuousSpreadHeight : singleHeight;

  // Aspect ratio separation
  const trimAspect = isSpread
    ? (profile.trimSpreadAspect ?? `${spreadTrimW}:${spreadTrimH}`)
    : (profile.trimAspect ?? `${trimW}:${trimH}`);

  const targetCanvasAspect = isSpread
    ? (profile.targetCanvasSpreadAspect ?? (targetWidth === 6675 && targetHeight === 2475 ? "89:33" : `${targetWidth}:${targetHeight}`))
    : (profile.targetCanvasAspect ?? (targetWidth === 3375 && targetHeight === 2475 ? "15:11" : `${targetWidth}:${targetHeight}`));

  const providerPresetAspect = isSpread
    ? (profile.providerPresetSpreadAspect ?? "21:9")
    : (profile.providerPresetAspect ?? "4:3");

  const mismatchPolicy =
    "NORMALIZATION CONTRACT: Never stretch artwork horizontally or vertically. " +
    "If raw provider output dimensions differ from the target canvas, normalize via proportional cover crop or proportional contain+backdrop without differential X/Y scaling.";

  const isSquare = profile.nominalSizeIn.width === profile.nominalSizeIn.height;

  if (isBackCover) {
    const coverDescriptor = isSquare
      ? "Square 1:1 composition for the back cover."
      : "Landscape composition for the back cover.";
    return (
      `TARGET ARTWORK FORMAT — back cover: ${coverDescriptor} full-bleed target canvas ${targetWidth}×${targetHeight} px ` +
      `(${targetCanvasAspect} aspect ratio at ${profile.dpi} DPI; ` +
      `trim ${trimW}×${trimH} in [${trimAspect} trim ratio], full-bleed ${singleBleedW}×${singleBleedH} in [${targetCanvasAspect} canvas ratio]; ` +
      `closest provider preset: ${providerPresetAspect}). ` +
      `Generate a full-bleed composition filling the ${targetWidth}×${targetHeight} px canvas (${targetCanvasAspect} aspect ratio). ` +
      `Keep the composition calm and evenly balanced across the whole frame — the back cover carries no title and needs no ` +
      `dedicated title-safe area, only the application's own required blurb/logo/barcode-safe margins added later by layout software. ` +
      `Do not apply gutter restrictions to the cover. ${mismatchPolicy}`
    );
  }

  if (isFrontCover) {
    const coverDescriptor = isSquare
      ? "Square 1:1 composition for the front cover."
      : "Landscape composition for the front cover.";
    return (
      `TARGET ARTWORK FORMAT — front cover: ${coverDescriptor} full-bleed target canvas ${targetWidth}×${targetHeight} px ` +
      `(${targetCanvasAspect} aspect ratio at ${profile.dpi} DPI; ` +
      `trim ${trimW}×${trimH} in [${trimAspect} trim ratio], full-bleed ${singleBleedW}×${singleBleedH} in [${targetCanvasAspect} canvas ratio]; ` +
      `closest provider preset: ${providerPresetAspect}). ` +
      `Generate a full-bleed composition filling the ${targetWidth}×${targetHeight} px canvas (${targetCanvasAspect} aspect ratio). ` +
      `Keep the lower portion of the frame (roughly the lower 25–30%) calm, open, and uncluttered with soft background scenery ` +
      `so the title can be overlaid cleanly by layout software without obscuring the child's face. ` +
      `Do not apply gutter restrictions to the cover. ${mismatchPolicy}`
    );
  }

  if (isSpread) {
    const spreadPrefix = isSquare
      ? `TARGET ARTWORK FORMAT — 2:1 continuous panoramic spread (${targetWidth}×${targetHeight} px target at ${profile.dpi} DPI): `
      : "TARGET ARTWORK FORMAT — Continuous panoramic spread: ";
    return (
      `${spreadPrefix}full-bleed target canvas ${targetWidth}×${targetHeight} px ` +
      `(${targetCanvasAspect} aspect ratio at ${profile.dpi} DPI; ` +
      `trim ${spreadTrimW}×${spreadTrimH} in [${trimAspect} trim ratio] (trim is ${trimW}×${trimH} in per page, totaling ${spreadTrimW}×${spreadTrimH} in spread before bleed), ` +
      `full-bleed spread ${spreadBleedW}×${spreadBleedH} in [${targetCanvasAspect} canvas ratio]; ` +
      `closest provider preset: ${providerPresetAspect}). ` +
      `Generate one uninterrupted panoramic scene across one wide canvas filling ${targetWidth}×${targetHeight} px target at ${profile.dpi} DPI (${targetCanvasAspect} aspect ratio). ` +
      `The artwork will span across two physical facing pages side by side. Keep focal subjects safely away from the exact center gutter. ${mismatchPolicy}`
    );
  }

  let singlePrefix = "TARGET ARTWORK FORMAT — Single page: ";
  if (isSquare) {
    singlePrefix = `TARGET ARTWORK FORMAT — 1:1 single page (${targetWidth}×${targetHeight} px target at ${profile.dpi} DPI, 10% safety margin). Square 1:1 composition: `;
  } else if (profile.id === "lulu-landscape-11x8.5") {
    singlePrefix = "TARGET ARTWORK FORMAT — 4:3 single page: ";
  }

  return (
    `${singlePrefix}full-bleed target canvas ${targetWidth}×${targetHeight} px ` +
    `(${targetCanvasAspect} aspect ratio at ${profile.dpi} DPI; ` +
    `trim ${trimW}×${trimH} in [${trimAspect} trim ratio], full-bleed ${singleBleedW}×${singleBleedH} in [${targetCanvasAspect} canvas ratio]; ` +
    `closest provider preset: ${providerPresetAspect}). ` +
    `Generate a full-bleed composition filling the ${targetWidth}×${targetHeight} px canvas (${targetCanvasAspect} aspect ratio). ${mismatchPolicy}`
  );
}

/**
 * Single-page composition contract with explicit scene-aware framing mode.
 *
 * Tailors headroom, body visibility, and anatomy rules per scene framing.
 * Deduplicates repeated no-text and edge rules.
 */
export function singlePageCompositionRules(framing: FramingMode = "medium"): string {
  const partialBodyRule =
    framing === "sleeping/bed-covered" ||
    framing === "bed-covered" ||
    framing === "seated-in-bed" ||
    framing === "waist-up portrait" ||
    framing === "vehicle/cockpit"
      ? "Prohibit accidental edge amputations of parts that should be visible (never crop visible hands, ears, or heads at outer boundaries)."
      : "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE — prohibit accidental edge amputations of parts that should be visible.";

  return (
    `COMPOSITION (single page) — Maintain roughly an 8–10% safety margin from all outer edges. ${partialBodyRule} ` +
    "TRANSFORMATION CROP SAFETY: When generated via provider presets (e.g. 4:3), proportional normalization removes approximately 28 px (1.1%) from top and bottom edges; " +
    "reserve at least 10–12% headroom and base margins so all facial features, hair, and limbs remain safely inside the target canvas after normalization. " +
    "Keep the lower portion calm and relatively open (soft background scenery) for story text to be added by layout software."
  );
}

/**
 * Two-page spread composition contract with explicit scene-aware framing mode.
 *
 * Enforces one continuous, uninterrupted panoramic scene across one wide canvas.
 * Never describes a left or right panel, vertical seam, fold, split, or collage.
 * Generates dynamic side-specific instructions for Text Left, Text Right, or No Text.
 */
export function spreadCompositionRules(
  layout: LayoutType = "text-left-subject-right",
  textSideOverride?: TextPlacementSide,
  subjectSideOverride?: SubjectPlacementSide,
  framing: FramingMode = "medium",
): string {
  let textSide: TextPlacementSide = textSideOverride ?? "left";
  if (!textSideOverride) {
    if (layout === "subject-left-text-right") textSide = "right";
    else if (layout === "full-art-no-text") textSide = "none";
    else textSide = "left";
  }

  const subjectSide: SubjectPlacementSide =
    subjectSideOverride ?? (textSide === "left" ? "right" : textSide === "right" ? "left" : "centered");

  let sideSpecificInstruction = "";
  if (textSide === "left") {
    const inwardNote = subjectSide === "right" ? ", looking inward toward the left when natural" : "";
    sideSpecificInstruction =
      "Reserve the LEFT-HAND region as calm, low-detail environmental space for story text that the layout software will add later. " +
      `Place the complete child safely within the ${subjectSide.toUpperCase()}-HAND subject-side region${inwardNote}.`;
  } else if (textSide === "right") {
    const inwardNote = subjectSide === "left" ? ", looking inward toward the right when natural" : "";
    sideSpecificInstruction =
      "Reserve the RIGHT-HAND region as calm, low-detail environmental space for story text that the layout software will add later. " +
      `Place the complete child safely within the ${subjectSide.toUpperCase()}-HAND subject-side region${inwardNote}.`;
  } else {
    sideSpecificInstruction =
      "This is a full-art spread with no story text. Create a balanced composition and balanced panoramic artwork across the canvas, " +
      "while keeping focal subjects safely inside the outer regions and away from the center gutter.";
  }

  const spreadPartialBodyRule =
    framing === "sleeping/bed-covered" ||
    framing === "bed-covered" ||
    framing === "seated-in-bed" ||
    framing === "waist-up portrait" ||
    framing === "vehicle/cockpit"
      ? "Prohibit accidental edge amputations of parts that should be visible."
      : "NO PARTIAL HUMAN OR ANIMAL BODY PART MAY ENTER FROM ANY EDGE.";

  return (
    "COMPOSITION (two-page continuous spread) — Create one uninterrupted panoramic scene across one wide canvas. " +
    "This is not a diptych, split-screen, collage, book mockup, or two separate panels. " +
    "The environment, horizon, lighting, shadows, colors, and visual texture must continue naturally across the exact center. " +
    "Do not draw a fold, line, border, seam, page edge, or lighting transition at the midpoint. " +
    "Do not generate a photographed open book, curved or curled pages, 3D book mockup, fake seam or binding line, crease, gutter shadow, or duplicated left/right scenes. " +
    `${sideSpecificInstruction} ` +
    "TRANSFORMATION CROP SAFETY: When generated via panoramic provider presets (e.g. 21:9), proportional normalization removes approximately 193 px (6.7%) from the top and 193 px (6.7%) from the bottom; " +
    "reserve at least 15–18% safety clearance from top and bottom boundaries so faces, hair, hands, companion faces, and essential props remain safely inside the final target safe region after crop normalization. " +
    "Keep the central gutter-safe zone free of faces, eyes, hands, feet, text, and important props. " +
    "Background sky, landscape, floor, water, or room architecture should continue through this zone naturally. " +
    `Maintain roughly a 10–12% safety margin from all outer edges. ${spreadPartialBodyRule}`
  );
}
