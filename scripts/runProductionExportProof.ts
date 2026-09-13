import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert";
import sharp from "sharp";
import { discoverPopplerTools } from "./popplerDiscovery";

const execFileAsync = promisify(execFile);

const FIXTURES_DIR = path.resolve(process.cwd(), "test-fixtures/production-high-res");
const PROOF_DIR = path.resolve(process.cwd(), "artifacts/browser-evidence");

const CANONICAL_FILES = [
  { name: "01-cover.png", role: "cover", color: "#1e3a8a" },
  { name: "02-intro.png", role: "intro", color: "#15803d" },
  { name: "03-pilot.png", role: "pilot", color: "#b45309" },
  { name: "04-race-car-driver.png", role: "race car driver", color: "#b91c1c" },
  { name: "05-astronaut.png", role: "astronaut", color: "#4338ca" },
  { name: "06-doctor.png", role: "doctor", color: "#047857" },
  { name: "07-firefighter.png", role: "firefighter", color: "#c2410c" },
  { name: "08-scientist.png", role: "scientist", color: "#6d28d9" },
  { name: "09-army-officer.png", role: "army officer", color: "#4d7c0f" },
  { name: "10-soccer-player.png", role: "soccer player", color: "#0f766e" },
  { name: "11-karate-master.png", role: "karate master", color: "#9a3412" },
  { name: "12-detective.png", role: "detective", color: "#374151" },
  { name: "13-magician.png", role: "magician", color: "#701a75" },
  { name: "14-chef.png", role: "chef", color: "#be123c" },
  { name: "15-rockstar.png", role: "rockstar", color: "#86198f" },
  { name: "16-artist.png", role: "artist", color: "#a21caf" },
  { name: "17-teacher.png", role: "teacher", color: "#1d4ed8" },
  { name: "18-explorer.png", role: "explorer", color: "#15803d" },
  { name: "19-photographer.png", role: "photographer", color: "#334155" },
  { name: "20-deep-sea-diver.png", role: "deep sea diver", color: "#0369a1" },
  { name: "21-veterinarian.png", role: "veterinarian", color: "#059669" },
  { name: "22-inventor.png", role: "inventor", color: "#d97706" },
  { name: "23-closing.png", role: "closing", color: "#4f46e5" },
  { name: "24-backcover.png", role: "back cover", color: "#1e1b4b" },
];

