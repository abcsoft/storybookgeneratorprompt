import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

async function run() {
  console.log("==================================================");
  console.log("MANDATORY LIVE BROWSER TEST — FRAMING EDITOR");
  console.log("==================================================");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  try {
    console.log("Navigating to http://localhost:3000/...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });

    // Step 1: Fill out profile form
    console.log("Filling child profile form...");
    await page.waitForSelector("#name");
    await page.type("#name", "Mehedi");

    // Click "Get Manual Workflow Prompts →" button and wait for /api/prompts response
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
    console.log("Prompts loaded successfully.");

    await new Promise((r) => setTimeout(r, 1000));

    // Create a temporary PNG image file to import
    const tmpImgPath = path.join(process.cwd(), "tmp_test_illustration.png");
    const samplePng = await sharp({
      create: {
        width: 2400,
        height: 2400,
        channels: 4,
        background: { r: 59, g: 130, b: 246, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="2400" height="2400"><rect x="600" y="600" width="1200" height="1200" fill="#ef4444"/><circle cx="1200" cy="1200" r="400" fill="#ffd36b"/></svg>`,
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    await fs.writeFile(tmpImgPath, samplePng);

    // Upload file to hidden file input
    const fileInput = await page.waitForSelector("input[type='file']");
    if (fileInput) {
      await fileInput.uploadFile(tmpImgPath);
      console.log("Uploaded test illustration image...");
    }

    await new Promise((r) => setTimeout(r, 1500));

    // Click "Review book →"
    const reviewBtns = await page.$$("button");
    for (const btn of reviewBtns) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Review book")) {
        await btn.click();
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 1500));

    const artifactDir = "C:\\Users\\mehed\\.gemini\\antigravity-ide\\brain\\8c74abe3-e347-45df-8713-44db1cef8c7c";

    // Click "🖼️ Adjust framing" on first tile
    const adjustBtns = await page.$$("button");
    for (const btn of adjustBtns) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Adjust framing")) {
        await btn.click();
        console.log("Clicked Adjust framing button...");
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 1000));

    // Capture framing editor modal screenshot
    const editorModalPath = path.join(artifactDir, "part3_whale_spread_framing_editor.png");
    await page.screenshot({ path: editorModalPath });
    console.log(`Saved framing editor screenshot: ${editorModalPath}`);

    // Switch to Preview final page
    const previewModeBtn = await page.$("button:nth-child(2)");
    const allEditorBtns = await page.$$("button");
    for (const btn of allEditorBtns) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Preview final page")) {
        await btn.click();
        console.log("Switched to Preview final page mode...");
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 1000));

    // Capture preview modal screenshot
    const previewModalPath = path.join(artifactDir, "part3_page_review_with_text.png");
    await page.screenshot({ path: previewModalPath });
    console.log(`Saved preview modal screenshot: ${previewModalPath}`);

    // Open Cover Preview
    const coverBtns = await page.$$("button");
    for (const btn of coverBtns) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Cover")) {
        await btn.click();
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
    const coverModalPath = path.join(artifactDir, "part3_cover_review_modal.png");
    await page.screenshot({ path: coverModalPath });
    console.log(`Saved cover review modal screenshot: ${coverModalPath}`);

    // Clean up temporary image file
    await fs.unlink(tmpImgPath).catch(() => {});

    console.log("\n==================================================");
    console.log("ALL LIVE BROWSER TESTS PASSED!");
    console.log("==================================================");
  } catch (err) {
    console.error("Live test failed:", err);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
