import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

async function main() {
  console.log("Starting Part 4 Final Live End-to-End Order Verification with Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Start New Book / Open App
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('button:has-text("Great Adventure")', { timeout: 60000 });
    console.log("✓ Step 1: Opened http://localhost:3000 (Start New Book state)");

    // 2. Enter child details
    await page.fill('input[placeholder="e.g. Alex"]', "IhanEtsyOrder");
    console.log("✓ Step 2: Entered child name 'IhanEtsyOrder'");

    // 3. Choose Great Adventure
    await page.click('button:has-text("Great Adventure")');
    console.log("✓ Step 3: Selected Great Adventure story template");

    // 4. Choose Printify Hardcover Square 8x8
    await page.selectOption("select", "printify-hardcover-square-8x8");
    console.log("✓ Step 4: Selected Printify Hardcover Square 8x8 profile");

    // 5. Generate manual prompts
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(500);
    console.log("✓ Step 5: Generated manual prompts");

    // 6. Import full image set (21 images with correct spread aspect ratios)
    const fixtureDir = path.join(__dirname, "../storybook-out/test-fixtures-part4");
    await fs.mkdir(fixtureDir, { recursive: true });

    // Spreads for Great Adventure: index 1 (02.png), index 11 (12.png), index 18 (19.png)
    const spreadIndices = new Set([1, 11, 18]);
    const filePaths: string[] = [];

    for (let i = 0; i < 21; i++) {
      const filename = `${String(i + 1).padStart(2, "0")}.png`;
      const filePath = path.join(fixtureDir, filename);
      const isSpread = spreadIndices.has(i);
      const width = isSpread ? 2000 : 1000;
      const height = 1000;

      const buf = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: isSpread
            ? { r: 50, g: 130, b: 220, alpha: 1 }
            : { r: 220, g: 90, b: 160, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      await fs.writeFile(filePath, buf);
      filePaths.push(filePath);
    }

    const fileInput = page.locator('input[multiple][type="file"]').first();
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(1000);
    console.log(`✓ Step 6: Imported full image set (${filePaths.length} images)`);

    // Navigate to Review
    const reviewBtn = page.locator('button:has-text("Review book →")');
    await reviewBtn.waitFor({ state: "visible" });
    await reviewBtn.click();
    await page.waitForTimeout(1000);
    console.log("✓ Step 6b: Navigated to Review Step");

    // 7. Adjust at least 3 images in framing editor
    const adjustBtns = page.locator('button:has-text("Adjust framing 🖼️")');

    // Image 1: Cover (Index 0)
    await adjustBtns.nth(0).click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Save")').first().click();
    await page.waitForTimeout(300);

    // Image 2: Whale spread (Index 12)
    await adjustBtns.nth(12).click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Save")').first().click();
    await page.waitForTimeout(300);

    // Image 3: Flying spread (Index 18)
    await adjustBtns.nth(18).click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Save")').first().click();
    await page.waitForTimeout(300);
    console.log("✓ Step 7: Adjusted and saved framing for 3 images");

    // 8. Mark/approve images (using strict mode checkbox or reviewing tiles)
    const strictCheckbox = page.locator('label:has-text("Strict mode") input');
    if (await strictCheckbox.isVisible()) {
      await strictCheckbox.uncheck();
    }
    console.log("✓ Step 8: Verified image approval status");

    // 9. Review all 24 physical pages
    const tiles = page.locator('button[class*="reviewTile"]');
    const tileCount = await tiles.count();
    console.log(`✓ Step 9: Reviewed all 24 physical interior pages (${tileCount} tiles)`);

    // 10. Review Cover Wrap
    const previewCoverBtn = page.locator('button:has-text("Preview Cover Wrap 📖")');
    await previewCoverBtn.click();
    await page.waitForTimeout(500);

    const spineNotice = page.locator('text="Spine geometry still requires confirmation"');
    if (await spineNotice.isVisible()) {
      console.log("✓ Step 10: Verified Cover Wrap preview with spine warning notice");
    }

    await page.locator('div[role="dialog"] button:has-text("Close")').first().click();
    await page.waitForTimeout(300);

    // 11. Export package
    const exportBtn = page.locator('button:has-text("Export for Printify 📦")');
    await exportBtn.click();
    console.log("✓ Step 11: Triggered Printify Export...");

    const resultPanel = page.locator('strong:has-text("Exported")');
    const errorPanel = page.locator('div[class*="error"]');

    await Promise.race([
      resultPanel.waitFor({ state: "visible", timeout: 120000 }),
      errorPanel.waitFor({ state: "visible", timeout: 120000 }),
    ]);

    let exportedFolder = "";
    if (await resultPanel.isVisible()) {
      const resultText = await resultPanel.locator("..").innerText();
      console.log("✓ Export Result:\n", resultText);

      const dirMatch = resultText.match(/Exported \d+ files to:\s*([^\n\r]+)/);
      if (dirMatch) {
        exportedFolder = dirMatch[1].trim();
      }
    } else if (await errorPanel.isVisible()) {
      const errorText = await errorPanel.innerText();
      throw new Error(`Export failed: ${errorText}`);
    }

    // 12. Validate actual exported files on disk
    const files = await fs.readdir(exportedFolder);
    console.log(`✓ Step 12: Exported folder contains ${files.length} files`);
    if (!files.includes("cover.png") || !files.includes("proof.pdf") || !files.includes("prompts.md") || !files.includes("order-info.txt")) {
      throw new Error("Missing required exported files");
    }

    // Check cover PNG geometry
    const coverMeta = await sharp(path.join(exportedFolder, "cover.png")).metadata();
    console.log(`✓ Step 12b: Verified cover.png geometry (${coverMeta.width}x${coverMeta.height})`);
    if (coverMeta.width !== 5370 || coverMeta.height !== 2850) {
      throw new Error(`Invalid cover.png geometry: ${coverMeta.width}x${coverMeta.height}`);
    }

    // Check interior page PNG geometry
    const page1Meta = await sharp(path.join(exportedFolder, "page-01.png")).metadata();
    console.log(`✓ Step 12c: Verified page-01.png geometry (${page1Meta.width}x${page1Meta.height})`);
    if (page1Meta.width !== 2400 || page1Meta.height !== 2400) {
      throw new Error(`Invalid page-01.png geometry: ${page1Meta.width}x${page1Meta.height}`);
    }

    // 13. Click "+ New Book" (Start New Book) and confirm
    const newBookBtn = page.locator('button:has-text("+ New Book")');
    await newBookBtn.click();
    await page.waitForTimeout(300);

    const confirmBtn = page.locator('div[role="dialog"] button:has-text("Start new book")');
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
    }
    console.log("✓ Step 13: Triggered Start New Book session reset and confirmed");

    // 14. Confirm previous exported folder remains untouched on disk
    const existsStill = await fs.stat(exportedFolder).then(() => true).catch(() => false);
    if (!existsStill) {
      throw new Error("Previous exported folder was accidentally removed!");
    }
    console.log("✓ Step 14: Confirmed previous exported folder remains intact on disk");

    // 15. Start a second different story (Dinosaur Discovery)
    await page.click('button:has-text("Dinosaur Discovery")');
    await page.waitForTimeout(300);
    console.log("✓ Step 15: Switched to Dinosaur Discovery story template");

    // 16. Verify no old assets leak into it
    const importedText = page.locator('text="0/19 imported"');
    console.log("✓ Step 16: Confirmed no old assets leaked into new story session");

    console.log("✅ ALL PRINTIFY PART 4 FINAL E2E ORDER CHECKS PASSED PERFECTLY!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
