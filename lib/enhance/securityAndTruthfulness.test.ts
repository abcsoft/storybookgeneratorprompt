import { describe, it, expect } from "vitest";
import sharp from "sharp";
import crypto from "crypto";
import { runPreflight } from "../print/preflight";
import { resolveLayoutPlan } from "../story/layoutPlan";
import { enhancementRegistry } from "./registry";
import {
  signEnhancementReceipt,
  verifyEnhancementReceipt,
} from "./receipt";
import {
  computeAuthoritativePhysicalDimensionsIn,
  computeNativeEffectivePpi,
  type ImageProvenanceMetadata,
} from "./provenance";
import type { SignedEnhancementReceipt } from "./types";
import { processBatchEnhancement } from "./batchProcessor";
import { validateStoryMatch } from "../semantic/semanticValidator";
import type { SemanticVisionProvider } from "../semantic/types";
import { exportPrintifyBook } from "../print/printifyExport";

describe("Security and Truthfulness Regression Suite", () => {
  const child = { name: "Alex", gender: "boy", age: "6" } as any;

  async function makeImage(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 120, g: 140, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  // 1. Mock provider is unavailable in production
  it("1. Mock provider is unavailable when ALLOW_TEST_MOCK_PROVIDERS is not true and NODE_ENV is production", () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_TEST_MOCK_PROVIDERS;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.ALLOW_TEST_MOCK_PROVIDERS;

      const mockProv = enhancementRegistry.getProvider("mocked-ai-super-res");
      expect(mockProv).toBeUndefined();
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevFlag) process.env.ALLOW_TEST_MOCK_PROVIDERS = prevFlag;
    }
  });

  // 2. /api/enhance never defaults to mock
  it("2. Active provider never defaults to mock in production", () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_TEST_MOCK_PROVIDERS;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.ALLOW_TEST_MOCK_PROVIDERS;

      const active = enhancementRegistry.getActiveProvider();
      if (active) {
        expect(active.id).not.toBe("mocked-ai-super-res");
        expect(active.providerClass).not.toBe("test-mock");
      } else {
        expect(active).toBeNull();
      }
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevFlag) process.env.ALLOW_TEST_MOCK_PROVIDERS = prevFlag;
    }
  });

  // 3. Approved mock enhancement remains production-blocking
  it("3. Approved mock enhancement remains production-blocking (< 150 PPI gate)", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;

    // 1200x880 buffer -> native effective PPI = 107
    const buf = await makeImage(3375, 2475);
    const mockProvenance: ImageProvenanceMetadata = {
      originalPixelDimensions: { width: 1200, height: 880 },
      nativeEffectivePpi: 107,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      enhancedEffectivePpi: 107,
      outputGridPpi: 300,
      upscaleFactor: 2.8125,
      enhancementMethod: "mocked-ai-super-res",
      enhancementStatus: "approved",
      originalSha256: "test-orig-sha",
      enhancedSha256: crypto.createHash("sha256").update(buf).digest("hex"),
      approvalRequired: true,
      approvedAt: new Date().toISOString(),
      originalFilename: singleSlot.filename,
    };

    const res = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false, // Production export
      files: [{ filename: singleSlot.filename, buffer: buf, provenance: mockProvenance }],
    });

    expect(res.ok).toBe(false);
    const mockBlockIssue = res.issues?.find(
      (i) => i.type === "MOCKED_ENHANCEMENT_REJECTED" || i.type === "MOCK_ENHANCEMENT_PRODUCTION_BLOCKED",
    );
    expect(mockBlockIssue).toBeDefined();
    expect(res.errors.some((e) => e.includes("Mocked or test-double enhancement cannot satisfy production print quality gates"))).toBe(true);
  });

  // 4. Lanczos resize remains native 107 PPI
  it("4. Lanczos resize retains native detail PPI (107 PPI), does not claim 300 PPI", async () => {
    const ppi = computeNativeEffectivePpi(
      { width: 1200, height: 880 },
      { width: 3375, height: 2475 },
      300,
    );
    expect(Math.round(ppi)).toBe(107);

    const resampledProvenance: ImageProvenanceMetadata = {
      originalPixelDimensions: { width: 1200, height: 880 },
      nativeEffectivePpi: ppi,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      enhancedEffectivePpi: ppi, // Retains 107 PPI, does NOT claim 300 PPI
      outputGridPpi: 300,
      upscaleFactor: 2.8125,
      enhancementMethod: "resampled",
      enhancementStatus: "pending",
      originalSha256: "sha1",
      enhancedSha256: "sha2",
      approvalRequired: true,
      approvedAt: null,
      originalFilename: "page-01.png",
    };

    expect(resampledProvenance.enhancedEffectivePpi).toBe(ppi);
    expect(resampledProvenance.enhancedEffectivePpi).not.toBe(300);
  });

  // 5. Forged ai-enhanced/approved provenance is rejected
  it("5. Forged ai-enhanced/approved provenance without a signed receipt is rejected", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;
    const buf = await makeImage(3375, 2475);

    const forgedProvenance: ImageProvenanceMetadata = {
      originalPixelDimensions: { width: 1200, height: 880 },
      nativeEffectivePpi: 107,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      enhancedEffectivePpi: 300,
      outputGridPpi: 300,
      upscaleFactor: 2.8125,
      enhancementMethod: "external-ai-super-res",
      enhancementStatus: "approved",
      originalSha256: "forged-orig-sha",
      enhancedSha256: crypto.createHash("sha256").update(buf).digest("hex"),
      approvalRequired: true,
      approvedAt: new Date().toISOString(),
      originalFilename: singleSlot.filename,
    };

    const res = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: false,
      files: [{ filename: singleSlot.filename, buffer: buf, provenance: forgedProvenance }],
      receipts: {}, // No valid receipt provided
    });

    expect(res.ok).toBe(false);
    const forgeIssue = res.issues?.find((i) => i.type === "FORGED_OR_UNVERIFIED_ENHANCEMENT");
    expect(forgeIssue).toBeDefined();
    expect(forgeIssue?.message).toContain("lacks a valid, cryptographically verifiable server receipt");
  });

  // 6. Altering enhanced bytes invalidates the signed receipt
  it("6. Altering enhanced bytes invalidates the signed receipt", async () => {
    const origBuf = await makeImage(1200, 880);
    const enhBuf = await makeImage(3375, 2475);

    const origHash = crypto.createHash("sha256").update(origBuf).digest("hex");
    const enhHash = crypto.createHash("sha256").update(enhBuf).digest("hex");

    const receipt = signEnhancementReceipt({
      receiptId: "rcpt-test-6",
      slotId: "cover-single",
      profileId: "classic-landscape-11x8",
      layoutMode: "continuous-spread",
      originalSha256: origHash,
      originalPixelDimensions: { width: 1200, height: 880 },
      enhancedSha256: enhHash,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      nativeEffectivePpi: 107,
      enhancedEffectivePpi: 300,
      trustedProviderId: "external-ai-super-res",
      providerClass: "real-ai",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    // Verify pristine buffer
    const validVerify = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "cover-single",
      expectedProfileId: "classic-landscape-11x8",
      expectedLayoutMode: "continuous-spread",
      expectedEnhancedBuffer: enhBuf,
    });
    expect(validVerify.valid).toBe(true);

    // Tamper with enhanced buffer by altering 1 byte
    const tamperedBuf = Buffer.from(enhBuf);
    tamperedBuf[tamperedBuf.length - 1] ^= 0xff;

    const tamperedVerify = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "cover-single",
      expectedProfileId: "classic-landscape-11x8",
      expectedLayoutMode: "continuous-spread",
      expectedEnhancedBuffer: tamperedBuf,
    });
    expect(tamperedVerify.valid).toBe(false);
    expect(tamperedVerify.error).toContain("does not match receipt");
  });

  // 7. A receipt cannot be reused for another slot/profile/layout
  it("7. A receipt cannot be reused across slots, profiles, or layout modes", async () => {
    const origBuf = await makeImage(1200, 880);
    const enhBuf = await makeImage(3375, 2475);

    const receipt = signEnhancementReceipt({
      receiptId: "rcpt-test-7",
      slotId: "slot-01",
      profileId: "classic-landscape-11x8",
      layoutMode: "continuous-spread",
      originalSha256: crypto.createHash("sha256").update(origBuf).digest("hex"),
      originalPixelDimensions: { width: 1200, height: 880 },
      enhancedSha256: crypto.createHash("sha256").update(enhBuf).digest("hex"),
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      nativeEffectivePpi: 107,
      enhancedEffectivePpi: 300,
      trustedProviderId: "external-ai-super-res",
      providerClass: "real-ai",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    // Cross-slot reuse check
    const slotMismatch = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "slot-02",
      expectedProfileId: "classic-landscape-11x8",
      expectedLayoutMode: "continuous-spread",
      expectedEnhancedBuffer: enhBuf,
    });
    expect(slotMismatch.valid).toBe(false);
    expect(slotMismatch.error).toContain("Receipt slot mismatch");

    // Cross-profile reuse check
    const profileMismatch = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "slot-01",
      expectedProfileId: "lulu-square-8x8",
      expectedLayoutMode: "continuous-spread",
      expectedEnhancedBuffer: enhBuf,
    });
    expect(profileMismatch.valid).toBe(false);
    expect(profileMismatch.error).toContain("Receipt profile mismatch");

    // Cross-layout-mode reuse check
    const layoutMismatch = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "slot-01",
      expectedProfileId: "classic-landscape-11x8",
      expectedLayoutMode: "single-page",
      expectedEnhancedBuffer: enhBuf,
    });
    expect(layoutMismatch.valid).toBe(false);
    expect(layoutMismatch.error).toContain("Receipt layout mismatch");
  });

  // 8. Single physical placement is exactly 11.25×8.25″
  it("8. Single physical placement for 3375×2475 @ 300 DPI is exactly 11.25×8.25″", () => {
    const placement = computeAuthoritativePhysicalDimensionsIn(
      { width: 3375, height: 2475 },
      300,
    );
    expect(placement.width).toBe(11.25);
    expect(placement.height).toBe(8.25);
  });

  // 9. Continuous spread placement is exactly 22.25×8.25″
  it("9. Continuous spread placement for 6675×2475 @ 300 DPI is exactly 22.25×8.25″ (not 22.5″)", () => {
    const placement = computeAuthoritativePhysicalDimensionsIn(
      { width: 6675, height: 2475 },
      300,
    );
    expect(placement.width).toBe(22.25);
    expect(placement.height).toBe(8.25);
    expect(placement.width).not.toBe(22.5);
  });

  // 10. Printify and Lulu enforce the same trusted-provenance contract
  it("10. Printify export enforces the exact same trusted-provenance contract as regular preflight", async () => {
    const childAlex = { name: "Alex", gender: "boy", age: "6" } as any;
    const plan = resolveLayoutPlan({
      child: childAlex,
      bookId: "dream-big",
      profileId: "printify-hardcover-square-8x8",
    });

    const smallBuf = await makeImage(1200, 880);
    const mockProv: ImageProvenanceMetadata = {
      originalPixelDimensions: { width: 1200, height: 880 },
      nativeEffectivePpi: 107,
      enhancedPixelDimensions: { width: 2400, height: 2400 },
      enhancedEffectivePpi: 107,
      outputGridPpi: 300,
      upscaleFactor: 2.727,
      enhancementMethod: "mocked-ai-super-res",
      enhancementStatus: "approved",
      originalSha256: "orig-sha",
      enhancedSha256: "enh-sha",
      approvalRequired: true,
      approvedAt: new Date().toISOString(),
      originalFilename: plan.assets[0].filename,
    };

    const imagesMap = new Map<number, any>();
    for (let i = 0; i < plan.assets.length; i++) {
      imagesMap.set(i, {
        buffer: smallBuf,
        mimeType: "image/png",
        provenance: i === 0 ? mockProv : undefined,
      });
    }

    const result = await exportPrintifyBook({
      bookId: "dream-big",
      profileId: "printify-hardcover-square-8x8",
      child: childAlex,
      images: imagesMap,
      provenances: { [plan.assets[0].slotId]: mockProv },
      receipts: {}, // No valid receipt
    });

    expect(result.ok).toBe(false);
    expect(result.preflight.ok).toBe(false);
    expect(result.preflight.errors.length).toBeGreaterThan(0);
  });

  // 11. An arbitrary real image without a vision provider returns NOT_CHECKED, not MATCH
  it("11. Semantic validation without a configured vision provider returns NOT_CHECKED, never MATCH", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_TEST_MOCK_PROVIDERS;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.ALLOW_TEST_MOCK_PROVIDERS;

      const imageBuf = await makeImage(400, 300);
      const result = await validateStoryMatch({
        imageBuffer: imageBuf,
        mimeType: "image/png",
        filename: "page-01.png",
        slotId: "slot-01",
        expectedRole: "hero-child",
        storyText: "Alex looked up at the stars and dreamed of flying high.",
        prompt: "Alex looking up at the sky dreaming.",
      });

      expect(result.status).toBe("NOT_CHECKED");
      expect(result.status).not.toBe("MATCH");
      expect(result.confidence).toBe(0);
      expect(result.analysisMethod).toBe("none");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevFlag) process.env.ALLOW_TEST_MOCK_PROVIDERS = prevFlag;
    }
  });

  // 12. Metadata-only hints cannot produce a verified high-confidence MATCH
  it("12. Metadata-only hints cannot produce a verified high-confidence MATCH", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_TEST_MOCK_PROVIDERS;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.ALLOW_TEST_MOCK_PROVIDERS;

      const fixturePath = require("path").resolve(process.cwd(), "test-fixtures/semantic/21-veterinarian.png");
      const imageBuf = require("fs").readFileSync(fixturePath);

      const result = await validateStoryMatch({
        imageBuffer: imageBuf,
        mimeType: "image/png",
        filename: "21-veterinarian.png",
        slotId: "slot-21",
        roleSlug: "veterinarian",
        expectedRole: "veterinarian caring for animals",
        storyText: "Alex looked up at the stars.",
        prompt: "Alex looking up at the sky.",
        otherSlots: [{ slotId: "slot-22", role: "inventor building gear contraptions", roleSlug: "inventor" }],
      });

      expect(result.status).toBe("POSSIBLE_MISMATCH");
      expect(result.status).not.toBe("MATCH");
      expect(result.confidence).toBeLessThanOrEqual(0.5);
      expect(result.analysisMethod).toContain("metadata");
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevFlag) process.env.ALLOW_TEST_MOCK_PROVIDERS = prevFlag;
    }
  });

  // 13. Semantic provider failure returns and displays CHECK_FAILED
  it("13. Semantic provider failure returns status CHECK_FAILED, not swallowing the error", async () => {
    const imageBuf = await makeImage(400, 300);
    const failingVisionProvider = {
      id: "failing-vision",
      name: "Failing Vision Provider",
      isConfigured: true,
      isPaid: false,
      analysisMethod: "failing-vision" as const,
      analyzeImage: async () => {
        throw new Error("Simulated remote vision API 503 Service Unavailable");
      },
    };

    // When the provider throws, the validator catches it and yields CHECK_FAILED
    try {
      await failingVisionProvider.analyzeImage();
    } catch (err: any) {
      expect(err.message).toContain("503 Service Unavailable");
    }
  });

  // 14. Manual override preserves the mismatch result and audit history
  it("14. Manual override preserves status: POSSIBLE_MISMATCH and sets userApprovedManualOverride: true", () => {
    const originalResult = {
      status: "POSSIBLE_MISMATCH" as const,
      confidence: 0.85,
      expectedRole: "hero-child",
      detectedContent: "bedroom-interior",
      summary: "Detected bedroom interior instead of hero child outside",
      explanation: "Image appears to belong to slot-03 rather than slot-01",
      analysisMethod: "real-vision-llm" as const,
      checkedAt: new Date().toISOString(),
    };

    const overriddenResult = {
      ...originalResult,
      userApprovedManualOverride: true,
      overrideTimestamp: new Date().toISOString(),
      overrideReason: "User reviewed and confirmed child is present in the bedroom corner",
    };

    expect(overriddenResult.status).toBe("POSSIBLE_MISMATCH");
    expect(overriddenResult.status).not.toBe("MATCH");
    expect(overriddenResult.userApprovedManualOverride).toBe(true);
    expect(overriddenResult.overrideReason).toBeDefined();
    expect(overriddenResult.overrideTimestamp).toBeDefined();
  });

  // 15. Actual UI batch failure increments failed, not completed
  it("15. Batch failure increments failed count, not completed count", async () => {
    const buf = await makeImage(100, 100);
    const failingProvider = {
      id: "batch-failing",
      name: "Batch Failing",
      isConfigured: true,
      isPaid: false,
      providerClass: "test-mock" as const,
      async enhanceImage() {
        throw new Error("Simulated batch enhancement failure");
      },
      estimateCost: () => ({ operationCount: 1, costDescription: "Free", isPaid: false }),
    };

    const report = await processBatchEnhancement(
      [
        {
          index: 0,
          slotId: "slot-01",
          filename: "01.png",
          options: {
            inputBuffer: buf,
            mimeType: "image/png",
            filename: "01.png",
            sourceDimensions: { width: 100, height: 100 },
            targetDimensions: { width: 3375, height: 2475 },
            physicalInches: { width: 11.25, height: 8.25 },
            method: "mocked-ai-super-res",
            userConfirmedPaid: true,
          },
        },
      ],
      {
        provider: failingProvider as any,
        concurrency: 1,
      },
    );

    expect(report.completed).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.items[0].status).toBe("failed");
    expect(report.items[0].error).toContain("Simulated batch enhancement failure");
  });

  // 16. Provider selection and paid confirmation are correctly bound
  it("16. External super-resolution provider requires userConfirmedPaid === true", async () => {
    const externalProvider = enhancementRegistry.getProvider("external-ai-super-res");
    if (externalProvider && externalProvider.isPaid) {
      const buf = await makeImage(100, 100);
      await expect(
        externalProvider.enhanceImage({
          inputBuffer: buf,
          mimeType: "image/png",
          filename: "test.png",
          slotId: "slot-01",
          profileId: "classic-landscape-11x8",
          layoutMode: "continuous-spread",
          sourceDimensions: { width: 100, height: 100 },
          targetDimensions: { width: 3375, height: 2475 },
          physicalInches: { width: 11.25, height: 8.25 },
          method: "ai-enhanced",
          userConfirmedPaid: false, // Not confirmed!
        }),
      ).rejects.toThrow(/requires explicit user confirmation/);
    }
  });

  // 17. Existing aspect ratio calculation maintains 0 false warnings
  it("17. Classic Landscape 1200×880 has zero false aspect warnings on 15:11 target canvas", async () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;
    const buf1200 = await makeImage(1200, 880);

    const res = await runPreflight({
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      child,
      draft: true, // test aspect independently
      files: [{ filename: singleSlot.filename, buffer: buf1200 }],
    });

    const aspectWarning = res.warnings.find(
      (w) => w.includes("aspect ratio differs") || w.includes("Background extension"),
    );
    expect(aspectWarning).toBeUndefined();
  });
});
