import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { getProofArtifactsDir } from "./popplerDiscovery";

const ARTIFACTS_DIR = getProofArtifactsDir();
const FIXTURES_DIR = path.join(process.cwd(), "scratch", "dual_choice_fixtures");

async function create22Fixtures() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const filePaths: string[] = [];
  for (let i = 1; i <= 22; i++) {
    const filename = `${String(i).padStart(2, "0")}.png`;
    const filePath = path.join(FIXTURES_DIR, filename);
    const buf = await sharp({
      create: {
        width: 1200,
        height: 880,
        channels: 4,
        background: { r: 50 + i * 8, g: 100, b: 200 - i * 6, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await fs.writeFile(filePath, buf);
    filePaths.push(filePath);
  }
  return filePaths;
}

export async function runDualChoiceBrowserVerification() {
  console.log("=== REQUIREMENT 2: VERIFY DUAL-CHOICE LEGACY UI IN REAL BROWSER ===");
  const files22 = await create22Fixtures();
  console.log(`Created 22 test fixture images in ${FIXTURES_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {
    // ----------------------------------------------------
    // TEST 1: SHIFT_PLUS_TWO Selection
    // ----------------------------------------------------
    console.log("\n--- Starting Flow 1: SHIFT_PLUS_TWO ---");
    const page1 = await context.newPage();
    await page1.goto("http://localhost:3000", { timeout: 60000 });
    await page1.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });

    // Select Dream Big story
    await page1.click('button:has-text("Dream Big")');
    // Classic landscape profile
    const profileSelect1 = page1.locator("select#print-profile");
    if (await profileSelect1.count() > 0) {
      await profileSelect1.selectOption("classic-landscape-11x8");
    }
    // Fill name
    await page1.fill('input[placeholder="e.g. Alex"]', "Alex");
    // Layout mode Standard Single
    const standardSingle1 = page1.locator('input[type="radio"][value="standard-single"]');
    if (await standardSingle1.count() > 0) {
      await standardSingle1.check();
    }
    // Click Get my prompts
    await page1.click('button:has-text("Get my prompts →")');
    await page1.waitForSelector('input[type="file"][multiple]', { state: "attached", timeout: 30000 });

    // Upload 22 numbered images
    console.log("Uploading 22 numbered images (01.png - 22.png)...");
    const fileInput1 = page1.locator('input[type="file"][multiple]').first();
    await fileInput1.setInputFiles(files22);
    await page1.waitForTimeout(2000);

    // Verify dual-choice panel appears
    const choicePanel = page1.locator('[data-testid="legacy-recovery-choice-panel"]');
    await choicePanel.waitFor({ state: "visible", timeout: 10000 });
    console.log("✓ Verified: Dual-choice legacy recovery panel is displayed");

    // Verify both choices are present
    const shiftChoiceCard = page1.locator('[data-testid="legacy-choice-shift-plus-two"]');
    const keepChoiceCard = page1.locator('[data-testid="legacy-choice-keep-numeric-slots"]');
    if ((await shiftChoiceCard.count()) === 0 || (await keepChoiceCard.count()) === 0) {
      throw new Error("FAIL: Both choice cards (SHIFT_PLUS_TWO, KEEP_NUMERIC_SLOTS) must be present in panel");
    }
    console.log("✓ Verified: Both choice cards are rendered");

    // Verify mapping tables
    const shiftTable = page1.locator('[data-testid="table-legacy-shift-plus-two"]');
    const keepTable = page1.locator('[data-testid="table-legacy-keep-numeric-slots"]');
    const shiftText = await shiftTable.innerText();
    const keepText = await keepTable.innerText();

    // In SHIFT_PLUS_TWO: 01.png -> 03-pilot, 22.png -> 24-backcover
    if (!shiftText.includes("01.png") || !shiftText.includes("03-pilot") || !shiftText.includes("22.png") || !shiftText.includes("24-backcover")) {
      throw new Error("FAIL: SHIFT_PLUS_TWO table does not correctly map 01.png -> 03-pilot and 22.png -> 24-backcover");
    }
    console.log("✓ Verified: SHIFT_PLUS_TWO table maps 01.png -> 03-pilot (Page 3) and 22.png -> 24-backcover (Page 24)");

    // In KEEP_NUMERIC_SLOTS: 01.png -> 01-cover, 22.png -> 22-inventor
    if (!keepText.includes("01.png") || !keepText.includes("01-cover") || !keepText.includes("22.png") || !keepText.includes("22-inventor")) {
      throw new Error("FAIL: KEEP_NUMERIC_SLOTS table does not correctly map 01.png -> 01-cover and 22.png -> 22-inventor");
    }
    console.log("✓ Verified: KEEP_NUMERIC_SLOTS table maps 01.png -> 01-cover (Page 1) and 22.png -> 22-inventor (Page 22)");

    // Verify missing slots text
    const shiftCardText = await shiftChoiceCard.innerText();
    const keepCardText = await keepChoiceCard.innerText();
    if (!shiftCardText.includes("01-cover") || !shiftCardText.includes("02-intro")) {
      throw new Error("FAIL: SHIFT_PLUS_TWO missing slots must list 01-cover and 02-intro");
    }
    if (!keepCardText.includes("23-closing") || !keepCardText.includes("24-backcover")) {
      throw new Error("FAIL: KEEP_NUMERIC_SLOTS missing slots must list 23-closing and 24-backcover");
    }
    console.log("✓ Verified: Resulting missing slots accurately displayed on both choice cards");

    // Save browser screenshot of dual-choice panel
    const screenshotPanelPath = path.join(ARTIFACTS_DIR, "browser_legacy_dual_choice_panel.png");
    await page1.screenshot({ path: screenshotPanelPath, fullPage: true });
    console.log(`✓ Saved screenshot: ${screenshotPanelPath}`);

    // Click: "These files are Pilot through Back Cover"
    const shiftBtn = page1.locator('[data-testid="btn-legacy-shift-plus-two"]');
    await shiftBtn.click();
    await page1.waitForTimeout(2000);
    console.log("✓ Clicked 'These files are Pilot through Back Cover' (SHIFT_PLUS_TWO)");

    // Save browser screenshot after selection
    const screenshotAfterShiftPath = path.join(ARTIFACTS_DIR, "browser_after_shift_plus_two.png");
    await page1.screenshot({ path: screenshotAfterShiftPath, fullPage: true });
    console.log(`✓ Saved screenshot: ${screenshotAfterShiftPath}`);

    // Verify slot assignments in illustrations list
    // Slot 1 (Cover) and Slot 2 (Intro) should be missing
    // Slot 3 (Pilot) through Slot 24 (Backcover) should have artwork added
    const cards1 = page1.locator('[class*="illoCard"]');
    const cardCount1 = await cards1.count();
    console.log(`Found ${cardCount1} illustration cards on page`);

    const coverBadge1 = await cards1.nth(0).locator('[class*="statusBadge"]').innerText();
    const introBadge1 = await cards1.nth(1).locator('[class*="statusBadge"]').innerText();
    const pilotBadge1 = await cards1.nth(2).locator('[class*="statusBadge"]').innerText();
    const backcoverBadge1 = await cards1.nth(23).locator('[class*="statusBadge"]').innerText();

    console.log(`Card 1 (Cover) badge: ${coverBadge1} (Expected: Missing)`);
    console.log(`Card 2 (Intro) badge: ${introBadge1} (Expected: Missing)`);
    console.log(`Card 3 (Pilot) badge: ${pilotBadge1} (Expected: Added)`);
    console.log(`Card 24 (Back cover) badge: ${backcoverBadge1} (Expected: Added)`);

    if (!coverBadge1.toLowerCase().includes("missing") || !introBadge1.toLowerCase().includes("missing")) {
      throw new Error("FAIL: Cover and Intro must be marked Missing after SHIFT_PLUS_TWO");
    }
    if (!pilotBadge1.toLowerCase().includes("added") || !backcoverBadge1.toLowerCase().includes("added")) {
      throw new Error("FAIL: Pilot and Back cover must be marked Added after SHIFT_PLUS_TWO");
    }

    // Verify progress to review/export is disabled
    const continueBtn1 = page1.locator('button:has-text("Import every page to continue")');
    await continueBtn1.waitFor({ state: "visible", timeout: 5000 });
    const isContinueDisabled1 = await continueBtn1.isDisabled();
    console.log(`✓ Flow progression blocked: 'Import every page to continue' is disabled: ${isContinueDisabled1}`);
    if (!isContinueDisabled1) {
      throw new Error("FAIL: Continue button must be disabled when Cover and Intro are missing!");
    }
    await page1.close();

    // ----------------------------------------------------
    // TEST 2: KEEP_NUMERIC_SLOTS Selection
    // ----------------------------------------------------
    console.log("\n--- Starting Flow 2: KEEP_NUMERIC_SLOTS ---");
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

    // Upload 22 images
    const fileInput2 = page2.locator('input[type="file"][multiple]').first();
    await fileInput2.setInputFiles(files22);
    await page2.waitForTimeout(2000);

    const choicePanel2 = page2.locator('[data-testid="legacy-recovery-choice-panel"]');
    await choicePanel2.waitFor({ state: "visible", timeout: 10000 });

    // Click: "These files are Cover through Inventor"
    const keepBtn = page2.locator('[data-testid="btn-legacy-keep-numeric"]');
    await keepBtn.click();
    await page2.waitForTimeout(2000);
    console.log("✓ Clicked 'These files are Cover through Inventor' (KEEP_NUMERIC_SLOTS)");

    const cards2 = page2.locator('[class*="illoCard"]');
    const coverBadge2 = await cards2.nth(0).locator('[class*="statusBadge"]').innerText();
    const inventorBadge2 = await cards2.nth(21).locator('[class*="statusBadge"]').innerText();
    const closingBadge2 = await cards2.nth(22).locator('[class*="statusBadge"]').innerText();
    const backcoverBadge2 = await cards2.nth(23).locator('[class*="statusBadge"]').innerText();

    console.log(`Card 1 (Cover) badge: ${coverBadge2} (Expected: Added)`);
    console.log(`Card 22 (Inventor) badge: ${inventorBadge2} (Expected: Added)`);
    console.log(`Card 23 (Closing) badge: ${closingBadge2} (Expected: Missing)`);
    console.log(`Card 24 (Back cover) badge: ${backcoverBadge2} (Expected: Missing)`);

    if (!coverBadge2.toLowerCase().includes("added") || !inventorBadge2.toLowerCase().includes("added")) {
      throw new Error("FAIL: Cover and Inventor must be marked Added after KEEP_NUMERIC_SLOTS");
    }
    if (!closingBadge2.toLowerCase().includes("missing") || !backcoverBadge2.toLowerCase().includes("missing")) {
      throw new Error("FAIL: Closing and Back cover must be marked Missing after KEEP_NUMERIC_SLOTS");
    }

    const continueBtn2 = page2.locator('button:has-text("Import every page to continue")');
    await continueBtn2.waitFor({ state: "visible", timeout: 5000 });
    const isContinueDisabled2 = await continueBtn2.isDisabled();
    console.log(`✓ Flow progression blocked: 'Import every page to continue' is disabled: ${isContinueDisabled2}`);
    if (!isContinueDisabled2) {
      throw new Error("FAIL: Continue button must be disabled when Closing and Backcover are missing!");
    }
    await page2.close();

    console.log("\n✅ ALL DUAL-CHOICE BROWSER VERIFICATIONS PASSED SUCCESSFULLY!");
  } finally {
    await browser.close();
  }
}

if (require.main === module || process.argv[1]?.endsWith("testDualChoiceBrowser.ts")) {
  runDualChoiceBrowserVerification().catch((err) => {
    console.error("Browser verification failed:", err);
    process.exit(1);
  });
}
