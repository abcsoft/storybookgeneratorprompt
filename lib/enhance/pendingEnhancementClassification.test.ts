/**
 * Regression coverage for a confirmed production defect: a genuine, pending
 * (not-yet-approved) Real-ESRGAN enhancement was classified as
 * ENHANCEMENT_APPROVAL_REQUIRED when its source landed in the below-150-PPI
 * bracket, but as QUALITY_WARNING_UNACKNOWLEDGED when its source landed in
 * the 150-299 PPI bracket — the SAME underlying "pending approval" state
 * reported as two different, contradictory issue codes depending on native
 * PPI, even though every asset card correctly showed "Status: pending" for
 * all of them. Root cause: lib/print/preflight.ts's 150-299 PPI branch had
 * no `isGenuineAiEnhanced && !isApproved` case at all (unlike the <150
 * branch, which already had one) — see the fix in that file for the exact
 * missing branch.
 *
 * Repro matches the task's confirmed evidence exactly: 26 source files at
 * 2400×1760 px on an 11.25×8.25in canvas (2400/11.25 ≈ 213.3 native PPI,
 * 1760/8.25 ≈ 213.3 — squarely in the 150-299 bracket), all genuinely
 * Real-ESRGAN-enhanced to 3375×2475, none yet visually approved.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import crypto from "node:crypto";
import { runPreflight, type PreflightFile } from "../print/preflight";
import { resolveLayoutPlan } from "../story/layoutPlan";
import { signEnhancementReceipt } from "./receipt";
import type { ChildProfile } from "../story/types";
import type { ImageProvenanceMetadata } from "./types";

const TEST_CHILD: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };

async function buildPendingEnhancedFile(
  slotId: string,
  expectedFilename: string,
  destinationDimensions: { width: number; height: number },
): Promise<PreflightFile> {
  const originalBuf = await sharp({
    create: { width: 2400, height: 1760, channels: 3, background: { r: 80, g: 120, b: 180 } },
  })
    .png()
    .toBuffer();
  const enhancedBuf = await sharp({
    create: { width: destinationDimensions.width, height: destinationDimensions.height, channels: 3, background: { r: 90, g: 130, b: 190 } },
  })
    .png()
    .toBuffer();

  const originalSha256 = crypto.createHash("sha256").update(originalBuf).digest("hex");
  const enhancedSha256 = crypto.createHash("sha256").update(enhancedBuf).digest("hex");

  const receipt = signEnhancementReceipt({
    receiptVersion: "1.0",
    receiptId: `rcpt-${slotId}`,
    slotId,
    bookId: "dream-big",
    profileId: "classic-landscape-11x8",
    layoutMode: "standard-single",
    originalSha256,
    originalPixelDimensions: { width: 2400, height: 1760 },
    enhancedSha256,
    enhancedPixelDimensions: destinationDimensions,
    destinationDimensions,
    trustedProviderId: "local-realesrgan",
    providerClass: "local-ai",
    enhancementMethod: "local-realesrgan",
    nativeEffectivePpi: 213.3,
    enhancedEffectivePpi: 300,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  const provenance: ImageProvenanceMetadata = {
    originalSha256,
    originalPixelDimensions: { width: 2400, height: 1760 },
    nativeEffectivePpi: 213.3,
    outputGridPpi: 300,
    upscaleFactor: destinationDimensions.width / 2400,
    enhancementMethod: "local-realesrgan",
    enhancementStatus: "pending", // NOT approved yet — this is the exact reported UI state
    approvalRequired: true,
  };

  return {
    filename: expectedFilename,
    buffer: enhancedBuf,
    provenance,
    receipt,
  };
}

describe("Pending genuine enhancement classifies identically across every PPI bracket", () => {
  it("26 pending, genuinely-enhanced 2400x1760-source assets all get ENHANCEMENT_APPROVAL_REQUIRED — never QUALITY_WARNING_UNACKNOWLEDGED", async () => {
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });
    expect(plan.assets.length).toBe(26);

    const files: PreflightFile[] = [];
    const mapping = new Map<string, PreflightFile>();
    for (const asset of plan.assets) {
      const pfFile = await buildPendingEnhancedFile(asset.slotId, asset.expectedFilename, asset.destinationDimensions);
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

    const approvalRequired = preflight.issues?.filter((i) => i.type === "ENHANCEMENT_APPROVAL_REQUIRED") ?? [];
    const qualityWarnings = preflight.issues?.filter((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED") ?? [];

    expect(qualityWarnings.length, "no pending genuine enhancement should ever be classified as a plain quality warning").toBe(0);
    expect(approvalRequired.length).toBe(26);
    expect(preflight.ok).toBe(false); // still blocked — approval hasn't happened yet
  });

  it("once each of the 26 is genuinely approved (valid server-signed approval record), all 26 pass the enhancement gate with zero ENHANCEMENT_APPROVAL_REQUIRED and zero QUALITY_WARNING_UNACKNOWLEDGED", async () => {
    const { signVisualApprovalRecord } = await import("./receipt");
    const plan = resolveLayoutPlan({
      child: TEST_CHILD,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const files: PreflightFile[] = [];
    const mapping = new Map<string, PreflightFile>();
    for (const asset of plan.assets) {
      const pfFile = await buildPendingEnhancedFile(asset.slotId, asset.expectedFilename, asset.destinationDimensions);
      const enhancedSha256 = crypto.createHash("sha256").update(pfFile.buffer).digest("hex");
      const approvalRecord = signVisualApprovalRecord({
        approvalId: `appr-${asset.slotId}`,
        slotId: asset.slotId,
        bookId: "dream-big",
        profileId: "classic-landscape-11x8",
        layoutMode: "standard-single",
        enhancedSha256,
        destinationDimensions: asset.destinationDimensions,
        action: "approve",
        approvedAt: new Date().toISOString(),
      });
      pfFile.provenance = { ...pfFile.provenance!, enhancementStatus: "approved", approvedAt: new Date().toISOString(), approvalRecord };
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

    const approvalRequired = preflight.issues?.filter((i) => i.type === "ENHANCEMENT_APPROVAL_REQUIRED") ?? [];
    const qualityWarnings = preflight.issues?.filter((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED") ?? [];
    expect(approvalRequired.length).toBe(0);
    expect(qualityWarnings.length).toBe(0);
  });
});
