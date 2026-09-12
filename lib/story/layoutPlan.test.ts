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

  it("Invariant 2: Every spread begins on an even physical page (verso)", () => {
    const spreads = defaultPlan.interiorAssets.filter((a) => a.assetKind === "spread");
    expect(spreads.length).toBeGreaterThan(0);
    for (const spread of spreads) {
      const startPage = spread.physicalPages[0];
      expect(startPage % 2).toBe(0);
    }
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

  it("Invariant 5: Dream Big default mapping is: p1 intro, p2-21 20 careers, p22-23 closing spread", () => {
    // 23 physical interior pages total (intro, 20 careers, closing spread 22-23)
    expect(defaultPlan.interiorPageCount).toBe(23);

    // Physical page 1: intro dedication
    const p1 = defaultPlan.pageToAsset.get(1)!;
    expect(p1.asset.slotId).toBe("page-01");
    expect(p1.asset.assetKind).toBe("single-page");
    expect(p1.asset.storyText).toContain("Once upon a time");

    // Physical pages 2-21: 20 single career scenes
    for (let p = 2; p <= 21; p++) {
      const entry = defaultPlan.pageToAsset.get(p)!;
      expect(entry.asset.assetKind).toBe("single-page");
      expect(entry.asset.physicalPages).toEqual([p]);
    }

    // Physical pages 22-23: closing spread
    const p22 = defaultPlan.pageToAsset.get(22)!;
    const p23 = defaultPlan.pageToAsset.get(23)!;
    expect(p22.asset).toBe(p23.asset);
    expect(p22.asset.slotId).toBe("spread-22-23");
    expect(p22.asset.assetKind).toBe("spread");
    expect(p22.asset.physicalPages).toEqual([22, 23]);

    // Covers are separate from interior pages
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

  it("Invariant 7: Enabling a custom spread consumes exactly one valid facing pair", () => {
    const customPlan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 4, endPage: 5, textSide: "left" }],
    });

    expect(customPlan.interiorPageCount).toBe(23);
    const p4 = customPlan.pageToAsset.get(4)!;
    const p5 = customPlan.pageToAsset.get(5)!;
    expect(p4.asset).toBe(p5.asset);
    expect(p4.asset.slotId).toBe("spread-04-05");
    expect(p4.asset.physicalPages).toEqual([4, 5]);

    // Ensure all 23 physical pages are covered
    for (let p = 1; p <= 23; p++) {
      expect(customPlan.pageToAsset.has(p)).toBe(true);
    }
  });

  it("Invariant 8: Text-left and text-right choices render story text on selected leaf", () => {
    const leftSpreadPlan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 6, endPage: 7, textSide: "left" }],
    });
    const leftAsset = leftSpreadPlan.pageToAsset.get(6)!.asset;
    expect(leftAsset.textSide).toBe("left");
    expect(leftAsset.subjectSide).toBe("right");
    expect(leftAsset.layout).toBe("text-left-subject-right");

    const rightSpreadPlan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 6, endPage: 7, textSide: "right" }],
    });
    const rightAsset = rightSpreadPlan.pageToAsset.get(6)!.asset;
    expect(rightAsset.textSide).toBe("right");
    expect(rightAsset.subjectSide).toBe("left");
    expect(rightAsset.layout).toBe("subject-left-text-right");
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
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads: [{ startPage: 4, endPage: 5, textSide: "left" }],
    });

    const manifest = buildManifest(child, "dream-big", profileId, "custom-spreads", [
      { startPage: 4, endPage: 5, textSide: "left" },
    ]);

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

  it("1. default all-single workflow: resolves 22 interior single pages with 1:1 aspect and page-NN filenames", () => {
    const singlePlan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "standard-single",
    });

    expect(singlePlan.interiorPageCount).toBe(22);
    expect(singlePlan.interiorAssets.length).toBe(22);
    expect(singlePlan.interiorAssets.every((a) => a.assetKind === "single-page")).toBe(true);
    expect(singlePlan.interiorAssets.every((a) => a.expectedSourceAspect === "1:1")).toBe(true);

    for (let p = 1; p <= 22; p++) {
      const entry = singlePlan.pageToAsset.get(p);
      expect(entry).toBeDefined();
      expect(entry?.asset.physicalPages).toEqual([p]);
      const expectedSlot = `page-${String(p).padStart(2, "0")}`;
      expect(entry?.asset.slotId).toBe(expectedSlot);
      expect(entry?.asset.filename).toBe(`${expectedSlot}.png`);
    }

    const manifest = buildManifest(child, "dream-big", profileId, "standard-single");
    expect(manifest.length).toBe(24); // cover + 22 interior pages + back cover
    expect(manifest.slice(1, 23).every((m) => !m.spread && m.aspect === "1:1")).toBe(true);
    expect(manifest[1].filename).toBe("page-01.png");
    expect(manifest[22].filename).toBe("page-22.png");
  });

  it("2. Dream Big default closing spread 22–23: maps spread on 22–23 and singles on 1–21", () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
    });

    expect(plan.interiorPageCount).toBe(23);
    const p22 = plan.pageToAsset.get(22);
    const p23 = plan.pageToAsset.get(23);
    expect(p22).toBeDefined();
    expect(p23).toBeDefined();
    expect(p22?.asset).toBe(p23?.asset);
    expect(p22?.asset.assetKind).toBe("spread");
    expect(p22?.asset.physicalPages).toEqual([22, 23]);
    expect(p22?.asset.slotId).toBe("spread-22-23");
    expect(p22?.asset.expectedSourceAspect).toBe("2:1");
    expect(p22?.asset.destinationDimensions).toEqual({ width: 4800, height: 2400 });

    // p1 intro is single page
    expect(plan.pageToAsset.get(1)?.asset.assetKind).toBe("single-page");
  });

  it("3. custom Text Left spread: text on left leaf, child on right looking inward/left", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 4, endPage: 5, textSide: "left" },
    ];
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads,
    });

    const spread = plan.pageToAsset.get(4)!.asset;
    expect(spread.assetKind).toBe("spread");
    expect(spread.textSide).toBe("left");
    expect(spread.subjectSide).toBe("right");

    // Left leaf (p4) has text; right leaf (p5) is art-only
    expect(spread.leaves[0].physicalPageNumber).toBe(4);
    expect(spread.leaves[0].hasText).toBe(true);
    expect(spread.leaves[0].text).toBeTruthy();
    expect(spread.leaves[1].physicalPageNumber).toBe(5);
    expect(spread.leaves[1].hasText).toBe(false);
    expect(spread.leaves[1].text).toBeNull();

    // Composition prompt instructs text-left, subject-right inward
    expect(spread.prompt).toContain("Reserve the LEFT-HAND region as calm");
    expect(spread.prompt).toContain("RIGHT-HAND subject-side region, looking inward toward the left when natural");
  });

  it("4. custom Text Right spread: text on right leaf, child on left looking inward/right", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 8, endPage: 9, textSide: "right" },
    ];
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads,
    });

    const spread = plan.pageToAsset.get(8)!.asset;
    expect(spread.assetKind).toBe("spread");
    expect(spread.textSide).toBe("right");
    expect(spread.subjectSide).toBe("left");

    // Left leaf (p8) is art-only; right leaf (p9) has text
    expect(spread.leaves[0].physicalPageNumber).toBe(8);
    expect(spread.leaves[0].hasText).toBe(false);
    expect(spread.leaves[0].text).toBeNull();
    expect(spread.leaves[1].physicalPageNumber).toBe(9);
    expect(spread.leaves[1].hasText).toBe(true);
    expect(spread.leaves[1].text).toBeTruthy();

    // Composition prompt instructs text-right, subject-left inward
    expect(spread.prompt).toContain("Reserve the RIGHT-HAND region as calm");
    expect(spread.prompt).toContain("LEFT-HAND subject-side region, looking inward toward the right when natural");
  });

  it("5. No Text spread: balanced panoramic artwork with both leaves art-only", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 10, endPage: 11, textSide: "none" },
    ];
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads,
    });

    const spread = plan.pageToAsset.get(10)!.asset;
    expect(spread.textSide).toBe("none");
    expect(!spread.storyText).toBe(true);
    expect(spread.leaves[0].hasText).toBe(false);
    expect(spread.leaves[0].text).toBeNull();
    expect(spread.leaves[1].hasText).toBe(false);
    expect(spread.leaves[1].text).toBeNull();

    // Composition prompt contract
    expect(spread.prompt).toContain("full-art spread with no story text");
    expect(spread.prompt).toContain("balanced panoramic artwork");
    expect(spread.prompt).toContain("away from the center gutter");
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
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 6, endPage: 7, textSide: "left", subjectSide: "right" },
    ];

    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "custom-spreads",
      customSpreads,
    });

    const manifest = buildManifest(child, "dream-big", profileId, "custom-spreads", customSpreads);
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
    const savedConfig: { mode: LayoutMode; customSpreads: CustomSpreadSelection[] } = {
      mode: "custom-spreads",
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

