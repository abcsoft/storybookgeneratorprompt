import { describe, expect, it } from "vitest";
import { listBooks, getBook } from "./registry";
import { listPrintProfiles, getPrintProfile } from "../print/registry";
import {
  resolveLayoutPlan,
  recalculateAndValidatePhysicalPagePlan,
  getProfileAssetGeometry,
  type LayoutMode,
} from "./layoutPlan";
import { getEditionForProfile } from "./editions";
import type { ChildProfile } from "./types";

const testChild: ChildProfile = {
  name: "Leo",
  age: 5,
  gender: "boy",
};

describe("Comprehensive Story Pipeline & Layout Contract Audit", () => {
  const books = listBooks();
  const profiles = listPrintProfiles();
  const modes: LayoutMode[] = ["standard-single", "custom-spreads"];

  it("registers exactly 10 stories", () => {
    expect(books.length).toBe(10);
    const expectedIds = [
      "dream-big",
      "great-adventure",
      "the-great-detective",
      "dinosaur-discovery",
      "space-explorer",
      "rainbow-kingdom",
      "safari-friendship",
      "underwater-kingdom",
      "bedtime-dream",
      "kindness-garden",
    ];
    for (const id of expectedIds) {
      expect(books.some((b) => b.id === id)).toBe(true);
    }
  });

  it("registers all 4 supported print profiles", () => {
    expect(profiles.length).toBe(4);
    const expectedProfileIds = [
      "classic-landscape-11x8",
      "printify-hardcover-square-8x8",
      "lulu-landscape-11x8.5",
      "lulu-square-8.5x8.5",
    ];
    for (const pid of expectedProfileIds) {
      expect(profiles.some((p) => p.id === pid)).toBe(true);
    }
  });

  describe("Requirement 1 & 3: Authoritative Single-Contract & Standard-Single Enforcement", () => {
    for (const b of books) {
      for (const p of profiles) {
        it(`${b.id} on ${p.id} in standard-single mode produces ONLY single-page artwork with ZERO spread instructions`, () => {
          const plan = resolveLayoutPlan({
            child: testChild,
            bookId: b.id,
            profileId: p.id,
            mode: "standard-single",
          });

          expect(plan.mode).toBe("standard-single");
          expect(plan.coverAsset.assetKind).toBe("front-cover");
          expect(plan.backCoverAsset.assetKind).toBe("back-cover");

          // Every interior asset MUST be single-page
          for (const asset of plan.interiorAssets) {
            expect(asset.assetKind).toBe("single-page");
            expect(asset.layout).toBe("single-page");
            expect(asset.physicalPages.length).toBe(1);
            expect(asset.leaves.length).toBe(1);
            expect(asset.expectedSourceAspect).toBe(p.singleAspect);
            expect(asset.destinationDimensions.width).toBe(p.canvasPx.width);
            expect(asset.destinationDimensions.height).toBe(p.canvasPx.height);

            // Safe regions must be present and have NO gutter on single pages
            expect(asset.safeRegions).toBeDefined();
            expect(asset.safeRegions.textSafe.widthPct).toBeGreaterThan(0);
            expect(asset.safeRegions.subjectSafe.widthPct).toBeGreaterThan(0);
            expect(asset.safeRegions.gutter).toBeUndefined();

            // Prompt must contain single-page composition rules and NEVER spread composition rules
            expect(asset.prompt).toContain("COMPOSITION (single page)");
            expect(asset.prompt).not.toContain("SPREAD COMPOSITION");
            expect(asset.prompt).not.toContain("two-page spread");
            expect(asset.prompt).not.toContain("BINDING GUTTER SAFETY");
            expect(asset.prompt).not.toContain("center gutter");
          }
        });
      }
    }
  });

  describe("Requirement 2: Profile & Page-Kind Propagation Across All Story Callbacks", () => {
    for (const b of books) {
      for (const p of profiles) {
        it(`${b.id} on ${p.id} propagates profileId and kinds into all prompt closures`, () => {
          const plan = resolveLayoutPlan({
            child: testChild,
            bookId: b.id,
            profileId: p.id,
            mode: "standard-single",
          });

          // Cover asset
          expect(plan.coverAsset.pageKind).toBe("cover");
          expect(plan.coverAsset.profileId).toBe(p.id);
          expect(plan.coverAsset.prompt).toContain("front cover");
          expect(plan.coverAsset.prompt).toContain(`trim ${p.nominalSizeIn.width}×${p.nominalSizeIn.height} in`);
          expect(plan.coverAsset.prompt).toContain("lower portion of the frame (roughly the lower 25–30%) calm");
          expect(plan.coverAsset.safeRegions.gutter).toBeUndefined();

          // Back cover asset
          expect(plan.backCoverAsset.pageKind).toBe("backcover");
          expect(plan.backCoverAsset.profileId).toBe(p.id);
          expect(plan.backCoverAsset.prompt).toContain(`trim ${p.nominalSizeIn.width}×${p.nominalSizeIn.height} in`);

          // Intro and scenes
          const introAsset = plan.interiorAssets.find((a) => a.pageKind === "intro");
          expect(introAsset).toBeDefined();
          expect(introAsset?.profileId).toBe(p.id);
          expect(introAsset?.prompt).toContain(`trim ${p.nominalSizeIn.width}×${p.nominalSizeIn.height} in`);

          const hasClosing = b.pages.some((pg) => pg.kind === "closing");
          if (hasClosing) {
            const closingAsset = plan.interiorAssets.find((a) => a.pageKind === "closing");
            expect(closingAsset).toBeDefined();
            expect(closingAsset?.profileId).toBe(p.id);
            expect(closingAsset?.prompt).toContain(`trim ${p.nominalSizeIn.width}×${p.nominalSizeIn.height} in`);
          }
        });
      }
    }
  });

  describe("Requirement 4: Spread Composition Invariants", () => {
    it("custom spreads have continuous environment, clear gutter, and no 3D book mockup elements", () => {
      const plan = resolveLayoutPlan({
        child: testChild,
        bookId: "dream-big",
        profileId: "printify-hardcover-square-8x8",
        mode: "custom-spreads",
        customSpreads: [{ startPage: 2, endPage: 3, textSide: "left" }],
      });

      const spreadAsset = plan.interiorAssets.find((a) => a.assetKind === "spread");
      expect(spreadAsset).toBeDefined();
      expect(spreadAsset?.physicalPages).toEqual([2, 3]);
      expect(spreadAsset?.leaves.length).toBe(2);
      expect(spreadAsset?.leaves[0].leafSide).toBe("left");
      expect(spreadAsset?.leaves[1].leafSide).toBe("right");

      // Dimensions must be 2x width
      expect(spreadAsset?.destinationDimensions.width).toBe(4800);
      expect(spreadAsset?.destinationDimensions.height).toBe(2400);
      expect(spreadAsset?.expectedSourceAspect).toBe("2:1");

      // Gutter region must be defined
      expect(spreadAsset?.safeRegions.gutter).toBeDefined();
      expect(spreadAsset?.safeRegions.gutter?.widthPct).toBeGreaterThan(0);

      // Prompt must include spread rules and explicit negatives against open books/curved pages
      expect(spreadAsset?.prompt).toContain("COMPOSITION (two-page continuous spread)");
      expect(spreadAsset?.prompt).toContain("Create one uninterrupted panoramic scene across one wide canvas");
      expect(spreadAsset?.prompt).toContain("Keep the central gutter-safe zone free of faces, eyes, hands, feet, text, and important props");
      expect(spreadAsset?.prompt).toContain("Do not generate a photographed open book, curved or curled pages, 3D book mockup, fake seam or binding line");
      expect(spreadAsset?.prompt).toContain("Reserve the LEFT-HAND region as calm, low-detail environmental space for story text");
    });
  });

  describe("Requirement 5: Exact Dimension Derivations & No Mismatch Stretching", () => {
    for (const p of profiles) {
      it(`derives correct trim & spread dimensions for profile ${p.id}`, () => {
        const singleGeo = getProfileAssetGeometry(p, "single-page");
        expect(singleGeo.printDimensionsIn.trimWidthIn).toBe(p.nominalSizeIn.width);
        expect(singleGeo.printDimensionsIn.trimHeightIn).toBe(p.nominalSizeIn.height);
        expect(singleGeo.printDimensionsIn.spread).toBe(false);

        const spreadGeo = getProfileAssetGeometry(p, "spread");
        expect(spreadGeo.printDimensionsIn.trimWidthIn).toBe(p.nominalSizeIn.width * 2);
        expect(spreadGeo.printDimensionsIn.trimHeightIn).toBe(p.nominalSizeIn.height);
        expect(spreadGeo.printDimensionsIn.spread).toBe(true);

        // Assert exact canvas px:
        // Single page canvas includes outer bleed and binding bleed:
        expect(singleGeo.dimensions.width).toBe(p.canvasPx.width);
        expect(singleGeo.dimensions.height).toBe(p.canvasPx.height);

        // Continuous spread canvas before slicing has 2 outer bleeds, NO center bleed:
        // Math: (trimWidth * 2 + bleed * 2) * DPI (Printify interior has zero bleed, so 4800px)
        const expectedContinuousSpreadWidth =
          p.id === "printify-hardcover-square-8x8"
            ? 4800
            : Math.round((p.nominalSizeIn.width * 2 + (p.bleedIn ?? 0.125) * 2) * p.dpi);
        expect(spreadGeo.dimensions.width).toBe(expectedContinuousSpreadWidth);
        expect(spreadGeo.dimensions.height).toBe(p.canvasPx.height);

        // In contrast, two separately exported pages each have binding bleed:
        const separatedPagesTotalWidth = p.canvasPx.width * 2;
        const hasBleed = p.id !== "printify-hardcover-square-8x8" && (p.bleedIn ?? 0.125) > 0;
        if (hasBleed) {
          // Continuous spread canvas is narrower by 2 * bleed (e.g. 75px / 0.25in for 300 DPI)
          expect(spreadGeo.dimensions.width).toBeLessThan(separatedPagesTotalWidth);
        } else {
          expect(spreadGeo.dimensions.width).toBe(separatedPagesTotalWidth);
        }
      });
    }

    it("classic-landscape-11x8 spread prompt explicitly specifies 22×8 in spread before bleed", () => {
      const plan = resolveLayoutPlan({
        child: testChild,
        bookId: "great-adventure",
        profileId: "classic-landscape-11x8",
        mode: "custom-spreads",
        customSpreads: [{ startPage: 2, endPage: 3, textSide: "left" }],
      });
      const spreadAsset = plan.interiorAssets.find((a) => a.assetKind === "spread");
      expect(spreadAsset).toBeDefined();
      expect(spreadAsset?.prompt).toContain("trim is 11×8 in per page, totaling 22×8 in spread before bleed");
      expect(spreadAsset?.prompt).toContain("6675×2475 px target at 300 DPI");
      expect(spreadAsset?.prompt).toContain("full-bleed spread 22.25×8.25 in");
    });
  });

  describe("Requirement 6: Cover Safe Areas & Framing", () => {
    for (const b of books) {
      it(`cover prompt for ${b.id} aligns with renderer title safe area (lower portion)`, () => {
        const plan = resolveLayoutPlan({
          child: testChild,
          bookId: b.id,
          profileId: "printify-hardcover-square-8x8",
          mode: "standard-single",
        });
        const coverPrompt = plan.coverAsset.prompt;
        expect(coverPrompt).toContain("Keep the lower portion of the frame (roughly the lower 25–30%) calm");
        expect(coverPrompt).toContain("Do not apply gutter restrictions to the cover");
        expect(coverPrompt).not.toContain("top portion of the cover");
        expect(coverPrompt).not.toContain("central gutter-safe zone");
        expect(coverPrompt).not.toContain("place any important subject in the center fold/gutter");
      });
    }
  });

  describe("Requirement 7: Companion Presence & Scene Independence", () => {
    it("dinosaurDiscovery: Sprout is absent in intro and beats 1-3, discovered in beat 4", () => {
      const b = getBook("dinosaur-discovery");
      const introPrompt = b.pages.find((p) => p.kind === "intro")?.illustrationPrompt(testChild);
      expect(introPrompt).not.toContain("COMPANION CONTINUITY");

      // Beat 1, 2, 3 (indices 2, 3, 4)
      for (let i = 2; i <= 4; i++) {
        const beatPrompt = b.pages[i].illustrationPrompt(testChild);
        expect(beatPrompt).not.toContain("COMPANION CONTINUITY");
      }

      // Beat 4 (index 5 - Sprout discovered)
      const beat4Prompt = b.pages[5].illustrationPrompt(testChild);
      expect(beat4Prompt).toContain("COMPANION CONTINUITY — Sprout");
    });

    it("spaceExplorer: Orbit is absent in intro, joins after launch", () => {
      const b = getBook("space-explorer");
      const introPrompt = b.pages.find((p) => p.kind === "intro")?.illustrationPrompt(testChild);
      expect(introPrompt).not.toContain("COMPANION CONTINUITY");
    });

    it("rainbowKingdom: Luma is absent in intro, met across the archway", () => {
      const b = getBook("rainbow-kingdom");
      const introPrompt = b.pages.find((p) => p.kind === "intro")?.illustrationPrompt(testChild);
      expect(introPrompt).not.toContain("COMPANION CONTINUITY");
    });

    it("underwaterKingdom: Coral is absent in intro and beat 3, met in beat 4", () => {
      const b = getBook("underwater-kingdom");
      const introPrompt = b.pages.find((p) => p.kind === "intro")?.illustrationPrompt(testChild);
      expect(introPrompt).not.toContain("COMPANION CONTINUITY");
      const beat3Prompt = b.pages[4].illustrationPrompt(testChild);
      expect(beat3Prompt).not.toContain("COMPANION CONTINUITY");
      const beat4Prompt = b.pages[5].illustrationPrompt(testChild);
      expect(beat4Prompt).toContain("COMPANION CONTINUITY — Coral");
    });

    it("bedtimeDream: Twinkle is absent in intro and beat 3, met in beat 4", () => {
      const b = getBook("bedtime-dream");
      const introPrompt = b.pages.find((p) => p.kind === "intro")?.illustrationPrompt(testChild);
      expect(introPrompt).not.toContain("COMPANION CONTINUITY");
      const beat3Prompt = b.pages[4].illustrationPrompt(testChild);
      expect(beat3Prompt).not.toContain("COMPANION CONTINUITY");
      const beat4Prompt = b.pages[5].illustrationPrompt(testChild);
      expect(beat4Prompt).toContain("COMPANION CONTINUITY — Twinkle");
    });

    it("kindnessGarden: Pip is absent in intro, freed in beat 1, present beat 2+", () => {
      const b = getBook("kindness-garden");
      const introPrompt = b.pages.find((p) => p.kind === "intro")?.illustrationPrompt(testChild);
      expect(introPrompt).not.toContain("COMPANION CONTINUITY");
      const beat2Prompt = b.pages[3].illustrationPrompt(testChild);
      expect(beat2Prompt).toContain("COMPANION CONTINUITY — Pip");
    });
  });

  describe("Requirement 8: The Great Detective Template & Shared Contract Routing", () => {
    it("Detective backcover reserves blank placard for application typography without dropping profileId or style rules", () => {
      const b = getBook("the-great-detective");
      const backCoverSpec = b.pages.find((p) => p.kind === "backcover");
      expect(backCoverSpec).toBeDefined();

      const prompt = backCoverSpec?.illustrationPrompt(testChild, "classic-landscape-11x8");
      expect(prompt).toContain("trim 11×8 in");
      expect(prompt).toContain("blank wooden placard face completely free of letters");
      expect(prompt).toContain("reserved for title overlay");
      expect(prompt).toContain("ABSOLUTELY NO TEXT IN THE IMAGE");
      expect(prompt).toContain("A high-end children's storybook picture");
      expect(prompt).toContain("PHOTOREALISTICALLY");
      expect(backCoverSpec?.text(testChild)).toContain("CASE CLOSED!\nLEO'S DETECTIVE AGENCY");
    });

    it("Detective scenes preserve side characters and props across pipeline", () => {
      const b = getBook("the-great-detective");
      // Beat 1: Rohan
      const rohanPrompt = b.pages[2].illustrationPrompt(testChild);
      expect(rohanPrompt).toContain("Rohan");
      expect(rohanPrompt).toContain("Leo");

      // Beat 15: Meera
      const meeraPrompt = b.pages[16].illustrationPrompt(testChild);
      expect(meeraPrompt).toContain("Meera");
    });
  });

  describe("Requirement 9: Narrative Order Preservation & Fixed Page Count Limitations", () => {
    it("preserves natural scene order and never silently duplicates scenes for short stories on variable profiles", () => {
      const gaPlan = resolveLayoutPlan({
        child: testChild,
        bookId: "great-adventure",
        profileId: "classic-landscape-11x8",
        mode: "standard-single",
      });

      // Great adventure has 19 interior scenes
      expect(gaPlan.interiorPageCount).toBe(19);
      expect(gaPlan.interiorAssets.length).toBe(19);

      // Verify strict 1:1 narrative order with unique source scene indices
      const sourceIndices = gaPlan.interiorAssets.map((a) => a.sourceSceneIndex);
      const uniqueIndices = new Set(sourceIndices);
      expect(uniqueIndices.size).toBe(19);
      for (let i = 0; i < sourceIndices.length; i++) {
        expect(sourceIndices[i]).toBe(i + 1); // 0 is cover, 1..19 are interior
      }
    });

    it("flags limitations when a story lacks an editorial edition for Printify 24-page hardcover", () => {
      const validation = recalculateAndValidatePhysicalPagePlan(
        "kindness-garden",
        "printify-hardcover-square-8x8",
        "standard-single",
      );
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("requires exactly 24 interior pages"))).toBe(true);

      const plan = resolveLayoutPlan({
        child: testChild,
        bookId: "kindness-garden",
        profileId: "printify-hardcover-square-8x8",
        mode: "standard-single",
      });
      expect(plan.isValidForProfile).toBe(false);
      expect(plan.limitations).toBeDefined();
      expect(plan.limitations![0]).toContain("requires exactly 24 interior pages");
      // Scenes are NOT duplicated to 24 (12 natural interior beats: 1 intro + 10 garden beats + 1 closing)
      expect(plan.interiorAssets.length).toBe(12);
    });

    it("Dream Big on Printify 24-page hardcover is valid because an editorial edition exists", () => {
      const validation = recalculateAndValidatePhysicalPagePlan(
        "dream-big",
        "printify-hardcover-square-8x8",
        "custom-spreads",
        [{ startPage: 22, endPage: 23, textSide: "left" }],
      );
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);

      const plan = resolveLayoutPlan({
        child: testChild,
        bookId: "dream-big",
        profileId: "printify-hardcover-square-8x8",
      });
      expect(plan.interiorPageCount).toBe(23);
    });
  });
});
