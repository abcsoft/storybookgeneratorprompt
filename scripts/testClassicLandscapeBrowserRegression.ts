import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  console.log("===================================================================");
  console.log("PLAYWRIGHT REGRESSION: DREAM-BIG + CLASSIC LANDSCAPE LIVE EXPORT");
  console.log("===================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Open app
    console.log("Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });
    console.log("✓ Step 1: Loaded studio page");

    // 2. Select Dream Big
    const dreamBigBtn = page.locator('button:has-text("Dream Big")');
    if (await dreamBigBtn.count() > 0) {
      await dreamBigBtn.click();
      console.log("✓ Step 2: Selected story 'Dream Big'");
    }

    // 3. Select Classic Landscape profile
    const profileSelect = page.locator('select#print-profile');
    if (await profileSelect.count() > 0) {
      await profileSelect.selectOption("classic-landscape-11x8");
      console.log("✓ Step 3: Selected profile 'Classic Landscape (11×8\")'");
    }

    // 4. Fill child name
    const nameInput = page.locator('input[placeholder="e.g. Alex"]');
    await nameInput.fill("Mehedi");
    console.log("✓ Step 4: Filled child name 'Mehedi'");

    // 5. Ensure Layout Mode is Standard Single
    // Check if Standard Single radio is present
    const standardSingleRadio = page.locator('input[type="radio"][value="standard-single"]');
    if (await standardSingleRadio.count() > 0) {
      await standardSingleRadio.check();
      console.log("✓ Step 5: Confirmed layout mode 'Standard Single'");
    }

    // 6. Click 'Get my prompts →'
    const getPromptsBtn = page.locator('button:has-text("Get my prompts →")');
    await getPromptsBtn.click();
    await page.waitForSelector('input[type="file"][multiple]', { state: "attached", timeout: 30000 });
    console.log("✓ Step 6: Prompts generated; on prompts step");

    // 7. Import all 24 readable landscape images from storybook-out/mehedi
    const sourceDir = path.join(__dirname, "../storybook-out/mehedi");
    const filesToImport: string[] = [];
    for (let i = 1; i <= 24; i++) {
      const filename = `${String(i).padStart(2, "0")}.png`;
      const fullPath = path.join(sourceDir, filename);
      filesToImport.push(fullPath);
    }

    const fileInput = page.locator('input[type="file"][multiple]').first();
    await fileInput.setInputFiles(filesToImport);
    await page.waitForTimeout(2000);
    console.log(`✓ Step 7: Imported ${filesToImport.length} source images from storybook-out/mehedi`);

    // 8. Proceed to Book Review
    const reviewBtn = page.locator('button:has-text("Review book →")');
    await reviewBtn.waitFor({ state: "visible", timeout: 15000 });
    await reviewBtn.click();
    await page.waitForSelector('button:has-text("Build my PDF")', { timeout: 15000 });
    console.log("✓ Step 8: Entered Book Review");

    // Check that preflight error panel is NOT present
    const blockedPanelBefore = page.locator('[data-testid="preflight-blocked-panel"]');
    expect(await blockedPanelBefore.count()).toBe(0);

    // 9. Click 'Build my PDF 📖' and await download
    console.log("Clicking 'Build my PDF 📖' and awaiting assembly...");
    const buildPdfBtn = page.locator('button:has-text("Build my PDF")');

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90000 }),
      buildPdfBtn.click(),
    ]);

    const suggestedName = download.suggestedFilename();
    const downloadDest = path.join(__dirname, "../scratch", suggestedName);
    await download.saveAs(downloadDest);

    const stats = await fs.stat(downloadDest);
    console.log(`✓ Step 9: PDF successfully produced and downloaded: ${suggestedName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    if (stats.size < 100000) {
      throw new Error(`Downloaded PDF is too small: ${stats.size} bytes`);
    }

    // Verify again that NO preflight blocked banner appeared
    const blockedPanelAfter = page.locator('[data-testid="preflight-blocked-panel"]');
    const genericError = page.locator('[data-testid="preflight-generic-error"]');
    const hasBlocked = (await blockedPanelAfter.count()) > 0;
    const hasGeneric = (await genericError.count()) > 0;

    if (hasBlocked || hasGeneric) {
      throw new Error("Export blocked banner unexpectedly visible after build!");
    }

    console.log("===================================================================");
    console.log("SUCCESS: Classic Landscape PDF produced with 0 errors!");
    console.log("===================================================================");
  } finally {
    await browser.close();
  }
}

function expect(val: any) {
  return {
    toBe(expected: any) {
      if (val !== expected) throw new Error(`Expected ${expected}, got ${val}`);
    },
  };
}

main().catch((err) => {
  console.error("Browser regression failed:", err);
  process.exit(1);
});
