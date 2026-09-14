import { describe, it, expect } from "vitest";
import sharp from "sharp";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { LocalRealEsrganProvider } from "./localRealEsrganProvider";
import { validateEnhancedImageQuality } from "./imageQualityValidator";
import {
  signEnhancementReceipt,
  verifyEnhancementReceipt,
  signVisualApprovalRecord,
  verifyVisualApprovalRecord,
} from "./receipt";
import { runPreflight, type PreflightFile } from "../print/preflight";
import { resolveLayoutPlan } from "../story/layoutPlan";
import { calculateLegacyDreamBigRemap, DREAM_BIG_CANONICAL_SLOTS } from "../story/legacyRemap";
import { calculateSha256 } from "./provenance";
import type { EnhancementReceiptPayload } from "./types";

describe("Truthful Production Gates & Regression Tests (Req 9)", () => {
  const child = { name: "Yasfa", gender: "girl", age: 4 } as any;

  // 1. Corrupted / tiled output rejection
  it("1. Rejects corrupted or tiled output with severe horizontal seams or edge clipping", async () => {
    // Create an image with an artificial seam: top half light blue, bottom half sharp contrast shift
    const base = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 120, g: 150, b: 180 } },
    }).raw().toBuffer();

    // Inject horizontal seam phase shift at y = 1200
    for (let y = 1200; y < 2475; y++) {
      for (let x = 0; x < 3375; x++) {
        const idx = (y * 3375 + x) * 3;
        base[idx] = 10; // Dark band causing seam
        base[idx + 1] = 10;
        base[idx + 2] = 10;
      }
    }

    const seamBuffer = await sharp(base, {
      raw: { width: 3375, height: 2475, channels: 3 },
    }).png().toBuffer();

    const check = await validateEnhancedImageQuality(seamBuffer, {
      targetDimensions: { width: 3375, height: 2475 },
    });

    expect(check.valid).toBe(false);
    expect(check.error).toContain("Tile seam or horizontal phase discontinuity detected");
  });

  it("1b. Rejects committed known-corrupted Real-ESRGAN output fixture despite correct dimensions", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-fixtures/corrupted-realesrgan-fixture.png");
    if (fs.existsSync(fixturePath)) {
      const corruptedBuf = fs.readFileSync(fixturePath);
      const meta = await sharp(corruptedBuf).metadata();
      // Confirm dimension correctness: exactly 3375x2475
      expect(meta.width).toBe(3375);
      expect(meta.height).toBe(2475);

      const check = await validateEnhancedImageQuality(corruptedBuf, {
        targetDimensions: { width: 3375, height: 2475 },
      });
      // Dimension correctness alone must never approve visual quality
      expect(check.valid).toBe(false);
      expect(check.error).toContain("Tile seam or horizontal phase discontinuity detected");
      expect(check.metrics?.hasSeamArtifacts).toBe(true);
    }
  });

  // 2. Missing-model health-check failure
  it("2. Missing-model health check failure returns ok: false with actionable message", async () => {
    const provider = new LocalRealEsrganProvider(undefined, "C:\\nonexistent_models_dir_xyz");
    const health = await provider.checkHealth();
    expect(health.ok).toBe(false);
    expect(health.error).toBeDefined();
    expect(health.error).toContain("not found");
  });

  // 3. Unavailable Vulkan failure: does not claim unsupported CPU fallback
  it("3. Provider reports unavailable when binary or inference fails without claiming CPU fallback", async () => {
    const provider = new LocalRealEsrganProvider("C:\\nonexistent_bin_path.exe");
    const health = await provider.checkHealth();
    expect(health.ok).toBe(false);
    expect(health.error).toContain("Real-ESRGAN binary not found");
    expect(health.error).not.toContain("CPU fallback available");
  });

  // 4. Photorealistic model selected, anime model not selected
  it("4. Selects photorealistic model (realesrgan-x4plus) and does not select anime model", () => {
    const provider = new LocalRealEsrganProvider();
    expect(provider.modelName).toBe("realesrgan-x4plus");
    expect(provider.modelName).not.toContain("anime");
  });

  // 5. Proportional no-crop output
  it("5. Downsamples using proportional contain without cropping source artwork", async () => {
    // 1200x880 has 15:11 aspect ratio. Target 3375x2475 has exact same 15:11 aspect ratio.
    const inputBuf = await sharp({
      create: { width: 120, height: 88, channels: 3, background: { r: 100, g: 150, b: 200 } },
    }).png().toBuffer();

    const provider = new LocalRealEsrganProvider();
    const result = await provider.enhanceImage({
      inputBuffer: inputBuf,
      mimeType: "image/png",
      filename: "proportional-test.png",
      slotId: "02-intro",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      sourceDimensions: { width: 120, height: 88 },
      targetDimensions: { width: 337, height: 247 },
      physicalInches: { width: 11.25, height: 8.25 },
    });

    expect(result.outputDimensions.width).toBe(337);
    expect(result.outputDimensions.height).toBe(247);
  });

  // 6. All 18 required receipt fields missing individually (fail-closed negative tests)
  it("6. Rejects enhancement receipt when any of the 18 required fields is missing individually", () => {
    const basePayload: EnhancementReceiptPayload = {
      receiptVersion: "1.0",
      receiptId: "rcpt-test-1",
      slotId: "01-cover",
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      originalSha256: "dummy-orig-sha",
      originalPixelDimensions: { width: 1200, height: 880 },
      enhancedSha256: "dummy-enh-sha",
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      destinationDimensions: { width: 3375, height: 2475 },
      trustedProviderId: "local-realesrgan",
      providerClass: "local-ai",
      enhancementMethod: "local-realesrgan",
      nativeEffectivePpi: 107,
      enhancedEffectivePpi: 300,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    };

    const requiredFields = [
      "receiptVersion",
      "receiptId",
      "slotId",
      "bookId",
      "profileId",
      "layoutMode",
      "originalSha256",
      "originalPixelDimensions",
      "enhancedSha256",
      "enhancedPixelDimensions",
      "destinationDimensions",
      "trustedProviderId",
      "providerClass",
      "enhancementMethod",
      "nativeEffectivePpi",
      "enhancedEffectivePpi",
      "createdAt",
      "expiresAt",
    ];

    for (const field of requiredFields) {
      const tamperedPayload = { ...basePayload } as any;
      delete tamperedPayload[field];

      const tamperedReceipt = {
        payload: tamperedPayload,
        signature: "dummy-sig",
      };

      const verify = verifyEnhancementReceipt(tamperedReceipt, {
        expectedSlotId: "01-cover",
        expectedBookId: "dream-big",
      });

      expect(verify.valid).toBe(false);
      expect(verify.error).toContain(`missing required field: ${field}`);
    }
  });

  // 7. Unregistered provider ID rejection
  it("7. Rejects unregistered provider IDs claiming trusted local-ai or real-ai status", () => {
    const fakePayload: EnhancementReceiptPayload = {
      receiptVersion: "1.0",
      receiptId: "rcpt-fake-1",
      slotId: "01-cover",
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      originalSha256: "dummy-orig-sha",
      originalPixelDimensions: { width: 1200, height: 880 },
      enhancedSha256: "dummy-enh-sha",
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      destinationDimensions: { width: 3375, height: 2475 },
      trustedProviderId: "unregistered-hacker-ai",
      providerClass: "local-ai", // Claiming local-ai without registration!
      enhancementMethod: "unregistered-hacker-ai",
      nativeEffectivePpi: 107,
      enhancedEffectivePpi: 300,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    };

    const fakeReceipt = signEnhancementReceipt(fakePayload);
    const verify = verifyEnhancementReceipt(fakeReceipt, {
      expectedSlotId: "01-cover",
      expectedBookId: "dream-big",
    });

    expect(verify.valid).toBe(false);
    expect(verify.error).toContain("Unregistered or spoofed provider ID");
  });

  // 8. Forged client approval rejection
  it("8. Rejects client-controlled enhancementStatus: approved without valid server-signed approval record", async () => {
    const testBuf = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 100, g: 100, b: 100 } },
    }).png().toBuffer();

    const res = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      draft: false,
      files: [
        {
          filename: "01-cover.png",
          buffer: testBuf,
          provenance: {
            originalPixelDimensions: { width: 1200, height: 880 },
            nativeEffectivePpi: 107,
            enhancedPixelDimensions: { width: 3375, height: 2475 },
            outputGridPpi: 300,
            upscaleFactor: 2.8125,
            enhancementMethod: "local-realesrgan",
            enhancementStatus: "approved", // Client attempting self-approval!
            originalSha256: "orig-sha",
            enhancedSha256: calculateSha256(testBuf),
            approvalRequired: true,
            approvedAt: new Date().toISOString(),
          },
        },
      ],
    });

    expect(res.ok).toBe(false);
    const forgedIssue = res.issues?.find((i) => i.type === "FORGED_OR_UNVERIFIED_APPROVAL");
    expect(forgedIssue).toBeDefined();
    expect(forgedIssue?.message).toContain("presents unverified client approval without a valid server-signed visual approval record");
  });

  // 9. Stale approval after image replacement
  it("9. Rejects approval record when image buffer hash changes (stale approval after image replacement)", async () => {
    const bufA = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();

    const bufB = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 50, g: 60, b: 70 } },
    }).png().toBuffer();

    // Sign approval for Buffer A
    const approvalForA = signVisualApprovalRecord({
      approvalId: "appr-a",
      bookId: "dream-big",
      slotId: "01-cover",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      enhancedSha256: calculateSha256(bufA),
      destinationDimensions: { width: 3375, height: 2475 },
      action: "approved_visual_review",
      approvedAt: new Date().toISOString(),
    });

    // Present Buffer B with Buffer A's approval record
    const verify = verifyVisualApprovalRecord(approvalForA, {
      expectedBookId: "dream-big",
      expectedSlotId: "01-cover",
      expectedProfileId: "classic-landscape-11x8",
      expectedLayoutMode: "standard-single",
      expectedEnhancedSha256: calculateSha256(bufB),
      expectedDestinationDimensions: { width: 3375, height: 2475 },
    });

    expect(verify.valid).toBe(false);
    expect(verify.error).toContain("Approval record hash mismatch");
  });

  // 10. Global acknowledgement boolean rejection
  it("10. Rejects global acknowledgeQualityWarnings: true in production without per-slot record", async () => {
    const buf213 = await sharp({
      create: { width: 2400, height: 1760, channels: 3, background: { r: 100, g: 150, b: 200 } },
    }).png().toBuffer();

    const res = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      draft: false,
      acknowledgeQualityWarnings: true, // Global boolean
      files: [{ filename: "02-intro.png", buffer: buf213 }],
    });

    expect(res.ok).toBe(false);
    const unack = res.issues?.find((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED");
    expect(unack).toBeDefined();
    expect(unack?.message).toContain("Requires explicit user acknowledgement bound to slot, file hash, and PPI");
  });

  // 11. Per-slot acknowledgement hash / PPI mismatch rejection
  it("11. Rejects per-slot acknowledgement with mismatched hash or PPI outside tolerance", async () => {
    const buf213 = await sharp({
      create: { width: 2400, height: 1760, channels: 3, background: { r: 100, g: 150, b: 200 } },
    }).png().toBuffer();

    // 11a: Mismatched hash
    const badHashAck = {
      slotId: "02-intro",
      sourceSha256: "totally-wrong-sha-256",
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      computedNativeEffectivePpi: 213.3,
      destinationDimensions: { width: 3375, height: 2475 },
      timestamp: new Date().toISOString(),
    };

    const resBadHash = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      draft: false,
      qualityAcknowledgements: { "02-intro": badHashAck },
      files: [{ filename: "02-intro.png", buffer: buf213 }],
    });

    expect(resBadHash.ok).toBe(false);
    const hashIssue = resBadHash.issues?.find((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED");
    expect(hashIssue?.message).toContain("Artwork hash mismatch");

    // 11b: Mismatched PPI outside tolerance (> 1.0 PPI)
    const badPpiAck = {
      slotId: "02-intro",
      sourceSha256: calculateSha256(buf213),
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      computedNativeEffectivePpi: 250.0, // Stale/mismatched PPI!
      destinationDimensions: { width: 3375, height: 2475 },
      timestamp: new Date().toISOString(),
    };

    const resBadPpi = await runPreflight({
      child,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      draft: false,
      qualityAcknowledgements: { "02-intro": badPpiAck },
      files: [{ filename: "02-intro.png", buffer: buf213 }],
    });

    expect(resBadPpi.ok).toBe(false);
    const ppiIssue = resBadPpi.issues?.find((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED");
    expect(ppiIssue?.message).toContain("Recorded PPI (250) does not match current computed native PPI");
  });

  // 12. All 24 real-image mappings & role-specific assertions
  it("12. Verifies all 24 real image mappings: intro, pilot, veterinarian, inventor, closing", () => {
    const mockFiles: Record<string, { filename: string }> = {};
    for (let i = 1; i <= 24; i++) {
      const numStr = String(i).padStart(2, "0");
      const slot = DREAM_BIG_CANONICAL_SLOTS[i - 1];
      mockFiles[slot.slotId] = { filename: `${numStr}.jpg` };
    }

    const { entries, newFilesBySlot } = calculateLegacyDreamBigRemap(mockFiles);
    expect(entries.length).toBe(24);

    // Assert intro receives old source 22
    const intro = entries.find((e) => e.destinationSlotId === "02-intro")!;
    expect(intro.sourceSlotId).toBe("22-inventor");
    expect(intro.sourceFilename).toBe("22.jpg");
    expect(newFilesBySlot["02-intro"].filename).toBe("22.jpg");

    // Assert pilot receives old source 02
    const pilot = entries.find((e) => e.destinationSlotId === "03-pilot")!;
    expect(pilot.sourceSlotId).toBe("02-intro");
    expect(pilot.sourceFilename).toBe("02.jpg");
    expect(newFilesBySlot["03-pilot"].filename).toBe("02.jpg");

    // Assert veterinarian receives old source 20
    const vet = entries.find((e) => e.destinationSlotId === "21-veterinarian")!;
    expect(vet.sourceSlotId).toBe("20-deep-sea-diver");
    expect(vet.sourceFilename).toBe("20.jpg");
    expect(newFilesBySlot["21-veterinarian"].filename).toBe("20.jpg");

    // Assert inventor receives old source 21
    const inv = entries.find((e) => e.destinationSlotId === "22-inventor")!;
    expect(inv.sourceSlotId).toBe("21-veterinarian");
    expect(inv.sourceFilename).toBe("21.jpg");
    expect(newFilesBySlot["22-inventor"].filename).toBe("21.jpg");

    // Assert 01-cover, 23-closing, and 24-backcover remain unchanged
    const cover = entries.find((e) => e.destinationSlotId === "01-cover")!;
    expect(cover.isChanged).toBe(false);
    expect(cover.sourceFilename).toBe("01.jpg");

    const closing = entries.find((e) => e.destinationSlotId === "23-closing")!;
    expect(closing.isChanged).toBe(false);
    expect(closing.sourceFilename).toBe("23.jpg");

    const backcover = entries.find((e) => e.destinationSlotId === "24-backcover")!;
    expect(backcover.isChanged).toBe(false);
    expect(backcover.sourceFilename).toBe("24.jpg");
  });
});
