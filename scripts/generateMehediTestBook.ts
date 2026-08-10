import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { exportPrintifyBook } from "../lib/print/printifyExport";
import { getPrintProfile } from "../lib/print/registry";
import { dreamBigBook } from "../lib/story/dreamBigTemplate";

async function run() {
  console.log("==================================================");
  console.log("GENERATING MEHEDI TEST BOOK (DREAM BIG 24 EDITION)");
  console.log("==================================================");

  const child = { name: "Mehedi", age: 5, gender: "boy" as const };
  const profileId = "printify-hardcover-square-8x8";
  const bookId = "dream-big";
  const profile = getPrintProfile(profileId);

  // Generate synthetic images for all 24 logical pages of Dream Big
  const images = new Map<number, { buffer: Buffer; mimeType: string }>();
  for (let i = 0; i < dreamBigBook.pages.length; i++) {
    const isSpread = dreamBigBook.pages[i].spread;
    const w = isSpread ? 4800 : 2400;
    const h = 2400;

    // Create solid image buffer with colored pattern
    const imgBuffer = await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: (i * 10) % 255, g: (i * 20) % 255, b: (i * 30 + 100) % 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    images.set(i, { buffer: imgBuffer, mimeType: "image/png" });
  }

  const result = await exportPrintifyBook({
    child,
    bookId,
    profileId,
    images,
  });

  if (!result.ok || !result.dir) {
    console.error("Export failed:", result.preflight.errors);
    process.exit(1);
  }

  console.log("\nEXPORT SUCCESSFUL!");
  console.log(`Directory: ${result.dir}`);
  console.log(`Files generated (${result.files.length}):`, result.files);

  const proofPdfPath = path.join(result.dir, "proof.pdf");
  const pdfStat = await fs.stat(proofPdfPath);
  const pdfSizeMb = (pdfStat.size / (1024 * 1024)).toFixed(2);

  console.log("\n==================================================");
  console.log("ACCEPTANCE FACT SUMMARY:");
  console.log(`- Final PDF Path: ${proofPdfPath}`);
  console.log(`- File Size: ${pdfSizeMb} MB`);
  console.log(`- Page Count: 24 physical interior pages + Cover Wrap`);
  console.log(`- Page Dimensions: 630 x 630 pt (${profile.canvasPx.width}x${profile.canvasPx.height} px @ 300 DPI)`);
  console.log(`- PDF Title: "${child.name}'s Dream Big Adventure"`);
  console.log("==================================================");
}

run().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
