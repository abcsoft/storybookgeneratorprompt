/**
 * Legacy Import API Audit: Verifies that the /api/assemble route uses
 * authoritative import resolution through matchImportedFiles() and properly
 * handles ambiguous 22-file Dream Big packages.
 *
 * Tests use role-labelled images (not identical gray files) so mismatched
 * slot assignments are semantically detectable.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import crypto from "crypto";
import { POST as assemblePost } from "../../app/api/assemble/route";
import { matchImportedFiles } from "./importMatch";
import { resolveLayoutPlan } from "../story/layoutPlan";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "TestChild", age: 5, gender: "boy" };

/** 22 hardcoded role labels — independently defined, NOT derived from the production mapping. */
const LEGACY_22_ROLES = [
  "PILOT",
  "RACER",
  "ASTRONAUT",
  "DOCTOR",
  "FIREFIGHTER",
  "SCIENTIST",
  "ARMY_OFFICER",
  "SOCCER_PLAYER",
  "KARATE_MASTER",
  "DETECTIVE",
  "MAGICIAN",
  "CHEF",
  "ROCKSTAR",
  "ARTIST",
  "TEACHER",
  "EXPLORER",
  "PHOTOGRAPHER",
  "DIVER",
  "VETERINARIAN",
  "INVENTOR",
  "CLOSING",
  "BACKCOVER",
];

async function makeRoleLabelledImage(role: string, index: number): Promise<Buffer> {
  const label = `${String(index + 1).padStart(2, "0")}-${role}`;
  // Create a visually distinct image with role text burned in.
  // Different hue per role so mismatches are visually obvious.
  const hue = Math.round((index / 22) * 360);
  const r = Math.round(128 + 127 * Math.sin((hue * Math.PI) / 180));
  const g = Math.round(128 + 127 * Math.sin(((hue + 120) * Math.PI) / 180));
  const b = Math.round(128 + 127 * Math.sin(((hue + 240) * Math.PI) / 180));

  // Create base image with role-colored background
  const svgOverlay = `<svg width="3375" height="2475">
    <rect width="100%" height="100%" fill="rgb(${r},${g},${b})" />
    <text x="50%" y="40%" font-size="120" fill="white" text-anchor="middle" font-family="sans-serif" font-weight="bold">${label}</text>
    <text x="50%" y="60%" font-size="80" fill="white" text-anchor="middle" font-family="sans-serif">ROLE: ${role}</text>
  </svg>`;

  return sharp(Buffer.from(svgOverlay))
    .png()
    .toBuffer();
}

/** `seed` varies pixel content — real artwork is never byte-identical
 *  across slots, and the duplicate-artwork-across-slots gate now correctly
 *  flags it if it is. */
async function makeHighResImage(width = 3375, height = 2475, seed = 0): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: (150 + seed * 7) % 255, b: (200 + seed * 11) % 255 } },
  })
    .png()
    .toBuffer();
}