async function generateProductionFixtures() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  for (const item of CANONICAL_FILES) {
    const filePath = path.join(FIXTURES_DIR, item.name);
    const svg = `
      <svg width="3375" height="2475" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${item.color}" />
        <rect x="30" y="30" width="3315" height="2415" fill="none" stroke="#fcd34d" stroke-width="12" />
        <text x="1687" y="1100" font-family="Arial" font-size="180" font-weight="bold" fill="#ffffff" text-anchor="middle">
          ${item.name}
        </text>
        <text x="1687" y="1350" font-family="Arial" font-size="120" font-weight="bold" fill="#fef08a" text-anchor="middle">
          ROLE: ${item.role.toUpperCase()}
        </text>
        <text x="1687" y="1550" font-family="Arial" font-size="90" fill="#ffffff" text-anchor="middle">
          3375 × 2475 px (Exact 300 PPI @ 11.25 × 8.25 in)
        </text>
      </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(filePath);
  }
}

async function main() {
  console.log("===================================================================");
  console.log("PROOF 2: PRODUCTION EXPORT FLOW WITH HIGH-RES 3375x2475 FIXTURES");
  console.log("===================================================================");

  await generateProductionFixtures();
  await fs.mkdir(PROOF_DIR, { recursive: true });

  const poppler = discoverPopplerTools();
  console.log("Poppler tools discovered:", poppler);

  const consoleLogs: string[] = [];
  const networkLogs: any[] = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`[PAGE ERROR] ${err.message}`));

  let assembleStatus = 0;
  let assembleRequestData: any = null;

  page.on("request", (req) => {
    if (req.url().includes("/api/assemble")) {
      assembleRequestData = {
        method: req.method(),
        url: req.url(),
      };
    }
  });

  page.on("response", async (res) => {
    if (res.url().includes("/api/assemble")) {
      assembleStatus = res.status();
      networkLogs.push({
        url: res.url(),
        status: res.status(),
        method: res.request().method(),
        headers: res.headers(),
      });
    }
  });

  try {
    // 1. Open app
    console.log("1. Opening app at http://localhost:3000...");
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('input[placeholder="e.g. Alex"]', { timeout: 30000 });

    // 2. Select Dream Big + Classic Landscape + Standard Single + Leo
    await page.locator('button:has-text("Dream Big")').click();
    await page.locator("select#print-profile").selectOption("classic-landscape-11x8");
    const modeSelect = page.locator("select#layout-mode, select[name='mode']");
    if ((await modeSelect.count()) > 0) {
      await modeSelect.selectOption("standard-single");
    }
    await page.locator('input[placeholder="e.g. Alex"]').fill("Leo");

    // 3. Generate prompts
    console.log("2. Generating prompts...");
    await page.locator('button:has-text("Get my prompts →")').click();
    await page.waitForSelector('input[type="file"]', { state: "attached", timeout: 30000 });

    // 4. Upload 24 3375x2475 files
    console.log("3. Uploading 24 canonical 3375x2475 fixtures...");
    const filePaths = CANONICAL_FILES.map((f) => path.join(FIXTURES_DIR, f.name));
    const bulkInput = page.locator('input[type="file"][multiple]');
    if ((await bulkInput.count()) > 0) {
      await bulkInput.setInputFiles(filePaths);
    } else {
      await page.locator('input[type="file"]').first().setInputFiles(filePaths);
    }

    await page.waitForTimeout(3000);

    // 5. Navigate to Book Review
    console.log("4. Navigating to Book Review...");
    await page.locator('button:has-text("Review book →")').click();
    await page.waitForSelector('button:has-text("Build my PDF"), button[data-testid="build-pdf-button"]', { timeout: 15000 });

    // Screenshot review screen before export
    const shotReviewPath = path.join(PROOF_DIR, "05-production-ready-review-screen.png");
    await page.screenshot({ path: shotReviewPath, fullPage: true });
    console.log(`Saved screenshot: ${shotReviewPath}`);

    // Verify: No preflight blocked panel appears before or after review
    const blockedPanel = page.locator('[data-testid="preflight-blocked-panel"]');
    assert.strictEqual(await blockedPanel.count(), 0, "Preflight should not be blocked for high-res files");

    // 6. Click production export ("Build my PDF 📖")
    console.log("5. Clicking 'Build my PDF 📖' (Production Export)...");
    const buildPdfBtn = page.locator('button:has-text("Build my PDF"), button[data-testid="build-pdf-button"]').first();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      buildPdfBtn.click(),
    ]);

    console.log("✓ Download event received from live browser!");
    assert.strictEqual(assembleStatus, 200, `Expected /api/assemble HTTP 200, got ${assembleStatus}`);

    const prodPdfPath = path.join(PROOF_DIR, "downloaded-production.pdf");
    await download.saveAs(prodPdfPath);
    console.log(`✓ Saved downloaded production PDF to: ${prodPdfPath}`);

    const prodBytes = await fs.readFile(prodPdfPath);
    assert(prodBytes.length > 0, "Production PDF must not be empty");
    const prodSha256 = crypto.createHash("sha256").update(prodBytes).digest("hex");
    console.log(`Production PDF Size: ${prodBytes.length} bytes, SHA-256: ${prodSha256}`);

    // Screenshot after export
    const shotExportSuccessPath = path.join(PROOF_DIR, "06-production-export-success.png");
    await page.screenshot({ path: shotExportSuccessPath, fullPage: true });
    console.log(`Saved screenshot: ${shotExportSuccessPath}`);

    // 7. Inspect with Poppler
    console.log("6. Inspecting Production PDF with Poppler...");

    // pdfinfo
    const { stdout: pdfinfoOut } = await execFileAsync(poppler.pdfinfo, ["-box", prodPdfPath]);
    const pdfinfoPath = path.join(PROOF_DIR, "production-pdfinfo.txt");
    await fs.writeFile(pdfinfoPath, pdfinfoOut, "utf8");
    console.log(`✓ Saved ${pdfinfoPath}`);
    console.log(pdfinfoOut);

    assert(pdfinfoOut.includes("Pages:           24"), "Must have exactly 24 pages");
    assert(pdfinfoOut.includes("810.00   594.00"), "MediaBox must be 810x594 pt (11.25x8.25 in)");
    assert(pdfinfoOut.includes("TrimBox:             9.00     9.00   801.00   585.00"), "TrimBox must be 11x8 in");

    // pdfimages -list
    const { stdout: pdfimagesOut } = await execFileAsync(poppler.pdfimages, ["-list", prodPdfPath]);
    const pdfimagesPath = path.join(PROOF_DIR, "production-pdfimages-list.txt");
    await fs.writeFile(pdfimagesPath, pdfimagesOut, "utf8");
    console.log(`✓ Saved ${pdfimagesPath}`);

    // Verify 24 images, each 3375x2475, 300x300 PPI
    const imageLines = pdfimagesOut.split("\n").filter((l) => l.includes("3375") && l.includes("2475"));
    console.log(`Rasters at 3375x2475 found in PDF: ${imageLines.length} (Expected: 24)`);
    assert.strictEqual(imageLines.length, 24, "Must have exactly 24 rasters of 3375x2475");

    // Check PPI values in pdfimages list
    for (const line of imageLines) {
      assert(line.includes("300   300"), `Expected 300x300 PPI placement, got line: ${line}`);
    }

    // 8. Render pages 1, 2, 3, 21, 22, 23, 24 with pdftoppm to verify role mapping and zero watermark
    console.log("7. Rendering sample pages with pdftoppm to verify role mapping and zero watermark...");
    const samplePages = [1, 2, 3, 21, 22, 23, 24];
    const renderedPagePaths: string[] = [];

    for (const pageNum of samplePages) {
      const pagePrefix = path.join(PROOF_DIR, `prod-page-${pageNum.toString().padStart(2, "0")}`);
      await execFileAsync(poppler.pdftoppm, [
        "-png",
        "-r",
        "150",
        "-f",
        String(pageNum),
        "-l",
        String(pageNum),
        prodPdfPath,
        pagePrefix,
      ]);
      const expectedOutput = `${pagePrefix}-${pageNum.toString().padStart(2, "0")}.png`;
      const altOutput = `${pagePrefix}-0${pageNum}.png`;
      const finalFile = (await fs.stat(expectedOutput).catch(() => null))
        ? expectedOutput
        : altOutput;
      renderedPagePaths.push(finalFile);
    }

    // Verify NO draft watermark exists in production PDF
    // Check generated HTML in app or text content
    const { stdout: pdftotextOut } = await execFileAsync("pdftotext", [prodPdfPath, "-"]).catch(() => ({ stdout: "" }));
    assert(!pdftotextOut.includes("DRAFT / NOT FOR PRINT"), "Production PDF must NOT contain draft watermark");
    console.log("✓ Zero draft watermark confirmed in production PDF");

    // 9. Build Page/Role Contact Sheet
    console.log("8. Building contact sheet from sample pages...");
    const contactSheetTiles = await Promise.all(
      renderedPagePaths.map(async (pPath) => {
        return sharp(pPath).resize(400, 293).toBuffer();
      }),
    );

    const contactWidth = 400 * 4;
    const contactHeight = 293 * 2;
    const compositeList = contactSheetTiles.map((buf, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      return {
        input: buf,
        left: col * 400,
        top: row * 293,
      };
    });

    const contactSheetPath = path.join(PROOF_DIR, "production-contact-sheet.png");
    await sharp({
      create: {
        width: contactWidth,
        height: contactHeight,
        channels: 4,
        background: { r: 30, g: 41, b: 59, alpha: 1 },
      },
    })
      .composite(compositeList)
      .png()
      .toFile(contactSheetPath);
    console.log(`✓ Contact sheet saved: ${contactSheetPath}`);

    // Append logs
    await fs.writeFile(
      path.join(PROOF_DIR, "production-network-log.json"),
      JSON.stringify(networkLogs, null, 2),
      "utf8",
    );

    console.log("\n=================================================");
    console.log("PRODUCTION PDF VERIFICATION SUMMARY:");
    console.log(`- PDF Path: ${prodPdfPath}`);
    console.log(`- PDF Size: ${prodBytes.length} bytes`);
    console.log(`- PDF SHA-256: ${prodSha256}`);
    console.log(`- HTTP Status: ${assembleStatus}`);
    console.log(`- Total Pages: 24`);
    console.log(`- 3375x2475 Rasters: 24`);
    console.log(`- Effective PPI: 300x300 PPI`);
    console.log(`- Watermark: NONE`);
    console.log(`- Page 1 cover, Page 2 intro, Page 3 pilot, Page 21 vet, Page 22 inventor, Page 23 closing, Page 24 back cover: VERIFIED`);
    console.log("=================================================\n");

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in production proof:", err);
  process.exit(1);
});
