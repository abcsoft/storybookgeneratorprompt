import { describe, expect, it } from "vitest";
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";
import { classicLandscapeProfile } from "./profiles/classicLandscape";
import { runPreflight } from "./preflight";
import { validateExportedFolder } from "./printifyExport";
import { greatAdventurePrintify24Edition } from "../story/greatAdventureTemplate";
import { getEditionForProfile } from "../story/editions";

describe("Part 1: Printify 24-Page Foundation, Numbering, and Preflight Regression Tests", () => {
  // Test 1: Printify profile requires exactly 24 interior pages
  it("1. Printify profile requires exactly 24 interior pages", () => {
    expect(printifyHardcoverSquare8x8Profile.interiorPageCount).toBe(24);
  });

  // Test 2: Great Adventure Printify edition maps to exactly 24
  it("2. Great Adventure Printify edition maps to exactly 24 interior pages", () => {
    const edition = getEditionForProfile("great-adventure", printifyHardcoverSquare8x8Profile);
    expect(edition).not.toBeNull();
    expect(edition?.interiorPageCount).toBe(24);
    expect(edition?.physicalPages.length).toBe(24);
  });

  // Test 3: Incompatible story edition is rejected
  it("3. Incompatible story edition is rejected by preflight", async () => {
    const dummyChild = { name: "Test", age: 5, gender: "boy" as const };
    const res = await runPreflight({
      child: dummyChild,
      bookId: "dream-big", // Dream Big does not have a 24-page Printify edition yet
      profileId: "printify-hardcover-square-8x8",
      files: [],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("does not yet have a 24-page Printify edition"))).toBe(true);
  });

  // Test 4: Illustration number != physical page number when appropriate
  it("4. Illustration number != physical page number when appropriate", () => {
    const edition = greatAdventurePrintify24Edition;
    // Illus 4 (04.png) lands on physical interior page 8 because preceding spreads occupy 2 leaves each
    const page8 = edition.physicalPages.find((p) => p.physicalPageNumber === 8);
    expect(page8).toBeDefined();
    expect(page8?.illustrationNumber).toBe(4);
    expect(page8?.filename).toBe("04.png");
    expect(page8?.physicalPageNumber).toBe(8);
  });

  // Test 5: Error messages use 'Illustration' correctly
  it("5. Error messages use 'Illustration' correctly", async () => {
    const dummyChild = { name: "Test", age: 5, gender: "boy" as const };
    // Create a portrait buffer (opposite orientation of wide spread landscape 2:1)
    const badAspectBuffer = await sharp({
      create: { width: 100, height: 300, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const res = await runPreflight({
      child: dummyChild,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      files: [
        { filename: "02.png", buffer: badAspectBuffer }, // Illus 02 is a wide spread requiring 2:1
      ],
    });
    expect(res.errors.some((e) => e.startsWith("Illustration 2 (02.png)"))).toBe(true);
  });

  // Test 6: Physical page mapping is stable
  it("6. Physical page mapping is stable for Great Adventure 24-page edition", () => {
    const edition = greatAdventurePrintify24Edition;
    expect(edition.physicalPages.map((p) => p.physicalPageNumber)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
    // Spreads must land on even physical page numbers: Intro (2), Waterfall (4), Desert (6), Coral (12), Flying (20)
    const spreadPages = edition.physicalPages.filter((p) => p.side === "left");
    expect(spreadPages.map((p) => p.physicalPageNumber)).toEqual([2, 4, 6, 12, 20]);
  });

  // Test 7: Duplicate input assets are detected before Map overwrite
  it("7. Duplicate input assets are detected before Map overwrite", async () => {
    const dummyChild = { name: "Test", age: 5, gender: "boy" as const };
    const dummyBuffer = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const res = await runPreflight({
      child: dummyChild,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      files: [
        { filename: "01.png", buffer: dummyBuffer },
        { filename: "01.png", buffer: dummyBuffer }, // Duplicate upload!
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('Duplicate filename "01.png"'))).toBe(true);
  });

  // Test 8: Unreadable required image is blocking
  it("8. Unreadable required image is blocking", async () => {
    const dummyChild = { name: "Test", age: 5, gender: "boy" as const };
    const corruptBuffer = Buffer.from("NOT_AN_IMAGE_FILE_DATA");

    const res = await runPreflight({
      child: dummyChild,
      bookId: "great-adventure",
      profileId: "printify-hardcover-square-8x8",
      files: [{ filename: "01.png", buffer: corruptBuffer }],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('Could not read "01.png" as an image'))).toBe(true);
  });

  // Test 9: Final output validator rejects 23 pages
  it("9. Final output validator rejects 23 pages", async () => {
    const tmpDir = path.join(__dirname, "../../storybook-out/test-temp-23pages");
    await mkdir(tmpDir, { recursive: true });
    try {
      const validPng = await sharp({
        create: { width: 2400, height: 2400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const coverPng = await sharp({
        create: { width: 5370, height: 2850, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      await writeFile(path.join(tmpDir, "cover.png"), coverPng);
      // Write only 23 interior pages (missing page-24.png)
      for (let i = 1; i <= 23; i++) {
        await writeFile(path.join(tmpDir, `page-${String(i).padStart(2, "0")}.png`), validPng);
      }

      const val = await validateExportedFolder(tmpDir, printifyHardcoverSquare8x8Profile);
      expect(val.ok).toBe(false);
      expect(val.errors.some((e) => e.includes("expected exactly 24"))).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 10: Final output validator rejects 25 pages
  it("10. Final output validator rejects missing interior pages when extra page exists", async () => {
    const tmpDir = path.join(__dirname, "../../storybook-out/test-temp-25pages");
    await mkdir(tmpDir, { recursive: true });
    try {
      const validPng = await sharp({
        create: { width: 2400, height: 2400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const coverPng = await sharp({
        create: { width: 5370, height: 2850, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      await writeFile(path.join(tmpDir, "cover.png"), coverPng);
      // Write page-01 to page-23 (23 files)
      for (let i = 1; i <= 23; i++) {
        await writeFile(path.join(tmpDir, `page-${String(i).padStart(2, "0")}.png`), validPng);
      }
      // write page-25 instead of page-24
      await writeFile(path.join(tmpDir, "page-25.png"), validPng);

      const val = await validateExportedFolder(tmpDir, printifyHardcoverSquare8x8Profile);
      expect(val.ok).toBe(false);
      expect(val.errors.some((e) => e.includes('Exported file "page-24.png" is missing'))).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 11: Final output validator rejects a 2399x2400 page
  it("11. Final output validator rejects a 2399x2400 page", async () => {
    const tmpDir = path.join(__dirname, "../../storybook-out/test-temp-badsize");
    await mkdir(tmpDir, { recursive: true });
    try {
      const validPng = await sharp({
        create: { width: 2400, height: 2400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const badPng = await sharp({
        create: { width: 2399, height: 2400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const coverPng = await sharp({
        create: { width: 5370, height: 2850, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      await writeFile(path.join(tmpDir, "cover.png"), coverPng);
      for (let i = 1; i <= 24; i++) {
        await writeFile(
          path.join(tmpDir, `page-${String(i).padStart(2, "0")}.png`),
          i === 5 ? badPng : validPng,
        );
      }

      const val = await validateExportedFolder(tmpDir, printifyHardcoverSquare8x8Profile);
      expect(val.ok).toBe(false);
      expect(val.errors.some((e) => e.includes('Exported file "page-05.png" has dimensions 2399x2400'))).toBe(
        true,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 12: Final output validator accepts 24 exact 2400x2400 pages
  it("12. Final output validator accepts 24 exact 2400x2400 pages and 5370x2850 cover", async () => {
    const tmpDir = path.join(__dirname, "../../storybook-out/test-temp-valid");
    await mkdir(tmpDir, { recursive: true });
    try {
      const validPng = await sharp({
        create: { width: 2400, height: 2400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const coverPng = await sharp({
        create: { width: 5370, height: 2850, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();

      await writeFile(path.join(tmpDir, "cover.png"), coverPng);
      for (let i = 1; i <= 24; i++) {
        await writeFile(path.join(tmpDir, `page-${String(i).padStart(2, "0")}.png`), validPng);
      }
      await writeFile(path.join(tmpDir, "proof.pdf"), "proof pdf");
      await writeFile(path.join(tmpDir, "prompts.md"), "prompts md");
      await writeFile(path.join(tmpDir, "order-info.txt"), "order info");

      const val = await validateExportedFolder(tmpDir, printifyHardcoverSquare8x8Profile);
      expect(val.ok).toBe(true);
      expect(val.errors).toHaveLength(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 13: Classic Landscape regression remains unchanged
  it("13. Classic Landscape regression remains unchanged", () => {
    expect(classicLandscapeProfile.id).toBe("classic-landscape-11x8");
    expect(classicLandscapeProfile.exportMode).toBe("single-pdf");
    expect(classicLandscapeProfile.interiorPageCount).toBeUndefined();
  });
});
