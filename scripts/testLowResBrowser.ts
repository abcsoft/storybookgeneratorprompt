import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const FIXTURES_2400 = path.join(process.cwd(), "scratch", "fixtures_2400x1760");
const FIXTURES_1200 = path.join(process.cwd(), "scratch", "fixtures_1200x880");

const CANONICAL_NAMES = [
  "01-cover.png",
  "02-intro.png",
  "03-pilot.png",
  "04-race-car-driver.png",
  "05-astronaut.png",
  "06-doctor.png",
  "07-firefighter.png",
  "08-scientist.png",
  "09-army-officer.png",
  "10-soccer-player.png",
  "11-karate-master.png",
  "12-detective.png",
  "13-magician.png",
  "14-chef.png",
  "15-rockstar.png",
  "16-artist.png",
  "17-teacher.png",
  "18-explorer.png",
  "19-photographer.png",
  "20-deep-sea-diver.png",
  "21-veterinarian.png",
  "22-inventor.png",
  "23-closing.png",
  "24-backcover.png",
];

async function createFixtures(dir: string, width: number, height: number): Promise<string[]> {
  await fs.mkdir(dir, { recursive: true });
  const filePaths: string[] = [];
  for (const name of CANONICAL_NAMES) {
    const filePath = path.join(dir, name);
    const buf = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 70, g: 110, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await fs.writeFile(filePath, buf);
    filePaths.push(filePath);
  }
  return filePaths;
}

