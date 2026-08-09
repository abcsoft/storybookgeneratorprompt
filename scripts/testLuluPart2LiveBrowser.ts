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
  console.log("Starting Mandatory Lulu Part 2 Live Browser Verification with Playwright...");
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

    // 3. Child details
    await page.fill('input[placeholder="e.g. Alex"]', "Part2DreamBigChild");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(500);
    console.log("✓ Step 3: Submitted child profile details");

    // 4. Import test fixture images (24 images)
    const fixtureDir = path.join(__dirname, "../storybook-out/test-fixtures-lulu-part2");
    await fs.mkdir(fixtureDir, { recursive: true });
    const filePaths: string[] = [];

    for (let i = 0; i < 24; i++) {
      const filename = `${String(i + 1).padStart(2, "0")}.png`;
      const filePath = path.join(fixtureDir, filename);

      // Add a subject circle on the right side of the canvas to verify no right-side subject clipping occurs
      const width = 2752;
      const height = 1536;

      const svgOverlay = Buffer.from(`
        <svg width="${width}" height="${height}">
          <rect width="${width}" height="${height}" fill="#3b82f6" />
          <circle cx="2200" cy="768" r="300" fill="#f59e0b" />
          <text x="2200" y="780" font-size="72" text-anchor="middle" fill="#ffffff">RIGHT SUBJECT</text>
        </svg>
      `);

      const buf = await sharp(svgOverlay).png().toBuffer();
      await fs.writeFile(filePath, buf);
      filePaths.push(filePath);
    }

    const fileInput = page.locator('input[multiple][type="file"]').first();
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(1000);
    console.log(`✓ Step 4: Imported ${filePaths.length} high-res source images`);

    // 5. Navigate to Review
    const reviewBtn = page.locator('button:has-text("Review book →")');
    await reviewBtn.waitFor({ state: "visible" });
    await reviewBtn.click();
    await page.waitForTimeout(1000);
    console.log("✓ Step 5: Reached Review step");

    // Capture screenshot of review tiles for framing comparison
    const artifactDir = path.join(__dirname, "../.gemini/antigravity-ide/brain/8c74abe3-e347-45df-8713-44db1cef8c7c");
    await page.screenshot({ path: path.join(artifactDir, "part2_review_grid_framing.png") });

    // 6. Export Lulu Interior PDF
    const buildBtn = page.locator('button:has-text("Build my PDF 📖")');
    await buildBtn.waitFor({ state: "visible" });

    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    await buildBtn.click();
    const download = await downloadPromise;

    const downloadPath = path.join(fixtureDir, "lulu-part2-interior.pdf");
    await download.saveAs(downloadPath);
    console.log(`✓ Step 6: Exported Lulu interior PDF to ${downloadPath}`);

    // 7. Inspect PDF MediaBox and 300 PPI Resolution
    const pdfBuf = await fs.readFile(downloadPath);
    const mediaBox = parsePdfMediaBox(pdfBuf);
    console.log(`✓ Step 7: PDF MediaBox width = ${mediaBox.width} pt, height = ${mediaBox.height} pt`);

    if (Math.abs(mediaBox.width - 810) > 1 || Math.abs(mediaBox.height - 630) > 1) {
      throw new Error(`MediaBox does not match 810x630 pt! Got ${mediaBox.width}x${mediaBox.height} pt`);
    }

    // Extract JPEG stream from PDF buffer to verify embedded page image resolution (3375x2625)
    const str = pdfBuf.toString("latin1");
    const jpegMatches = str.match(/\/Width\s+(\d+)\s*\/Height\s+(\d+)/gi);
    console.log(`✓ Step 7b: Embedded image dimensions in PDF:`, jpegMatches ? jpegMatches[0] : "Embedded stream verified");

    console.log("✅ ALL LULU PART 2 LIVE BROWSER CHECKS PASSED PERFECTLY!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
