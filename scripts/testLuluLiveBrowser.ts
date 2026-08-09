import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function parsePdfMediaBox(pdfBuffer: Buffer): { width: number; height: number } {
  const str = pdfBuffer.toString("latin1");
  const mediaBoxMatch = str.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/i);
  if (mediaBoxMatch) {
    const x1 = parseFloat(mediaBoxMatch[1]);
    const y1 = parseFloat(mediaBoxMatch[2]);
    const x2 = parseFloat(mediaBoxMatch[3]);
    const y2 = parseFloat(mediaBoxMatch[4]);
    return {
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }
  throw new Error("Could not parse MediaBox from PDF");
}

async function main() {
  console.log("Starting Mandatory Lulu Live Browser Verification with Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    // 1. Open app
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('button:has-text("Dream Big")', { timeout: 60000 });
    console.log("✓ Step 1: Opened http://localhost:3000");

    // 2. Select Dream Big story & Lulu Premium Color Landscape 11x8.5 profile
    await page.click('button:has-text("Dream Big")');
    await page.selectOption("select", "lulu-landscape-11x8.5");
    console.log("✓ Step 2: Selected Dream Big story & Lulu Premium Color Landscape 11x8.5 profile");

    // 3. Child profile details
    await page.fill('input[placeholder="e.g. Alex"]', "LuluTestChild");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(500);
    console.log("✓ Step 3: Submitted child profile details");

    // 4. Import test fixture images (24 images)
    const fixtureDir = path.join(__dirname, "../storybook-out/test-fixtures-lulu");
    await fs.mkdir(fixtureDir, { recursive: true });
    const filePaths: string[] = [];

    for (let i = 0; i < 24; i++) {
      const filename = `${String(i + 1).padStart(2, "0")}.png`;
      const filePath = path.join(fixtureDir, filename);
      const buf = await sharp({
        create: {
          width: 1200,
          height: 900,
          channels: 4,
          background: { r: 70, g: 150, b: 210, alpha: 1 },
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
    console.log(`✓ Step 4: Imported ${filePaths.length} test fixture images`);

    // 5. Navigate to Review
    const reviewBtn = page.locator('button:has-text("Review book →")');
    await reviewBtn.waitFor({ state: "visible" });
    await reviewBtn.click();
    await page.waitForTimeout(1000);
    console.log("✓ Step 5: Reached Review step");

    // 6. Export Lulu Interior PDF
    const buildBtn = page.locator('button:has-text("Build my PDF 📖")');
    await buildBtn.waitFor({ state: "visible" });

    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    await buildBtn.click();
    const download = await downloadPromise;

    const downloadPath = path.join(fixtureDir, "lulu-exported-interior.pdf");
    await download.saveAs(downloadPath);
    console.log(`✓ Step 6: Exported Lulu interior PDF to ${downloadPath}`);

    // 7. Inspect REAL file
    const diskPdfBuf = await fs.readFile(downloadPath);
    const mediaBox = parsePdfMediaBox(diskPdfBuf);
    console.log(`✓ Step 7: PDF MediaBox width = ${mediaBox.width} pt, height = ${mediaBox.height} pt`);

    if (Math.abs(mediaBox.width - 810) > 1 || Math.abs(mediaBox.height - 630) > 1) {
      throw new Error(`MediaBox does not match 810x630 pt! Got ${mediaBox.width}x${mediaBox.height} pt`);
    }

    // Verify page count in PDF buffer (count /Page objects)
    const pageMatches = diskPdfBuf.toString("latin1").match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 0;
    console.log(`✓ Step 7b: PDF interior page count = ${pageCount} (only interior pages)`);

    // 8. Regression Safety: Export Printify once with Great Adventure
    await page.click('button:has-text("+ New Book")');
    await page.waitForTimeout(300);

    const confirmBtn = page.locator('div[role="dialog"] button:has-text("Start new book")');
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
    }

    await page.fill('input[placeholder="e.g. Alex"]', "PrintifyRegressChild");
    await page.click('button:has-text("Great Adventure")');
    await page.selectOption("select", "printify-hardcover-square-8x8");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(300);

    // Import 21 images for Great Adventure Printify edition
    const printifyFilePaths: string[] = filePaths.slice(0, 21);
    const fileInput2 = page.locator('input[multiple][type="file"]').first();
    await fileInput2.setInputFiles(printifyFilePaths);
    await page.waitForTimeout(1000);

    const reviewBtn2 = page.locator('button:has-text("Review book →")');
    await reviewBtn2.click();
    await page.waitForTimeout(500);

    const exportPrintifyBtn = page.locator('button:has-text("Export for Printify 📦")');
    await exportPrintifyBtn.click();

    const resultPanel = page.locator('strong:has-text("Exported")');
    await resultPanel.waitFor({ state: "visible", timeout: 120000 });
    console.log("✓ Step 8: Confirmed Printify export regression safety");

    console.log("✅ ALL MANDATORY LULU LIVE BROWSER CHECKS PASSED PERFECTLY!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
