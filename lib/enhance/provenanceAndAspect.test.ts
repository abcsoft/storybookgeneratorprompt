import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { runPreflight } from "../print/preflight";
import { resolveLayoutPlan } from "../story/layoutPlan";
import { processBatchEnhancement } from "./batchProcessor";
import { enhancementRegistry } from "./registry";
import type { ImageProvenanceMetadata } from "./provenance";
import type { ResolutionEnhancementProvider } from "./types";

describe("Resolution Provenance, Aspect Ratios, and Quality Gates", () => {
  const child = { name: "Alex", gender: "boy", age: "6" } as any;

  async function makeImage(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  // Regression Test 1:
  // 1200×880, 2400×1760, and 3375×2475 produce NO aspect warning for Classic Landscape single pages
  it("1. 1200×880, 2400×1760, and 3375×2475 produce no aspect warning for Classic Landscape", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });

    const buf1200 = await makeImage(1200, 880);
    const buf2400 = await makeImage(2400, 1760);
    const buf3375 = await makeImage(3375, 2475);

    // Test each buffer against single page slot (destination 3375x2475, exact 15:11 ratio)
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;

    for (const [dims, buf] of [
      ["1200×880", buf1200],
      ["2400×1760", buf2400],
      ["3375×2475", buf3375],
    ] as const) {
      const res = await runPreflight({
        bookId: "dream-big",
        profileId: "classic-landscape-11x8",
        child,
        draft: true, // test aspect ratio independently of draft PPI watermark
        files: [{ filename: singleSlot.filename, buffer: buf }],
      });

      const aspectWarning = res.warnings.find(
        (w) => w.includes("aspect ratio differs") || w.includes("Background extension"),
      );
      expect(
        aspectWarning,
        `Expected no aspect warning for ${dims} on Classic Landscape single page (expected 15:11 / 1.3636)`,
      ).toBeUndefined();
    }
  });

  // Regression Test 2:
  // A real 3:2 source does produce an aspect warning against the 15:11 target
  it("2. A real 3:2 source (e.g. 1800×1200) produces an aspect warning against the 15:11 target", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;

    // 1800x1200 has exact 3:2 ratio = 1.50. Target is 3375x2475 = 15:11 ≈ 1.3636.
    // Difference is ~10.0%, which exceeds the 8% threshold.
    const buf3to2 = await makeImage(1800, 1200);

    const res = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: true,
      files: [{ filename: singleSlot.filename, buffer: buf3to2 }],
    });

    const aspectWarning = res.warnings.find(
      (w) => w.includes("aspect ratio differs") && w.includes("1.50 vs expected"),
    );
    expect(aspectWarning).toBeDefined();
    expect(aspectWarning).toContain("Background extension or letterboxing will occur");
  });

  // Regression Test 3:
  // Square and spread profiles derive ratios from their own resolved dimensions
  it("3. Square and spread profiles derive aspect ratios from their own resolved dimensions", async () => {
    // 3a. Lulu Square profile (8.5x8.5, destination 2625x2625 = 1:1)
    const luluSquarePlan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "lulu-premium-square-85x85",
    });
    const squareSlot = luluSquarePlan.assets.find((s) => s.assetKind === "single-page")!;
    expect(squareSlot.destinationDimensions.width).toBe(squareSlot.destinationDimensions.height);

    const bufSquare = await makeImage(1024, 1024);
    const squareRes = await runPreflight({
      bookId: "dream-big",
      profileId: "lulu-premium-square-85x85",
      child,
      draft: true,
      files: [{ filename: squareSlot.filename, buffer: bufSquare }],
    });
    const squareAspectWarning = squareRes.warnings.find((w) => w.includes("aspect ratio differs"));
    expect(squareAspectWarning).toBeUndefined();

    // 3b. Classic Landscape spread slot (6675x2475 continuous spread)
    const landscapePlan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads: [{ startPage: 20, endPage: 21, textSide: "left", subjectSide: "right" }],
    });
    const spreadSlot = landscapePlan.assets.find((s) => s.assetKind === "spread")!;
    expect(spreadSlot).toBeDefined();
    expect(spreadSlot.destinationDimensions.width).toBe(6675);
    expect(spreadSlot.destinationDimensions.height).toBe(2475);

    const bufSpread = await makeImage(6675, 2475);
    const spreadRes = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: true,
      files: [{ filename: spreadSlot.filename, buffer: bufSpread }],
    });
    const spreadAspectWarning = spreadRes.warnings.find((w) => w.includes("aspect ratio differs"));
    expect(spreadAspectWarning).toBeUndefined();
  });

  // Regression Test 4:
  // Plain pixel resampling cannot rewrite native 107 PPI as native 300 PPI
  it("4. Plain pixel resampling cannot rewrite native 107 PPI as native 300 PPI", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;

    // A 3375x2475 image, but whose provenance records it was resampled from a 1200x880 source (107 native PPI)
    const bufResampled = await makeImage(3375, 2475);
    const resampledProvenance: ImageProvenanceMetadata = {
      originalPixelDimensions: { width: 1200, height: 880 },
      nativeEffectivePpi: 107,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      enhancedEffectivePpi: 107,
      outputGridPpi: 300,
      upscaleFactor: 2.8125,
      enhancementMethod: "resampled", // plain Lanczos resize, NOT AI
      enhancementStatus: "enhanced",
      originalSha256: "dummy-orig-sha",
      enhancedSha256: "dummy-enh-sha",
      approvalRequired: true,
      approvedAt: null,
      originalFilename: singleSlot.filename,
    };

    const res = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false, // Production export!
      files: [{ filename: singleSlot.filename, buffer: bufResampled, provenance: resampledProvenance }],
    });

    // Plain resampling MUST be rejected for production when native PPI is 107 (< 150)
    expect(res.ok).toBe(false);
    const lowPpiIssue = (res.issues ?? []).find((i) => i.type === "LOW_PPI");
    expect(lowPpiIssue).toBeDefined();
    expect(lowPpiIssue?.message).toContain("Plain pixel resampling cannot rewrite native low-resolution artwork");
    expect(lowPpiIssue?.message).toContain("native 107 PPI");
  });

  // Regression Test 5:
  // Below-150 native assets remain production-blocking until real/mocked enhancement and approval
  it("5. Below-150 native assets remain production-blocking until real enhancement and visual approval", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;
    const buf3375 = await makeImage(3375, 2475);

    // 5a. Unapproved AI enhancement: blocks production export with ENHANCEMENT_APPROVAL_REQUIRED
    const unapprovedProvenance: ImageProvenanceMetadata = {
      originalPixelDimensions: { width: 1200, height: 880 },
      nativeEffectivePpi: 107,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      enhancedEffectivePpi: 300,
      outputGridPpi: 300,
      upscaleFactor: 2.8125,
      enhancementMethod: "mocked-ai-super-res",
      enhancementStatus: "enhanced", // not yet approved!
      originalSha256: "dummy-orig-sha",
      enhancedSha256: "dummy-enh-sha",
      approvalRequired: true,
      approvedAt: null,
      originalFilename: singleSlot.filename,
    };

    const resUnapproved = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false,
      files: [{ filename: singleSlot.filename, buffer: buf3375, provenance: unapprovedProvenance }],
    });

    expect(resUnapproved.ok).toBe(false);
    const approvalIssue = (resUnapproved.issues ?? []).find((i) => i.type === "ENHANCEMENT_APPROVAL_REQUIRED");
    expect(approvalIssue).toBeDefined();
    expect(approvalIssue?.message).toContain("requires explicit visual approval before production export");

    // 5b. Approved AI enhancement: passes production export
    const approvedProvenance: ImageProvenanceMetadata = {
      ...unapprovedProvenance,
      enhancementStatus: "approved",
      approvedAt: new Date().toISOString(),
    };

    const resApproved = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false,
      files: [{ filename: singleSlot.filename, buffer: buf3375, provenance: approvedProvenance }],
    });

    const lowPpiOrApproval = (resApproved.issues ?? []).find(
      (i) => i.type === "LOW_PPI" || i.type === "ENHANCEMENT_APPROVAL_REQUIRED",
    );
    expect(lowPpiOrApproval).toBeUndefined();
  });

  // Regression Test 6:
  // A 213-PPI asset follows the acknowledgement policy
  it("6. A 213-PPI asset follows the acknowledgement policy", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;

    // 2400x1760 on 11.25x8.25" canvas yields 213.3 PPI (between 150 and 299 PPI)
    const buf2400 = await makeImage(2400, 1760);

    // 6a. Unacknowledged production export: returns QUALITY_WARNING_UNACKNOWLEDGED
    const resUnack = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false,
      acknowledgeQualityWarnings: false,
      files: [{ filename: singleSlot.filename, buffer: buf2400 }],
    });

    expect(resUnack.ok).toBe(false);
    const unackIssue = (resUnack.issues ?? []).find((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED");
    expect(unackIssue).toBeDefined();
    expect(unackIssue?.message).toContain("between 150 and 299 PPI");

    // 6b. Acknowledged production export: passes with warning
    const resAck = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false,
      acknowledgeQualityWarnings: true,
      files: [{ filename: singleSlot.filename, buffer: buf2400 }],
    });

    const unackIssueAfterAck = (resAck.issues ?? []).find((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED");
    expect(unackIssueAfterAck).toBeUndefined();
    const ackWarning = resAck.warnings.find((w) => w.includes("between 150 and 299 PPI"));
    expect(ackWarning).toBeDefined();
  });

  // Regression Test 7:
  // Batch enhancement never overwrites originals and reports partial failures
  it("7. Batch enhancement never overwrites originals and reports partial failures", async () => {
    const origBuf1 = await makeImage(1200, 880);
    const origBuf2 = await makeImage(1200, 880);

    const origBufferCopy1 = Buffer.from(origBuf1);
    const origBufferCopy2 = Buffer.from(origBuf2);

    let callCount = 0;
    const failingProvider: ResolutionEnhancementProvider = {
      id: "test-partial-fail",
      name: "Test Partial Fail Provider",
      isConfigured: true,
      isPaid: false,
      async enhanceImage(options) {
        callCount++;
        if (options.filename?.includes("fail")) {
          throw new Error("Simulated network timeout during super-resolution");
        }
        return {
          enhancedBuffer: Buffer.alloc(100),
          outputDimensions: { width: 3375, height: 2475 },
          method: "mocked-ai-super-res",
          upscaleFactor: 2.8125,
          provenance: {} as any,
          mimeType: "image/png",
        };
      },
      estimateCost: () => ({ operationCount: 0, costDescription: "Free", isPaid: false }),
    };

    const items = [
      {
        index: 0,
        slotId: "slot-01",
        filename: "01-success.png",
        options: {
          inputBuffer: origBuf1,
          mimeType: "image/png",
          filename: "01-success.png",
          sourceDimensions: { width: 1200, height: 880 },
          targetDimensions: { width: 3375, height: 2475 },
          physicalInches: { width: 11.25, height: 8.25 },
          method: "mocked-ai-super-res" as any,
          userConfirmedPaid: true,
        },
      },
      {
        index: 1,
        slotId: "slot-02",
        filename: "02-fail.png",
        options: {
          inputBuffer: origBuf2,
          mimeType: "image/png",
          filename: "02-fail.png",
          sourceDimensions: { width: 1200, height: 880 },
          targetDimensions: { width: 3375, height: 2475 },
          physicalInches: { width: 11.25, height: 8.25 },
          method: "mocked-ai-super-res" as any,
          userConfirmedPaid: true,
        },
      },
    ];

    const report = await processBatchEnhancement(items, {
      provider: failingProvider,
      concurrency: 1,
      maxRetries: 1,
    });

    // Verify partial failure reporting
    expect(report.completed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.items[0].status).toBe("completed");
    expect(report.items[1].status).toBe("failed");
    expect(report.items[1].error).toContain("Simulated network timeout");

    // Verify original buffers were never mutated/overwritten
    expect(Buffer.compare(origBuf1, origBufferCopy1)).toBe(0);
    expect(Buffer.compare(origBuf2, origBufferCopy2)).toBe(0);
  });

  // Regression Test 8:
  // Incorrect enhanced dimensions or non-uniform scaling fail closed
  it("8. Incorrect enhanced dimensions or non-uniform scaling fail closed", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;

    // Enhanced image produced 3300x2400 instead of exact 3375x2475 target
    const bufWrongDimensions = await makeImage(3300, 2400);
    const wrongDimProvenance: ImageProvenanceMetadata = {
      originalPixelDimensions: { width: 1200, height: 880 },
      nativeEffectivePpi: 107,
      enhancedPixelDimensions: { width: 3300, height: 2400 },
      enhancedEffectivePpi: 300,
      outputGridPpi: 300,
      upscaleFactor: 2.75,
      enhancementMethod: "mocked-ai-super-res",
      enhancementStatus: "approved",
      originalSha256: "dummy-orig-sha",
      enhancedSha256: "dummy-enh-sha",
      approvalRequired: true,
      approvedAt: new Date().toISOString(),
      originalFilename: singleSlot.filename,
    };

    const res = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false,
      files: [{ filename: singleSlot.filename, buffer: bufWrongDimensions, provenance: wrongDimProvenance }],
    });

    expect(res.ok).toBe(false);
    const dimIssue = (res.issues ?? []).find((i) => i.type === "INCORRECT_ENHANCED_DIMENSIONS");
    expect(dimIssue).toBeDefined();
    expect(dimIssue?.message).toContain("do not match destination canvas 3375×2475");
  });
});