describe("Legacy 22-file Import API Audit", () => {
  const dreamBigSlots = resolveLayoutPlan({
    child,
    bookId: "dream-big",
    profileId: "classic-landscape-11x8",
    mode: "standard-single",
  }).assets;

  // ──────────────────────────────────────────────────
  // Test 1: 22 plain-numbered files trigger HTTP 409 with two choices
  // ──────────────────────────────────────────────────
  it("1. 22 legacy files trigger LEGACY_MAPPING_CONFIRMATION_REQUIRED (HTTP 409) with both choices", async () => {
    const formData = new FormData();
    formData.append("name", child.name);
    formData.append("age", String(child.age));
    formData.append("gender", child.gender);
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");

    for (let i = 0; i < 22; i++) {
      const buf = await makeRoleLabelledImage(LEGACY_22_ROLES[i], i);
      const filename = `${String(i + 1).padStart(2, "0")}.png`;
      formData.append("images", new File([new Uint8Array(buf)], filename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });
    const res = await assemblePost(req);

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("LEGACY_MAPPING_CONFIRMATION_REQUIRED");
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBe(2);

    // Verify SHIFT_PLUS_TWO choice ("files are Pilot through Back Cover" —
    // cover-front, greeting, intro, and video-qr have no legacy equivalent
    // among these 22 files and remain missing)
    const shiftChoice = data.choices.find((c: any) => c.interpretation === "SHIFT_PLUS_TWO");
    expect(shiftChoice).toBeDefined();
    expect(shiftChoice.resultingMissingSlots).toEqual([
      expect.objectContaining({ slotId: "cover-front", physicalPages: [] }),
      expect.objectContaining({ slotId: "01-greeting", physicalPages: [1] }),
      expect.objectContaining({ slotId: "02-intro", physicalPages: [2] }),
      expect.objectContaining({ slotId: "24-video-qr-background", physicalPages: [24] }),
    ]);

    // Verify KEEP_NUMERIC_SLOTS choice ("files are Cover through Inventor" —
    // greeting, closing, video-qr, and the separate back cover remain missing)
    const keepChoice = data.choices.find((c: any) => c.interpretation === "KEEP_NUMERIC_SLOTS");
    expect(keepChoice).toBeDefined();
    expect(keepChoice.resultingMissingSlots).toEqual([
      expect.objectContaining({ slotId: "01-greeting" }),
      expect.objectContaining({ slotId: "23-closing" }),
      expect.objectContaining({ slotId: "24-video-qr-background" }),
      expect.objectContaining({ slotId: "cover-back" }),
    ]);
  });

  // ──────────────────────────────────────────────────
  // Test 2: SHIFT_PLUS_TWO → missing 01-cover and 02-intro (NOT 23-closing, 24-backcover)
  // ──────────────────────────────────────────────────
  it("2. SHIFT_PLUS_TWO maps 22 files to slots 03-24, reports 01-cover and 02-intro missing", async () => {
    const formData = new FormData();
    formData.append("name", child.name);
    formData.append("age", String(child.age));
    formData.append("gender", child.gender);
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");
    formData.append("legacyInterpretation", "SHIFT_PLUS_TWO");

    for (let i = 0; i < 22; i++) {
      const buf = await makeRoleLabelledImage(LEGACY_22_ROLES[i], i);
      const filename = `${String(i + 1).padStart(2, "0")}.png`;
      formData.append("images", new File([new Uint8Array(buf)], filename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });
    const res = await assemblePost(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("MISSING_REQUIRED_ARTWORK");

    // CRITICAL ASSERTION: Must report cover-front, greeting, intro, and
    // video-qr as missing (none of these had a legacy equivalent among the
    // 22 "Pilot through Back Cover" files)
    expect(data.missingSlots).toEqual([
      expect.objectContaining({ slotId: "cover-front", physicalPages: [] }),
      expect.objectContaining({ slotId: "01-greeting", physicalPages: [1] }),
      expect.objectContaining({ slotId: "02-intro", physicalPages: [2] }),
      expect.objectContaining({ slotId: "24-video-qr-background", physicalPages: [24] }),
    ]);

    // CRITICAL NEGATIVE ASSERTION: Must NOT report 23-closing or cover-back — both got a file.
    const slotIds = data.missingSlots.map((s: any) => s.slotId);
    expect(slotIds).not.toContain("23-closing");
    expect(slotIds).not.toContain("cover-back");
  });

  // ──────────────────────────────────────────────────
  // Test 3: KEEP_NUMERIC_SLOTS → missing 23-closing and 24-backcover
  // ──────────────────────────────────────────────────
  it("3. KEEP_NUMERIC_SLOTS maps 22 files to slots 01-22, reports 23-closing and 24-backcover missing", async () => {
    const formData = new FormData();
    formData.append("name", child.name);
    formData.append("age", String(child.age));
    formData.append("gender", child.gender);
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");
    formData.append("legacyInterpretation", "KEEP_NUMERIC_SLOTS");

    for (let i = 0; i < 22; i++) {
      const buf = await makeRoleLabelledImage(LEGACY_22_ROLES[i], i);
      const filename = `${String(i + 1).padStart(2, "0")}.png`;
      formData.append("images", new File([new Uint8Array(buf)], filename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });
    const res = await assemblePost(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("MISSING_REQUIRED_ARTWORK");

    // Must report greeting, closing, video-qr, and the separate back cover as
    // missing (all 20 careers + cover + intro got a file: cover + intro + 20
    // careers = 22, exactly matching "files are Cover through Inventor").
    const slotIds = data.missingSlots.map((s: any) => s.slotId);
    expect(slotIds).toContain("01-greeting");
    expect(slotIds).toContain("23-closing");
    expect(slotIds).toContain("24-video-qr-background");
    expect(slotIds).toContain("cover-back");

    // Must NOT report cover-front or 02-intro
    expect(slotIds).not.toContain("cover-front");
    expect(slotIds).not.toContain("02-intro");
  });

  // ──────────────────────────────────────────────────
  // Test 4: matchImportedFiles SHIFT_PLUS_TWO exact assertions
  // ──────────────────────────────────────────────────
  it("4. matchImportedFiles SHIFT_PLUS_TWO returns exact missingSlots", () => {
    const files22 = Array.from({ length: 22 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`);
    const report = matchImportedFiles(files22, dreamBigSlots, undefined, {
      bookId: "dream-big",
      legacyInterpretation: "SHIFT_PLUS_TWO",
      confirmLegacyOffsetRecovery: true,
    });

    expect(report.legacyRecoveryApplied).toBe(true);
    expect(report.missingSlotDetails).toEqual([
      expect.objectContaining({ slotId: "cover-front", physicalPages: [] }),
      expect.objectContaining({ slotId: "01-greeting", physicalPages: [1] }),
      expect.objectContaining({ slotId: "02-intro", physicalPages: [2] }),
      expect.objectContaining({ slotId: "24-video-qr-background", physicalPages: [24] }),
    ]);

    // 01.png mapped to 03-scene-01 (first career scene), NOT the front cover
    expect(report.bySlotId.get("03-scene-01")).toBe("01.png");
    expect(report.bySlotId.has("cover-front")).toBe(false);

    // 22.png (the old "backcover" file) mapped to the separate cover-back asset
    expect(report.bySlotId.get("cover-back")).toBe("22.png");
  });

  // ──────────────────────────────────────────────────
  // Test 5: matchImportedFiles KEEP_NUMERIC_SLOTS exact assertions
  // ──────────────────────────────────────────────────
  it("5. matchImportedFiles KEEP_NUMERIC_SLOTS returns exact missingSlots", () => {
    const files22 = Array.from({ length: 22 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`);
    const report = matchImportedFiles(files22, dreamBigSlots, undefined, {
      bookId: "dream-big",
      legacyInterpretation: "KEEP_NUMERIC_SLOTS",
    });

    expect(report.missingSlotDetails).toEqual([
      expect.objectContaining({ slotId: "01-greeting" }),
      expect.objectContaining({ slotId: "23-closing" }),
      expect.objectContaining({ slotId: "24-video-qr-background" }),
      expect.objectContaining({ slotId: "cover-back" }),
    ]);

    // 01.png mapped to cover-front
    expect(report.bySlotId.get("cover-front")).toBe("01.png");
    expect(report.bySlotId.get("02-intro")).toBe("02.png");

    // greeting, closing, video-qr, and cover-back are missing
    expect(report.bySlotId.has("01-greeting")).toBe(false);
    expect(report.bySlotId.has("23-closing")).toBe(false);
    expect(report.bySlotId.has("24-video-qr-background")).toBe(false);
    expect(report.bySlotId.has("cover-back")).toBe(false);
  });

  // ──────────────────────────────────────────────────
  // Test 6: Full 26-file canonical set (2 cover + 24 interior) passes through API and produces PDF
  // ──────────────────────────────────────────────────
  it("6. Full 26 canonical files pass API preflight and produce a PDF", async () => {
    const formData = new FormData();
    formData.append("name", child.name);
    formData.append("age", String(child.age));
    formData.append("gender", child.gender);
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");
    formData.append("videoUrl", "https://example.com/watch/dream-big-test-video");

    for (let i = 0; i < 26; i++) {
      const slot = dreamBigSlots[i];
      const buf = await makeHighResImage(3375, 2475, i);
      formData.append("images", new File([new Uint8Array(buf)], slot.expectedFilename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });
    const res = await assemblePost(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const pdfBytes = await res.arrayBuffer();
    expect(pdfBytes.byteLength).toBeGreaterThan(10000);
  }, 60000);

  // ──────────────────────────────────────────────────
  // Test 7: Quality warning acknowledgement contract
  // ──────────────────────────────────────────────────
  it("7. 150-299 PPI without acknowledgement returns HTTP 409 QUALITY_WARNING_ACKNOWLEDGEMENT_REQUIRED", async () => {
    const formData = new FormData();
    formData.append("name", child.name);
    formData.append("age", String(child.age));
    formData.append("gender", child.gender);
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");

    // 2000x1500 ≈ 178 PPI (between 150 and 300); distinct per-slot content.
    for (let i = 0; i < 26; i++) {
      const slot = dreamBigSlots[i];
      const buf = await sharp({
        create: { width: 2000, height: 1500, channels: 3, background: { r: 100, g: (150 + i * 7) % 255, b: (200 + i * 11) % 255 } },
      }).png().toBuffer();
      formData.append("images", new File([new Uint8Array(buf)], slot.expectedFilename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });
    const res = await assemblePost(req);

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("QUALITY_WARNING_ACKNOWLEDGEMENT_REQUIRED");
    expect(data.qualityWarnings).toBeDefined();
    expect(data.qualityWarnings.length).toBeGreaterThan(0);
    expect(data.qualityWarnings[0]).toEqual(
      expect.objectContaining({
        slotId: expect.any(String),
        filename: expect.any(String),
        nativeWidth: 2000,
        nativeHeight: 1500,
      }),
    );
  }, 30000);

  // ──────────────────────────────────────────────────
  // Test 8: 150-299 PPI WITH acknowledgement produces PDF
  // ──────────────────────────────────────────────────
  it("8. 150-299 PPI with bound qualityAcknowledgements produces PDF", async () => {
    const formData = new FormData();
    formData.append("name", child.name);
    formData.append("age", String(child.age));
    formData.append("gender", child.gender);
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");
    formData.append("videoUrl", "https://example.com/watch/dream-big-test-video");

    const acks: Record<string, any> = {};
    for (let i = 0; i < 26; i++) {
      const slot = dreamBigSlots[i];
      // Distinct per-slot content — real artwork is never byte-identical
      // across slots, and the duplicate-artwork-across-slots gate now
      // correctly flags it if it is. Each slot's own SHA is acknowledged
      // individually below.
      const buf = await sharp({
        create: { width: 2000, height: 1500, channels: 3, background: { r: 100, g: (150 + i * 7) % 255, b: (200 + i * 11) % 255 } },
      }).png().toBuffer();
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      formData.append("images", new File([new Uint8Array(buf)], slot.expectedFilename, { type: "image/png" }));
      acks[slot.slotId] = {
        slotId: slot.slotId,
        bookId: "dream-big",
        profileId: "classic-landscape-11x8",
        layoutMode: "standard-single",
        sourceSha256: sha256,
        computedNativeEffectivePpi: 177.8,
        destinationDimensions: { width: 3375, height: 2475 },
        timestamp: new Date().toISOString(),
      };
    }
    formData.append("qualityAcknowledgements", JSON.stringify(acks));

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });
    const res = await assemblePost(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  }, 60000);

  // ──────────────────────────────────────────────────
  // Test 9: Below 150 PPI is a hard error, even with acknowledgement
  // ──────────────────────────────────────────────────
  it("9. Below 150 PPI is a hard error that acknowledgement cannot bypass", async () => {
    const formData = new FormData();
    formData.append("name", child.name);
    formData.append("age", String(child.age));
    formData.append("gender", child.gender);
    formData.append("bookId", "dream-big");
    formData.append("profileId", "classic-landscape-11x8");
    formData.append("layoutMode", "standard-single");
    formData.append("acknowledgeQualityWarnings", "true");

    // 1376x768 ≈ 122 PPI (below 150)
    for (let i = 0; i < 26; i++) {
      const slot = dreamBigSlots[i];
      const buf = await sharp({
        create: { width: 1376, height: 768, channels: 3, background: { r: 100, g: 100, b: 100 } },
      }).png().toBuffer();
      formData.append("images", new File([new Uint8Array(buf)], slot.expectedFilename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });
    const res = await assemblePost(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    // Must be a hard error, not a quality warning
    expect(data.code).not.toBe("QUALITY_WARNING_ACKNOWLEDGEMENT_REQUIRED");
  }, 30000);
});
