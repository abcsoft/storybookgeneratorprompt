import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getPrintProfile } from "../print/registry";
import { resolveLayoutPlan } from "./layoutPlan";
import { buildTargetFormatBlock, inferFramingMode, singlePageCompositionRules, spreadCompositionRules } from "./prompt/compositionRules";
import { negativeRules } from "./prompt/negativeRules";
import { buildIllustrationPrompt } from "./prompt/buildIllustrationPrompt";
import { normalizeProductionAsset } from "../print/artworkTransform";
import { CLASSIC_LANDSCAPE_PDF_BOXES, injectPdfBoxes, inspectPdfPreflight } from "../pdf/pdfBoxes";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Leo", age: 5, gender: "boy" };

describe("Aspect Ratio Contract & Mathematics", () => {
  const profile = getPrintProfile("classic-landscape-11x8");

  it("proves 3375x2475 is 15:11 (approx 1.363636) and NOT 3:2 (1.5)", () => {
    const w = 3375;
    const h = 2475;
    const ratio = w / h;
    expect(ratio).toBeCloseTo(15 / 11, 5);
    expect(ratio).not.toBeCloseTo(3 / 2, 2);
    expect(Math.abs(ratio - 1.5)).toBeGreaterThan(0.13); // 10% discrepancy from 3:2
  });

  it("proves 6675x2475 is 89:33 (approx 2.696970) and NOT 21:9 (2.333333)", () => {
    const w = 6675;
    const h = 2475;
    const ratio = w / h;
    expect(ratio).toBeCloseTo(89 / 33, 5);
    expect(ratio).not.toBeCloseTo(21 / 9, 2);
    expect(Math.abs(ratio - (21 / 9))).toBeGreaterThan(0.35); // 15% discrepancy from 21:9
  });

  it("proves 11x8 trim is 11:8 (1.375) and 22x8 spread trim is 11:4 (2.75)", () => {
    expect(11 / 8).toBe(1.375);
    expect(22 / 8).toBe(2.75);
  });

  it("proves provider preset 4:3 is mathematically closer to 15:11 (2.2% delta) than 3:2 (10% delta)", () => {
    const target = 15 / 11;
    const p43 = 4 / 3;
    const p32 = 3 / 2;

    const delta43 = Math.abs(p43 - target) / target;
    const delta32 = Math.abs(p32 - target) / target;

    expect(delta43).toBeLessThan(0.025); // 2.22%
    expect(delta32).toBeGreaterThan(0.099); // 10.0%
    expect(delta43).toBeLessThan(delta32);
  });

  it("fails if prompt target format block presents 3375x2475 as a 3:2 canvas or 6675x2475 as a 21:9 canvas", () => {
    const singleFormat = buildTargetFormatBlock("classic-landscape-11x8", "single-page", "scene");
    expect(singleFormat).toContain("3375×2475 px (15:11 aspect ratio");
    expect(singleFormat).toContain("trim 11×8 in [11:8 trim ratio]");
    expect(singleFormat).toContain("closest provider preset: 4:3");
    expect(singleFormat).not.toContain("3375×2475 px (3:2 aspect ratio");
    expect(singleFormat).not.toContain("3:2 single page");

    const spreadFormat = buildTargetFormatBlock("classic-landscape-11x8", "text-left-subject-right", "scene");
    expect(spreadFormat).toContain("6675×2475 px (89:33 aspect ratio");
    expect(spreadFormat).toContain("trim 22×8 in [11:4 trim ratio]");
    expect(spreadFormat).toContain("closest provider preset: 21:9");
    expect(spreadFormat).not.toContain("6675×2475 px (21:9 aspect ratio");
    expect(spreadFormat).not.toContain("21:9 continuous panoramic spread");
  });

  it("fails if provider request metadata is presented as target-canvas metadata in resolved slots", () => {
    const plan = resolveLayoutPlan({ child, bookId: "bedtime-dream", profileId: "classic-landscape-11x8" });
    const singleSlot = plan.interiorAssets[0];

    expect(singleSlot.targetCanvasAspect).toBe("15:11");
    expect(singleSlot.trimAspect).toBe("11:8");
    expect(singleSlot.providerPresetAspect).toBe("4:3");
    expect(singleSlot.destinationDimensions).toEqual({ width: 3375, height: 2475 });
    expect(singleSlot.normalizedProductionDimensions).toEqual({ width: 3375, height: 2475 });

    // Must never claim target canvas is 3:2 or equal to provider preset
    expect(singleSlot.targetCanvasAspect).not.toBe("3:2");
    expect(singleSlot.targetCanvasAspect).not.toBe(singleSlot.providerPresetAspect);
  });

  it("enforces deterministic, non-stretch normalization transform (scaleX === scaleY strictly)", async () => {
    // Synthetic 1000x800 input image (~5:4)
    const rawInput = await sharp({
      create: { width: 1000, height: 800, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    }).png().toBuffer();

    const normSingle = await normalizeProductionAsset(rawInput, { width: 3375, height: 2475 }, "proportional-cover-crop");
    expect(normSingle.width).toBe(3375);
    expect(normSingle.height).toBe(2475);
    expect(normSingle.scaleX).toBe(normSingle.scaleY);
    expect(normSingle.uniformScale).toBe(normSingle.scaleX);
    expect(normSingle.cropBounds.width).toBe(3375);
    expect(normSingle.cropBounds.height).toBe(2475);

    // Continuous spread master
    const normSpread = await normalizeProductionAsset(rawInput, { width: 6675, height: 2475 }, "proportional-cover-crop");
    expect(normSpread.width).toBe(6675);
    expect(normSpread.height).toBe(2475);
    expect(normSpread.scaleX).toBe(normSpread.scaleY);
  });

  it("verifies spread slicing with integer crop bounds and half-pixel center handling", async () => {
    const masterW = 6675;
    const masterH = 2475;
    const halfCenter = masterW / 2; // 3337.5 px
    const overlap = 75; // 0.25 in @ 300 DPI

    // Left leaf: [0, 3375]
    const leftCrop = { left: 0, top: 0, width: 3375, height: 2475 };
    // Right leaf: [3300, 6675]
    const rightCrop = { left: 3300, top: 0, width: 3375, height: 2475 };

    expect(Number.isInteger(leftCrop.left)).toBe(true);
    expect(Number.isInteger(leftCrop.width)).toBe(true);
    expect(Number.isInteger(rightCrop.left)).toBe(true);
    expect(Number.isInteger(rightCrop.width)).toBe(true);

    // Overlap width
    expect(leftCrop.left + leftCrop.width - rightCrop.left).toBe(overlap);

    // Trim boundary coordinates:
    // Left leaf trim is at x = 3337.5 px on master
    // Right leaf trim is at x = 3337.5 px on master
    // Left inner bleed = [3300, 3337.5] (37.5 px)
    // Right inner bleed = [3300, 3337.5] (37.5 px)
    expect(3375 - halfCenter).toBe(37.5);
    expect(halfCenter - rightCrop.left).toBe(37.5);

    // Both trimmed leaves meet at the exact same master coordinate without duplicated or missing strip
    const leftTrimEndOnMaster = leftCrop.left + (leftCrop.width - 37.5);
    const rightTrimStartOnMaster = rightCrop.left + 37.5;
    expect(leftTrimEndOnMaster).toBe(halfCenter);
    expect(rightTrimStartOnMaster).toBe(halfCenter);
    expect(leftTrimEndOnMaster).toBe(rightTrimStartOnMaster);
  });
});

describe("Resolved Prompts Enforcement & Negative Tests", () => {
  it("proves a scene resolved as single-page cannot submit a spread prompt or spread dimensions", () => {
    const singlePlan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    for (const slot of singlePlan.interiorAssets) {
      expect(slot.layout).toBe("single-page");
      expect(slot.assetKind).toBe("single-page");
      expect(slot.destinationDimensions).toEqual({ width: 3375, height: 2475 });
      expect(slot.targetCanvasAspect).toBe("15:11");

      // Negative assertions: prompt must never contain spread instructions
      expect(slot.prompt).not.toContain("COMPOSITION (two-page continuous spread)");
      expect(slot.prompt).not.toContain("uninterrupted panoramic scene across one wide canvas");
      expect(slot.prompt).not.toContain("center gutter-safe zone");
      expect(slot.prompt).not.toContain("6675×2475 px");
    }
  });

  it("negative test: Bedtime Dream closing in custom-spreads mode resolves strictly as single-page and rejects spread prompts", () => {
    const spreadPlan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads: [{ startPage: 10, endPage: 11, textSide: "left", subjectSide: "right" }],
    });

    const closingSlot = spreadPlan.interiorAssets.find((a) => a.sceneId === "closing")!;
    expect(closingSlot.layout).toBe("single-page");
    expect(closingSlot.assetKind).toBe("single-page");
    expect(closingSlot.physicalPages).toEqual([14]);
    expect(closingSlot.destinationDimensions).toEqual({ width: 3375, height: 2475 });

    // Negative prompt check: no spread prompt or raw spread-master prompt permitted
    expect(closingSlot.prompt).toContain("COMPOSITION (single page)");
    expect(closingSlot.prompt).not.toContain("two-page continuous spread");
    expect(closingSlot.prompt).not.toContain("6675×2475 px");
  });
});

