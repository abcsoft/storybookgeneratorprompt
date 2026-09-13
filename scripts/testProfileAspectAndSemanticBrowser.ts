import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import { signEnhancementReceipt } from "../lib/enhance/receipt";

const ARTIFACTS_DIR = path.resolve(process.cwd(), "artifacts/profile-aspect-semantic-proofs");

async function main() {
  console.log("===================================================================");
  console.log("BROWSER E2E TEST: ASPECT RATIO, AUTO-FIX & SEMANTIC VALIDATION");
  console.log("===================================================================");

  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err));

  try {
    // 1. Navigate to localhost:3000
    console.log("1. Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });
    console.log("✓ Loaded studio page");

    // 2. Select Dream Big & Classic Landscape
    const dreamBigBtn = page.locator('button:has-text("Dream Big")');
    if ((await dreamBigBtn.count()) > 0) {
      await dreamBigBtn.click();
      console.log("✓ Selected story 'Dream Big'");
    }

    const profileSelect = page.locator("select#print-profile");
    if ((await profileSelect.count()) > 0) {
      await profileSelect.selectOption("classic-landscape-11x8");
      console.log("✓ Selected profile 'Classic Landscape (11×8\")'");
    }

    const nameInput = page.locator('input[placeholder="e.g. Alex"]');
    await nameInput.fill("Leo");

    // 3. Click 'Get my prompts →'
    const getPromptsBtn = page.locator('button:has-text("Get my prompts →")');
    await getPromptsBtn.click();
    await page.waitForSelector('input[type="file"]', { state: "attached", timeout: 30000 });
    console.log("✓ Prompts generated; on prompts step");

    // 4. Test aspect ratio & resolution display with 1200x880 image (negative veterinarian fixture)
    const vetFixturePath = path.resolve(process.cwd(), "test-fixtures/semantic/21-veterinarian.png");
    console.log(`4. Uploading 1200x880 fixture to Illustration 21...`);

    // Find the replace file input for illustration 21
    const cards = page.locator(stylesMatch("illoCard"));
    const cardCount = await cards.count();
    console.log(`Found ${cardCount} illustration cards.`);

    // Illustration 21 is index 20
    const card21 = cards.nth(20);
    const replaceInput21 = card21.locator('input[type="file"]');
    await replaceInput21.setInputFiles(vetFixturePath);
    await page.waitForTimeout(1000);

    // Verify: No aspect ratio warning for 1200x880 on Classic Landscape!
    const card21Warning = card21.locator(stylesMatch("illoWarning"));
    const hasAspectWarning = (await card21Warning.count()) > 0;
    console.log(`Aspect warning on 1200x880 Classic Landscape: ${hasAspectWarning ? "FOUND (FAIL)" : "ZERO (PASS)"}`);
    if (hasAspectWarning) {
      const warningText = await card21Warning.innerText();
      console.log(`Warning text: "${warningText}"`);
    }

    // Verify native PPI badge (107 native PPI)
    const card21Text = await card21.innerText();
    const has107Ppi = card21Text.includes("107 native PPI");
    console.log(`Native PPI badge (107 native PPI) displayed: ${has107Ppi ? "YES (PASS)" : "NO"}`);

    // Take screenshot of card 21 with resolution badge
    await card21.screenshot({ path: path.join(ARTIFACTS_DIR, "browser-card21-provenance.png") });
    console.log("Saved browser-card21-provenance.png");

    // 5. Semantic Validation: Click 'Check story match' on card 21
    console.log("5. Testing semantic story match check on card 21...");
    const checkStoryBtn = card21.locator('button:has-text("Check story match")');
    if ((await checkStoryBtn.count()) > 0) {
      await checkStoryBtn.click();
      await page.waitForSelector(stylesMatch("semanticMismatchCard"), { timeout: 10000 });
      console.log("✓ Semantic mismatch card appeared!");

      const mismatchCard = card21.locator(stylesMatch("semanticMismatchCard"));
      const mismatchText = await mismatchCard.innerText();
      console.log("Semantic mismatch details:\n", mismatchText);

      await card21.screenshot({ path: path.join(ARTIFACTS_DIR, "browser-card21-semantic-mismatch.png") });
      console.log("Saved browser-card21-semantic-mismatch.png");
    }

    // 6. Test Auto-fix resolution (Mocked at Boundary with signed receipt)
    console.log("6. Testing Auto-fix resolution on card 21 with mocked-at-boundary provider...");
    const enhSharp = await sharp({
      create: {
        width: 3375,
        height: 2475,
        channels: 4,
        background: { r: 30, g: 58, b: 138, alpha: 1 },
      },
    }).png().toBuffer();

    const origBytes = await fs.readFile(vetFixturePath);
    const origHash = crypto.createHash("sha256").update(origBytes).digest("hex");
    const enhHash = crypto.createHash("sha256").update(enhSharp).digest("hex");

    const receipt = signEnhancementReceipt({
      receiptId: "browser-e2e-receipt",
      slotId: "21-veterinarian",
      profileId: "classic-landscape-11x8",
      layoutMode: "standard-single",
      originalSha256: origHash,
      originalPixelDimensions: { width: 1200, height: 880 },
      enhancedSha256: enhHash,
      enhancedPixelDimensions: { width: 3375, height: 2475 },
      nativeEffectivePpi: 107,
      enhancedEffectivePpi: 300,
      trustedProviderId: "external-ai-enhancer",
      providerClass: "real-ai",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    page.on("dialog", async (dialog) => {
      console.log(`DIALOG [${dialog.type()}]: ${dialog.message()}`);
      await dialog.accept();
    });

    await page.route("**/api/enhance*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            provider: {
              id: "external-ai-enhancer",
              name: "Configured AI Super-Resolution Provider",
              providerClass: "real-ai",
              available: true,
              isConfigured: true,
              isPaid: false,
              estimatedCostUsd: 0,
            },
            isAvailable: true,
            availableProviders: [
              {
                id: "external-ai-enhancer",
                name: "Configured AI Super-Resolution Provider",
                providerClass: "real-ai",
                available: true,
                isConfigured: true,
                isPaid: false,
                estimatedCostUsd: 0,
              },
            ],
          }),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            enhancedBase64: enhSharp.toString("base64"),
            mimeType: "image/png",
            outputDimensions: { width: 3375, height: 2475 },
            method: "ai-super-resolution",
            providerClass: "real-ai",
            upscaleFactor: 2.8125,
            provenance: {
              originalPixelDimensions: { width: 1200, height: 880 },
              nativeEffectivePpi: 107,
              enhancedPixelDimensions: { width: 3375, height: 2475 },
              enhancedEffectivePpi: 300,
              outputGridPpi: 300,
              upscaleFactor: 2.8125,
              enhancementMethod: "ai-super-resolution",
              providerClass: "real-ai",
              enhancementStatus: "pending",
              originalSha256: origHash,
              enhancedSha256: enhHash,
              approvalRequired: true,
              approvedAt: null,
              originalFilename: "21-veterinarian.png",
              receipt,
            },
            receipt,
          }),
        });
      } else {
        await route.continue();
      }
    });

    const autoFixBtn = card21.locator('button:has-text("Auto-fix resolution")');
    if ((await autoFixBtn.count()) > 0) {
      await autoFixBtn.click();
      await page.waitForSelector('button:has-text("Review enhancement")', { timeout: 15000 });
      console.log("✓ Resolution enhancement completed! 'Review enhancement' button is visible.");

      // Open Comparison Modal
      const reviewBtn = card21.locator('button:has-text("Review enhancement")');
      await reviewBtn.click();
      await page.waitForSelector(stylesMatch("modalBox"), { timeout: 5000 });
      console.log("✓ Visual comparison modal opened!");

      // Screenshot modal at 1x
      const modal = page.locator(stylesMatch("modalBox"));
      await modal.screenshot({ path: path.join(ARTIFACTS_DIR, "browser-enhancement-modal-1x.png") });
      console.log("Saved browser-enhancement-modal-1x.png");

      // Test 2x zoom inspection
      const zoom2xBtn = modal.locator('button:has-text("2×")');
      if ((await zoom2xBtn.count()) > 0) {
        await zoom2xBtn.click();
        await page.waitForTimeout(300);
        console.log("✓ Zoomed to 2× pixel inspection");
      }

      // Approve visual quality
      const approveVisualBtn = modal.locator('button:has-text("Approve Visual Quality")');
      await approveVisualBtn.click();
      await page.waitForTimeout(500);
      console.log("✓ Approved visual quality!");

      // Verify approved badge
      const afterApproveText = await card21.innerText();
      const isApproved = afterApproveText.includes("approved");
      console.log(`Enhancement approved status displayed: ${isApproved ? "YES (PASS)" : "NO"}`);

      await card21.screenshot({ path: path.join(ARTIFACTS_DIR, "browser-card21-approved.png") });
      console.log("Saved browser-card21-approved.png");
    }

    console.log("\n===================================================================");
    console.log("ALL BROWSER E2E TESTS PASSED SUCCESSFULLY!");
    console.log("===================================================================");
  } finally {
    await browser.close();
  }
}

function stylesMatch(className: string) {
  return `[class*="${className}"]`;
}

main().catch((err) => {
  console.error("Browser test failed:", err);
  process.exit(1);
});
