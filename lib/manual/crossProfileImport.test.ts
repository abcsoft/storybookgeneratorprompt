import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveLayoutPlan, type CustomSpreadSelection } from "../story/layoutPlan";
import { buildManifest } from "./manifest";
import { matchImportedFiles } from "./importMatch";
import { getPrintProfile } from "../print/registry";
import type { ChildProfile } from "../story/types";

const alex: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("Cross-Profile Import & Authoritative Slot Integrity", () => {
  // 1. Dream Big + Classic Landscape + Standard Single
  it("1. Dream Big + Classic Landscape + Standard Single: UI and API slot IDs match and use 3375x2475", () => {
    const plan = resolveLayoutPlan({
      child: alex,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });
    const manifest = buildManifest(alex, "dream-big", "classic-landscape-11x8", "standard-single");

    expect(manifest.length).toBe(24);
    expect(plan.assets.length).toBe(24);

    for (let i = 0; i < 24; i++) {
      expect(manifest[i].slotId).toBe(plan.assets[i].slotId);
      expect(manifest[i].expectedFilename).toBe(plan.assets[i].expectedFilename);
      expect(plan.assets[i].destinationDimensions).toEqual({ width: 3375, height: 2475 });
      expect(plan.assets[i].layout).toBe("single-page");
      expect(manifest[i].spread).toBe(false);
    }
  });

  // 2. Dream Big + Classic Landscape + Custom Spreads
  it("2. Dream Big + Classic Landscape + Custom Spreads: spreads remain spreads", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 20, endPage: 21, textSide: "left", subjectSide: "right" },
    ];
    const plan = resolveLayoutPlan({
      child: alex,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads,
    });
    const manifest = buildManifest(alex, "dream-big", "classic-landscape-11x8", "custom-spreads", customSpreads);

    expect(manifest.length).toBe(plan.assets.length);

    // Find the spread asset
    const spreadAsset = plan.assets.find((a) => a.assetKind === "spread");
    expect(spreadAsset).toBeDefined();
    expect(spreadAsset?.physicalPages).toEqual([20, 21]);

    const spreadManifest = manifest.find((m) => m.spread === true);
    expect(spreadManifest).toBeDefined();
    expect(spreadManifest?.slotId).toBe(spreadAsset?.slotId);
  });

  // 3. Dream Big + Printify Square
  it("3. Dream Big + Printify Square: retains square dimensions (2400x2400) with no 11x8 leakage", () => {
    const profile = getPrintProfile("printify-square-8x8");
    const plan = resolveLayoutPlan({
      child: alex,
      bookId: "dream-big",
      profileId: profile.id,
      mode: "standard-single",
    });
    const manifest = buildManifest(alex, "dream-big", profile.id, "standard-single");

    expect(plan.assets.length).toBe(24);
    for (const slot of plan.assets) {
      if (slot.pageKind === "cover") {
        expect(slot.destinationDimensions).toEqual({ width: 5370, height: 2850 });
      } else {
        expect(slot.destinationDimensions).toEqual({ width: 2400, height: 2400 });
        expect(slot.targetCanvasAspect).toBe("1:1");
      }
      // Verify no Classic 11x8 canvas dimensions leaked
      expect(slot.destinationDimensions.width).not.toBe(3375);
      expect(slot.destinationDimensions.height).not.toBe(2475);
    }

    for (let i = 0; i < 24; i++) {
      expect(manifest[i].slotId).toBe(plan.assets[i].slotId);
    }
  });

  // 4. Dream Big + Lulu Landscape
  it("4. Dream Big + Lulu Landscape: keeps Lulu dimensions (3375x2625) without Classic 11x8 leakage", () => {
    const profile = getPrintProfile("lulu-landscape-11x8.5");
    const plan = resolveLayoutPlan({
      child: alex,
      bookId: "dream-big",
      profileId: profile.id,
      mode: "standard-single",
    });
    const manifest = buildManifest(alex, "dream-big", profile.id, "standard-single");

    expect(plan.assets.length).toBe(24);
    for (const slot of plan.assets) {
      expect(slot.destinationDimensions).toEqual({ width: 3375, height: 2625 });
      expect(slot.printDimensionsIn.trimHeightIn).toBe(8.5);
      // Verify no Classic 11x8 canvas dimensions leaked
      expect(slot.destinationDimensions.height).not.toBe(2475);
    }

    for (let i = 0; i < 24; i++) {
      expect(manifest[i].slotId).toBe(plan.assets[i].slotId);
    }
  });

  // 5. Dream Big + Lulu Square
  it("5. Dream Big + Lulu Square: keeps Lulu square dimensions (2625x2625) without Classic 11x8 leakage", () => {
    const profile = getPrintProfile("lulu-square-8.5x8.5");
    const plan = resolveLayoutPlan({
      child: alex,
      bookId: "dream-big",
      profileId: profile.id,
      mode: "standard-single",
    });
    const manifest = buildManifest(alex, "dream-big", profile.id, "standard-single");

    expect(plan.assets.length).toBe(24);
    for (const slot of plan.assets) {
      expect(slot.destinationDimensions).toEqual({ width: 2625, height: 2625 });
      expect(slot.printDimensionsIn.trimWidthIn).toBe(8.5);
      expect(slot.printDimensionsIn.trimHeightIn).toBe(8.5);
      // Verify no Classic 11x8 canvas dimensions leaked
      expect(slot.destinationDimensions.width).not.toBe(3375);
      expect(slot.destinationDimensions.height).not.toBe(2475);
    }

    for (let i = 0; i < 24; i++) {
      expect(manifest[i].slotId).toBe(plan.assets[i].slotId);
    }
  });

  // 6. Starlit Dream + Standard Single
  it("6. Starlit Dream + Standard Single: UI and API match without Dream Big roles", () => {
    const plan = resolveLayoutPlan({
      child: alex,
      bookId: "starlit-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });
    const manifest = buildManifest(alex, "starlit-dream", "classic-landscape-11x8", "standard-single");

    expect(plan.assets.length).toBe(manifest.length);
    for (let i = 0; i < plan.assets.length; i++) {
      expect(manifest[i].slotId).toBe(plan.assets[i].slotId);
      // Starlit Dream does not have Dream Big career roles like "pilot" or "firefighter"
      expect(plan.assets[i].slotId).not.toContain("pilot");
      expect(plan.assets[i].slotId).not.toContain("firefighter");
    }
  });

  // 7. Starlit Dream + Custom Spreads
  it("7. Starlit Dream + Custom Spreads: preserves spread layout and dimensions", () => {
    const customSpreads: CustomSpreadSelection[] = [
      { startPage: 4, endPage: 5, textSide: "left", subjectSide: "right" },
    ];
    const plan = resolveLayoutPlan({
      child: alex,
      bookId: "starlit-dream",
      profileId: "classic-landscape-11x8",
      mode: "custom-spreads",
      customSpreads,
    });
    const manifest = buildManifest(alex, "starlit-dream", "classic-landscape-11x8", "custom-spreads", customSpreads);

    const spreadAsset = plan.assets.find((s) => s.assetKind === "spread");
    expect(spreadAsset).toBeDefined();
    expect(spreadAsset?.physicalPages).toEqual([4, 5]);

    const spreadManifest = manifest.find((m) => m.spread === true);
    expect(spreadManifest).toBeDefined();
    expect(spreadManifest?.slotId).toBe(spreadAsset?.slotId);
  });

  // 8. Non-Dream-Big 24-slot fixture: 22 legacy files do NOT activate Dream Big recovery
  it("8. Non-Dream-Big 24-slot fixture: 22 files do NOT activate Dream Big recovery", () => {
    // 24-slot fixture for a non-Dream-Big story
    const basePlan = resolveLayoutPlan({
      child: alex,
      bookId: "dream-big",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });
    const nonDreamBigSlots = basePlan.assets.map((slot, i) => ({
      ...slot,
      slotId: `scene-${String(i + 1).padStart(2, "0")}`,
      expectedFilename: `${String(i + 1).padStart(2, "0")}.png`,
      legacyAliases: [],
      role: `adventure-${i + 1}`,
      roleSlug: `adventure-${i + 1}`,
    }));

    const files22 = Array.from({ length: 22 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`);

    const report = matchImportedFiles(files22, nonDreamBigSlots, {
      bookId: "great-adventure",
      confirmLegacyOffsetRecovery: false,
    });

    // Guarded legacy recovery must NOT be proposed for non-Dream-Big books!
    expect(report.legacyRecoveryProposal).toBeNull();
    expect(report.legacyRecoveryChoices).toBeUndefined();
    expect(report.legacyRecoveryApplied).toBeFalsy();

    // Standard matching assigns 01.png..22.png to the first 22 slots
    expect(report.assignedCount).toBe(22);
    expect(report.missingSlots.length).toBe(2); // 23 and 24 missing
    expect(report.missingSlots).toEqual(["scene-23", "scene-24"]);
  });

  // 9. Static Code Guard: No synthetic slot reconstruction exists in client or matcher code
  it("9. Static Code Guard: No 'as unknown as ResolvedAssetSlot[]' or getAuthoritativeResolvedSlots() exists", async () => {
    const manualFlowPath = path.join(process.cwd(), "app", "ManualFlow.tsx");
    const importMatchPath = path.join(process.cwd(), "lib", "manual", "importMatch.ts");

    const manualFlowContent = await fs.readFile(manualFlowPath, "utf8");
    const importMatchContent = await fs.readFile(importMatchPath, "utf8");

    expect(manualFlowContent).not.toContain("as unknown as ResolvedAssetSlot[]");
    expect(manualFlowContent).not.toContain("getAuthoritativeResolvedSlots()");
    expect(importMatchContent).not.toContain("as unknown as ResolvedAssetSlot[]");
    expect(importMatchContent).not.toContain('profileId: "classic-landscape-11x8"');
  });
});
