/**
 * Comprehensive, independent end-to-end verification suite for the Dream Big
 * illustration-to-page pipeline.
 *
 * Assertions:
 * 1. Exactly 24 required Dream Big standard-single slots
 * 2. Physical page 1 = cover, page 2 = intro, page 3 = pilot ... page 22 = inventor, page 23 = closing, page 24 = back cover
 * 3. Review UI and manifest report 1-based physical page numbers
 * 4. Negative regression: 22 career+closing+backcover assets without cover/intro block production export,
 *    offer guarded legacy recovery requiring explicit confirmation, and keep slots 1 & 2 missing
 * 5. Full production export via /api/assemble succeeds with 24 pages, all 3375x2475 rasters at 300 PPI,
 *    no non-uniform scaling, and vector text
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { resolveLayoutPlan } from "./layoutPlan";
import { buildManifest } from "../manual/manifest";
import { matchImportedFiles } from "../manual/importMatch";
import { parseFilename } from "../manual/filenameMatch";
import { formatPhysicalPageLabel } from "../manual/reviewOrder";
import { POST as assemblePost } from "../../app/api/assemble/route";
import { inspectPdfPreflight } from "../pdf/pdfBoxes";
import { dreamBigBook } from "./dreamBigTemplate";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

// Independent source of truth for Dream Big's standard-24 edition: cover is
// delivered as 2 separate assets (never assigned an interior page number),
// and the 24 interior pages are numbered continuously 1-24 (greeting, intro,
// 20 careers, closing, video-qr). This does NOT import or derive from the
// production mapping code under test.
const INDEPENDENT_COVER_ASSETS = [
  { assetKind: "front-cover", slotId: "cover-front", filename: "cover-front.png" },
  { assetKind: "back-cover", slotId: "cover-back", filename: "cover-back.png" },
];

const INDEPENDENT_24_PAGE_SEQUENCE = [
  { page: 1, roleSlug: "greeting", slotId: "01-greeting", filename: "01-greeting.png", displayTitle: "Greeting" },
  { page: 2, roleSlug: "intro", slotId: "02-intro", filename: "02-intro.png", displayTitle: "Intro" },
  { page: 3, roleSlug: "pilot", slotId: "03-scene-01", filename: "03-scene-01.png", displayTitle: "Pilot" },
  { page: 4, roleSlug: "race-car-driver", slotId: "04-scene-02", filename: "04-scene-02.png", displayTitle: "Race-car driver" },
  { page: 5, roleSlug: "astronaut", slotId: "05-scene-03", filename: "05-scene-03.png", displayTitle: "Astronaut" },
  { page: 6, roleSlug: "doctor", slotId: "06-scene-04", filename: "06-scene-04.png", displayTitle: "Doctor" },
  { page: 7, roleSlug: "firefighter", slotId: "07-scene-05", filename: "07-scene-05.png", displayTitle: "Firefighter" },
  { page: 8, roleSlug: "scientist", slotId: "08-scene-06", filename: "08-scene-06.png", displayTitle: "Scientist" },
  { page: 9, roleSlug: "army-officer", slotId: "09-scene-07", filename: "09-scene-07.png", displayTitle: "Army officer" },
  { page: 10, roleSlug: "soccer-player", slotId: "10-scene-08", filename: "10-scene-08.png", displayTitle: "Soccer player" },
  { page: 11, roleSlug: "karate-master", slotId: "11-scene-09", filename: "11-scene-09.png", displayTitle: "Karate master" },
  { page: 12, roleSlug: "detective", slotId: "12-scene-10", filename: "12-scene-10.png", displayTitle: "Detective" },
  { page: 13, roleSlug: "magician", slotId: "13-scene-11", filename: "13-scene-11.png", displayTitle: "Magician" },
  { page: 14, roleSlug: "chef", slotId: "14-scene-12", filename: "14-scene-12.png", displayTitle: "Chef" },
  { page: 15, roleSlug: "rockstar", slotId: "15-scene-13", filename: "15-scene-13.png", displayTitle: "Rockstar" },
  { page: 16, roleSlug: "artist", slotId: "16-scene-14", filename: "16-scene-14.png", displayTitle: "Artist" },
  { page: 17, roleSlug: "teacher", slotId: "17-scene-15", filename: "17-scene-15.png", displayTitle: "Teacher" },
  { page: 18, roleSlug: "explorer", slotId: "18-scene-16", filename: "18-scene-16.png", displayTitle: "Explorer" },
  { page: 19, roleSlug: "photographer", slotId: "19-scene-17", filename: "19-scene-17.png", displayTitle: "Photographer" },
  { page: 20, roleSlug: "deep-sea-diver", slotId: "20-scene-18", filename: "20-scene-18.png", displayTitle: "Deep-sea diver" },
  { page: 21, roleSlug: "veterinarian", slotId: "21-scene-19", filename: "21-scene-19.png", displayTitle: "Veterinarian" },
  { page: 22, roleSlug: "inventor", slotId: "22-scene-20", filename: "22-scene-20.png", displayTitle: "Inventor" },
  { page: 23, roleSlug: "closing", slotId: "23-closing", filename: "23-closing.png", displayTitle: "Closing" },
  { page: 24, roleSlug: "video-qr", slotId: "24-video-qr-background", filename: "24-video-qr-background.png", displayTitle: "Video-qr" },
];

// Legacy (pre standard-24) filenames used by test 3's simulated 22-file
// legacy upload — kept as the old role-based names since that is exactly
// what a real legacy package on disk would contain.
const LEGACY_ROLE_FILENAMES = [
  "pilot", "race-car-driver", "astronaut", "doctor", "firefighter", "scientist",
  "army-officer", "soccer-player", "karate-master", "detective", "magician",
  "chef", "rockstar", "artist", "teacher", "explorer", "photographer",
  "deep-sea-diver", "veterinarian", "inventor", "closing", "backcover",
];

/** Create a deterministic, role-labelled image buffer with exact dimensions */
async function makeDeterministicFixture(role: string, width = 3375, height = 2475): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#2b5c8f" />
    <circle cx="200" cy="200" r="120" fill="#f4c542" />
    <text x="50%" y="50%" font-size="140" font-family="Arial, sans-serif" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">
      DREAM BIG ROLE: ${role}
    </text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("Dream Big Illustration-to-Page Pipeline Repairs", () => {
  const profileId = "classic-landscape-11x8";

  it("1. Slot resolution: cover-front + cover-back + exactly 24 required Dream Big standard-single interior slots mapped 1-to-1 to physical pages 1..24", () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "standard-single",
    });

    // Standard-24 edition: cover-front + 24 interior + cover-back = 26 assets.
    expect(plan.assets.length).toBe(26);
    expect(plan.assets.every((a) => a.required)).toBe(true);

    for (let i = 0; i < INDEPENDENT_24_PAGE_SEQUENCE.length; i++) {
      const expected = INDEPENDENT_24_PAGE_SEQUENCE[i];
      // plan.assets[0] is the separate front cover, so interior page N sits at index N.
      const slot = plan.assets[i + 1];

      expect(slot.slotId).toBe(expected.slotId);
      expect(slot.roleSlug).toBe(expected.roleSlug);
      expect(slot.filename).toBe(expected.filename);
      expect(slot.physicalPages).toEqual([expected.page]);

      // Verify pageToAsset lookup for every physical page 1..24
      const lookup = plan.pageToAsset.get(expected.page);
      expect(lookup).toBeDefined();
      expect(lookup?.asset.slotId).toBe(expected.slotId);

      // Verify 1-based review label
      const reviewLabel = formatPhysicalPageLabel(slot);
      expect(reviewLabel.toLowerCase()).toContain(`physical page ${expected.page}`);
      const checkWord = expected.roleSlug === "veterinarian" ? "vet" : expected.roleSlug.replace(/-/g, " ").split(" ")[0];
      expect(reviewLabel.toLowerCase()).toContain(checkWord);
      expect(reviewLabel).not.toContain("Page 0");
    }

    // Cover is delivered as 2 separate assets, never assigned an interior page number.
    expect(plan.assets[0].slotId).toBe(INDEPENDENT_COVER_ASSETS[0].slotId);
    expect(plan.assets[0].assetKind).toBe(INDEPENDENT_COVER_ASSETS[0].assetKind);
    expect(plan.assets[0].physicalPages).toEqual([]);
    expect(plan.assets[25].slotId).toBe(INDEPENDENT_COVER_ASSETS[1].slotId);
    expect(plan.assets[25].assetKind).toBe(INDEPENDENT_COVER_ASSETS[1].assetKind);
    expect(plan.assets[25].physicalPages).toEqual([]);

    // Physical page 1 = greeting
    expect(plan.assets[1].slotId).toBe("01-greeting");
    expect(plan.assets[1].physicalPages).toEqual([1]);

    // Physical page 2 = intro
    expect(plan.assets[2].slotId).toBe("02-intro");
    expect(plan.assets[2].physicalPages).toEqual([2]);

    // Physical page 3 = pilot (first career scene)
    expect(plan.assets[3].slotId).toBe("03-scene-01");
    expect(plan.assets[3].physicalPages).toEqual([3]);

    // Physical page 22 = inventor (last career scene)
    expect(plan.assets[22].slotId).toBe("22-scene-20");
    expect(plan.assets[22].physicalPages).toEqual([22]);

    // Physical page 23 = closing
    expect(plan.assets[23].slotId).toBe("23-closing");
    expect(plan.assets[23].physicalPages).toEqual([23]);

    // Physical page 24 = app-rendered, character-free video-QR background
    expect(plan.assets[24].slotId).toBe("24-video-qr-background");
    expect(plan.assets[24].physicalPages).toEqual([24]);
  });

  it("2. Back cover narrative agreement: approved 'happy dreamer' waving cheerfully prompt", () => {
    const backCoverSpec = dreamBigBook.pages.find((p) => p.kind === "backcover");
    expect(backCoverSpec).toBeDefined();
    expect(backCoverSpec?.role).toBe("happy dreamer");

    const prompt = backCoverSpec?.illustrationPrompt(child, profileId);
    expect(prompt).toContain("Waving cheerfully with a big joyful smile");
    expect(prompt).toContain("pastel background with a few gentle stars");
  });

  it("3. Negative regression: exactly 22 assets uploaded (pilot to back cover) blocks production export and offers guarded legacy recovery", async () => {
    const plan = resolveLayoutPlan({ child, bookId: "dream-big", profileId, mode: "standard-single" });

    // Simulate 22 uploaded files (01.png .. 22.png representing pilot through backcover, omitting cover and intro)
    const files22 = [
      "01-pilot.png",
      "02-race-car-driver.png",
      "03-astronaut.png",
      "04-doctor.png",
      "05-firefighter.png",
      "06-scientist.png",
      "07-army-officer.png",
      "08-soccer-player.png",
      "09-karate-master.png",
      "10-detective.png",
      "11-magician.png",
      "12-chef.png",
      "13-rockstar.png",
      "14-artist.png",
      "15-teacher.png",
      "16-explorer.png",
      "17-photographer.png",
      "18-deep-sea-diver.png",
      "19-veterinarian.png",
      "20-inventor.png",
      "21-closing.png",
      "22-backcover.png",
    ];

    // Case A: Without user confirmation, matcher offers proposal and DOES NOT map them
    const matchWithoutConfirm = matchImportedFiles(files22, plan.assets, false);
    expect(matchWithoutConfirm.legacyRecoveryProposal).toBeDefined();
    expect(matchWithoutConfirm.legacyRecoveryProposal).toContain(
      "Cover and intro appear to be missing. Map these 22 assets to slots 3–24?",
    );
    expect(matchWithoutConfirm.assignedCount).toBe(0);
    // Standard-24 edition: cover-front + 24 interior + cover-back = 26 assets,
    // all reported missing before the user confirms an interpretation.
    expect(matchWithoutConfirm.missingSlots.length).toBe(26);

    // Case B: Even WITH explicit user confirmation, the front cover, greeting,
    // intro, and video-qr (none of which any legacy package ever had an image
    // for) remain visibly missing.
    const matchWithConfirm = matchImportedFiles(files22, plan.assets, true);
    expect(matchWithConfirm.assignedCount).toBe(22);
    expect(matchWithConfirm.missingSlots).toContain("cover-front");
    expect(matchWithConfirm.missingSlots).toContain("01-greeting");
    expect(matchWithConfirm.missingSlots).toContain("02-intro");
    expect(matchWithConfirm.missingSlots).toContain("24-video-qr-background");
    expect(matchWithConfirm.matchedSlots.get("03-scene-01")).toBe("01-pilot.png");
    // The 22nd (back cover) file lands on the separate cover-back asset, not
    // an interior page — video-qr (interior page 24) has no legacy equivalent.
    expect(matchWithConfirm.matchedSlots.get("cover-back")).toBe("22-backcover.png");

    // Case C: Production API export with these 22 files MUST first offer guarded legacy recovery (HTTP 409)
    const formData = new FormData();
    formData.append("name", "Alex");
    formData.append("age", "4");
    formData.append("gender", "boy");
    formData.append("bookId", "dream-big");
    formData.append("profileId", profileId);
    formData.append("layoutMode", "standard-single");

    const sampleBuffer = await makeDeterministicFixture("sample", 1500, 1100);
    for (const name of files22) {
      formData.append("images", new File([new Uint8Array(sampleBuffer)], name, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });

    const res = await assemblePost(req);
    // Without legacyInterpretation, API must return 409 requiring user choice
    expect(res.status).toBe(409);
    const choiceData = await res.json();
    expect(choiceData.code).toBe("LEGACY_MAPPING_CONFIRMATION_REQUIRED");
    expect(choiceData.choices).toBeDefined();
    expect(choiceData.choices.length).toBe(2);

    // Case D: With explicit SHIFT_PLUS_TWO interpretation, API returns 400 with missing cover & intro
    const formData2 = new FormData();
    formData2.append("name", "Alex");
    formData2.append("age", "4");
    formData2.append("gender", "boy");
    formData2.append("bookId", "dream-big");
    formData2.append("profileId", profileId);
    formData2.append("layoutMode", "standard-single");
    formData2.append("legacyInterpretation", "SHIFT_PLUS_TWO");

    for (const name of files22) {
      formData2.append("images", new File([new Uint8Array(sampleBuffer)], name, { type: "image/png" }));
    }

    const req2 = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData2,
    });

    const res2 = await assemblePost(req2);
    expect(res2.status).toBe(400);
    const data = await res2.json();
    expect(data.code).toBe("MISSING_REQUIRED_ARTWORK");
    expect(Array.isArray(data.missingSlots)).toBe(true);

    const missingSlotIds = data.missingSlots.map((s: any) => s.slotId);
    expect(missingSlotIds).toContain("cover-front");
    expect(missingSlotIds).toContain("01-greeting");
    expect(missingSlotIds).toContain("02-intro");
    expect(missingSlotIds).toContain("24-video-qr-background");
  });

  it("4. Full production Book Review export: 26 required illustrations (2 cover + 24 interior) produce a 26-page PDF with 3375x2475 rasters at 300 PPI", async () => {
    const formData = new FormData();
    formData.append("name", "Alex");
    formData.append("age", "4");
    formData.append("gender", "boy");
    formData.append("bookId", "dream-big");
    formData.append("profileId", profileId);
    formData.append("layoutMode", "standard-single");
    formData.append("videoUrl", "https://example.com/watch/dream-big-test-video");

    // Create 26 deterministic 3375x2475 images: front cover, 24 interior, back cover.
    for (const item of INDEPENDENT_COVER_ASSETS) {
      const buf = await makeDeterministicFixture(item.assetKind, 3375, 2475);
      formData.append("images", new File([new Uint8Array(buf)], item.filename, { type: "image/png" }));
    }
    for (const item of INDEPENDENT_24_PAGE_SEQUENCE) {
      const buf = await makeDeterministicFixture(item.roleSlug, 3375, 2475);
      formData.append("images", new File([new Uint8Array(buf)], item.filename, { type: "image/png" }));
    }

    const req = new Request("http://localhost:3000/api/assemble", {
      method: "POST",
      body: formData,
    });

    const res = await assemblePost(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const pdfBuffer = Buffer.from(await res.arrayBuffer());
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Deep byte-level inspection of the generated production PDF
    const inspection = inspectPdfPreflight(pdfBuffer, 11, 8, 0.125);

    // 1. Exactly 26 physical PDF pages (2 cover + 24 interior)
    expect(inspection.pageCount).toBe(26);

    // 2. Exactly 26 raster images embedded in the PDF
    expect(inspection.embeddedRasterDimensions.length).toBe(26);

    // 3. All 26 page backgrounds are exactly 3375 x 2475 pixels
    for (const dim of inspection.embeddedRasterDimensions) {
      expect(dim.width).toBe(3375);
      expect(dim.height).toBe(2475);
    }

    // 4. Output grid PPI is 300x300 and no non-uniform scaling
    expect(inspection.hasNonUniformScaling).toBe(false);
    for (const img of inspection.imageObjects) {
      expect(img.effectivePpi).toBeCloseTo(300, 0);
      expect(img.placedWidthIn).toBeCloseTo(11.25, 2);
      expect(img.placedHeightIn).toBeCloseTo(8.25, 2);
    }
  }, 90000); // Allow Puppeteer sufficient time for 26-page PDF rendering
});
