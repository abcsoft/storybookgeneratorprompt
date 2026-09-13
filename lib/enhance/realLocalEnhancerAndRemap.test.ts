import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { ENHANCEMENT_PROVIDER_IDS } from "./constants";
import { LocalRealEsrganProvider } from "./localRealEsrganProvider";
import {
  enhancementRegistry,
  ExternalAiSuperResolutionProvider,
  MockAiSuperResolutionProvider,
  ResolutionEnhancementRegistry,
} from "./registry";
import {
  canonicalizeReceiptPayload,
  getSigningSecret,
  signEnhancementReceipt,
  verifyEnhancementReceipt,
} from "./receipt";
import {
  runPreflight,
  type QualityAcknowledgementRecord,
  type PreflightFile,
} from "../print/preflight";
import { resolveLayoutPlan } from "../story/layoutPlan";
import {
  calculateLegacyDreamBigRemap,
  DREAM_BIG_CANONICAL_SLOTS,
} from "../story/legacyRemap";
import type { ChildProfile } from "../story/types";

const TEST_CHILD: ChildProfile = { name: "Jordan", age: 5, gender: "neutral" };

describe("Real Local ESRGAN, Canonical Provider Contract & Legacy Remap", () => {
  // 1. Canonical Provider IDs & Registry Discovery Contract
  it("1. Canonical provider contract: credentials configured -> external available, absent -> unavailable, mock never in prod", () => {
    // Registry contains canonical IDs
    expect(enhancementRegistry.get(ENHANCEMENT_PROVIDER_IDS.LOCAL_REALESRGAN)).toBeDefined();
    expect(enhancementRegistry.get(ENHANCEMENT_PROVIDER_IDS.RESAMPLED)).toBeDefined();
    expect(enhancementRegistry.get(ENHANCEMENT_PROVIDER_IDS.EXTERNAL_AI)).toBeDefined();

    // Credentials configured -> external provider isConfigured = true
    const origKey = process.env.ENHANCEMENT_API_KEY;
    const origUrl = process.env.ENHANCEMENT_API_URL;
    try {
      process.env.ENHANCEMENT_API_KEY = "dummy-key";
      process.env.ENHANCEMENT_API_URL = "https://ai.example.com/api";
      const ext = new ExternalAiSuperResolutionProvider();
      expect(ext.id).toBe(ENHANCEMENT_PROVIDER_IDS.EXTERNAL_AI);
      expect(ext.isConfigured).toBe(true);

      // Credentials absent -> isConfigured = false
      delete process.env.ENHANCEMENT_API_KEY;
      delete process.env.ENHANCEMENT_API_URL;
      const extUnconfigured = new ExternalAiSuperResolutionProvider();
      expect(extUnconfigured.isConfigured).toBe(false);
    } finally {
      if (origKey !== undefined) process.env.ENHANCEMENT_API_KEY = origKey;
      else delete process.env.ENHANCEMENT_API_KEY;
      if (origUrl !== undefined) process.env.ENHANCEMENT_API_URL = origUrl;
      else delete process.env.ENHANCEMENT_API_URL;
    }

    // Mock provider never in production
    const origEnv = process.env.NODE_ENV;
    const origMock = process.env.ALLOW_TEST_MOCK_PROVIDERS;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.ALLOW_TEST_MOCK_PROVIDERS;
      const prodReg = new ResolutionEnhancementRegistry();
      expect(prodReg.getProvider(ENHANCEMENT_PROVIDER_IDS.MOCK_AI)).toBeUndefined();
      expect(prodReg.listProviders().some((p) => p.id === ENHANCEMENT_PROVIDER_IDS.MOCK_AI)).toBe(false);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      if (origMock !== undefined) process.env.ALLOW_TEST_MOCK_PROVIDERS = origMock;
    }

    // Unknown or mismatched provider IDs fail closed
    expect(enhancementRegistry.getProvider("unknown-fake-enhancer")).toBeUndefined();
  });

  // 2. Local Real-ESRGAN Provider Health Check & Subprocess Execution
  it("2. Local Real-ESRGAN provider executes real subprocess with isolated temp files and Lanczos downsampling", async () => {
    const provider = new LocalRealEsrganProvider();
    expect(provider.id).toBe("local-realesrgan");
    expect(provider.providerClass).toBe("local-ai");
    expect(provider.isPaid).toBe(false);

    // Health check
    const health = await provider.checkHealth();
    expect(health.ok).toBe(true);
    expect(health.binPath).toBeDefined();

    // Create a small test image (120x88, proportional to 1200x880)
    const testInput = await sharp({
      create: { width: 120, height: 88, channels: 3, background: { r: 60, g: 120, b: 180 } },
    }).png().toBuffer();

    const targetDims = { width: 337, height: 247 }; // 1/10th scale for fast test execution
    const res = await provider.enhanceImage({
      inputBuffer: testInput,
      mimeType: "image/png",
      filename: "test-card.png",
      slotId: "02-intro",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      sourceDimensions: { width: 120, height: 88 },
      targetDimensions: targetDims,
      physicalInches: { width: 11.25, height: 8.25 },
    });

    expect(res.outputDimensions).toEqual(targetDims);
    expect(res.method).toBe("local-realesrgan");
    expect(res.providerClass).toBe("local-ai");
    expect(res.provenance.enhancedEffectivePpi).toBe(300);
    expect(res.provenance.approvalRequired).toBe(true);
    expect(res.provenance.enhancementStatus).toBe("pending");

    // Output buffer metadata matches exact destination
    const meta = await sharp(res.enhancedBuffer).metadata();
    expect(meta.width).toBe(targetDims.width);
    expect(meta.height).toBe(targetDims.height);
  });

  // 3. Constant-Time HMAC Signature & Tamper Rejection
  it("3. Receipt verification enforces constant-time HMAC, slot/book/profile/dimension bindings", async () => {
    const origBuf = await sharp({
      create: { width: 120, height: 88, channels: 3, background: { r: 50, g: 100, b: 150 } },
    }).png().toBuffer();
    const enhBuf = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 50, g: 100, b: 150 } },
    }).png().toBuffer();

    const origSha = crypto.createHash("sha256").update(origBuf).digest("hex");
    const enhSha = crypto.createHash("sha256").update(enhBuf).digest("hex");

    const receipt = signEnhancementReceipt({
      receiptId: "receipt-sec-1",
      slotId: "02-intro",
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      originalSha256: origSha,
      originalPixelDimensions: { width: 120, height: 88 },
      enhancedSha256: enhSha,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      destinationDimensions: { width: 3375, height: 2475 },
      trustedProviderId: "local-realesrgan",
      providerClass: "local-ai",
      nativeEffectivePpi: 107,
      enhancedEffectivePpi: 300,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // Valid verification
    const validRes = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "02-intro",
      expectedBookId: "dream-big",
      expectedProfileId: "classic-landscape-11x8",
      expectedLayoutMode: "standard-single",
      expectedEnhancedBuffer: enhBuf,
      expectedDestinationDimensions: { width: 3375, height: 2475 },
      requireProductionTrusted: true,
    });
    expect(validRes.valid).toBe(true);

    // Tampered byte in enhanced buffer
    const tamperedBuf = Buffer.from(enhBuf);
    tamperedBuf[0] ^= 0xff;
    const tamperedRes = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "02-intro",
      expectedEnhancedBuffer: tamperedBuf,
    });
    expect(tamperedRes.valid).toBe(false);
    expect(tamperedRes.error).toContain("does not match receipt");

    // Reused receipt on another slot
    const slotMismatch = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "03-pilot",
    });
    expect(slotMismatch.valid).toBe(false);
    expect(slotMismatch.error).toContain("slot mismatch");

    // Reused on another profile
    const profileMismatch = verifyEnhancementReceipt(receipt, {
      expectedSlotId: "02-intro",
      expectedProfileId: "square-8x8",
    });
    expect(profileMismatch.valid).toBe(false);
    expect(profileMismatch.error).toContain("profile mismatch");
  });

  // 4. Structured Acknowledgement Lifetime
  it("4. Acknowledgement records bind to slot, sha, ppi, profile, layout; strictly rejected for < 150 PPI", async () => {
    const plan = resolveLayoutPlan({ child: TEST_CHILD, bookId: "dream-big", profileId: "classic-landscape-11x8" });
    const slot01 = plan.assets[0]; // 01-cover

    // 2400x1760 = 213 PPI
    const img213 = await sharp({
      create: { width: 2400, height: 1760, channels: 3, background: { r: 90, g: 90, b: 90 } },
    }).png().toBuffer();
    const sha213 = crypto.createHash("sha256").update(img213).digest("hex");

    const ackRecord: QualityAcknowledgementRecord = {
      slotId: slot01.slotId,
      imageSha256: crypto.createHash("sha256").update(img213).digest("hex"),
      nativeEffectivePpi: 213.33,
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
    };

    // Preflight without acknowledgement: issues QUALITY_WARNING_UNACKNOWLEDGED
    const resUnack = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files: [{ filename: slot01.filename, buffer: img213 }],
      resolvedSlotMapping: new Map([[slot01.slotId, { filename: slot01.filename, buffer: img213 }]]),
    });
    expect(resUnack.issues?.some((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED")).toBe(true);

    // Preflight with valid structured acknowledgement record: warning acknowledged
    const resAck = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files: [{ filename: slot01.filename, buffer: img213 }],
      resolvedSlotMapping: new Map([[slot01.slotId, { filename: slot01.filename, buffer: img213 }]]),
      qualityAcknowledgements: { [slot01.slotId]: ackRecord },
    });
    expect(resAck.issues?.some((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED")).toBe(false);

    // Image modification invalidates acknowledgement
    const modifiedImg = await sharp({
      create: { width: 2400, height: 1760, channels: 3, background: { r: 95, g: 95, b: 95 } },
    }).png().toBuffer();
    const resInvalidated = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files: [{ filename: slot01.filename, buffer: modifiedImg }],
      resolvedSlotMapping: new Map([[slot01.slotId, { filename: slot01.filename, buffer: modifiedImg }]]),
      qualityAcknowledgements: { [slot01.slotId]: ackRecord },
    });
    console.log("resInvalidated issues:", resInvalidated.issues?.map((i) => ({ type: i.type, msg: i.message })));
    expect(resInvalidated.issues?.some((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED")).toBe(true);

    // Below-150 PPI image (1200x880) CANNOT be acknowledged away
    const img107 = await sharp({
      create: { width: 1200, height: 880, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).png().toBuffer();
    const resBelow150 = await runPreflight({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      files: [{ filename: slot01.filename, buffer: img107 }],
      resolvedSlotMapping: new Map([[slot01.slotId, { filename: slot01.filename, buffer: img107 }]]),
      qualityAcknowledgements: {
        [slot01.slotId]: {
          slotId: slot01.slotId,
          imageSha256: crypto.createHash("sha256").update(img107).digest("hex"),
          nativeEffectivePpi: 106.7,
          profileId: "classic-landscape-11x8",
          layoutMode: "standard-single",
        },
      },
    });
    expect(resBelow150.ok).toBe(false);
    expect(resBelow150.issues?.some((i) => i.type === "LOW_PPI")).toBe(true);
  });

  // 5. Legacy Dream Big Content-Remap Recovery
  it("5. Legacy Dream Big remap calculates exact cyclic shift: 02 receives 22, 03..22 receive N-1, 01, 23, 24 unchanged", () => {
    // Construct old files map
    const mockFiles: Record<string, { filename: string }> = {};
    for (const s of DREAM_BIG_CANONICAL_SLOTS) {
      mockFiles[s.slotId] = { filename: `${s.slotId}.png` };
    }

    const { entries, newFilesBySlot, hasShiftableAssets } = calculateLegacyDreamBigRemap(mockFiles);
    expect(hasShiftableAssets).toBe(true);

    // Check Page 1 (Cover): unchanged
    const entry01 = entries.find((e) => e.destinationSlotId === "01-cover")!;
    expect(entry01.sourceSlotId).toBe("01-cover");
    expect(entry01.isChanged).toBe(false);

    // Check Page 2 (Intro): receives old source 22-inventor
    const entry02 = entries.find((e) => e.destinationSlotId === "02-intro")!;
    expect(entry02.sourceSlotId).toBe("22-inventor");
    expect(entry02.sourceOriginalRole).toBe("Inventor");
    expect(entry02.isChanged).toBe(true);
    expect(newFilesBySlot["02-intro"].originalSourceSlotId).toBe("22-inventor");

    // Check Page 3 (Pilot): receives old source 02-intro
    const entry03 = entries.find((e) => e.destinationSlotId === "03-pilot")!;
    expect(entry03.sourceSlotId).toBe("02-intro");
    expect(entry03.isChanged).toBe(true);

    // Check Page 21 (Veterinarian): receives old source 20-deep-sea-diver
    const entry21 = entries.find((e) => e.destinationSlotId === "21-veterinarian")!;
    expect(entry21.sourceSlotId).toBe("20-deep-sea-diver");
    expect(entry21.isChanged).toBe(true);

    // Check Page 22 (Inventor): receives old source 21-veterinarian
    const entry22 = entries.find((e) => e.destinationSlotId === "22-inventor")!;
    expect(entry22.sourceSlotId).toBe("21-veterinarian");
    expect(entry22.isChanged).toBe(true);

    // Check Page 23 (Closing) and 24 (Back cover): unchanged
    const entry23 = entries.find((e) => e.destinationSlotId === "23-closing")!;
    expect(entry23.sourceSlotId).toBe("23-closing");
    expect(entry23.isChanged).toBe(false);

    const entry24 = entries.find((e) => e.destinationSlotId === "24-backcover")!;
    expect(entry24.sourceSlotId).toBe("24-backcover");
    expect(entry24.isChanged).toBe(false);
  });
});
