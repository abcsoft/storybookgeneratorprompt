import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import sharp, { type OverlayOptions } from "sharp";
import { inspectPdfPreflight } from "../lib/pdf/pdfBoxes";

import { getProofArtifactsDir, discoverPopplerTools } from "./popplerDiscovery";

const execFileAsync = promisify(execFile);

const ARTIFACTS_DIR = getProofArtifactsDir();
const poppler = discoverPopplerTools();
const PDFINFO_EXE = poppler.pdfinfo;
const PDFIMAGES_EXE = poppler.pdfimages;
const PDFTOPPM_EXE = poppler.pdftoppm;

// Independently hardcoded role list and visible markers — NOT derived from production mapping code
const INDEPENDENT_FIXTURES = [
  { page: 1, marker: "SLOT-01-COVER", role: "cover", filename: "01-cover.png", bg: "#1e3a8a" },
  { page: 2, marker: "SLOT-02-INTRO", role: "intro", filename: "02-intro.png", bg: "#312e81" },
  { page: 3, marker: "SLOT-03-PILOT", role: "pilot", filename: "03-pilot.png", bg: "#1e40af" },
  { page: 4, marker: "SLOT-04-RACER", role: "race-car-driver", filename: "04-race-car-driver.png", bg: "#991b1b" },
  { page: 5, marker: "SLOT-05-ASTRONAUT", role: "astronaut", filename: "05-astronaut.png", bg: "#3730a3" },
  { page: 6, marker: "SLOT-06-DOCTOR", role: "doctor", filename: "06-doctor.png", bg: "#065f46" },
  { page: 7, marker: "SLOT-07-FIREFIGHTER", role: "firefighter", filename: "07-firefighter.png", bg: "#c2410c" },
  { page: 8, marker: "SLOT-08-SCIENTIST", role: "scientist", filename: "08-scientist.png", bg: "#4338ca" },
  { page: 9, marker: "SLOT-09-ARMYOFFICER", role: "army-officer", filename: "09-army-officer.png", bg: "#3f6212" },
  { page: 10, marker: "SLOT-10-SOCCERPLAYER", role: "soccer-player", filename: "10-soccer-player.png", bg: "#15803d" },
  { page: 11, marker: "SLOT-11-KARATEMASTER", role: "karate-master", filename: "11-karate-master.png", bg: "#854d0e" },
  { page: 12, marker: "SLOT-12-DETECTIVE", role: "detective", filename: "12-detective.png", bg: "#713f12" },
  { page: 13, marker: "SLOT-13-MAGICIAN", role: "magician", filename: "13-magician.png", bg: "#581c87" },
  { page: 14, marker: "SLOT-14-CHEF", role: "chef", filename: "14-chef.png", bg: "#9a3412" },
  { page: 15, marker: "SLOT-15-ROCKSTAR", role: "rockstar", filename: "15-rockstar.png", bg: "#831843" },
  { page: 16, marker: "SLOT-16-ARTIST", role: "artist", filename: "16-artist.png", bg: "#0f766e" },
  { page: 17, marker: "SLOT-17-TEACHER", role: "teacher", filename: "17-teacher.png", bg: "#1d4ed8" },
  { page: 18, marker: "SLOT-18-EXPLORER", role: "explorer", filename: "18-explorer.png", bg: "#047857" },
  { page: 19, marker: "SLOT-19-PHOTOGRAPHER", role: "photographer", filename: "19-photographer.png", bg: "#0e7490" },
  { page: 20, marker: "SLOT-20-DIVER", role: "deep-sea-diver", filename: "20-deep-sea-diver.png", bg: "#0369a1" },
  { page: 21, marker: "SLOT-21-VETERINARIAN", role: "veterinarian", filename: "21-veterinarian.png", bg: "#15803d" },
  { page: 22, marker: "SLOT-22-INVENTOR", role: "inventor", filename: "22-inventor.png", bg: "#b45309" },
  { page: 23, marker: "SLOT-23-CLOSING", role: "closing", filename: "23-closing.png", bg: "#4c1d95" },
  { page: 24, marker: "SLOT-24-BACKCOVER", role: "backcover", filename: "24-backcover.png", bg: "#1e1b4b" },
];

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function makeFixture(item: (typeof INDEPENDENT_FIXTURES)[0], destPath: string) {
  const svg = `<svg width="3375" height="2475" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${item.bg}" />
    <rect x="80" y="80" width="3215" height="2315" fill="none" stroke="#ffffff" stroke-width="10" stroke-dasharray="30 20" />
    <circle cx="350" cy="350" r="160" fill="#facc15" />
    <text x="350" y="390" font-size="120" font-family="Arial, sans-serif" font-weight="bold" fill="#000000" text-anchor="middle">P${item.page}</text>
    <text x="1687" y="1050" font-size="200" font-family="Arial, sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4">
      ${item.marker}
    </text>
    <text x="1687" y="1320" font-size="130" font-family="Arial, sans-serif" font-weight="bold" fill="#fef08a" text-anchor="middle">
      PAGE ${item.page}: ${item.role.toUpperCase()}
    </text>
    <text x="1687" y="1520" font-size="80" font-family="Arial, sans-serif" fill="#e2e8f0" text-anchor="middle">
      CANONICAL FILE: ${item.filename} | 3375x2475 @ 300 PPI
    </text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(destPath, buf);
}

async function main() {
  console.log("===================================================================");
  console.log("FIFTH & SIXTH DIRECTIVES: REAL USER-FACING BROWSER E2E TEST & PDF PROOF");
  console.log("===================================================================");

  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const fixturesDir = path.join(process.cwd(), "scratch", "dream_big_fixtures");
  await fs.mkdir(fixturesDir, { recursive: true });

  console.log("\n1. Generating 24 deterministic role-labelled fixture images (3375x2475)...");
  const uploadedFiles: string[] = [];
  for (const item of INDEPENDENT_FIXTURES) {
    const dest = path.join(fixturesDir, item.filename);
    await makeFixture(item, dest);
    uploadedFiles.push(dest);
  }
  console.log(`✓ Generated 24 fixtures in ${fixturesDir}`);

  // Launch Playwright browser
  console.log("\n2. Launching browser subagent to execute real user-facing flow...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Navigate to application
  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { timeout: 60000 });
  await page.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });
  console.log("✓ App loaded successfully");

  // Select Dream Big
  const dreamBigBtn = page.locator('button:has-text("Dream Big")');
  if (await dreamBigBtn.count() > 0) {
    await dreamBigBtn.click();
    console.log("✓ Selected story 'Dream Big'");
  }

  // Select Classic Landscape 11x8
  const profileSelect = page.locator("select#print-profile");
  if (await profileSelect.count() > 0) {
    await profileSelect.selectOption("classic-landscape-11x8");
    console.log("✓ Selected print profile 'Classic Landscape 11×8'");
  }

  // Fill child name
  const nameInput = page.locator('input[placeholder="e.g. Alex"]');
  await nameInput.fill("Alex");
  console.log("✓ Entered child name 'Alex'");

  // Select Standard Single
  const standardSingleRadio = page.locator('input[type="radio"][value="standard-single"]');
  if (await standardSingleRadio.count() > 0) {
    await standardSingleRadio.check();
    console.log("✓ Selected layout mode 'Standard Single'");
  }

  // Click 'Get my prompts →'
  const getPromptsBtn = page.locator('button:has-text("Get my prompts →")');
  await getPromptsBtn.click();
  await page.waitForSelector('input[type="file"][multiple]', { state: "attached", timeout: 30000 });
  console.log("✓ Generated prompts and navigated to upload step");

  // Upload 24 deterministic role-labelled images through real file input
  console.log("Uploading 24 deterministic role-labelled images...");
  const fileInput = page.locator('input[type="file"][multiple]').first();
  await fileInput.setInputFiles(uploadedFiles);
  await page.waitForTimeout(2500);
  console.log("✓ 24 images uploaded via real file input");

  const buttons = await page.locator("button").allInnerTexts();
  console.log("Found buttons on page:", buttons);
  const reportText = await page.locator("div[class*='instructions']").allInnerTexts();
  console.log("Report div text:", reportText);
  const hintText = await page.locator("span[class*='hint']").allInnerTexts();
  console.log("Hint text:", hintText);

  // Enter Book Review
  const reviewBtn = page.locator('button:has-text("Review book →")');
  await reviewBtn.waitFor({ state: "visible", timeout: 15000 });
  await reviewBtn.click();
  await page.waitForSelector('button:has-text("Build my PDF")', { timeout: 15000 });
  console.log("✓ Navigated into Book Review");

  // Confirm user-facing numbering begins at Physical page 1, never Page 0
  const reviewPageText = await page.content();
  if (reviewPageText.includes("Physical page 0") || reviewPageText.includes("Physical Page 0") || reviewPageText.includes("Page 0 —")) {
    throw new Error("FAIL: Found 'Page 0' in user-facing Book Review UI!");
  }
  console.log("✓ Verified: User-facing numbering begins at Physical page 1, never Page 0");

  // Verify first and last tiles in Book Review
  const page1Header = await page.locator('text=/Physical page 1\\s*[—–-]\\s*Cover/i').first().count();
  const page2Header = await page.locator('text=/Physical page 2\\s*[—–-]\\s*Intro/i').first().count();
  const page3Header = await page.locator('text=/Physical page 3\\s*[—–-]\\s*Pilot/i').first().count();
  const page24Header = await page.locator('text=/Physical page 24\\s*[—–-]\\s*Back cover/i').first().count();

  console.log(`Tile checks: P1 Cover: ${page1Header > 0}, P2 Intro: ${page2Header > 0}, P3 Pilot: ${page3Header > 0}, P24 Back Cover: ${page24Header > 0}`);
  if (page1Header === 0 || page2Header === 0 || page3Header === 0 || page24Header === 0) {
    throw new Error("FAIL: Book Review tiles do not correctly show Physical page 1 — Cover, 2 — Intro, 3 — Pilot, or 24 — Back cover");
  }

  // Intercept and capture exact API response
  console.log("\n3. Triggering production export button and capturing API response...");
  let capturedApiResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    bodyLength: number;
  } | null = null;

  page.on("response", async (resp) => {
    if (resp.url().includes("/api/assemble")) {
      const headers = resp.headers();
      let bodyLength = 0;
      try {
        const b = await resp.body();
        bodyLength = b.length;
      } catch {
        /* ignore */
      }
      capturedApiResponse = {
        status: resp.status(),
        statusText: resp.statusText(),
        headers,
        bodyLength,
      };
      console.log(`Captured /api/assemble response: HTTP ${resp.status()} ${resp.statusText()} (${(bodyLength / 1024 / 1024).toFixed(2)} MB)`);
    }
  });

  const buildPdfBtn = page.locator('button:has-text("Build my PDF")');
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    buildPdfBtn.click(),
  ]);

  const outputPdfPath = path.join(ARTIFACTS_DIR, "proof-dream-big-production.pdf");
  await download.saveAs(outputPdfPath);
  await browser.close();

  const pdfBuf = await fs.readFile(outputPdfPath);
  const pdfSha = sha256(pdfBuf);
  console.log(`\n✓ Successfully saved production PDF to: ${outputPdfPath}`);
  console.log(`  Size: ${pdfBuf.length} bytes (${(pdfBuf.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  SHA-256: ${pdfSha}`);

  // 4. Render all PDF pages to PNG using pdftoppm
  console.log("\n4. Rendering all 24 PDF pages to PNG using pdftoppm...");
  const renderedPagesDir = path.join(ARTIFACTS_DIR, "rendered_pages");
  await fs.mkdir(renderedPagesDir, { recursive: true });

  const pagePrefix = path.join(renderedPagesDir, "page");
  await execFileAsync(PDFTOPPM_EXE, ["-png", "-r", "150", outputPdfPath, pagePrefix]);

  const renderedFiles = (await fs.readdir(renderedPagesDir))
    .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
    .sort();

  console.log(`✓ Rendered ${renderedFiles.length} pages to PNG in ${renderedPagesDir}`);
  if (renderedFiles.length !== 24) {
    throw new Error(`Expected 24 rendered pages, found ${renderedFiles.length}`);
  }

  // 5. Create 24-page contact sheet
  console.log("\n5. Creating 24-page contact sheet for visual review...");
  const thumbW = 400;
  const thumbH = 293;
  const cols = 6;
  const rows = 4;
  const sheetW = cols * thumbW;
  const sheetH = rows * thumbH;

  const composites: OverlayOptions[] = [];
  for (let i = 0; i < renderedFiles.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const pageImgPath = path.join(renderedPagesDir, renderedFiles[i]);
    const resizedThumb = await sharp(pageImgPath).resize(thumbW, thumbH, { fit: "cover" }).toBuffer();

    composites.push({
      input: resizedThumb,
      left: col * thumbW,
      top: row * thumbH,
    });
  }

  const contactSheetPath = path.join(ARTIFACTS_DIR, "dream-big-contact-sheet.png");
  await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(contactSheetPath);

  console.log(`✓ Created 24-page contact sheet: ${contactSheetPath}`);

  // 6. Run Poppler command-line inspection
  console.log("\n6. Running pdfinfo and pdfimages inspection...");
  const pdfinfoRes = await execFileAsync(PDFINFO_EXE, [outputPdfPath]);
  console.log("\n--- RAW PDFINFO OUTPUT ---");
  console.log(pdfinfoRes.stdout);

  const pdfimagesRes = await execFileAsync(PDFIMAGES_EXE, ["-list", outputPdfPath]);
  console.log("\n--- RAW PDFIMAGES -LIST OUTPUT ---");
  console.log(pdfimagesRes.stdout);

  // Deep structural inspection with inspectPdfPreflight
  const inspection = inspectPdfPreflight(pdfBuf, 11, 8, 0.125);
  console.log("\n--- INTERNAL PREFLIGHT INSPECTION ---");
  console.log(`Page count: ${inspection.pageCount}`);
  console.log(`Embedded rasters: ${inspection.embeddedRasterDimensions.length}`);
  console.log(`Non-uniform scaling: ${inspection.hasNonUniformScaling}`);
  console.log(`Vector story text: ${inspection.hasVectorStoryText}`);
  console.log(`Min production PPI: ${inspection.minProductionPpi}`);
  console.log(`MediaBoxes: ${inspection.mediaBoxes.length}`);
  console.log(`BleedBoxes: ${inspection.bleedBoxes.length}`);
  console.log(`TrimBoxes: ${inspection.trimBoxes.length}`);

  if (inspection.pageCount !== 24) throw new Error(`Page count is ${inspection.pageCount}, expected 24`);
  if (inspection.embeddedRasterDimensions.length !== 24) throw new Error(`Raster count is ${inspection.embeddedRasterDimensions.length}, expected 24`);
  for (const dim of inspection.embeddedRasterDimensions) {
    if (dim.width !== 3375 || dim.height !== 2475) {
      throw new Error(`Invalid raster dimension: ${dim.width}x${dim.height}, expected 3375x2475`);
    }
  }

  // 7. Negative test: Upload only 22 legacy files and assert HTTP 400
  console.log("\n7. Executing real negative test: 22 legacy files without cover and intro...");
  const formData22 = new FormData();
  formData22.append("name", "Alex");
  formData22.append("age", "4");
  formData22.append("gender", "boy");
  formData22.append("bookId", "dream-big");
  formData22.append("profileId", "classic-landscape-11x8");
  formData22.append("layoutMode", "standard-single");

  // Send only 22 career files (01.png to 22.png)
  for (let i = 1; i <= 22; i++) {
    const fn = `${String(i).padStart(2, "0")}.png`;
    const buf = await sharp({
      create: { width: 3375, height: 2475, channels: 3, background: { r: 100, g: 100, b: 100 } },
    }).png().toBuffer();
    formData22.append("images", new File([new Uint8Array(buf)], fn, { type: "image/png" }));
  }

  const negRes = await fetch("http://localhost:3000/api/assemble", {
    method: "POST",
    body: formData22,
  });

  console.log(`Negative test HTTP status: ${negRes.status} (expected: 400)`);
  const negJson = await negRes.json();
  console.log(`Negative test error code: ${negJson.code} (expected: MISSING_REQUIRED_ARTWORK)`);
  console.log(`Missing slots: ${JSON.stringify(negJson.missingSlots)}`);

  if (negRes.status !== 400) throw new Error(`Expected HTTP 400, got ${negRes.status}`);
  if (negJson.code !== "MISSING_REQUIRED_ARTWORK") throw new Error(`Expected code MISSING_REQUIRED_ARTWORK, got ${negJson.code}`);

  // Save audit log
  const auditSummary = {
    testDate: new Date().toISOString(),
    sha256: pdfSha,
    fileSize: pdfBuf.length,
    pageCount: inspection.pageCount,
    rasterCount: inspection.embeddedRasterDimensions.length,
    rasterDimensions: "3375x2475",
    outputGridPpi: 300,
    hasNonUniformScaling: inspection.hasNonUniformScaling,
    hasVectorStoryText: inspection.hasVectorStoryText,
    mediaBox: inspection.mediaBoxes[0],
    bleedBox: inspection.bleedBoxes[0],
    trimBox: inspection.trimBoxes[0],
    capturedApiResponse,
    pdfinfoOutput: pdfinfoRes.stdout,
    pdfimagesOutput: pdfimagesRes.stdout,
    negativeTestCase: {
      status: negRes.status,
      code: negJson.code,
      missingSlots: negJson.missingSlots,
    },
  };

  await fs.writeFile(
    path.join(ARTIFACTS_DIR, "production-audit-report.json"),
    JSON.stringify(auditSummary, null, 2),
  );

  console.log("\n===================================================================");
  console.log("ALL E2E BROWSER AUDIT GATES PASSED EMPIRICALLY!");
  console.log("===================================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR in browser audit:", err);
  process.exit(1);
});
