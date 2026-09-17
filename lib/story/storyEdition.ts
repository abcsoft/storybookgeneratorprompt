/**
 * StoryEdition — a provider-independent, authoritative editorial edition for
 * a story: which scenes exist, in what order, and how they map to interior
 * page numbers and the separate cover group. Unlike `PrintEdition` (see
 * editions.ts), a StoryEdition carries NO profile-specific geometry at all —
 * `resolveStoryEditionPlan()` derives destination dimensions for whichever
 * profile is requested via the same `getProfileAssetGeometry()` every other
 * resolution path already uses, so one StoryEdition (e.g. "standard-24")
 * works unchanged across every print profile.
 *
 * Print profiles keep owning only physical production rules (trim, bleed,
 * DPI, canvas, provider restrictions, export format) — never the editorial
 * page sequence.
 */

import type {
  ChildProfile,
  DeliveryGroup,
  LayoutType,
  PageKind,
} from "./types";
import type { PrintProfile } from "../print/types";
// Value imports come from layoutGeometry.ts (a dependency-free leaf module),
// never from layoutPlan.ts — layoutPlan.ts itself imports from this file at
// module scope (for the StoryEdition-priority resolution branch), so a
// runtime value-import back from here into layoutPlan.ts would be a true
// circular dependency. Node's CJS interop tolerates that cycle (function
// declarations hoist, so it's fine by call time), but Vitest's Vite/ESM
// transform does not: a module-level `const` on one side can still be in its
// temporal-dead-zone when the other side's top-level code runs. The types
// below are `import type` only, so they're erased at compile time and don't
// re-introduce the cycle.
import {
  canonicalFilenameForSlot,
  computeAssetSafeRegions,
  getProfileAssetGeometry,
  getRoleSlug,
  type AssetKind,
  type ResolvedSafeRegions,
  type SubjectSide,
  type TextSide,
  type TextPanelPosition,
} from "./layoutGeometry";

/** Derive the legacy left/right/none textSide + subjectSide (used for safe-region
 *  computation and prompt composition-side hints) from one of the six declared
 *  text-panel positions. The vertical (top/bottom) component only affects the
 *  panel's CSS placement in page-template.ts — it has no effect on which half of
 *  the frame the illustration prompt reserves for the subject. */
function legacySidesForPosition(pos: TextPanelPosition): { textSide: TextSide; subjectSide: SubjectSide } {
  if (pos === "right" || pos === "top-right" || pos === "bottom-right") {
    return { textSide: "right", subjectSide: "left" };
  }
  return { textSide: "left", subjectSide: "right" };
}
import type { ResolvedAssetSlot, ResolvedLayoutPlan, ResolvedPhysicalLeaf } from "./layoutPlan";

/** One scene in a StoryEdition. Prompt/text builders share the exact same
 *  signature as PageSpec so a story's existing `illustration()` factory
 *  output can be reused verbatim for unchanged scenes. */
export interface StoryEditionScene {
  /** Stable identity independent of position, e.g. "greeting", "pilot",
   *  "scene-07", "video-qr". */
  sceneId: string;
  kind: PageKind;
  role?: string;
  illustrationPrompt: (
    child: ChildProfile,
    profileId?: string,
    layoutOverrides?: {
      layout?: LayoutType;
      textSide?: "left" | "right" | "none";
      subjectSide?: "left" | "right" | "centered";
    },
  ) => string;
  text: (child: ChildProfile) => string;
  /** Old filenames (from before this StoryEdition existed) that identify
   *  the exact same narrative content, for backward-compatible import of
   *  already-generated packages. Empty for genuinely new scenes (e.g.
   *  greeting, video-qr, or freshly-authored narrative beats) — there is
   *  nothing old to alias, and no old filename may be reused for different
   *  content just because it once occupied the same position. */
  legacyFilenames?: string[];
  /** Where this scene's application-rendered story-text panel (or, for
   *  "video-qr", the QR/CTA block) sits — chosen per scene from where the
   *  subject, companion, secret marker, treasure chest, or QR reservation
   *  actually is in that scene's illustration, so the panel never covers a
   *  story-critical object. Defaults to "bottom-left" when unset (the prior,
   *  single hardcoded position) so existing scenes that haven't been audited
   *  yet keep their current placement rather than silently moving. */
  textPanelPosition?: TextPanelPosition;
}

