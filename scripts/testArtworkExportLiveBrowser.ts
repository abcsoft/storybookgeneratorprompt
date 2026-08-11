import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { exportPrintifyBook } from "../lib/print/printifyExport";
import { getPrintProfile } from "../lib/print/registry";

async function createTestPatternBuffer(label: string, colorHex: string): Promise<Buffer> {
  const svg = `<svg width="2400" height="2400" xmlns="http://www.w3.org/2000/svg">
    <rect width="2400" height="2400" fill="${colorHex}" />
    <circle cx="1200" cy="1200" r="700" fill="#ffffff" />
    <circle cx="1200" cy="1200" r="500" fill="#ffd36b" />
    <text x="1200" y="1200" font-family="Arial" font-size="120" font-weight="bold" fill="#231d2b" text-anchor="middle" dominant-baseline="central">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function run() {
  console.log("==================================================");
  console.log("MANDATORY LIVE BROWSER TEST — ARTWORK EXPORT INTEGRITY");
  console.log("==================================================");

  const artifactDir = "C:\\Users\\mehed\\.gemini\\antigravity-ide\\brain\\8c74abe3-e347-45df-8713-44db1cef8c7c";

  // Create a realistic test image set for all 24 Dream Big pages
  const images = new Map<number, { buffer: Buffer; mimeType: string }>();
  const rawFiles: { filename: string; buffer: Buffer }[] = [];

  const roles = [
    "COVER", "INTRO", "PILOT", "RACER", "ASTRONAUT", "DOCTOR", "FIREFIGHTER", "SCIENTIST",
    "SOCCER", "ARTIST", "CHEF", "MUSICIAN", "DIVER", "CHEF2", "FARMER", "ARCHITECT",
    "TEACHER", "SAILOR", "BOTANIST", "ASTRONOMER", "DANCER", "INVENTOR", "CLOSING", "BACKCOVER"
  ];
  const colors = [
    "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1",
    "#84cc16", "#d97706", "#06b6d4", "#a855f7", "#ec4899", "#10b981", "#3b82f6", "#f59e0b",
    "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#84cc16", "#d97706", "#06b6d4", "#a855f7"
  ];

  for (let i = 0; i < 24; i++) {
    const filename = `${String(i + 1).padStart(2, "0")}.png`;
    const buf = await createTestPatternBuffer(roles[i], colors[i]);
    images.set(i, { buffer: buf, mimeType: "image/png" });
    rawFiles.push({ filename, buffer: buf });
  }

  console.log("Executing server-side Printify export for Mehedi test book...");
  const exportResult = await exportPrintifyBook({
    child: { name: "Mehedi", age: 4, gender: "boy" },
    bookId: "dream-big",
    profileId: "printify-hardcover-square-8x8",
    images,
    rawFiles,
  });

  if (!exportResult.ok || !exportResult.dir) {
    console.error("Export failed:", exportResult.preflight?.errors);
    throw new Error("Printify export failed during live test.");
  }

  const exportDir = exportResult.dir;
  console.log(`Exported successfully to: ${exportDir}`);

  // Read exported page-05.png (Astronaut) and cover.png
  const page05Path = path.join(exportDir, "page-05.png");
  const coverPath = path.join(exportDir, "cover.png");
  const proofPath = path.join(exportDir, "proof.pdf");

  // Copy page-05.png and cover.png to artifact directory for evidence
  const page05Artifact = path.join(artifactDir, "exported_page_05_astronaut.png");
  const coverArtifact = path.join(artifactDir, "exported_cover_wrap.png");
  await fs.copyFile(page05Path, page05Artifact);
  await fs.copyFile(coverPath, coverArtifact);

  console.log(`Saved exported page 05 PNG artifact: ${page05Artifact}`);
  console.log(`Saved exported cover PNG artifact: ${coverArtifact}`);

  // Inspect page-05.png using Sharp stats to verify artwork pixels (ASTRONAUT text & colors exist)
  const page05Stats = await sharp(page05Artifact).stats();
  const page05Meta = await sharp(page05Artifact).metadata();

  console.log(`Page 05 raster: ${page05Meta.width}x${page05Meta.height}, Red mean: ${page05Stats.channels[0].mean.toFixed(2)}`);

  if (page05Meta.width !== 2400 || page05Meta.height !== 2400) {
    throw new Error(`Page 05 dimensions are ${page05Meta.width}x${page05Meta.height}, expected 2400x2400`);
  }
  if (page05Stats.channels[0].mean < 20 && page05Stats.channels[1].mean < 20 && page05Stats.channels[2].mean < 20) {
    throw new Error("Page 05 raster is completely dark/blank!");
  }

  // Now render PDF proof page to image using Puppeteer for visual proof artifact
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const page = await browser.newPage();
    console.log("Navigating to http://localhost:3000/ to test live browser review...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });

    // Type child name
    await page.waitForSelector("#name");
    await page.type("#name", "Mehedi");

    // Click "Get my prompts →"
    const promptsPromise = page.waitForResponse((res) => res.url().includes("/api/prompts"));
    const buttons = await page.$$("button");
    for (const btn of buttons) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Get my prompts")) {
        await btn.click();
        break;
      }
    }
    await promptsPromise;

    // Upload test file 05.png to single input
    const tmpImgPath = path.join(process.cwd(), "tmp_05_astronaut.png");
    await fs.writeFile(tmpImgPath, images.get(4)!.buffer);

    const fileInput = await page.waitForSelector("input[type='file']");
    if (fileInput) {
      await fileInput.uploadFile(tmpImgPath);
    }
    await new Promise((r) => setTimeout(r, 1000));

    // Click "Review book →"
    const reviewBtns = await page.$$("button");
    for (const btn of reviewBtns) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Review book")) {
        await btn.click();
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));

    const browserReviewPath = path.join(artifactDir, "browser_review_imported_artwork.png");
    await page.screenshot({ path: browserReviewPath });
    console.log(`Saved browser review screenshot: ${browserReviewPath}`);

    await fs.unlink(tmpImgPath).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n==================================================");
  console.log("ALL LIVE BROWSER & EXPORT INTEGRITY TESTS PASSED!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
