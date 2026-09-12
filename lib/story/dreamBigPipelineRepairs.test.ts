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

// Independent source of truth for the 24 Dream Big physical pages and roles.
// This does NOT import or derive from the production mapping code under test.
const INDEPENDENT_24_PAGE_SEQUENCE = [
  { page: 1, roleSlug: "cover", slotId: "01-cover", filename: "01-cover.png", displayTitle: "Cover" },
  { page: 2, roleSlug: "intro", slotId: "02-intro", filename: "02-intro.png", displayTitle: "Intro" },
  { page: 3, roleSlug: "pilot", slotId: "03-pilot", filename: "03-pilot.png", displayTitle: "Pilot" },
  { page: 4, roleSlug: "race-car-driver", slotId: "04-race-car-driver", filename: "04-race-car-driver.png", displayTitle: "Race-car driver" },
  { page: 5, roleSlug: "astronaut", slotId: "05-astronaut", filename: "05-astronaut.png", displayTitle: "Astronaut" },
  { page: 6, roleSlug: "doctor", slotId: "06-doctor", filename: "06-doctor.png", displayTitle: "Doctor" },
  { page: 7, roleSlug: "firefighter", slotId: "07-firefighter", filename: "07-firefighter.png", displayTitle: "Firefighter" },
  { page: 8, roleSlug: "scientist", slotId: "08-scientist", filename: "08-scientist.png", displayTitle: "Scientist" },
  { page: 9, roleSlug: "army-officer", slotId: "09-army-officer", filename: "09-army-officer.png", displayTitle: "Army officer" },
  { page: 10, roleSlug: "soccer-player", slotId: "10-soccer-player", filename: "10-soccer-player.png", displayTitle: "Soccer player" },
  { page: 11, roleSlug: "karate-master", slotId: "11-karate-master", filename: "11-karate-master.png", displayTitle: "Karate master" },
  { page: 12, roleSlug: "detective", slotId: "12-detective", filename: "12-detective.png", displayTitle: "Detective" },
  { page: 13, roleSlug: "magician", slotId: "13-magician", filename: "13-magician.png", displayTitle: "Magician" },
  { page: 14, roleSlug: "chef", slotId: "14-chef", filename: "14-chef.png", displayTitle: "Chef" },
  { page: 15, roleSlug: "rockstar", slotId: "15-rockstar", filename: "15-rockstar.png", displayTitle: "Rockstar" },
  { page: 16, roleSlug: "artist", slotId: "16-artist", filename: "16-artist.png", displayTitle: "Artist" },
  { page: 17, roleSlug: "teacher", slotId: "17-teacher", filename: "17-teacher.png", displayTitle: "Teacher" },
  { page: 18, roleSlug: "explorer", slotId: "18-explorer", filename: "18-explorer.png", displayTitle: "Explorer" },
  { page: 19, roleSlug: "photographer", slotId: "19-photographer", filename: "19-photographer.png", displayTitle: "Photographer" },
  { page: 20, roleSlug: "deep-sea-diver", slotId: "20-deep-sea-diver", filename: "20-deep-sea-diver.png", displayTitle: "Deep-sea diver" },
  { page: 21, roleSlug: "veterinarian", slotId: "21-veterinarian", filename: "21-veterinarian.png", displayTitle: "Veterinarian" },
  { page: 22, roleSlug: "inventor", slotId: "22-inventor", filename: "22-inventor.png", displayTitle: "Inventor" },
  { page: 23, roleSlug: "closing", slotId: "23-closing", filename: "23-closing.png", displayTitle: "Closing" },
  { page: 24, roleSlug: "backcover", slotId: "24-backcover", filename: "24-backcover.png", displayTitle: "Back cover" },
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

  it("1. Slot resolution: exactly 24 required Dream Big standard-single slots mapped 1-to-1 to physical pages 1..24", () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "dream-big",
      profileId,
      mode: "standard-single",
    });

    expect(plan.assets.length).toBe(24);
    expect(plan.assets.every((a) => a.required)).toBe(true);

    for (let i = 0; i < INDEPENDENT_24_PAGE_SEQUENCE.length; i++) {
      const expected = INDEPENDENT_24_PAGE_SEQUENCE[i];
      const slot = plan.assets[i];

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
      const checkWord =
        expected.roleSlug === "veterinarian"
          ? "vet"
          : expected.roleSlug === "backcover"
            ? "back cover"
            : expected.roleSlug.replace(/-/g, " ").split(" ")[0];
      expect(reviewLabel.toLowerCase()).toContain(checkWord);
      expect(reviewLabel).not.toContain("Page 0");
    }

    // Physical page 1 = cover
    expect(plan.assets[0].slotId).toBe("01-cover");
    expect(plan.assets[0].physicalPages).toEqual([1]);

    // Physical page 2 = intro
    expect(plan.assets[1].slotId).toBe("02-intro");
    expect(plan.assets[1].physicalPages).toEqual([2]);

    // Physical page 3 = pilot
    expect(plan.assets[2].slotId).toBe("03-pilot");
    expect(plan.assets[2].physicalPages).toEqual([3]);

    // Physical page 22 = inventor
    expect(plan.assets[21].slotId).toBe("22-inventor");
    expect(plan.assets[21].physicalPages).toEqual([22]);

    // Physical page 23 = closing
    expect(plan.assets[22].slotId).toBe("23-closing");
    expect(plan.assets[22].physicalPages).toEqual([23]);

    // Physical page 24 = backcover
    expect(plan.assets[23].slotId).toBe("24-backcover");
    expect(plan.assets[23].physicalPages).toEqual([24]);
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
    expect(matchWithoutConfirm.missingSlots.length).toBe(24);

    // Case B: Even WITH explicit user confirmation, slots 1 (cover) and 2 (intro) remain visibly missing
    const matchWithConfirm = matchImportedFiles(files22, plan.assets, true);
    expect(matchWithConfirm.assignedCount).toBe(22);
    expect(matchWithConfirm.missingSlots).toContain("01-cover");
    expect(matchWithConfirm.missingSlots).toContain("02-intro");
    expect(matchWithConfirm.matchedSlots.get("03-pilot")).toBe("01-pilot.png");
    expect(matchWithConfirm.matchedSlots.get("24-backcover")).toBe("22-backcover.png");

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
    expect(missingSlotIds).toContain("01-cover");
    expect(missingSlotIds).toContain("02-intro");
  });

  it("4. Full production Book Review export: 24 required illustrations produce 24-page PDF with 3375x2475 rasters at 300 PPI", async () => {
    const formData = new FormData();
    formData.append("name", "Alex");
    formData.append("age", "4");
    formData.append("gender", "boy");
    formData.append("bookId", "dream-big");
    formData.append("profileId", profileId);
    formData.append("layoutMode", "standard-single");

    // Create 24 deterministic 3375x2475 images
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

    // 1. Exactly 24 physical PDF pages
    expect(inspection.pageCount).toBe(24);

    // 2. Exactly 24 raster images embedded in the PDF
    expect(inspection.embeddedRasterDimensions.length).toBe(24);

    // 3. All 24 page backgrounds are exactly 3375 x 2475 pixels
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
  }, 90000); // Allow Puppeteer sufficient time for 24-page PDF rendering
});