export interface StoryEdition {
  id: string;
  storyId: string;
  /** Always 24 for "standard-24"; kept explicit so a future "standard-30"
   *  Gelato edition (or similar) can coexist without touching this type. */
  interiorPageCount: number;
  greeting: StoryEditionScene;
  intro: StoryEditionScene;
  /** Exactly `interiorPageCount - 4` (20 for a 24-page edition: minus
   *  greeting, intro, closing, video-qr). */
  scenes: StoryEditionScene[];
  closing: StoryEditionScene;
  videoQr: StoryEditionScene;
  cover: { front: StoryEditionScene; back: StoryEditionScene };
  /** Facing pairs (1-based interior page numbers) an editor has explicitly
   *  approved as spreads for this edition — e.g. [[6,7]]. A spread replaces
   *  the two singles at those pages with one panoramic asset while the
   *  interior page COUNT stays exactly interiorPageCount; the leaf that
   *  isn't carrying text still needs its own scene's text preserved (see
   *  resolveStoryEditionPlan). Omit/empty until an edition has approved
   *  pairs — Custom Spreads is disabled for a StoryEdition with none.
   */
  approvedSpreadPairs?: [number, number][];
}

const storyEditionRegistry = new Map<string, StoryEdition>();

export function registerStoryEdition(edition: StoryEdition): void {
  if (edition.scenes.length !== edition.interiorPageCount - 4) {
    throw new Error(
      `StoryEdition "${edition.id}" for "${edition.storyId}" declares interiorPageCount=${edition.interiorPageCount} ` +
        `but has ${edition.scenes.length} scenes (expected ${edition.interiorPageCount - 4}: greeting+intro+scenes+closing+video-qr).`,
    );
  }
  storyEditionRegistry.set(`${edition.storyId}:${edition.id}`, edition);
}

export function getStoryEdition(storyId: string, editionId = "standard-24"): StoryEdition | null {
  return storyEditionRegistry.get(`${storyId}:${editionId}`) ?? null;
}

function buildSlot(
  scene: StoryEditionScene,
  opts: {
    illustrationIndex: number;
    deliveryGroup: DeliveryGroup;
    physicalPages: number[];
    assetKind: AssetKind;
    filename: string;
    legacyAliases: string[];
    child: ChildProfile;
    profile: PrintProfile;
    textSide: TextSide;
    subjectSide: SubjectSide;
    layout: LayoutType;
    storyEditionId: string;
    textPanelPosition?: TextPanelPosition;
  },
): ResolvedAssetSlot {
  const geom = getProfileAssetGeometry(opts.profile, opts.assetKind);
  const roleSlug = getRoleSlug(scene.kind, scene.role);
  const prompt = scene.illustrationPrompt(opts.child, opts.profile.id, {
    layout: opts.layout,
    textSide: opts.textSide,
    subjectSide: opts.subjectSide,
  });
  const storyText = scene.text(opts.child);

  const leaf: ResolvedPhysicalLeaf = {
    physicalPageNumber: opts.physicalPages[0] ?? 0,
    leafSide: (opts.physicalPages[0] ?? 0) % 2 === 0 ? "left" : "right",
    bindingEdge: (opts.physicalPages[0] ?? 0) % 2 === 0 ? "right" : "left",
    hasText: opts.deliveryGroup === "interior" && scene.kind !== "video-qr",
    text: opts.deliveryGroup === "interior" && scene.kind !== "video-qr" ? storyText : null,
    textSide: opts.textSide,
  };

  return {
    slotId: filenameStem(opts.filename),
    illustrationIndex: opts.illustrationIndex,
    sceneId: scene.sceneId,
    pageKind: scene.kind,
    kind: scene.kind,
    profileId: opts.profile.id,
    layout: opts.layout,
    assetKind: opts.assetKind,
    filename: opts.filename,
    expectedFilename: opts.filename,
    legacyAliases: opts.legacyAliases,
    sourceSceneIndex: opts.illustrationIndex,
    sourceSceneRole: scene.role,
    role: scene.role ?? scene.kind,
    roleSlug,
    required: true,
    physicalPages: opts.physicalPages,
    textSide: opts.textSide,
    subjectSide: opts.subjectSide,
    textPanelPosition: opts.textPanelPosition ?? (opts.textSide === "right" ? "bottom-right" : "bottom-left"),
    destinationDimensions: geom.dimensions,
    printDimensionsIn: geom.printDimensionsIn,
    targetCanvasAspect: geom.targetCanvasAspect,
    trimAspect: geom.trimAspect,
    providerPresetAspect: geom.providerPresetAspect,
    expectedSourceAspect: geom.providerPresetAspect,
    normalizedProductionDimensions: geom.normalizedProductionDimensions,
    normalizationStrategy: geom.normalizationStrategy,
    minAcceptableResolution: geom.minResolution,
    safeRegions: computeAssetSafeRegions(opts.profile, opts.assetKind, opts.textSide, opts.subjectSide) as ResolvedSafeRegions,
    prompt,
    storyText,
    leaves: opts.deliveryGroup === "interior" ? [leaf] : [],
    deliveryGroup: opts.deliveryGroup,
    physicalInteriorPage: opts.deliveryGroup === "interior" ? opts.physicalPages[0] : undefined,
    storyEditionId: opts.storyEditionId,
  };
}