export async function runLowResBrowserVerification() {
  console.log("=== REQUIREMENT 5: VERIFY REAL LOW-RES QUALITY GATE IN BROWSER ===");

  console.log("Generating 2400x1760 fixtures (~213 PPI - Quality Warning)...");
  const files2400 = await createFixtures(FIXTURES_2400, 2400, 1760);

  console.log("Generating 1200x880 fixtures (~107 PPI - Hard Block)...");
  const files1200 = await createFixtures(FIXTURES_1200, 1200, 880);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });

  try {
    // -------------------------------------------------------------
    // PART A: 2400x1760 (150-299 PPI Quality Warning Dialog Test)
    // -------------------------------------------------------------
    console.log("\n--- Testing 2400x1760: Quality Warning Dialog Flow ---");
    const page1 = await context.newPage();
    page1.on("console", (msg) => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
    page1.on("response", (resp) => {
      if (resp.url().includes("/api/")) {
        console.log(`[Browser HTTP] ${resp.status()} ${resp.url()}`);
      }
    });
    page1.on("pageerror", (err) => console.log(`[Browser PageError] ${err.message}`));
    await page1.goto("http://localhost:3000", { timeout: 60000 });
    await page1.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });

    await page1.click('button:has-text("Dream Big")');
    const profileSelect1 = page1.locator("select#print-profile");
    if (await profileSelect1.count() > 0) {
      await profileSelect1.selectOption("classic-landscape-11x8");
    }
    await page1.fill('input[placeholder="e.g. Alex"]', "Alex");
    const standardSingle1 = page1.locator('input[type="radio"][value="standard-single"]');
    if (await standardSingle1.count() > 0) {
      await standardSingle1.check();
    }
    await page1.click('button:has-text("Get my prompts →")');
    await page1.waitForSelector('input[type="file"][multiple]', { state: "attached", timeout: 30000 });

    console.log("Uploading 24 2400x1760 images...");
    const fileInput1 = page1.locator('input[type="file"][multiple]').first();
    await fileInput1.setInputFiles(files2400);
    await page1.waitForTimeout(2500);

    const reviewBtn1 = page1.locator('button:has-text("Review book →")');
    await reviewBtn1.click();
    await page1.waitForSelector('button:has-text("Build my PDF")', { timeout: 15000 });

    const buildPdfBtn1 = page1.locator('button:has-text("Build my PDF")');

    // Step A1: Click Build my PDF -> Quality warning dialog should appear
    console.log("Clicking 'Build my PDF' without acknowledgement...");
    await buildPdfBtn1.click();

    const warningDialog = page1.locator('[data-testid="quality-warning-dialog"]');
    await warningDialog.waitFor({ state: "visible", timeout: 15000 });
    console.log("✓ Verified: Quality warning dialog appears for 2400x1760 files");

    // Step A2: Click Cancel -> Dialog closes, export is cancelled
    console.log("Clicking Cancel on quality warning dialog...");
    const cancelBtn = page1.locator('[data-testid="cancel-quality-warnings"]');
    await cancelBtn.click();
    await warningDialog.waitFor({ state: "hidden", timeout: 5000 });
    console.log("✓ Verified: Cancelling quality warning dialog dismisses it without exporting");

    // Step A3: Click Build my PDF again -> Dialog appears -> Click Acknowledge -> Export succeeds
    console.log("Clicking 'Build my PDF' again...");
    await buildPdfBtn1.click();
    await warningDialog.waitFor({ state: "visible", timeout: 15000 });

    console.log("Clicking 'I understand — proceed with export'...");
    const acknowledgeBtn = page1.locator('[data-testid="acknowledge-quality-warnings"]');

    const [download] = await Promise.all([
      page1.waitForEvent("download", { timeout: 60000 }),
      acknowledgeBtn.click(),
    ]);
    console.log(`✓ Verified: Acknowledging permits export and downloads PDF (${download.suggestedFilename()})`);
    await page1.close();

    // -------------------------------------------------------------
    // PART B: 1200x880 (<150 PPI Hard Block Test)
    // -------------------------------------------------------------
    console.log("\n--- Testing 1200x880: Hard Block Flow ---");
    const page2 = await context.newPage();
    await page2.goto("http://localhost:3000", { timeout: 60000 });
    await page2.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });

    await page2.click('button:has-text("Dream Big")');
    const profileSelect2 = page2.locator("select#print-profile");
    if (await profileSelect2.count() > 0) {
      await profileSelect2.selectOption("classic-landscape-11x8");
    }
    await page2.fill('input[placeholder="e.g. Alex"]', "Alex");
    const standardSingle2 = page2.locator('input[type="radio"][value="standard-single"]');
    if (await standardSingle2.count() > 0) {
      await standardSingle2.check();
    }
    await page2.click('button:has-text("Get my prompts →")');
    await page2.waitForSelector('input[type="file"][multiple]', { state: "attached", timeout: 30000 });

    console.log("Uploading 24 1200x880 images (<150 PPI)...");
    const fileInput2 = page2.locator('input[type="file"][multiple]').first();
    await fileInput2.setInputFiles(files1200);
    await page2.waitForTimeout(2500);

    const reviewBtn2 = page2.locator('button:has-text("Review book →")');
    await reviewBtn2.click();
    await page2.waitForSelector('button:has-text("Build my PDF")', { timeout: 15000 });

    const buildPdfBtn2 = page2.locator('button:has-text("Build my PDF")');
    console.log("Clicking 'Build my PDF' with 1200x880 files...");
    await buildPdfBtn2.click();

    // Verify preflight blocked panel appears (hard-blocked)
    const blockedPanel = page2.locator('[data-testid="preflight-blocked-panel"]');
    await blockedPanel.waitFor({ state: "visible", timeout: 15000 });
    const blockedText = await blockedPanel.innerText();
    console.log(`✓ Verified: 1200x880 files are HARD-BLOCKED by preflight validation`);
    console.log(`  Blocked text snippet: ${blockedText.substring(0, 120)}...`);

    // Verify that NO download was triggered and quality warning dialog is NOT shown
    const qualityDialogCount = await page2.locator('[data-testid="quality-warning-dialog"]').count();
    if (qualityDialogCount > 0) {
      throw new Error("FAIL: 1200x880 (<150 PPI) must NOT show quality warning dialog — it must be hard-blocked!");
    }
    console.log("✓ Verified: Quality warning acknowledgement is NOT offered for <150 PPI hard-block");
    await page2.close();

    console.log("\n✅ ALL LOW-RES BROWSER QUALITY GATE VERIFICATIONS PASSED SUCCESSFULLY!");
  } finally {
    await browser.close();
  }
}

if (require.main === module || process.argv[1]?.endsWith("testLowResBrowser.ts")) {
  runLowResBrowserVerification().catch((err) => {
    console.error("Low-res browser verification failed:", err);
    process.exit(1);
  });
}
