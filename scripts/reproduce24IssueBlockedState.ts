import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

const FIXTURES_DIR = path.resolve(process.cwd(), "test-fixtures/mixed-resolution");
const ARTIFACTS_DIR = path.resolve(process.cwd(), "artifacts/browser-reproduction");

const CANONICAL_FILES = [
  { name: "01-cover.png", width: 2400, height: 1760, role: "cover" },
  { name: "02-intro.png", width: 2400, height: 1760, role: "intro" },
  { name: "03-pilot.png", width: 2400, height: 1760, role: "pilot" },
  { name: "04-race-car-driver.png", width: 2400, height: 1760, role: "race car driver" },
  { name: "05-astronaut.png", width: 2400, height: 1760, role: "astronaut" },
  { name: "06-doctor.png", width: 2400, height: 1760, role: "doctor" },
  { name: "07-firefighter.png", width: 2400, height: 1760, role: "firefighter" },
  { name: "08-scientist.png", width: 1200, height: 880, role: "scientist" },
  { name: "09-army-officer.png", width: 1200, height: 880, role: "army officer" },
  { name: "10-soccer-player.png", width: 1200, height: 880, role: "soccer player" },
  { name: "11-karate-master.png", width: 1200, height: 880, role: "karate master" },
  { name: "12-detective.png", width: 1200, height: 880, role: "detective" },
  { name: "13-magician.png", width: 1200, height: 880, role: "magician" },
  { name: "14-chef.png", width: 1200, height: 880, role: "chef" },
  { name: "15-rockstar.png", width: 1200, height: 880, role: "rockstar" },
  { name: "16-artist.png", width: 1200, height: 880, role: "artist" },
  { name: "17-teacher.png", width: 1200, height: 880, role: "teacher" },
  { name: "18-explorer.png", width: 1200, height: 880, role: "explorer" },
  { name: "19-photographer.png", width: 1200, height: 880, role: "photographer" },
  { name: "20-deep-sea-diver.png", width: 1200, height: 880, role: "deep sea diver" },
  { name: "21-veterinarian.png", width: 1200, height: 880, role: "veterinarian" },
  { name: "22-inventor.png", width: 1200, height: 880, role: "inventor" },
  { name: "23-closing.png", width: 1200, height: 880, role: "closing" },
  { name: "24-backcover.png", width: 1200, height: 880, role: "back cover" },
];

