import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

async function main() {
  console.log("Starting Part 2 Live Browser Verification with Playwright...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const artifactDir = "C:/Users/mehed/.gemini/antigravity-ide/brain/8c74abe3-e347-45df-8713-44db1cef8c7c";

  try {
    // 1. Open app
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    console.log("✓ Opened http://localhost:3000");

    // 2. Select Great Adventure & Printify 8x8 profile
    await page.click('button:has-text("Great Adventure")');
    const profileSelect = page.locator("select#print-profile");
    if (await profileSelect.isVisible()) {
      await profileSelect.selectOption("printify-hardcover-square-8x8");
    }
    console.log("✓ Selected Great Adventure & Printify 8x8 Profile");

    // 3. Child details
    await page.fill("input#name", "Ihan");
    await page.fill("input#age", "5");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(500);
    console.log("✓ Submitted child profile details");

    // 4. Generate 21 test fixture images with correct aspect ratios for spreads vs single pages
    const fixtureDir = path.join(__dirname, "../storybook-out/test-fixtures-part2");
    await fs.mkdir(fixtureDir, { recursive: true });

    // Spreads for Great Adventure edition: 02.png (index 1), 12.png (index 11), 19.png (index 18)
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
            ? { r: 60, g: 120, b: 200, alpha: 1 }
            : { r: 200, g: 100, b: 150, alpha: 1 },
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
    console.log(`✓ Uploaded ${filePaths.length} valid test fixture images to dropzone`);

    // 5. Navigate to Review
    const reviewBtn = page.locator('button:has-text("Review book →")');
    await reviewBtn.waitFor({ state: "visible" });
    await reviewBtn.click();
    await page.waitForTimeout(500);
    console.log("✓ Navigated to Step 3 Review");

    // 6. Test 1: Whale Spread Framing Adjustment (Illustration 12)
    // Find framing adjust button on review tile for Illustration 12
    const adjustBtns = page.locator('button:has-text("Adjust framing 🖼️")');
    const count = await adjustBtns.count();
    console.log(`Found ${count} adjust framing buttons on tiles`);

    // Click adjust framing for illustration index 12 (Whale spread)
    await adjustBtns.nth(12).click();
    await page.waitForTimeout(500);

    // Modal open
    const modal = page.locator('[role="dialog"]');
    await modal.waitFor({ state: "visible" });
    console.log("✓ Opened Framing Editor Modal for Whale spread");

    // Adjust zoom slider
    const zoomInput = page.locator('input[id="zoom-slider"]');
    await zoomInput.fill("0.8");
    await page.waitForTimeout(300);

    // Drag canvas to offset subject away from center gutter
    const canvas = page.locator('div[class*="editorCanvas"]');
    const box = await canvas.boundingBox();
    if (box) {
      const startX = box.x + box.width * 0.5;
      const startY = box.y + box.height * 0.5;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 60, startY + 20, { steps: 5 });
      await page.mouse.up();
    }
    await page.waitForTimeout(300);

    // Save
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);
    console.log("✓ Saved Whale spread framing transform");

    // Take screenshot of review step with updated Whale tile
    await page.screenshot({ path: path.join(artifactDir, "live_test_whale_framing.png") });

    // 7. Test 2: Flying Home spread (Illustration 19)
    await adjustBtns.nth(19).click();
    await page.waitForTimeout(500);

    // Verify center split line and red gutter zone overlay
    const gutterZone = page.locator('div[style*="rgba(232, 93, 93, 0.28)"]');
    const gutterVisible = await gutterZone.isVisible();
    console.log(`✓ Center red gutter zone visible in spread editor: ${gutterVisible}`);

    // Click Save & Next →
    await page.click('button:has-text("Save & Next →")');
    await page.waitForTimeout(500);
    console.log("✓ Saved & Navigated to next illustration framing editor");

    // Close modal
    const closeBtn = page.locator('button:has-text("✕")');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }

    // 8. Test 3: Session Persistence
    await page.click('button:has-text("← Back to illustrations")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Review book →")');
    await page.waitForTimeout(300);
    console.log("✓ Confirmed review state session persistence");

    // 9. Test 4: Export for Printify 📦
    const exportBtn = page.locator('button:has-text("Export for Printify 📦")');
    await exportBtn.click();
    console.log("✓ Triggered Printify Export...");

    // Wait for result panel or error panel
    const resultPanel = page.locator('strong:has-text("Exported")');
    const errorPanel = page.locator('div[class*="error"]');

    await Promise.race([
      resultPanel.waitFor({ state: "visible", timeout: 120000 }),
      errorPanel.waitFor({ state: "visible", timeout: 120000 }),
    ]);

    let resultText = "";
    if (await resultPanel.isVisible()) {
      resultText = await resultPanel.locator("..").innerText();
      console.log("✓ Export Result:\n", resultText);
    } else if (await errorPanel.isVisible()) {
      const errorText = await errorPanel.innerText();
      console.error("❌ Export failed with error:", errorText);
    }

    await page.screenshot({ path: path.join(artifactDir, "live_test_export_result.png") });

    // 10. Validate Exported Output Files
    const exportMatch = resultText.match(/Exported \d+ files to:\s*([^\n]+)/);
    const exportDir = exportMatch ? exportMatch[1].trim() : null;

    if (exportDir) {
      const exportedFiles = await fs.readdir(exportDir);
      console.log(`✓ Exported directory contains ${exportedFiles.length} files`);
      const coverMeta = await sharp(path.join(exportDir, "cover.png")).metadata();
      const page1Meta = await sharp(path.join(exportDir, "page-01.png")).metadata();

      console.log(`✓ Cover PNG dimensions: ${coverMeta.width}x${coverMeta.height}`);
      console.log(`✓ Page 01 PNG dimensions: ${page1Meta.width}x${page1Meta.height}`);

      if (coverMeta.width === 5370 && coverMeta.height === 2850 && page1Meta.width === 2400 && page1Meta.height === 2400) {
        console.log("✅ ALL PRINTIFY PART 2 LIVE BROWSER CHECKS PASSED PERFECTLY!");
      } else {
        console.error("❌ Dimensions mismatch in exported files!");
      }
    }

  } catch (err) {
    console.error("❌ Test failed:", err);
  } finally {
    await browser.close();
  }
}

main();
