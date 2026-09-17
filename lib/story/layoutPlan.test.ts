import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  resolveLayoutPlan,
  canonicalFilenameForSlot,
  getProfileAssetGeometry,
  defaultSubjectSideFor,
  ELIGIBLE_FACING_PAIRS,
  recalculateAndValidatePhysicalPagePlan,
  type LayoutMode,
  type CustomSpreadSelection,
} from "./layoutPlan";
import { buildManifest } from "../manual/manifest";
import { getPrintProfile } from "../print/registry";
import { isValidFacingPair, assertValidFacingPair } from "../pdf/imposition";
import { runPreflight } from "../print/preflight";
import { splitSpread } from "../print/printifyExport";
import { spreadCompositionRules } from "./prompt/compositionRules";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("Authoritative Layout Plan Invariants", () => {
  const profileId = "printify-hardcover-square-8x8";
  const defaultPlan = resolveLayoutPlan({
    child,
    bookId: "dream-big",
    profileId,
  });

  it("Invariant 1: Page 1 is always a right-hand page (recto)", () => {
    const p1 = defaultPlan.pageToAsset.get(1);
    expect(p1).toBeDefined();
    expect(p1?.leaf.leafSide).toBe("right");
    expect(p1?.leaf.bindingEdge).toBe("left");
    expect(p1?.asset.assetKind).toBe("single-page");
    expect(p1?.asset.physicalPages).toEqual([1]);
  });

  it("Invariant 2: Dream Big now resolves through its registered standard-24 edition, which has no approved spreads — every interior page is single, and the even-start-page rule is enforced at the point a spread would be requested", () => {
    // Dream Big has a registered "standard-24" StoryEdition with no
    // approvedSpreadPairs, so the default plan contains zero spreads —
    // there's no longer a live spread to check the even-start-page rule
    // against directly. The rule itself is still enforced (assertValidFacingPair,
    // exercised in Invariant 4 below, and lib/pdf/imposition.test.ts) — it
    // just has no reachable spread asset to apply to for this story anymore.
    const spreads = defaultPlan.interiorAssets.filter((a) => a.assetKind === "spread");
    expect(spreads.length).toBe(0);
    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId,
        mode: "custom-spreads",
        customSpreads: [{ startPage: 6, endPage: 7, textSide: "left" }],
      }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");
  });

  it("Invariant 3: Every spread maps left half to even page and right half to the following odd page", () => {
    const spreads = defaultPlan.interiorAssets.filter((a) => a.assetKind === "spread");
    for (const spread of spreads) {
      expect(spread.physicalPages.length).toBe(2);
      const [start, end] = spread.physicalPages;
      expect(end).toBe(start + 1);
      expect(start % 2).toBe(0);
      expect(end % 2).toBe(1);

      expect(spread.leaves.length).toBe(2);
      expect(spread.leaves[0].physicalPageNumber).toBe(start);
      expect(spread.leaves[0].leafSide).toBe("left");
      expect(spread.leaves[0].bindingEdge).toBe("right");

      expect(spread.leaves[1].physicalPageNumber).toBe(end);
      expect(spread.leaves[1].leafSide).toBe("right");
      expect(spread.leaves[1].bindingEdge).toBe("left");
    }
  });

  it("Invariant 4: No spread maps across physically impossible pairs 1-2 or 23-24", () => {
    expect(isValidFacingPair(1, 2, 24)).toBe(false);
    expect(isValidFacingPair(23, 24, 24)).toBe(false);
    expect(isValidFacingPair(3, 4, 24)).toBe(false); // odd start

    expect(() => assertValidFacingPair(1, 2, 24)).toThrow(/1–2/);
    expect(() => assertValidFacingPair(23, 24, 24)).toThrow(/23–24/);
    expect(() => assertValidFacingPair(3, 4, 24)).toThrow(/odd physical page/);

    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId,
        mode: "custom-spreads",
        customSpreads: [{ startPage: 1, endPage: 2, textSide: "left" }],
      }),
    ).toThrow();

    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId,
        mode: "custom-spreads",
        customSpreads: [{ startPage: 23, endPage: 24, textSide: "left" }],
      }),
    ).toThrow();
  });

  it("Invariant 5: Dream Big's standard-24 edition maps p1 greeting, p2 intro, p3-22 20 careers, p23 closing, p24 video-qr — cover always separate", () => {
    // 24 physical interior pages total, numbered continuously; no spread —
    // Dream Big's standard-24 edition declares no approvedSpreadPairs.
    expect(defaultPlan.interiorPageCount).toBe(24);

    // Physical page 1: personalized greeting (app-overlaid text, not "Once
    // upon a time" — that's the intro, now page 2).
    const p1 = defaultPlan.pageToAsset.get(1)!;
    expect(p1.asset.slotId).toBe("01-greeting");
    expect(p1.asset.pageKind).toBe("greeting");
    expect(p1.asset.assetKind).toBe("single-page");
    expect(p1.asset.storyText).toContain(child.name);

    // Physical page 2: intro dedication
    const p2 = defaultPlan.pageToAsset.get(2)!;
    expect(p2.asset.slotId).toBe("02-intro");
    expect(p2.asset.pageKind).toBe("intro");
    expect(p2.asset.storyText).toContain("Once upon a time");

    // Physical pages 3-22: 20 single career scenes
    for (let p = 3; p <= 22; p++) {
      const entry = defaultPlan.pageToAsset.get(p)!;
      expect(entry.asset.assetKind).toBe("single-page");
      expect(entry.asset.pageKind).toBe("scene");
      expect(entry.asset.physicalPages).toEqual([p]);
    }

    // Physical page 23: closing
    const p23 = defaultPlan.pageToAsset.get(23)!;
    expect(p23.asset.slotId).toBe("23-closing");
    expect(p23.asset.pageKind).toBe("closing");
    expect(p23.asset.assetKind).toBe("single-page");

    // Physical page 24: app-rendered, character-free video-QR background
    const p24 = defaultPlan.pageToAsset.get(24)!;
    expect(p24.asset.slotId).toBe("24-video-qr-background");
    expect(p24.asset.pageKind).toBe("video-qr");
    expect(p24.asset.storyText).toBe("");

    // Covers are separate from interior pages, never assigned a page number.
    expect(defaultPlan.coverAsset.assetKind).toBe("front-cover");
    expect(defaultPlan.coverAsset.physicalPages).toEqual([]);
    expect(defaultPlan.backCoverAsset.assetKind).toBe("back-cover");
    expect(defaultPlan.backCoverAsset.physicalPages).toEqual([]);
  });

  it("Invariant 6: Astronaut and Diver are single pages in default plan", () => {
    const astronautAsset = defaultPlan.assets.find((a) =>
      a.sourceSceneRole?.toLowerCase().includes("astronaut"),
    );
    expect(astronautAsset).toBeDefined();
    expect(astronautAsset?.assetKind).toBe("single-page");
    expect(astronautAsset?.physicalPages.length).toBe(1);

    const diverAsset = defaultPlan.assets.find((a) =>
      a.sourceSceneRole?.toLowerCase().includes("diver"),
    );
    expect(diverAsset).toBeDefined();
    expect(diverAsset?.assetKind).toBe("single-page");
    expect(diverAsset?.physicalPages.length).toBe(1);
  });

  it("Invariant 7: A custom spread request against Dream Big's standard-24 edition is rejected outright, not silently consumed", () => {
    // Dream Big's standard-24 edition declares no approvedSpreadPairs, so
    // "consuming a facing pair" for a spread is no longer possible for this
    // story at all — the request must fail closed instead.
    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId,
        mode: "custom-spreads",
        customSpreads: [{ startPage: 4, endPage: 5, textSide: "left" }],
      }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");

    // The standard-single resolution still covers all 24 physical pages.
    const standardPlan = resolveLayoutPlan({ child, bookId: "dream-big", profileId, mode: "standard-single" });
    for (let p = 1; p <= 24; p++) {
      expect(standardPlan.pageToAsset.has(p)).toBe(true);
    }
  });

  it("Invariant 8: A custom spread request is rejected the same way regardless of the requested textSide", () => {
    // Dream Big's standard-24 edition has no approvedSpreadPairs, so there is
    // no longer a live spread asset whose textSide/subjectSide/layout could
    // be checked — every custom-spreads request against it fails closed,
    // whichever textSide is requested.
    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId,
        mode: "custom-spreads",
        customSpreads: [{ startPage: 6, endPage: 7, textSide: "left" }],
      }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");

    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId,
        mode: "custom-spreads",
        customSpreads: [{ startPage: 6, endPage: 7, textSide: "right" }],
      }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");
  });

  it("Invariant 9: Single and spread destination dimensions match exact selected print profile", () => {
    const singleGeom = getProfileAssetGeometry(getPrintProfile(profileId), "single-page");
    const spreadGeom = getProfileAssetGeometry(getPrintProfile(profileId), "spread");

    expect(singleGeom.dimensions).toEqual({ width: 2400, height: 2400 });
    expect(spreadGeom.dimensions).toEqual({ width: 4800, height: 2400 });
  });

  it("Invariant 10: Canonical filenames follow unambiguous schema", () => {
    expect(canonicalFilenameForSlot("front-cover", [])).toBe("front-cover.png");
    expect(canonicalFilenameForSlot("back-cover", [])).toBe("back-cover.png");
    expect(canonicalFilenameForSlot("single-page", [3])).toBe("page-03.png");
    expect(canonicalFilenameForSlot("spread", [4, 5])).toBe("spread-04-05.png");
  });

  it("Invariant 11: Prompt, manifest, and layout plan report unified authority", () => {
    // Custom spreads are rejected outright for Dream Big (standard-24, no
    // approvedSpreadPairs) — use its valid standard-single resolution to
    // check manifest/plan agreement instead.
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "standard-single",
    });

    const manifest = buildManifest(child, "dream-big", profileId, "standard-single", []);

    expect(manifest.length).toBe(plan.assets.length);
    for (let i = 0; i < manifest.length; i++) {
      expect(manifest[i].filename).toBe(plan.assets[i].filename);
      expect(manifest[i].spread).toBe(plan.assets[i].assetKind === "spread");
    }
  });

  it("Invariant 12: Existing books without custom spreads continue to work", () => {
    const dinoPlan = resolveLayoutPlan({
      child,
      bookId: "dinosaur-discovery",
      profileId,
    });
    expect(dinoPlan.interiorAssets.length).toBeGreaterThan(0);
    expect(dinoPlan.interiorAssets.every((a) => a.assetKind === "single-page")).toBe(true);
  });
});

