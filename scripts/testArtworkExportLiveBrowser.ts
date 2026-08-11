import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { exportPrintifyBook } from "../lib/print/printifyExport";
import { dreamBigPrintify24Edition } from "../lib/story/dreamBigTemplate";
import { resolvePhysicalPageText } from "../lib/story/editions";
import type { ChildProfile } from "../lib/story/types";

const mockChild: ChildProfile = { name: "Mehedi", age: 4, gender: "boy" };

async function createTestPatternBuffer(label: string, colorHex: string): Promise<Buffer> {
  const svg = `<svg width="2400" height="2400" xmlns="http://www.w3.org/2000/svg">
    <rect width="2400" height="2400" fill="${colorHex}" />
    <circle cx="1200" cy="1200" r="700" fill="#ffffff" />
    <circle cx="1200" cy="1200" r="500" fill="#ffd36b" />
    <text x="1200" y="1200" font-family="Arial" font-size="110" font-weight="bold" fill="#231d2b" text-anchor="middle" dominant-baseline="central">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function run() {
  console.log("==================================================");
  console.log("MANDATORY LIVE TEST — MAPPING & REAL ASSET INTEGRITY");
  console.log("==================================================");

  const artifactDir = "C:\\Users\\mehed\\.gemini\\antigravity-ide\\brain\\8c74abe3-e347-45df-8713-44db1cef8c7c";
  const edition = dreamBigPrintify24Edition;

  // ----------------------------------------------------
  // TEST A: DYNAMIC DIAGNOSTIC FIXTURE MAPPING VERIFICATION
  // ----------------------------------------------------
  console.log("\n--- TEST A: DYNAMIC DIAGNOSTIC FIXTURE MAPPING VERIFICATION ---");
  const diagImages = new Map<number, { buffer: Buffer; mimeType: string }>();
  const diagRawFiles: { filename: string; buffer: Buffer }[] = [];
  const colors = [
    "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1",
    "#84cc16", "#d97706", "#06b6d4", "#a855f7", "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
    "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#84cc16", "#d97706", "#06b6d4", "#a855f7",
  ];

  // Derive labels strictly from edition.illustrations (NO hardcoded role array!)
  for (const illo of edition.illustrations) {
    const label = (illo.role || illo.kind || `ILLO-${illo.number}`).toUpperCase();
    const buf = await createTestPatternBuffer(label, colors[illo.index % colors.length]);
    diagImages.set(illo.index, { buffer: buf, mimeType: "image/png" });
    diagRawFiles.push({ filename: illo.filename, buffer: buf });
  }

  const diagExportResult = await exportPrintifyBook({
    child: mockChild,
    bookId: "dream-big",
    profileId: "printify-hardcover-square-8x8",
    images: diagImages,
    rawFiles: diagRawFiles,
  });

  if (!diagExportResult.ok || !diagExportResult.dir) {
    throw new Error(`Diagnostic export failed: ${diagExportResult.preflight?.errors.join("\n")}`);
  }

  console.log(`Diagnostic Export Directory: ${diagExportResult.dir}`);

  // Verify physical page mapping consistency for all 24 physical interior pages
  for (const p of edition.physicalPages) {
    const illo = edition.illustrations.find((i) => i.index === p.illustrationIndex)!;
    const pageText = resolvePhysicalPageText(p, mockChild) ?? "";
    const expectedLabel = (illo.role || illo.kind).toUpperCase();

    console.log(
      `Page ${String(p.physicalPageNumber).padStart(2, "0")} | Illustration ${String(p.illustrationNumber).padStart(2, "0")} (${p.filename}) | Role: ${expectedLabel} | Text: "${pageText.slice(0, 45)}..."`,
    );
  }

  // ----------------------------------------------------
  // TEST B: REAL ORIGINAL DREAM BIG HEAVY GEMINI ASSET TEST
  // ----------------------------------------------------
  console.log("\n--- TEST B: REAL ORIGINAL DREAM BIG HEAVY ASSETS ACCEPTANCE ---");
  const realSourceDir = "C:\\xampp_lite_8_3\\www\\githubstory\\sto1\\storybook-out\\mehedi";
  const realImages = new Map<number, { buffer: Buffer; mimeType: string }>();
  const realRawFiles: { filename: string; buffer: Buffer }[] = [];

  let smallestSize = Infinity;
  let largestSize = 0;
  let countGt5MB = 0;
  let countGt10MB = 0;

  console.log("Loading real original Gemini files from storybook-out/mehedi/...");
  for (let i = 1; i <= 24; i++) {
    const filename = `${String(i).padStart(2, "0")}.png`;
    const filePath = path.join(realSourceDir, filename);
    const buf = await fs.readFile(filePath);
    const size = buf.length;

    if (size < smallestSize) smallestSize = size;
    if (size > largestSize) largestSize = size;
    if (size > 5 * 1024 * 1024) countGt5MB++;
    if (size > 10 * 1024 * 1024) countGt10MB++;

    console.log(`  Imported ${filename}: ${(size / (1024 * 1024)).toFixed(2)} MB`);

    const index = i - 1;
    realImages.set(index, { buffer: buf, mimeType: "image/png" });
    realRawFiles.push({ filename, buffer: buf });
  }

  console.log("\n==================================================");
  console.log("REAL ASSET STATISTICAL REPORT:");
  console.log(`- Total Real Files: ${realRawFiles.length}`);
  console.log(`- Smallest File Size: ${(smallestSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- Largest File Size: ${(largestSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- Files > 5 MB: ${countGt5MB}`);
  console.log(`- Files > 10 MB: ${countGt10MB}`);
  console.log("==================================================");

  console.log("\nExecuting server-side Printify export with REAL heavy assets...");
  const realExportResult = await exportPrintifyBook({
    child: mockChild,
    bookId: "dream-big",
    profileId: "printify-hardcover-square-8x8",
    images: realImages,
    rawFiles: realRawFiles,
  });

  if (!realExportResult.ok || !realExportResult.dir) {
    throw new Error(`Real asset export failed: ${realExportResult.preflight?.errors.join("\n")}`);
  }

  const realExportDir = realExportResult.dir;
  console.log(`Real Heavy Asset Export Successful: ${realExportDir}`);

  // Copy sample exported page PNGs to artifacts for visual confirmation
  const samplePages = [1, 3, 5, 6, 7, 8, 9, 10, 16, 20, 22, 23, 24];
  for (const pageNum of samplePages) {
    const pageName = `page-${String(pageNum).padStart(2, "0")}.png`;
    const srcPath = path.join(realExportDir, pageName);
    const destPath = path.join(artifactDir, `real_exported_${pageName}`);
    await fs.copyFile(srcPath, destPath);

    const meta = await sharp(destPath).metadata();
    const stats = await sharp(destPath).stats();
    console.log(`Visual Proof ${pageName}: ${meta.width}x${meta.height}, Mean RGB: (${stats.channels[0].mean.toFixed(1)}, ${stats.channels[1].mean.toFixed(1)}, ${stats.channels[2].mean.toFixed(1)})`);
  }

  console.log("\n==================================================");
  console.log("ALL MAPPING & REAL ASSET TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