function filenameStem(filename: string): string {
  return filename.replace(/\.png$/i, "");
}

/** Canonical filename for interior page N (1-based) of a given kind. */
function canonicalInteriorFilename(page: number, kind: PageKind, sceneIndexInBlock?: number): string {
  const n = String(page).padStart(2, "0");
  if (kind === "greeting") return `${n}-greeting.png`;
  if (kind === "intro") return `${n}-intro.png`;
  if (kind === "closing") return `${n}-closing.png`;
  if (kind === "video-qr") return `${n}-video-qr-background.png`;
  // "scene": 03-scene-01.png .. 22-scene-20.png
  const sceneNum = String((sceneIndexInBlock ?? 0) + 1).padStart(2, "0");
  return `${n}-scene-${sceneNum}.png`;
}

/**
 * Resolves a StoryEdition into a full ResolvedLayoutPlan for a given child
 * and print profile. Always exactly `edition.interiorPageCount` interior
 * pages (numbered continuously 1..N) plus a separate 2-asset cover group
 * (front/back) that is never assigned an interior page number.
 */
export function resolveStoryEditionPlan(
  edition: StoryEdition,
  child: ChildProfile,
  profile: PrintProfile,
): ResolvedLayoutPlan {
  const spreadPages = new Set<number>();
  for (const [a, b] of edition.approvedSpreadPairs ?? []) {
    spreadPages.add(a);
    spreadPages.add(b);
  }

  const coverAsset = buildSlot(edition.cover.front, {
    illustrationIndex: 0,
    deliveryGroup: "cover",
    physicalPages: [],
    assetKind: "front-cover",
    filename: "cover-front.png",
    legacyAliases: Array.from(new Set(["cover-front.png", "01-cover.png", "01.png", "front-cover.png", "cover.png", ...(edition.cover.front.legacyFilenames ?? [])])),
    child,
    profile,
    textSide: "left",
    subjectSide: "centered",
    layout: "single-page",
    storyEditionId: edition.id,
  });

  const backCoverAsset = buildSlot(edition.cover.back, {
    illustrationIndex: 1,
    deliveryGroup: "cover",
    physicalPages: [],
    assetKind: "back-cover",
    filename: "cover-back.png",
    legacyAliases: Array.from(new Set(["cover-back.png", "back-cover.png", "backcover.png", ...(edition.cover.back.legacyFilenames ?? [])])),
    child,
    profile,
    textSide: "none",
    subjectSide: "centered",
    layout: "single-page",
    storyEditionId: edition.id,
  });

  // Ordered interior sequence: greeting, intro, 20 scenes, closing, video-qr.
  const interiorScenes: StoryEditionScene[] = [
    edition.greeting,
    edition.intro,
    ...edition.scenes,
    edition.closing,
    edition.videoQr,
  ];

  const interiorAssets: ResolvedAssetSlot[] = [];
  const pageToAsset = new Map<number, { asset: ResolvedAssetSlot; leaf: ResolvedPhysicalLeaf }>();

  let page = 1;
  let cursor = 0;
  let illustrationIndex = 2;
  while (cursor < interiorScenes.length) {
    const isSpreadStart = spreadPages.has(page) && !spreadPages.has(page - 1);
    const scene = interiorScenes[cursor];
    const sceneIndexInBlock = cursor - 2; // 0-based index within the 20 narrative scenes (greeting=idx0, intro=idx1)

    if (isSpreadStart && spreadPages.has(page + 1)) {
      // Approved spread: this scene's own text stays on its own leaf; the
      // OTHER leaf keeps the scene that would otherwise occupy it — i.e. a
      // spread here still renders as ONE panoramic asset but must not
      // silently drop the second interior page's own story text. Since no
      // edition currently declares approvedSpreadPairs, this branch has no
      // live caller yet; it exists so a future edition can opt in safely.
      const nextScene = interiorScenes[cursor + 1];
      const p1 = page;
      const p2 = page + 1;
      const filename = `${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}-spread.png`;
      const slot = buildSlot(scene, {
        illustrationIndex: illustrationIndex++,
        deliveryGroup: "interior",
        physicalPages: [p1, p2],
        assetKind: "spread",
        filename,
        legacyAliases: [],
        child,
        profile,
        textSide: "left",
        subjectSide: "right",
        layout: "text-left-subject-right",
        storyEditionId: edition.id,
      });
      // Preserve both leaves' text explicitly (never silently drop page 2's copy).
      slot.leaves = [
        { physicalPageNumber: p1, leafSide: "left", bindingEdge: "right", hasText: true, text: scene.text(child), textSide: "left" },
        { physicalPageNumber: p2, leafSide: "right", bindingEdge: "left", hasText: true, text: nextScene.text(child), textSide: "right" },
      ];
      interiorAssets.push(slot);
      pageToAsset.set(p1, { asset: slot, leaf: slot.leaves[0] });
      pageToAsset.set(p2, { asset: slot, leaf: slot.leaves[1] });
      page += 2;
      cursor += 2;
      continue;
    }

    const filename = canonicalInteriorFilename(page, scene.kind, sceneIndexInBlock);
    const textPanelPosition = scene.textPanelPosition ?? "bottom-left";
    const { textSide, subjectSide } = legacySidesForPosition(textPanelPosition);
    const slot = buildSlot(scene, {
      illustrationIndex: illustrationIndex++,
      deliveryGroup: "interior",
      physicalPages: [page],
      assetKind: "single-page",
      filename,
      legacyAliases: Array.from(new Set([filename, ...(scene.legacyFilenames ?? [])])),
      child,
      profile,
      textSide,
      subjectSide,
      textPanelPosition,
      layout: "single-page",
      storyEditionId: edition.id,
    });
    interiorAssets.push(slot);
    pageToAsset.set(page, { asset: slot, leaf: slot.leaves[0] });
    page += 1;
    cursor += 1;
  }

  const allAssets = [coverAsset, ...interiorAssets, backCoverAsset];
  allAssets.forEach((a, idx) => {
    a.illustrationIndex = idx;
  });

  return {
    storyId: edition.storyId,
    profileId: profile.id,
    mode: "standard-single",
    interiorPageCount: edition.interiorPageCount,
    assets: allAssets,
    coverAsset,
    backCoverAsset,
    interiorAssets,
    pageToAsset,
    isValidForProfile: true,
    coverAssetCount: 2,
    storyEditionId: edition.id,
  };
}