describe("Page Layout Feature Verification Suite", () => {
  const profileId = "printify-hardcover-square-8x8";

  it("1. default all-single workflow: resolves 24 interior single pages with 1:1 aspect and canonical filenames", () => {
    const singlePlan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "standard-single",
    });

    // Standard-24 edition: 24 interior pages, numbered continuously 1-24, no
    // spreads (Dream Big has no approvedSpreadPairs).
    expect(singlePlan.interiorPageCount).toBe(24);
    expect(singlePlan.interiorAssets.length).toBe(24);
    expect(singlePlan.interiorAssets.every((a) => a.assetKind === "single-page")).toBe(true);
    expect(singlePlan.interiorAssets.every((a) => a.expectedSourceAspect === "1:1")).toBe(true);

    for (let p = 1; p <= 24; p++) {
      const entry = singlePlan.pageToAsset.get(p);
      expect(entry).toBeDefined();
      expect(entry?.asset.physicalPages).toEqual([p]);
    }

    const manifest = buildManifest(child, "dream-big", profileId, "standard-single", []);
    // cover-front + 24 interior pages + cover-back = 26 assets.
    expect(manifest.length).toBe(26);
    expect(manifest.slice(1, 25).every((m) => !m.spread && m.aspect === "1:1")).toBe(true);
    expect(manifest[0].filename).toBe("cover-front.png");
    expect(manifest[1].filename).toBe("01-greeting.png");
    expect(manifest[2].filename).toBe("02-intro.png");
    expect(manifest[3].filename).toBe("03-scene-01.png");
    expect(manifest[22].filename).toBe("22-scene-20.png");
    expect(manifest[23].filename).toBe("23-closing.png");
    expect(manifest[24].filename).toBe("24-video-qr-background.png");
    expect(manifest[25].filename).toBe("cover-back.png");
  });

  it("2. Dream Big's standard-24 default has no closing spread — every interior page, including closing (23) and video-qr (24), resolves single", () => {
    // Originally Dream Big had a default editorial spread on 22-23; its
    // registered standard-24 StoryEdition declares no approvedSpreadPairs,
    // so the default resolution (no explicit mode) is now uniformly single-page.
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
    });

    expect(plan.interiorPageCount).toBe(24);
    const p23 = plan.pageToAsset.get(23);
    const p24 = plan.pageToAsset.get(24);
    expect(p23?.asset.assetKind).toBe("single-page");
    expect(p23?.asset.pageKind).toBe("closing");
    expect(p24?.asset.assetKind).toBe("single-page");
    expect(p24?.asset.pageKind).toBe("video-qr");

    // p1 greeting is single page
    expect(plan.pageToAsset.get(1)?.asset.assetKind).toBe("single-page");
  });

  // Tests 3-5 originally exercised Custom Spreads' per-spread textSide
  // (left/right/none) selection UI on Dream Big — building one text leaf +
  // one art-only leaf with a composition prompt matching the chosen side.
  // Dream Big's standard-24 edition has no approvedSpreadPairs, so that
  // whole per-spread textSide selection feature has no reachable resolution
  // path for it anymore (or for any of the other 9 registered stories,
  // which are all standard-24 too) — every request is rejected outright,
  // regardless of which textSide is requested. The underlying composition
  // prompt language itself is still separately, genuinely covered by test 9
  // below (`spreadCompositionRules` called directly).
  it("3. custom Text Left spread request is rejected — Custom Spreads has no reachable resolution path for Dream Big", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 4, endPage: 5, textSide: "left" },
    ];
    expect(() =>
      resolveLayoutPlan({ child, bookId: "dream-big", profileId, mode: "custom-spreads", customSpreads }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");
  });

  it("4. custom Text Right spread request is rejected the same way", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 8, endPage: 9, textSide: "right" },
    ];
    expect(() =>
      resolveLayoutPlan({ child, bookId: "dream-big", profileId, mode: "custom-spreads", customSpreads }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");
  });

  it("5. No Text spread request is rejected the same way", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 10, endPage: 11, textSide: "none" },
    ];
    expect(() =>
      resolveLayoutPlan({ child, bookId: "dream-big", profileId, mode: "custom-spreads", customSpreads }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");
  });

  it("6. invalid pair rejection: rejects 1–2, 3–4, 5–6, 23–24 and accepts only valid pairs", () => {
    // Only 11 valid facing pairs exist in a 24-page book
    expect(ELIGIBLE_FACING_PAIRS).toEqual([
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
      [10, 11],
      [12, 13],
      [14, 15],
      [16, 17],
      [18, 19],
      [20, 21],
      [22, 23],
    ]);

    const invalidPairs = [
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 4 },
      { startPage: 5, endPage: 6 },
      { startPage: 23, endPage: 24 },
    ];

    for (const { startPage, endPage } of invalidPairs) {
      expect(isValidFacingPair(startPage, endPage, 24)).toBe(false);

      const validation = recalculateAndValidatePhysicalPagePlan("dream-big", profileId, "custom-spreads", [
        { startPage, endPage, textSide: "left" },
      ]);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);

      expect(() =>
        resolveLayoutPlan({
          child,
          bookId: "dream-big",
          profileId,
          mode: "custom-spreads",
          customSpreads: [{ startPage, endPage, textSide: "left" }],
        }),
      ).toThrow();
    }
  });

  it("7. page-count preservation: strictly calculates and validates physical page counts", () => {
    // Standard Single produces valid 24-page plan
    const singleValidation = recalculateAndValidatePhysicalPagePlan("dream-big", profileId, "standard-single");
    expect(singleValidation.valid).toBe(true);
    expect(singleValidation.physicalPageCount).toBe(24);
    expect(singleValidation.requiredPageCount).toBe(24);
    expect(singleValidation.spreadCount).toBe(0);
    expect(singleValidation.singleCount).toBe(24);

    // Custom spreads valid configuration
    const customValidation = recalculateAndValidatePhysicalPagePlan("dream-big", profileId, "custom-spreads", [
      { startPage: 4, endPage: 5, textSide: "left" },
      { startPage: 14, endPage: 15, textSide: "right" },
    ]);
    expect(customValidation.valid).toBe(true);
    expect(customValidation.physicalPageCount).toBe(24);
    expect(customValidation.spreadCount).toBe(2);
    expect(customValidation.singleCount).toBe(20);

    // Explanation provides clear diagnostic
    expect(customValidation.explanation).toContain("Layout is valid: exactly 24 physical interior pages");
  });

  it("8. prompt/manifest/upload/review/export agreement: all subsystems reflect layout mode", () => {
    // Custom spreads is rejected outright for Dream Big (standard-24, no
    // approvedSpreadPairs) — use its valid standard-single resolution.
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "standard-single",
    });

    const manifest = buildManifest(child, "dream-big", profileId, "standard-single", []);
    expect(manifest.length).toBe(plan.assets.length);

    for (let i = 0; i < manifest.length; i++) {
      const m = manifest[i];
      const slot = plan.assets[i];

      expect(m.filename).toBe(slot.filename);
      expect(m.spread).toBe(slot.assetKind === "spread");
      expect(m.aspect).toBe(slot.expectedSourceAspect);
      expect(m.prompt).toBe(slot.prompt);
      expect(m.text).toBe(slot.storyText);
      expect(m.role).toBe(slot.sourceSceneRole);
    }
  });

  it("9. gutter safety: composition rules and dimensions guard central gutter", () => {
    const rulesLeft = spreadCompositionRules("text-left-subject-right");
    expect(rulesLeft).toContain("central gutter-safe zone");
    expect(rulesLeft).toContain("free of faces, eyes, hands, feet, text, and important props");

    const rulesNone = spreadCompositionRules("full-art-no-text");
    expect(rulesNone).toContain("away from the center gutter");
    expect(rulesNone).toContain("central gutter-safe zone free of faces");
  });

  it("10. source-resolution failure: preflight fails closed when source image is low-resolution", async () => {
    const lowResSingle = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 255, g: 100, b: 50 } },
    })
      .png()
      .toBuffer();

    const result = await runPreflight({
      child,
      bookId: "dream-big",
      profileId,
      mode: "standard-single",
      files: [{ filename: "page-01.png", buffer: lowResSingle }],
      allowLowResolutionForTesting: false,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("below print-safe threshold"))).toBe(true);
  });

  it("11. exact output dimensions: matches selected print profile canvas exactly", () => {
    const squareProfile = getPrintProfile("printify-hardcover-square-8x8");
    const squareSingle = getProfileAssetGeometry(squareProfile, "single-page");
    const squareSpread = getProfileAssetGeometry(squareProfile, "spread");

    expect(squareSingle.dimensions).toEqual({ width: 2400, height: 2400 });
    expect(squareSpread.dimensions).toEqual({ width: 4800, height: 2400 });

    const landscapeProfile = getPrintProfile("classic-landscape-11x8");
    const landscapeSingle = getProfileAssetGeometry(landscapeProfile, "single-page");
    const landscapeSpread = getProfileAssetGeometry(landscapeProfile, "spread");

    expect(landscapeSingle.dimensions).toEqual({ width: 3375, height: 2475 });
    // Continuous spread canvas: 22.25 x 8.25 in @ 300 DPI = 6675 x 2475 px (2 outer bleeds, no center bleed)
    expect(landscapeSpread.dimensions).toEqual({ width: 6675, height: 2475 });
    // Two separately exported pages: 2 x 3375 px = 6750 px (includes 2 binding bleeds)
    expect(landscapeSingle.dimensions.width * 2).toBe(6750);
  });

  it("12. seamless split without center line: normalizes continuous master spread into halves", async () => {
    // Generate a 4800x2400 continuous test artwork buffer
    const masterBuf = await sharp({
      create: {
        width: 4800,
        height: 2400,
        channels: 3,
        background: { r: 120, g: 160, b: 220 },
      },
    })
      .png()
      .toBuffer();

    const [leftBuf, rightBuf] = await splitSpread(
      { buffer: masterBuf, mimeType: "image/png" },
      { width: 2400, height: 2400 },
    );

    const leftMeta = await sharp(leftBuf).metadata();
    const rightMeta = await sharp(rightBuf).metadata();

    expect(leftMeta.width).toBe(2400);
    expect(leftMeta.height).toBe(2400);
    expect(rightMeta.width).toBe(2400);
    expect(rightMeta.height).toBe(2400);

    // Recombining halves horizontally produces exact 4800x2400 canvas
    const recombined = await sharp({
      create: {
        width: 4800,
        height: 2400,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: leftBuf, left: 0, top: 0 },
        { input: rightBuf, left: 2400, top: 0 },
      ])
      .png()
      .toBuffer();

    const recombinedMeta = await sharp(recombined).metadata();
    expect(recombinedMeta.width).toBe(4800);
    expect(recombinedMeta.height).toBe(2400);
  });

  it("13. saved selection survives reload/editing: serialized JSON config restores identical plan", () => {
    // Dream Big's standard-24 edition rejects Custom Spreads outright, so a
    // saved config can no longer hold mode "custom-spreads" for it — but the
    // client may still be holding a stale non-empty customSpreads array from
    // before this architecture change while on Standard Single (see
    // lib/api/promptsRoute.test.ts's "leftover non-empty customSpreads"
    // regression). customSpreads is inert in that mode, so the round-trip
    // must still resolve deterministically rather than throwing.
    const savedConfig: { mode: LayoutMode; customSpreads: CustomSpreadSelection[] } = {
      mode: "standard-single",
      customSpreads: [
        { startPage: 4, endPage: 5, textSide: "left", subjectSide: "right" },
        { startPage: 12, endPage: 13, textSide: "right", subjectSide: "left" },
        { startPage: 18, endPage: 19, textSide: "none" },
      ],
    };

    // Simulate browser localStorage JSON roundtrip
    const serialized = JSON.stringify(savedConfig);
    const restored = JSON.parse(serialized) as typeof savedConfig;

    const planBefore = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: savedConfig.mode,
      customSpreads: savedConfig.customSpreads,
    });

    const planAfter = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: restored.mode,
      customSpreads: restored.customSpreads,
    });

    expect(planBefore.interiorPageCount).toBe(planAfter.interiorPageCount);
    expect(planBefore.assets.length).toBe(planAfter.assets.length);

    for (let i = 0; i < planBefore.assets.length; i++) {
      const a = planBefore.assets[i];
      const b = planAfter.assets[i];
      expect(a.slotId).toBe(b.slotId);
      expect(a.filename).toBe(b.filename);
      expect(a.assetKind).toBe(b.assetKind);
      expect(a.expectedSourceAspect).toBe(b.expectedSourceAspect);
      expect(a.prompt).toBe(b.prompt);
      expect(a.storyText).toBe(b.storyText);
      expect(a.textSide).toBe(b.textSide);
      expect(a.subjectSide).toBe(b.subjectSide);
    }
  });
});