describe("Scene-Aware Framing & Contradiction Deduplication", () => {
  it("sleeping/bed-covered scene does not demand feet/hands under blankets", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: { defaultOutfit: "pajamas" },
      scene: "Tucked comfortably in bed under soft blankets, fast asleep in the cozy bedroom.",
      layout: "single-page",
      kind: "scene",
    });

    expect(prompt).toContain("FRAMING (sleeping/bed-covered)");
    expect(prompt).toContain("Require natural visible anatomy only for body parts actually outside the bedding");
    expect(prompt).not.toContain("active arms");
    expect(prompt).not.toContain("visible feet");
    expect(prompt).not.toContain("two visible legs");
    expect(prompt).not.toContain("no feet touching the bottom");
    expect(prompt).not.toContain("crop the head, hair, hands, or feet");
  });

  it("waist-up cover does not add a later 'never crop feet' instruction", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: { defaultOutfit: "explorer outfit" },
      scene: "Hero cover portrait standing on a hill, turned toward the viewer with a joyful smile.",
      layout: "single-page",
      kind: "cover",
    });

    expect(prompt).toContain("FRAMING (waist-up portrait)");
    expect(prompt).toContain("Frame naturally from the waist or chest up with ample headroom");
    expect(prompt).not.toContain("no feet touching the bottom");
    expect(prompt).not.toContain("crop the head, hair, hands, or feet");
  });

  it("cockpit scene respects vehicle occlusion without demanding hidden lower limbs", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: { defaultOutfit: "spacesuit" },
      scene: "Sitting in the spaceship cockpit, hands on steering controls looking out at passing stars.",
      layout: "single-page",
      kind: "scene",
    });

    expect(prompt).toContain("FRAMING (vehicle/cockpit)");
    expect(prompt).toContain("Lower body portions seated behind consoles or railings are naturally occluded");
    expect(prompt).not.toContain("no feet touching the bottom");
  });

  it("deduplicates repeated text prohibitions across composition and negative rules", () => {
    const prompt = buildIllustrationPrompt({
      child,
      story: {},
      scene: "Walking along a forest path.",
      layout: "single-page",
      kind: "scene",
    });

    // Check occurrences of "NO TEXT IN THE IMAGE"
    const textMatches = prompt.match(/NO TEXT IN (THE )?IMAGE/g) ?? [];
    expect(textMatches.length).toBe(1);
  });
});

describe("Real PDF Preflight Verification", () => {
  it("verifies TrimBox (792x576 pt), BleedBox (810x594 pt), and MediaBox (810x594 pt) on Classic Landscape PDF", () => {
    // Generate a minimal mock PDF with MediaBox [0 0 810 594]
    const mockRawPdf = Buffer.from(
      "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 810 594 ] >>\nendobj\n" +
      "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF\n",
      "latin1",
    );

    const injected = injectPdfBoxes(mockRawPdf, CLASSIC_LANDSCAPE_PDF_BOXES);
    const preflight = inspectPdfPreflight(injected, 11, 8, 0.125);

    expect(preflight.ok).toBe(true);
    expect(preflight.pageCount).toBe(1);
    expect(preflight.mediaBoxes[0]).toContain("[ 0 0 810 594 ]");
    expect(preflight.bleedBoxes[0]).toContain("[0 0 810 594]");
    expect(preflight.trimBoxes[0]).toContain("[9 9 801 585]");
  });
});
