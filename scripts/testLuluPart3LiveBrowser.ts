import { chromium } from "playwright";

async function main() {
  console.log("Starting Mandatory Lulu Part 3 Live Browser Prompt Verification with Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Open app
    await page.goto("http://localhost:3000", { timeout: 60000 });
    await page.waitForSelector('button:has-text("Dream Big")', { timeout: 60000 });
    console.log("✓ Step 1: Opened http://localhost:3000");

    // 2. Select Dream Big story & Printify Square 8x8 profile
    await page.click('button:has-text("Dream Big")');
    await page.selectOption("select", "printify-hardcover-square-8x8");
    await page.fill('input[placeholder="e.g. Alex"]', "PromptTestChild");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(1000);
    console.log("✓ Step 2: Selected Printify Square 8x8 profile");

    // Expand Cover prompt card (first IllustrationCard)
    const viewPromptBtn1 = page.locator('button:has-text("View full prompt")').nth(0);
    await viewPromptBtn1.click();
    await page.waitForTimeout(300);

    // Capture Cover prompt text (nth(1) after anchor prompt)
    const printifyCoverPrompt = await page.locator('p[class*="promptText"]').nth(1).innerText();
    console.log("Printify Square Cover Prompt:\n", printifyCoverPrompt.slice(0, 300) + "...\n");

    if (!printifyCoverPrompt.includes("Square 1:1 composition")) {
      throw new Error("Printify Square cover prompt missing 'Square 1:1 composition'!");
    }

    // 3. Navigate back and select Lulu Landscape 11x8.5 profile
    await page.click('button:has-text("← Edit details")');
    await page.waitForTimeout(300);
    await page.selectOption("select", "lulu-landscape-11x8.5");
    await page.click('button:has-text("Get my prompts →")');
    await page.waitForTimeout(1000);
    console.log("✓ Step 3: Selected Lulu Landscape 11x8.5 profile");

    // Expand Cover prompt card
    const viewPromptBtn2 = page.locator('button:has-text("View full prompt")').nth(0);
    await viewPromptBtn2.click();
    await page.waitForTimeout(300);

    // Capture Cover prompt text for Lulu Landscape
    const luluCoverPrompt = await page.locator('p[class*="promptText"]').nth(1).innerText();
    console.log("Lulu Landscape Cover Prompt:\n", luluCoverPrompt.slice(0, 300) + "...\n");

    if (!luluCoverPrompt.includes("Landscape composition")) {
      throw new Error("Lulu Landscape cover prompt missing 'Landscape composition'!");
    }

    // 4. Verify prompts for same scene differ dynamically based on profile
    if (printifyCoverPrompt === luluCoverPrompt) {
      throw new Error("Printify Square and Lulu Landscape prompts are byte-identical!");
    }
    console.log("✓ Step 4: Confirmed prompt text updates dynamically when switching print profiles!");

    console.log("✅ ALL MANDATORY LULU PART 3 LIVE PROMPT CHECKS PASSED PERFECTLY!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
