import { chromium } from "playwright";
import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

async function findLatestExportDir(prefix: string): Promise<string> {
  const base = path.join(process.cwd(), "storybook-out");
  const entries = await readdir(base, { withFileTypes: true });
  const matching = entries
    .filter((e) => e.isDirectory() && e.name.toLowerCase().includes(prefix.toLowerCase()))
    .map((e) => path.join(base, e.name));

  if (matching.length === 0) {
    const all = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    throw new Error(`No export directory found matching prefix "${prefix}" in ${base}. All directories: [${all.join(", ")}]`);
  }

  // Pick most recently modified directory
  matching.sort((a, b) => b.localeCompare(a));
  const chosen = matching[0];

  // If chosen has a profile subfolder (e.g. printify-hardcover-square-8x8 or lulu-landscape-11x8.5), descend into it
  const subEntries = await readdir(chosen, { withFileTypes: true });
  const subDirs = subEntries.filter((e) => e.isDirectory());
  if (subDirs.length > 0) {
    return path.join(chosen, subDirs[0].name);
  }

  return chosen;
}

async function main() {
  console.log("==================================================");
  console.log("MANDATORY FIX PART 4 END-TO-END LIVE BROWSER TEST");
  console.log("==================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Open app
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('button:has-text("Dream Big")', { timeout: 60000 });
    console.log("✓ Step 1: Opened http://localhost:3000");

    // 2. Select Dream Big story & Lulu Premium Color Landscape 11x8.5
    await page.click('button:has-text("Dream Big")');
    await page.selectOption("select", "lulu-landscape-11x8.5");
    await page.fill('input[placeholder="e.g. Alex"]', "LuluPart4Child");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(1000);
    console.log("✓ Step 2: Selected Lulu Premium Color Landscape 11x8.5 profile");

    // 3. Ensure test-fixtures/great-adventure-source contains 24 images
    const fixtureDir = path.join(process.cwd(), "test-fixtures", "great-adventure-source");
    await mkdir(fixtureDir, { recursive: true });

    const existing = await readdir(fixtureDir);
    if (existing.length < 24) {
      console.log("Generating 24 fixture images for Playwright E2E test...");
      for (let i = 1; i <= 24; i++) {
        const fn = `${String(i).padStart(2, "0")}.png`;
        const filePath = path.join(fixtureDir, fn);
        const ratio = i % 2 === 0 ? 2 : 1;
        const width = ratio === 2 ? 800 : 400;
        const height = 400;
        const buf = await sharp({
          create: {
            width,
            height,
            channels: 3,
            background: { r: (i * 10) % 255, g: (i * 20) % 255, b: (i * 30) % 255 },
          },
        })
          .png()
          .toBuffer();
        await writeFile(filePath, buf);
      }
    }

    const fixtureFiles = (await readdir(fixtureDir))
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => path.join(fixtureDir, f));

    const fileInput = page.locator('input[type="file"][multiple]');
    await fileInput.setInputFiles(fixtureFiles);
    await page.waitForTimeout(2000);
    console.log(`✓ Step 3: Imported ${fixtureFiles.length} Dream Big source images`);

    // 4. Click Review book ->
    await page.click('button:has-text("Review book →")');
    await page.waitForTimeout(1500);
    console.log("✓ Step 4: Entered Book Review mode");

    // 5. Trigger PDF build / export
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
    await page.click('button:has-text("Build my PDF 📖")');
    await page.waitForTimeout(4000);

    const download = await downloadPromise;
    console.log("✓ Step 5: Triggered Lulu PDF export");

    // 6. Inspect Lulu output package in storybook-out/
    const luluExportDir = await findLatestExportDir("lulupart4child");
    console.log(`✓ Step 6: Located Lulu export package at:\n  ${luluExportDir}`);

    const dirFiles = await readdir(luluExportDir);
    console.log("Package files:", dirFiles.join(", "));

    if (!dirFiles.includes("interior.pdf")) throw new Error("Missing interior.pdf in Lulu package!");
    if (!dirFiles.includes("proof.pdf")) throw new Error("Missing proof.pdf in Lulu package!");
    if (!dirFiles.includes("order-info.txt")) throw new Error("Missing order-info.txt in Lulu package!");

    // 7. Validate PDF page dimensions (MediaBox = 810 x 630 pt)
    const pdfBuf = await readFile(path.join(luluExportDir, "interior.pdf"));
    const pdfStr = pdfBuf.toString("latin1");

    const mbMatch = pdfStr.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/i);
    if (!mbMatch) {
      throw new Error("Could not locate /MediaBox tag in Lulu interior PDF!");
    }
    const actualW = Math.round(Math.abs(parseFloat(mbMatch[3]) - parseFloat(mbMatch[1])));
    const actualH = Math.round(Math.abs(parseFloat(mbMatch[4]) - parseFloat(mbMatch[2])));

    if (actualW !== 810 || actualH !== 630) {
      throw new Error(`Lulu interior PDF MediaBox ${actualW}x${actualH} pt does NOT equal expected 810 x 630 pt!`);
    }
    console.log(`✓ Step 7: Verified PDF MediaBox equals exact ${actualW} x ${actualH} pt (11.25 x 8.75 in @ 72pt/in)`);

    // 8. Validate order-info.txt contents
    const orderInfoText = await readFile(path.join(luluExportDir, "order-info.txt"), "utf-8");
    if (!orderInfoText.includes("Premium Color")) {
      throw new Error("order-info.txt missing Premium Color preset confirmation!");
    }
    if (!orderInfoText.includes("3375 x 2625 px")) {
      throw new Error("order-info.txt missing 3375 x 2625 px raster confirmation!");
    }
    console.log("✓ Step 8: Verified order-info.txt contains Premium Color and 3375x2625 px metrics");

    // 9. PRINTIFY REGRESSION TEST
    console.log("==================================================");
    console.log("RUNNING PRINTIFY 8x8 REGRESSION TEST");
    console.log("==================================================");

    await page.click('button:has-text("← Back to illustrations")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("← Edit details")');
    await page.waitForTimeout(500);
    await page.selectOption("select", "printify-hardcover-square-8x8");
    await page.fill('input[placeholder="e.g. Alex"]', "PrintifyRegressChild");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(1000);

    // Re-import fixture images for Printify
    await fileInput.setInputFiles(fixtureFiles);
    await page.waitForTimeout(2000);

    await page.click('button:has-text("Review book →")');
    await page.waitForTimeout(1500);

    await page.click('button:has-text("Export for Printify 📦")');
    await page.waitForTimeout(6000);

    const printifyExportDir = await findLatestExportDir("printifyregresschild");
    console.log(`✓ Step 9: Located Printify export package at:\n  ${printifyExportDir}`);

    const printifyFiles = await readdir(printifyExportDir);
    if (!printifyFiles.includes("cover.png")) throw new Error("Missing cover.png in Printify export!");
    if (!printifyFiles.includes("page-01.png")) throw new Error("Missing page-01.png in Printify export!");

    const p01Meta = await sharp(path.join(printifyExportDir, "page-01.png")).metadata();
    if (p01Meta.width !== 2400 || p01Meta.height !== 2400) {
      throw new Error(`Printify page-01.png dimensions ${p01Meta.width}x${p01Meta.height} != 2400x2400!`);
    }

    const coverMeta = await sharp(path.join(printifyExportDir, "cover.png")).metadata();
    if (coverMeta.width !== 5370 || coverMeta.height !== 2850) {
      throw new Error(`Printify cover.png dimensions ${coverMeta.width}x${coverMeta.height} != 5370x2850!`);
    }

    console.log("✓ Step 10: Printify dimensions remain 100% UNCHANGED (2400x2400 interior, 5370x2850 cover)");
    console.log("✅ ALL MANDATORY FIX PART 4 END-TO-END LIVE CHECKS PASSED PERFECTLY!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ E2E Test failed:", err);
  process.exit(1);
});
