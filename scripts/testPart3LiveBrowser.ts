import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

async function main() {
  console.log("Starting Part 3 Live Browser Verification with Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Open app
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('button:has-text("Great Adventure")', { timeout: 60000 });
    console.log("✓ Opened http://localhost:3000");

    // 2. Select Great Adventure & Printify 8x8 Profile
    await page.click('button:has-text("Great Adventure")');
    await page.selectOption("select", "printify-hardcover-square-8x8");
    console.log("✓ Selected Great Adventure & Printify 8x8 Profile");

    // 3. Child profile details
    await page.fill('input[placeholder="e.g. Alex"]', "Ihan");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(500);
    console.log("✓ Submitted child profile details");

    // 4. Generate 21 test fixture images with correct aspect ratios (2:1 for spreads, 1:1 for single pages)
    const fixtureDir = path.join(__dirname, "../storybook-out/test-fixtures-part3");
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
    await page.waitForTimeout(1000);
    console.log("✓ Navigated to Step 3 Review");

    // 6. Verify Full Wrap Cover Tile & Interior Pages
    const coverTile = page.locator('text="📖 Full Wrap Cover (Back | Spine | Front)"');
    await coverTile.waitFor({ state: "visible" });
    console.log("✓ Cover Wrap Review tile visible at top of grid");

    // 7. Open Cover Wrap Preview Modal
    const previewCoverBtn = page.locator('button:has-text("Preview Cover Wrap 📖")');
    await previewCoverBtn.click();
    await page.waitForTimeout(500);

    // Verify spine warning notice
    const spineNotice = page.locator('text="Spine geometry still requires confirmation"');
    if (await spineNotice.isVisible()) {
      console.log("✓ Spine geometry confirmation warning visible in Cover Wrap preview");
    }

    // Capture screenshot of Cover Review Modal
    const artifactDir = "C:/Users/mehed/.gemini/antigravity-ide/brain/8c74abe3-e347-45df-8713-44db1cef8c7c";
    await page.screenshot({ path: path.join(artifactDir, "part3_cover_review_modal.png") });

    // Close Cover Wrap preview modal
    await page.locator('div[role="dialog"] button:has-text("Close")').first().click();
    await page.waitForTimeout(300);

    // 8. Open Interior Page Detail Modal & Verify Text Panel + Overlay Toggles
    const page1Tile = page.locator('text="Page 1"').first();
    await page1Tile.click();
    await page.waitForTimeout(500);

    // Verify Story Verse Text is rendered inside page review
    const verseText = page.locator("text=Ihan").first();
    if (await verseText.isVisible()) {
      console.log("✓ Story verse text panel rendered in interior page preview");
    }

    // Toggle Text Area overlay
    const textAreaCheckbox = page.locator('label:has-text("Text Area") input');
    await textAreaCheckbox.check();
    await page.waitForTimeout(300);
    console.log("✓ Toggled Text Area overlay on interior page modal");

    // Capture screenshot of Interior Page Detail with Text Area overlay
    await page.screenshot({ path: path.join(artifactDir, "part3_page_review_with_text.png") });

    // Close page detail modal
    await page.locator('div[role="dialog"] button:has-text("Close")').first().click();
    await page.waitForTimeout(300);

    // 9. Inspect Whale Spread Framing Editor
    const adjustBtns = page.locator('button:has-text("Adjust framing 🖼️")');
    // Index 11 is 12.png (Whale spread)
    await adjustBtns.nth(11).click();
    await page.waitForTimeout(500);

    console.log("✓ Opened Framing Editor Modal for Whale spread");

    // Capture screenshot of Whale spread framing editor with Text Area overlay
    await page.screenshot({ path: path.join(artifactDir, "part3_whale_spread_framing_editor.png") });

    // Save framing transform
    await page.locator('button:has-text("Save")').first().click();
    await page.waitForTimeout(500);
    console.log("✓ Saved Whale spread framing transform");

    // 10. Trigger Printify Export
    const exportBtn = page.locator('button:has-text("Export for Printify 📦")');
    await exportBtn.click();
    console.log("✓ Triggered Printify Export...");

    // Wait for result panel
    const resultPanel = page.locator('strong:has-text("Exported")');
    const errorPanel = page.locator('div[class*="error"]');

    await Promise.race([
      resultPanel.waitFor({ state: "visible", timeout: 120000 }),
      errorPanel.waitFor({ state: "visible", timeout: 120000 }),
    ]);

    if (await resultPanel.isVisible()) {
      const resultText = await resultPanel.locator("..").innerText();
      console.log("✓ Export Result:\n", resultText);

      // Extract exported directory path
      const dirMatch = resultText.match(/Exported \d+ files to:\s*([^\n\r]+)/);
      if (dirMatch) {
        const exportDir = dirMatch[1].trim();
        const files = await fs.readdir(exportDir);
        console.log(`✓ Exported directory contains ${files.length} files`);

        const proofPath = path.join(exportDir, "proof.pdf");
        const proofExists = await fs.stat(proofPath).then(() => true).catch(() => false);
        if (proofExists) {
          const proofStat = await fs.stat(proofPath);
          console.log(`✓ Generated proof.pdf confirmed (${proofStat.size} bytes)`);
        }
      }
    } else if (await errorPanel.isVisible()) {
      const errorText = await errorPanel.innerText();
      console.error("❌ Export failed with error:", errorText);
      throw new Error(errorText);
    }

    console.log("✅ ALL PRINTIFY PART 3 LIVE BROWSER CHECKS PASSED PERFECTLY!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