async function generateFixtures() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  console.log(`Generating 24 test fixtures in ${FIXTURES_DIR}...`);

  for (const item of CANONICAL_FILES) {
    const filePath = path.join(FIXTURES_DIR, item.name);
    const svg = `
      <svg width="${item.width}" height="${item.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e3a8a" />
            <stop offset="100%" stop-color="#3b82f6" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
        <rect x="20" y="20" width="${item.width - 40}" height="${item.height - 40}" fill="none" stroke="#fbbf24" stroke-width="8" />
        <text x="${item.width / 2}" y="${item.height / 2 - 40}" font-family="Arial" font-size="${Math.round(item.height * 0.08)}" font-weight="bold" fill="#ffffff" text-anchor="middle">
          ${item.name}
        </text>
        <text x="${item.width / 2}" y="${item.height / 2 + 40}" font-family="Arial" font-size="${Math.round(item.height * 0.05)}" fill="#93c5fd" text-anchor="middle">
          Role: ${item.role} | ${item.width}×${item.height}
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svg)).png().toFile(filePath);
  }
  console.log("✓ All 24 fixtures generated.");
}

async function main() {
  await generateFixtures();
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: any[] = [];
  let assembleRequestData: any = null;
  let assembleResponseData: any = null;

  console.log("Launching Chromium browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    if (msg.type() === "error") {
      console.error("PAGE CONSOLE ERROR:", text);
    }
  });

  page.on("pageerror", (err) => {
    const text = `PAGE ERROR: ${err.message}\n${err.stack}`;
    pageErrors.push(text);
    console.error(text);
  });

  page.on("requestfailed", (req) => {
    const info = {
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText,
    };
    failedRequests.push(info);
    console.warn("REQUEST FAILED:", info);
  });

  page.on("request", (req) => {
    if (req.url().includes("/api/assemble")) {
      assembleRequestData = {
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
      };
      console.log("Captured /api/assemble request!");
    }
  });

  page.on("response", async (res) => {
    if (res.url().includes("/api/assemble")) {
      const status = res.status();
      const headers = res.headers();
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        try {
          body = await res.text();
        } catch {
          body = "<unreadable>";
        }
      }
      assembleResponseData = {
        status,
        headers,
        body,
      };
      console.log(`Captured /api/assemble response: HTTP ${status}`);
    }
  });

  try {
    // 1. Open app
    console.log("1. Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });
    console.log("✓ Studio page loaded");

    // 2. Select Dream Big
    const dreamBigBtn = page.locator('button:has-text("Dream Big")');
    if ((await dreamBigBtn.count()) > 0) {
      await dreamBigBtn.click();
      console.log("✓ Selected story 'Dream Big'");
    }

    // 3. Select Classic Landscape 11×8
    const profileSelect = page.locator("select#print-profile");
    if ((await profileSelect.count()) > 0) {
      await profileSelect.selectOption("classic-landscape-11x8");
      console.log("✓ Selected profile 'classic-landscape-11x8'");
    }

    // 4. Select Standard Single
    const modeSelect = page.locator("select#layout-mode, select[name='mode']");
    if ((await modeSelect.count()) > 0) {
      await modeSelect.selectOption("standard-single");
      console.log("✓ Selected layout mode 'standard-single'");
    }

    // 5. Enter child details
    const nameInput = page.locator('input[placeholder="e.g. Alex"]');
    await nameInput.fill("Leo");
    console.log("✓ Entered child name 'Leo'");

    // 6. Generate prompts
    const getPromptsBtn = page.locator('button:has-text("Get my prompts →")');
    await getPromptsBtn.click();
    await page.waitForSelector('input[type="file"]', { state: "attached", timeout: 30000 });
    console.log("✓ Generated prompts; navigated to Review/Prompts step");

    // 7. Upload exactly 24 canonically named images
    console.log("7. Bulk uploading 24 canonically named files...");
    const filePaths = CANONICAL_FILES.map((f) => path.join(FIXTURES_DIR, f.name));

    // Find the bulk upload input
    const bulkInput = page.locator('input[type="file"][multiple]');
    if ((await bulkInput.count()) > 0) {
      await bulkInput.setInputFiles(filePaths);
    } else {
      const firstInput = page.locator('input[type="file"]').first();
      await firstInput.setInputFiles(filePaths);
    }

    // Wait for client checks to complete
    await page.waitForTimeout(3000);
    console.log("✓ Uploaded 24 files to browser session");

    // 8. Confirm zero aspect-ratio warnings
    const aspectWarnings = page.locator('[class*="illoWarning"]');
    const warningCount = await aspectWarnings.count();
    console.log(`Aspect ratio warnings count: ${warningCount} (Expected: 0)`);

    // Screenshot before export
    const beforeScreenshotPath = path.join(ARTIFACTS_DIR, "01-before-export-uploaded-24.png");
    await page.screenshot({ path: beforeScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${beforeScreenshotPath}`);

    // 8.5 Click 'Review book →'
    console.log("8.5 Clicking 'Review book →' button...");
    const reviewBookBtn = page.locator('button:has-text("Review book →")');
    await reviewBookBtn.waitFor({ state: "visible", timeout: 15000 });
    await reviewBookBtn.click();
    await page.waitForSelector('button:has-text("Build my PDF"), button[data-testid="build-pdf-button"]', { timeout: 15000 });
    console.log("✓ Navigated to Book Review step");

    // 9. Click "Build my PDF"
    console.log("9. Clicking 'Build my PDF' button...");
    const buildPdfBtn = page.locator('button:has-text("Build my PDF"), button[data-testid="build-pdf-button"]').first();
    await buildPdfBtn.click();

    // Wait for network response and error panel
    await page.waitForTimeout(5000);

    // Screenshot after clicking export
    const afterScreenshotPath = path.join(ARTIFACTS_DIR, "02-after-export-blocked-24-issues.png");
    await page.screenshot({ path: afterScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${afterScreenshotPath}`);

    // Check if blocked panel is visible
    const blockedPanel = page.locator('[data-testid="preflight-blocked-panel"], [class*="preflightBlockedPanel"]');
    const isBlockedVisible = (await blockedPanel.count()) > 0;
    console.log(`Blocked panel visible: ${isBlockedVisible}`);

    let blockedText = "";
    if (isBlockedVisible) {
      blockedText = await blockedPanel.innerText();
      console.log("\n--- BLOCKED PANEL TEXT ---");
      console.log(blockedText.slice(0, 500) + "...\n");
    }

    // Summary of reproduction
    const reproductionReport = {
      timestamp: new Date().toISOString(),
      canonicalFilesCount: CANONICAL_FILES.length,
      aspectWarningsCount: warningCount,
      isBlockedVisible,
      assembleRequest: {
        method: assembleRequestData?.method,
        url: assembleRequestData?.url,
        headers: assembleRequestData?.headers,
      },
      assembleResponse: {
        status: assembleResponseData?.status,
        headers: assembleResponseData?.headers,
        body: assembleResponseData?.body,
      },
      failedRequests,
      pageErrors,
      consoleLogsSample: consoleLogs.slice(-20),
    };

    const reportPath = path.join(ARTIFACTS_DIR, "reproduction-report.json");
    await fs.writeFile(reportPath, JSON.stringify(reproductionReport, null, 2), "utf8");
    console.log(`✓ Saved reproduction report to ${reportPath}`);

    console.log("\n=================================================");
    console.log("REPRODUCTION RESULTS SUMMARY:");
    console.log(`- Aspect warnings count: ${warningCount}`);
    console.log(`- /api/assemble HTTP Status: ${assembleResponseData?.status}`);
    console.log(`- Error Code: ${assembleResponseData?.body?.code}`);
    console.log(`- Issues Count: ${assembleResponseData?.body?.issues?.length}`);
    if (assembleResponseData?.body?.issues) {
      const qWarnings = assembleResponseData.body.issues.filter((i: any) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED");
      const lowResErrors = assembleResponseData.body.issues.filter((i: any) => i.type === "IMAGE_RESOLUTION_TOO_LOW");
      console.log(`  - QUALITY_WARNING_UNACKNOWLEDGED (150-299 PPI): ${qWarnings.length}`);
      console.log(`  - IMAGE_RESOLUTION_TOO_LOW (<150 PPI): ${lowResErrors.length}`);
    }
    console.log("=================================================\n");

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in reproduction script:", err);
  process.exit(1);
});
