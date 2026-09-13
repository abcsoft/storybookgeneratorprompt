import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import assert from "node:assert";
import sharp from "sharp";

const FIXTURES_DIR = path.resolve(process.cwd(), "test-fixtures/batch-test");
const PROOF_DIR = path.resolve(process.cwd(), "artifacts/browser-evidence");

async function prepareBatchFixtures() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const files = [
    { name: "08-scientist.png", role: "scientist", width: 1200, height: 880 },
    { name: "09-army-officer.png", role: "army officer", width: 1200, height: 880 },
    { name: "10-soccer-player.png", role: "soccer player", width: 1200, height: 880 },
  ];
  for (const f of files) {
    const svg = `
      <svg width="${f.width}" height="${f.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#334155" />
        <text x="${f.width / 2}" y="${f.height / 2}" font-family="Arial" font-size="60" fill="#ffffff" text-anchor="middle">
          ${f.name}
        </text>
      </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(path.join(FIXTURES_DIR, f.name));
  }
}

async function main() {
  console.log("===================================================================");
  console.log("PROOF 3: BATCH ERROR & CANCELLATION REPORTING (1 SUC, 1 FAIL, 1 CAN)");
  console.log("===================================================================");

  await prepareBatchFixtures();
  await fs.mkdir(PROOF_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`[BROWSER CONSOLE] ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`[BROWSER ERROR] ${err.message}`));

  let postCount = 0;

  let post2StartedResolve: () => void;
  const post2StartedPromise = new Promise<void>((resolve) => {
    post2StartedResolve = resolve;
  });

  // Intercept /api/enhance to route 1 success, 1 failure, and delay for cancel
  await page.route("**/api/enhance", async (route, req) => {
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          provider: {
            id: "test-ai-enhancer",
            name: "Test AI Super-Res Provider",
            available: true,
            isPaid: false,
            estimatedCostUsd: 0,
          },
        }),
      });
      return;
    }

    if (req.method() === "POST") {
      postCount++;
      console.log(`Intercepted /api/enhance POST #${postCount}`);

      if (postCount === 1) {
        // Item 1: SUCCESS
        const dummyEnhanced = await sharp({
          create: { width: 3375, height: 2475, channels: 4, background: { r: 10, g: 100, b: 200, alpha: 1 } },
        })
          .png()
          .toBuffer();

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            enhancedBase64: dummyEnhanced.toString("base64"),
            mimeType: "image/png",
            provenance: {
              originalPixelDimensions: { width: 1200, height: 880 },
              nativeEffectivePpi: 106.7,
              outputGridPpi: 300,
              upscaleFactor: 2.81,
              enhancementMethod: "external-ai-super-res",
              enhancementStatus: "approved",
              enhancedEffectivePpi: 300,
              approvalRequired: false,
            },
          }),
        });
        return;
      }

      if (postCount === 2) {
        // Signal that POST 2 has started
        post2StartedResolve();

        // Delay 1000ms so the user has time to click Cancel during processing
        await new Promise((r) => setTimeout(r, 1000));

        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Simulated upstream 500 error from enhancement provider",
          }),
        });
        return;
      }

      // If postCount > 2 happens
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Should have been cancelled",
        }),
      });
    }
  });

  try {
    // 1. Open app
    console.log("1. Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });

    // 2. Select profile & child
    await page.locator('button:has-text("Dream Big")').click();
    await page.locator("select#print-profile").selectOption("classic-landscape-11x8");
    await page.locator('input[placeholder="e.g. Alex"]').fill("Leo");

    // 3. Move to prompts
    await page.locator('button:has-text("Get my prompts →")').click();
    await page.waitForSelector('input[type="file"]', { state: "attached", timeout: 30000 });

    // 4. Upload 3 files
    console.log("2. Uploading 3 low-resolution test files...");
    const filesToUpload = [
      path.join(FIXTURES_DIR, "08-scientist.png"),
      path.join(FIXTURES_DIR, "09-army-officer.png"),
      path.join(FIXTURES_DIR, "10-soccer-player.png"),
    ];

    const bulkInput = page.locator('input[type="file"][multiple]');
    if ((await bulkInput.count()) > 0) {
      await bulkInput.setInputFiles(filesToUpload);
    } else {
      await page.locator('input[type="file"]').first().setInputFiles(filesToUpload);
    }

    await page.waitForTimeout(2000);

    // 5. Click "✨ Auto-fix all eligible images"
    console.log("3. Triggering batch enhancement...");
    const batchBtn = page.locator('button:has-text("Auto-fix all eligible images")');
    assert.strictEqual(await batchBtn.count(), 1, "Batch auto-fix button must exist");

    await batchBtn.click();

    // 6. Wait for batch progress card and cancel button
    console.log("4. Waiting for batch progress card...");
    await page.waitForSelector('[data-testid="batch-progress-card"]', { timeout: 15000 });
    await page.waitForSelector('[data-testid="cancel-batch-button"]', { timeout: 15000 });

    // Wait until POST 2 has started
    console.log("Waiting for POST #2 to start before clicking cancel...");
    await post2StartedPromise;

    // Click cancel while POST 2 is in flight!
    console.log("Clicking cancel button during item 2 processing...");
    await page.locator('[data-testid="cancel-batch-button"]').click();

    // Wait until inProgress is done (dismiss button appears)
    console.log("5. Waiting for batch completion card (dismiss button)...");
    await page.waitForSelector('[data-testid="dismiss-batch-button"]', { timeout: 20000 });

    // 7. Verify exact completed, failed, and cancelled counts
    const completedCountText = await page.locator('[data-testid="batch-completed-count"]').innerText();
    const failedCountText = await page.locator('[data-testid="batch-failed-count"]').innerText();
    const cancelledCountText = await page.locator('[data-testid="batch-cancelled-count"]').innerText();

    console.log(`Reported Counts:`);
    console.log(`- Completed: ${completedCountText} (Expected: 1)`);
    console.log(`- Failed: ${failedCountText} (Expected: 1)`);
    console.log(`- Cancelled: ${cancelledCountText} (Expected: 1)`);

    assert.strictEqual(completedCountText.trim(), "1", "Completed count must be exactly 1");
    assert.strictEqual(failedCountText.trim(), "1", "Failed count must be exactly 1");
    assert.strictEqual(cancelledCountText.trim(), "1", "Cancelled count must be exactly 1");

    // Screenshot batch summary card
    const cardEl = page.locator('[data-testid="batch-progress-card"]');
    const shotCardPath = path.join(PROOF_DIR, "07-batch-partial-failure-progress.png");
    await cardEl.screenshot({ path: shotCardPath });
    console.log(`Saved screenshot: ${shotCardPath}`);

    console.log("\n=================================================");
    console.log("BATCH ERROR REPORTING VERIFICATION: PASS");
    console.log("- Exactly 1 success reported");
    console.log("- Exactly 1 server failure reported");
    console.log("- Exactly 1 cancelled queued item reported");
    console.log("=================================================\n");

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in batch proof:", err);
  process.exit(1);
});
