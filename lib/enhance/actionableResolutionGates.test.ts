import { describe, it, expect } from "vitest";
import sharp from "sharp";
import crypto from "node:crypto";
import { runPreflight, type PreflightFile } from "../print/preflight";
import { resolveLayoutPlan } from "../story/layoutPlan";
import { renderBookHtml } from "../pdf/page-template";
import { computeAuthoritativePhysicalDimensionsIn } from "./provenance";
import { signEnhancementReceipt } from "./receipt";
import { validateStoryMatch } from "../semantic/semanticValidator";
import type { GeneratedPage, ChildProfile } from "../story/types";
import type { ImageProvenanceMetadata } from "./types";

const TEST_CHILD: ChildProfile = { name: "Leo", age: 5, gender: "boy" };

describe("Actionable Resolution Gates & Truthfulness Verification Suite", () => {
  // 1. Mixed 213/107-PPI issue classification
  it("classifies mixed 213 PPI (7 files) and 107 PPI (17 files) into distinct issue types", async () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const files: PreflightFile[] = [];
    const mapping = new Map<string, PreflightFile>();

    for (let i = 0; i < plan.assets.length; i++) {
      const asset = plan.assets[i];
      const is213 = i < 7;
      const width = is213 ? 2400 : 1200;
      const height = is213 ? 1760 : 880;
      // Distinct per-slot pixel content (not just distinct filenames) — real
      // artwork is never byte-identical across slots, and the preflight's
      // duplicate-artwork-across-slots gate now correctly flags it if it is.
      const buf = await sharp({
        create: { width, height, channels: 3, background: { r: 50, g: (100 + i * 7) % 255, b: (200 + i * 11) % 255 } },
      }).png().toBuffer();

      const pfFile: PreflightFile = {
        filename: asset.expectedFilename,
        buffer: buf,
      };
      files.push(pfFile);
      mapping.set(asset.slotId, pfFile);
    }

    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
      acknowledgeQualityWarnings: false,
    });

    expect(preflight.ok).toBe(false);
    expect(preflight.issues).toBeDefined();
    // Standard-24 edition: 26 assets (2 cover + 24 interior), so the
    // remaining 26 - 7 = 19 files land in the below-150-PPI bucket.
    expect(preflight.issues?.length).toBe(26);

    const qualityWarnings = preflight.issues?.filter(
      (i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED"
    );
    const lowPpiErrors = preflight.issues?.filter(
      (i) => i.type === "LOW_PPI" || i.type === "IMAGE_RESOLUTION_TOO_LOW"
    );

    expect(qualityWarnings?.length).toBe(7);
    expect(lowPpiErrors?.length).toBe(19);
    expect(preflight.qualityWarnings?.length).toBe(7);
  });

  // 2. Acknowledgement clears only 150-299 PPI issues
  it("acknowledgement clears only 150-299 PPI warnings, keeping below-150 PPI errors strictly blocked", async () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const files: PreflightFile[] = [];
    const mapping = new Map<string, PreflightFile>();

    for (let i = 0; i < plan.assets.length; i++) {
      const asset = plan.assets[i];
      const is213 = i < 7;
      const width = is213 ? 2400 : 1200;
      const height = is213 ? 1760 : 880;
      // Distinct per-slot pixel content (not just distinct filenames) — real
      // artwork is never byte-identical across slots, and the preflight's
      // duplicate-artwork-across-slots gate now correctly flags it if it is.
      const buf = await sharp({
        create: { width, height, channels: 3, background: { r: 50, g: (100 + i * 7) % 255, b: (200 + i * 11) % 255 } },
      }).png().toBuffer();

      const pfFile: PreflightFile = {
        filename: asset.expectedFilename,
        buffer: buf,
      };
      files.push(pfFile);
      mapping.set(asset.slotId, pfFile);
    }

    // 2a. Global boolean alone is rejected in production (all 24 issues remain)
    const preflightGlobalOnly = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
      acknowledgeQualityWarnings: true,
    });
    expect(preflightGlobalOnly.ok).toBe(false);
    // Standard-24 edition: 26 assets (2 cover + 24 interior).
    expect(preflightGlobalOnly.issues?.length).toBe(26);

    // 2b. Per-slot bound qualityAcknowledgements for the 7 213-PPI slots
    const acks: Record<string, any> = {};
    for (let i = 0; i < 7; i++) {
      const asset = plan.assets[i];
      const pfFile = files[i];
      acks[asset.slotId] = {
        slotId: asset.slotId,
        sourceSha256: crypto.createHash("sha256").update(pfFile.buffer).digest("hex"),
        bookId: "dream-big",
        profileId: "classic-landscape-11x8",
        layoutMode: "standard-single",
        computedNativeEffectivePpi: 213.3,
        destinationDimensions: asset.destinationDimensions,
        timestamp: new Date().toISOString(),
      };
    }

    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
      qualityAcknowledgements: acks,
    });

    // Still not ok because 19 files (26 total - 7 acknowledged) are <150 PPI
    expect(preflight.ok).toBe(false);
    expect(preflight.issues?.length).toBe(19);

    const qualityWarnings = preflight.issues?.filter(
      (i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED"
    );
    const lowPpiErrors = preflight.issues?.filter(
      (i) => i.type === "LOW_PPI" || i.type === "IMAGE_RESOLUTION_TOO_LOW"
    );

    // The 7 quality warnings are cleared from blocking issues!
    expect(qualityWarnings?.length).toBe(0);
    // The 19 below-150-PPI errors remain blocked!
    expect(lowPpiErrors?.length).toBe(19);
  });

  // 3. Below-150 PPI issues cannot be acknowledged away
  it("rejects production export when only below-150 PPI issues exist even if acknowledgeQualityWarnings is true", async () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const files: PreflightFile[] = [];
    const mapping = new Map<string, PreflightFile>();

    for (let i = 0; i < plan.assets.length; i++) {
      const asset = plan.assets[i];
      // Distinct per-slot content — see the "classifies mixed 213/107 PPI" test above.
      const buf = await sharp({
        create: { width: 1200, height: 880, channels: 3, background: { r: 30, g: (40 + i * 7) % 255, b: (50 + i * 11) % 255 } },
      }).png().toBuffer();

      const pfFile: PreflightFile = {
        filename: asset.expectedFilename,
        buffer: buf,
      };
      files.push(pfFile);
      mapping.set(asset.slotId, pfFile);
    }

    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
      acknowledgeQualityWarnings: true,
    });

    expect(preflight.ok).toBe(false);
    // Standard-24 edition: 26 assets (2 cover + 24 interior), all below 150 PPI.
    expect(preflight.issues?.length).toBe(26);
    expect(preflight.issues?.every((i) => i.type === "LOW_PPI" || i.type === "IMAGE_RESOLUTION_TOO_LOW")).toBe(true);
  });

  // 4. Draft PDF succeeds and is visibly watermarked
  it("draft PDF HTML renders high-visibility DRAFT / NOT FOR PRINT watermark on every page", () => {
    const dummyPage: GeneratedPage = {
      index: 0,
      kind: "scene",
      role: "pilot",
      text: "Flying high in the sky!",
      image: Buffer.from("dummy-image-data"),
      imageMimeType: "image/png",
      failed: false,
    };

    const draftHtml = renderBookHtml([dummyPage], TEST_CHILD, { draft: true });
    expect(draftHtml).toContain('class="draft-overlay-watermark"');
    expect(draftHtml).toContain("DRAFT / NOT FOR PRINT");

    const prodHtml = renderBookHtml([dummyPage], TEST_CHILD, { draft: false });
    expect(prodHtml).not.toContain('<div class="draft-overlay-watermark"');
    expect(prodHtml).not.toContain("DRAFT / NOT FOR PRINT");
  });

  // 5. Production PDF succeeds with 3375x2475 artwork
  it("production preflight passes cleanly with 24 3375x2475 rasters (300 PPI) and zero quality warnings", async () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const files: PreflightFile[] = [];
    const mapping = new Map<string, PreflightFile>();

    for (let i = 0; i < plan.assets.length; i++) {
      const asset = plan.assets[i];
      // Distinct per-slot content — see the "classifies mixed 213/107 PPI" test above.
      const buf = await sharp({
        create: { width: 3375, height: 2475, channels: 3, background: { r: 100, g: (150 + i * 7) % 255, b: (200 + i * 11) % 255 } },
      }).png().toBuffer();

      const pfFile: PreflightFile = {
        filename: asset.expectedFilename,
        buffer: buf,
      };
      files.push(pfFile);
      mapping.set(asset.slotId, pfFile);
    }

    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files,
      mode: "standard-single",
      resolvedSlotMapping: mapping,
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.errors.length).toBe(0);
    expect(preflight.issues?.length).toBe(0);
    expect(preflight.qualityWarnings ?? []).toHaveLength(0);
  });

  // 6. Mock enhancement never passes production
  it("preflight strictly rejects mock enhancement even when approved", async () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
    });
    const singleSlot = plan.assets.find((s) => s.assetKind === "single-page")!;

    const buf = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();

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
      child: TEST_CHILD,
      draft: false,
      files: [{ filename: singleSlot.filename, buffer: buf, provenance: mockProvenance }],
    });

    expect(res.ok).toBe(false);
    const mockBlockIssue = res.issues?.find(
      (i) => i.type === "MOCKED_ENHANCEMENT_REJECTED" || i.type === "MOCK_ENHANCEMENT_PRODUCTION_BLOCKED"
    );
    expect(mockBlockIssue).toBeDefined();
    expect(res.errors.some((e) => e.includes("Mocked or test-double enhancement cannot satisfy production print quality gates"))).toBe(true);
  });

  // 7. Forged receipt is rejected
  it("cryptographically rejects altered or forged enhancement receipts", async () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const asset = plan.assets[0];
    const enhancedBuf = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();

    const genuineReceipt = signEnhancementReceipt({
      receiptId: "rcpt-1",
      slotId: asset.slotId,
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      originalSha256: "originalhash123",
      originalPixelDimensions: { width: 1200, height: 880 },
      enhancedSha256: crypto.createHash("sha256").update(enhancedBuf).digest("hex"),
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      trustedProviderId: "external-ai-super-res",
      providerClass: "real-ai",
      nativeEffectivePpi: 106.7,
      enhancedEffectivePpi: 300,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // Tamper with receipt
    const forgedReceipt = {
      ...genuineReceipt,
      payload: {
        ...genuineReceipt.payload,
        slotId: "other-slot-tampered",
      },
    };

    const pfFile: PreflightFile = {
      filename: asset.expectedFilename,
      buffer: enhancedBuf,
      provenance: {
        originalSha256: crypto.createHash("sha256").update(Buffer.from("orig")).digest("hex"),
        originalPixelDimensions: { width: 1200, height: 880 },
        nativeEffectivePpi: 106.7,
        outputGridPpi: 300,
        upscaleFactor: 2.81,
        enhancementMethod: "external-ai-super-res",
        enhancementStatus: "approved",
        approvedAt: new Date().toISOString(),
        approvalRequired: true,
      },
      receipt: forgedReceipt,
    };

    const preflight = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files: [pfFile],
      mode: "standard-single",
      resolvedSlotMapping: new Map([[asset.slotId, pfFile]]),
    });

    const receiptIssue = preflight.issues?.find((i) => i.type === "INVALID_ENHANCEMENT_RECEIPT");
    expect(receiptIssue).toBeDefined();
    expect(preflight.ok).toBe(false);
  });

  // 8. Classic single and spread PPI geometry
  it("computes physical geometry as exactly 11.25x8.25 for single and 22.25x8.25 for continuous spread", () => {
    const singleDims = { width: 3375, height: 2475 };
    const singlePhys = computeAuthoritativePhysicalDimensionsIn(singleDims, 300);
    expect(singlePhys.width).toBeCloseTo(11.25, 4);
    expect(singlePhys.height).toBeCloseTo(8.25, 4);

    const spreadDims = { width: 6675, height: 2475 };
    const spreadPhys = computeAuthoritativePhysicalDimensionsIn(spreadDims, 300);
    expect(spreadPhys.width).toBeCloseTo(22.25, 4);
    expect(spreadPhys.height).toBeCloseTo(8.25, 4);
    expect(spreadPhys.width).not.toBeCloseTo(22.5, 2);
  });

  // 9. Semantic validator returns NOT_CHECKED without vision provider
  it("semantic validation returns NOT_CHECKED with confidence 0 when no vision provider is configured", async () => {
    const dummyBuf = Buffer.from("arbitrary image content");
    const result = await validateStoryMatch({
      slotId: "slot-03",
      filename: "03-pilot.png",
      expectedRole: "pilot",
      roleSlug: "pilot",
      storyText: "Flying high among the clouds.",
      assembledScenePrompt: "A cheerful pilot waving from a cockpit.",
      imageBuffer: dummyBuf,
      mimeType: "image/png",
      visionProvider: null,
    });

    expect(result.status).toBe("NOT_CHECKED");
    expect(result.confidence).toBe(0);
    expect(result.status).not.toBe("MATCH");
  });

  // 10. Exact cover + Page 1–24 mapping in Dream Big's standard-24 edition
  it("maps the separate front cover, Page 1 greeting through Page 24 video-QR, and the separate back cover authoritatively", () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    // Standard-24 edition: cover-front + 24 interior + cover-back = 26 assets,
    // the cover never assigned an interior page number.
    expect(plan.assets.length).toBe(26);
    expect(plan.assets[0].expectedFilename).toBe("cover-front.png");
    expect(plan.assets[1].expectedFilename).toBe("01-greeting.png");
    expect(plan.assets[2].expectedFilename).toBe("02-intro.png");
    expect(plan.assets[3].expectedFilename).toBe("03-scene-01.png");
    expect(plan.assets[22].expectedFilename).toBe("22-scene-20.png");
    expect(plan.assets[23].expectedFilename).toBe("23-closing.png");
    expect(plan.assets[24].expectedFilename).toBe("24-video-qr-background.png");
    expect(plan.assets[25].expectedFilename).toBe("cover-back.png");
  });
});
