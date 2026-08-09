import { describe, expect, it } from "vitest";
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";
import { classicLandscapeProfile } from "./profiles/classicLandscape";
import { validateExportedFolder } from "./printifyExport";
import { uniquePath, outputBaseDir, slug } from "../generate/paths";
import { getBook, listBooks } from "../story/registry";
import { getEditionForProfile } from "../story/editions";
import { buildReviewSequenceForEdition } from "../manual/reviewOrder";
import "../story/greatAdventureTemplate";
import "../story/dinosaurDiscoveryTemplate";
import "../story/spaceExplorerTemplate";

describe("Part 4: Production Hardening & Package Validation Tests", () => {
  // Test 1: Full Final Package Validation (Valid Package)
  it("1. validateExportedFolder passes when all 24 interior pages, cover, proof, prompts, order-info exist", async () => {
    const tmpDir = path.join(process.cwd(), "storybook-out", "test-part4-valid");
    await mkdir(tmpDir, { recursive: true });

    try {
      // 24 interior pages (2400x2400)
      for (let i = 1; i <= 24; i++) {
        const fname = `page-${String(i).padStart(2, "0")}.png`;
        const buf = await import("sharp").then((s) =>
          s.default({
            create: { width: 2400, height: 2400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
          }).png().toBuffer()
        );
        await writeFile(path.join(tmpDir, fname), buf);
      }

      // Cover (5370x2850)
      const coverBuf = await import("sharp").then((s) =>
        s.default({
          create: { width: 5370, height: 2850, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
        }).png().toBuffer()
      );
      await writeFile(path.join(tmpDir, "cover.png"), coverBuf);
      await writeFile(path.join(tmpDir, "proof.pdf"), "dummy pdf content");
      await writeFile(path.join(tmpDir, "prompts.md"), "dummy markdown");
      await writeFile(path.join(tmpDir, "order-info.txt"), "dummy info");

      const res = await validateExportedFolder(tmpDir, printifyHardcoverSquare8x8Profile);
      expect(res.ok).toBe(true);
      expect(res.errors.length).toBe(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 2: Reject extra invalid page file (e.g. page-25.png)
  it("2. validateExportedFolder fails if extra page-25.png exists", async () => {
    const tmpDir = path.join(process.cwd(), "storybook-out", "test-part4-extra");
    await mkdir(tmpDir, { recursive: true });

    try {
      for (let i = 1; i <= 25; i++) {
        const fname = `page-${String(i).padStart(2, "0")}.png`;
        const buf = await import("sharp").then((s) =>
          s.default({
            create: { width: 2400, height: 2400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
          }).png().toBuffer()
        );
        await writeFile(path.join(tmpDir, fname), buf);
      }

      const coverBuf = await import("sharp").then((s) =>
        s.default({
          create: { width: 5370, height: 2850, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
        }).png().toBuffer()
      );
      await writeFile(path.join(tmpDir, "cover.png"), coverBuf);
      await writeFile(path.join(tmpDir, "proof.pdf"), "dummy pdf");
      await writeFile(path.join(tmpDir, "prompts.md"), "dummy md");
      await writeFile(path.join(tmpDir, "order-info.txt"), "dummy info");

      const res = await validateExportedFolder(tmpDir, printifyHardcoverSquare8x8Profile);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.includes("Unexpected extra interior page file"))).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 3: Output Directory Safety & Non-destructive Naming
  it("3. Output directory naming uses uniquePath and never overwrites existing orders", async () => {
    const base = path.join(outputBaseDir(), slug("IhanTestUnique"), printifyHardcoverSquare8x8Profile.id);
    const path1 = uniquePath(base);
    await mkdir(path1, { recursive: true });

    try {
      const path2 = uniquePath(base);
      expect(path2).not.toBe(path1);
      expect(path2).toContain("_");
    } finally {
      await rm(path1, { recursive: true, force: true });
    }
  });

  // Test 4: Multi-Story Smoke Test
  it("4. Multi-Story Smoke Test: Great Adventure, Dinosaur Discovery, Space Explorer", () => {
    const stories = ["great-adventure", "dinosaur-discovery", "space-explorer"];
    for (const storyId of stories) {
      const book = getBook(storyId);
      expect(book).toBeDefined();
      expect(book.id).toBe(storyId);
      expect(book.pages.length).toBeGreaterThan(10);

      // Verify Printify edition lookup
      const edition = getEditionForProfile(storyId, printifyHardcoverSquare8x8Profile);
      expect(edition).toBeDefined();
      if (edition) {
        expect(edition.interiorPageCount).toBe(24);
        const reviewSeq = buildReviewSequenceForEdition(edition);
        expect(reviewSeq.length).toBeGreaterThan(10);
      }
    }
  });

  // Test 5: Profile Switching Layout Recalculation
  it("5. Profile switching between Printify 8x8 and Classic Landscape recalculates layout", () => {
    const p1 = printifyHardcoverSquare8x8Profile;
    const p2 = classicLandscapeProfile;

    expect(p1.canvasPx.width).toBe(2400);
    expect(p1.canvasPx.height).toBe(2400);

    expect(p2.canvasPx.width).toBe(3375);
    expect(p2.canvasPx.height).toBe(2475);

    const edition1 = getEditionForProfile("great-adventure", p1);
    const edition2 = getEditionForProfile("great-adventure", p2);

    expect(edition1?.interiorPageCount).toBe(24);
    expect(edition2).toBeNull(); // Classic landscape doesn't enforce fixed interior count
  });
});
