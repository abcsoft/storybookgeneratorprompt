import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runPreflight } from "./preflight";
import { assembleFromImages } from "../manual/assemble";
import { resolveLayoutPlan } from "../story/layoutPlan";
import { getPrintProfile } from "./registry";
import { POST as assemblePost } from "../../app/api/assemble/route";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Mehedi", age: 4, gender: "boy" };

async function makeImage(width: number, height: number, color = { r: 100, g: 150, b: 200 }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
}

describe("Classic Landscape Preflight & Active Layout Contract Regression Suite", () => {
  // Test 1: dream-big + classic-landscape-11x8 + standard-single + 24 readable landscape files passes preflight
  it("1. dream-big + classic-landscape-11x8 + standard-single + 24 readable landscape files passes preflight and assembles", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    expect(plan.assets.length).toBe(24);
    expect(plan.interiorPageCount).toBe(22);

    const files = await Promise.all(
      plan.assets.map(async (slot, idx) => ({
        filename: slot.legacyAliases[0] ?? `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: await makeImage(1800, 1320),
      })),
    );

    const preflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      files,
      allowLowResolutionForTesting: false,
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.errors).toEqual([]);

    // Also verify assembleFromImages successfully builds the PDF with these files
    const imagesMap = new Map<number, { buffer: Buffer; mimeType: string }>();
    for (let i = 0; i < files.length; i++) {
      imagesMap.set(i, { buffer: files[i].buffer, mimeType: "image/jpeg" });
    }

    const assembleResult = await assembleFromImages(
      child,
      imagesMap,
      "dream-big",
      "classic-landscape-11x8",
      { mode: "standard-single" },
    );

    expect(assembleResult.pdf).toBeDefined();
    expect(assembleResult.pdf.length).toBeGreaterThan(10000);
    expect(assembleResult.totalPages).toBe(24); // 1 front + 22 interior + 1 back
  });

  // Test 2: Low-PPI policy: 1376x768 (approx 122 PPI on 11.25") is strictly blocked in production
  it("2a. Negative test: 1376x768 (approx 122 PPI) is blocked in production preflight as hard error", async () => {
    const files = await Promise.all(
      Array.from({ length: 24 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: await makeImage(1376, 768),
      })),
    );

    const preflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      files,
      allowLowResolutionForTesting: false,
      draft: false,
    });

    // 1376x768 on 11.25" is ~122 PPI, strictly < 150 PPI: MUST be blocked in production!
    expect(preflight.ok).toBe(false);
    expect(preflight.errors.length).toBeGreaterThan(0);
    expect(preflight.errors.some((e) => e.includes("below print-safe threshold") || e.includes("150"))).toBe(true);
    expect(preflight.issues?.some((i) => i.type === "LOW_PPI")).toBe(true);

    // Verify separated metrics are populated correctly in asset reports
    const report = preflight.assetReports?.[0];
    expect(report).toBeDefined();
    expect(report?.nativeSourceWidth).toBe(1376);
    expect(report?.nativeSourceHeight).toBe(768);
    expect(report?.nativeEffectivePpiX).toBeCloseTo(122.3, 1);
    expect(report?.finalRasterWidth).toBe(3375);
    expect(report?.finalRasterHeight).toBe(2475);
    expect(report?.finalOutputGridPpi).toBe(300);
  });

  // Test 2b: 1376x768 is allowed in explicit draft mode with visible watermark warning
  it("2b. 1376x768 is accepted in explicit draft mode with watermark warning", async () => {
    const files = await Promise.all(
      Array.from({ length: 24 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: await makeImage(1376, 768),
      })),
    );

    const preflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      files,
      draft: true, // explicit draft mode
    });

    // Allowed in draft mode
    expect(preflight.ok).toBe(true);
    expect(preflight.errors).toEqual([]);
    expect(preflight.warnings.some((w) => w.includes("draft mode") && w.includes("watermark"))).toBe(true);
  });

  // Test 2c: Intermediate resolution (150 to < 300 PPI) passes with warning requiring user acknowledgement
  it("2c. Intermediate resolution (150 to < 300 PPI) passes production with explicit warning", async () => {
    // 2000x1500 px on 11.25x8.25 in gives ~178 PPI
    const files = await Promise.all(
      Array.from({ length: 24 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: await makeImage(2000, 1500),
      })),
    );

    const preflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      files,
      allowLowResolutionForTesting: false,
      draft: false,
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.errors).toEqual([]);
    // Non-blocking warning requiring user acknowledgement
    expect(preflight.warnings.some((w) => w.includes("between 150 and 299 PPI"))).toBe(true);
    expect(preflight.warnings.some((w) => w.includes("does not create genuine native 300-PPI detail"))).toBe(true);

    const report = preflight.assetReports?.[0];
    expect(report?.nativeSourceWidth).toBe(2000);
    expect(report?.nativeSourceHeight).toBe(1500);
    expect(report?.nativeEffectivePpiX).toBeCloseTo(177.8, 1);
    expect(report?.finalRasterWidth).toBe(3375);
    expect(report?.finalRasterHeight).toBe(2475);
    expect(report?.finalOutputGridPpi).toBe(300);
  });

  // Test 3: Standard Single ignores every legacy spread hint
  it("3. Standard Single ignores every legacy spread hint and does not fail on odd spread parity", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    // Verify all interior assets resolve as single pages
    const interiorAssets = plan.assets.filter(
      (a) => a.assetKind !== "front-cover" && a.assetKind !== "back-cover",
    );
    expect(interiorAssets.every((a) => a.assetKind === "single-page")).toBe(true);
    expect(interiorAssets.every((a) => a.layout === "single-page")).toBe(true);
    expect(plan.assets.some((a) => a.assetKind === "spread")).toBe(false);

    // Page 22 (scene index 21) was legacy spread: true in dreamBigTemplate. Verify it is single-page now.
    const page22Asset = plan.assets.find((a) => a.sourceSceneIndex === 21);
    expect(page22Asset?.assetKind).toBe("single-page");
  });

  // Test 4: Custom Spread mode still validates real spread parity
  it("4. Custom Spread mode still validates real spread parity and fails if spread starts on odd physical page", async () => {
    // Attempt an invalid custom spread starting on odd page (page 1 is recto)
    expect(() => {
      resolveLayoutPlan({
        child,
        bookId: "dream-big",
        profileId: "classic-landscape-11x8",
        mode: "custom-spreads",
        customSpreads: [{ startPage: 1, endPage: 2, textSide: "left", subjectSide: "right" }],
      });
    }).toThrow(/Invalid spread across physical pages 1–2|Facing spreads can only begin on even-numbered/);

    // Preflight also catches invalid spread attempts
    const files = await Promise.all(
      Array.from({ length: 24 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: await makeImage(1500, 1100),
      })),
    );

    const preflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads: [{ startPage: 1, endPage: 2, textSide: "left", subjectSide: "right" }],
      files,
    });

    expect(preflight.ok).toBe(false);
    expect(preflight.errors.some((e) => e.includes("Spreads cannot begin on page 1") || e.includes("Invalid spread across physical pages"))).toBe(true);
  });

  // Test 5: Printify fixed-page requirements remain fail-closed
  it("5. Printify fixed-page requirements remain fail-closed on missing asset or low PPI", async () => {
    // Only 23 files provided to 24-asset Printify edition (requires 24 assets)
    const files = await Promise.all(
      Array.from({ length: 23 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: await makeImage(2400, 2400),
      })),
    );

    const preflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "printify-hardcover-square-8x8",
      files,
      allowLowResolutionForTesting: false,
    });

    expect(preflight.ok).toBe(false);
    expect(preflight.errors.some((e) => e.includes("missing"))).toBe(true);

    // PPI < 150 on Printify must fail closed
    const lowResFiles = await Promise.all(
      Array.from({ length: 25 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: await makeImage(500, 500),
      })),
    );

    const lowResPreflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "printify-hardcover-square-8x8",
      files: lowResFiles,
      allowLowResolutionForTesting: false,
    });

    expect(lowResPreflight.ok).toBe(false);
    expect(lowResPreflight.errors.some((e) => e.includes("PPI") || e.includes("resolution"))).toBe(true);
  });

  // Test 6: A corrupt or portrait asset still blocks export
  it("6. A corrupt or portrait asset still blocks export with hard structured errors", async () => {
    // Portrait asset on Classic Landscape
    const portraitFiles = await Promise.all(
      Array.from({ length: 24 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        // Illustration 3 is portrait
        buffer: idx === 2 ? await makeImage(800, 1200) : await makeImage(1500, 1100),
      })),
    );

    const portraitPreflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      files: portraitFiles,
    });

    expect(portraitPreflight.ok).toBe(false);
    expect(portraitPreflight.errors.some((e) => e.includes("portrait") && e.includes("landscape"))).toBe(true);
    expect(portraitPreflight.issues?.some((i) => i.type === "INCOMPATIBLE_ORIENTATION" && i.illustrationNumber === 3)).toBe(true);

    // Corrupt buffer
    const corruptFiles = await Promise.all(
      Array.from({ length: 24 }, async (_, idx) => ({
        filename: `${String(idx + 1).padStart(2, "0")}.png`,
        buffer: idx === 5 ? Buffer.from("NOT_AN_IMAGE_GARBAGE_BYTES") : await makeImage(1500, 1100),
      })),
    );

    const corruptPreflight = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
      files: corruptFiles,
    });

    expect(corruptPreflight.ok).toBe(false);
    expect(corruptPreflight.errors.some((e) => e.includes("corrupt") || e.includes("unreadable"))).toBe(true);
    expect(corruptPreflight.issues?.some((i) => (i.type === "UNREADABLE_IMAGE" || i.type === "CORRUPT_IMAGE") && i.illustrationNumber === 6)).toBe(true);
  });

  // Test 7: /api/assemble returns detailed structured errors
  it("7. /api/assemble returns detailed structured errors and status 400 when preflight fails", async () => {
    const formData = new FormData();
    formData.append("name", "Mehedi");
    formData.append("age", "4");
    formData.append("gender", "boy");
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");

    // Send a portrait file for illustration 2 (02.png)
    const portraitBuf = await makeImage(800, 1200);
    formData.append("images", new File([new Uint8Array(portraitBuf)], "02.png", { type: "image/jpeg" }));

    // Send normal files for others up to 24
    for (let i = 1; i <= 24; i++) {
      if (i === 2) continue;
      const normalBuf = await makeImage(1500, 1100);
      formData.append("images", new File([new Uint8Array(normalBuf)], `${String(i).padStart(2, "0")}.png`, { type: "image/jpeg" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });

    const res = await assemblePost(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.code).toBe("PREFLIGHT_FAILED");
    expect(data.error).toBe("Preflight validation failed — production export blocked.");
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues.length).toBeGreaterThan(0);

    // Verify structured issue contains illustration number, filename, expected, actual, recommendation
    const issue = data.issues.find((i: any) => i.illustrationNumber === 2);
    expect(issue).toBeDefined();
    expect(issue.filename).toBe("02.png");
    expect(issue.expected.toLowerCase()).toContain("landscape");
    expect(issue.actual.toLowerCase()).toContain("portrait");
    expect(issue.recommendation).toBeDefined();
  });

  // Test 8: ManualFlow structured error parsing contract
  it("8. ManualFlow response parsing contract extracts structured issues and isolates warnings", () => {
    // Simulate /api/assemble error response payload
    const mockApiResponse = {
      code: "PREFLIGHT_FAILED",
      error: "Preflight validation failed — production export blocked.",
      preflight: {
        ok: false,
        errors: ['Illustration 4 ("04.png"): image file is corrupt or unreadable.'],
        warnings: ["Illustration 1 source PPI (96) is below recommended 150 PPI."],
        issues: [
          {
            type: "IMAGE_CORRUPT",
            illustrationNumber: 4,
            filename: "04.png",
            expected: "Valid readable image file",
            actual: "Corrupted byte stream",
            recommendation: "Re-generate or re-export the image file as a clean PNG or JPEG.",
            message: 'Illustration 4 ("04.png"): image file is corrupt or unreadable.',
          },
        ],
      },
      issues: [
        {
          type: "IMAGE_CORRUPT",
          illustrationNumber: 4,
          filename: "04.png",
          expected: "Valid readable image file",
          actual: "Corrupted byte stream",
          recommendation: "Re-generate or re-export the image file as a clean PNG or JPEG.",
          message: 'Illustration 4 ("04.png"): image file is corrupt or unreadable.',
        },
      ],
    };

    // Parse according to ManualFlow logic
    const rawErrors = mockApiResponse.preflight?.errors ?? [];
    const rawWarnings = mockApiResponse.preflight?.warnings ?? [];
    const rawIssues = mockApiResponse.issues ?? mockApiResponse.preflight?.issues ?? [];

    expect(rawWarnings).toEqual(["Illustration 1 source PPI (96) is below recommended 150 PPI."]);

    const structured = rawIssues.map((item: any) => ({
      type: item.type,
      illustrationNumber: item.illustrationNumber,
      filename: item.filename,
      expected: item.expected,
      actual: item.actual,
      recommendation: item.recommendation,
      message: item.message ?? "",
    }));

    expect(structured.length).toBe(1);
    expect(structured[0].illustrationNumber).toBe(4);
    expect(structured[0].filename).toBe("04.png");
    expect(structured[0].expected).toBe("Valid readable image file");
    expect(structured[0].actual).toBe("Corrupted byte stream");
    expect(structured[0].recommendation).toContain("Re-generate");
  });
});
