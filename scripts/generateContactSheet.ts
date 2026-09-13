import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { DREAM_BIG_CANONICAL_SLOTS, calculateLegacyDreamBigRemap } from "../lib/story/legacyRemap";

export interface ContactSheetPageMeta {
  pageNumber: number;
  slotId: string;
  role: string;
  expectedFilename: string;
  sourceFilename: string;
  status: string;
  nativePpi: number;
  enhancedOutputPpi: number;
  imageBuffer: Buffer;
}

export async function createContactSheet(
  pagesMeta: ContactSheetPageMeta[],
  outputPath: string,
): Promise<void> {
  const cols = 6;
  const rows = 4;
  const thumbW = 450;
  const thumbH = 330;
  const cardPad = 15;
  const cardW = thumbW + cardPad * 2;
  const cardH = thumbH + 130; // 130px for metadata text box
  const headerH = 100;
  const totalW = cols * cardW + cardPad * 2;
  const totalH = rows * cardH + headerH + cardPad * 2;

  // Create composite operations
  const composites: OverlayOptions[] = [];

  // Header SVG
  const headerSvg = `
    <svg width="${totalW}" height="${headerH}">
      <rect width="100%" height="100%" fill="#090d16" />
      <text x="30" y="42" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#38bdf8">
        DREAM BIG — 24-PAGE PRODUCTION CONTACT SHEET &amp; TRUTHFUL RECOVERY PROOF
      </text>
      <text x="30" y="76" font-family="Arial, sans-serif" font-size="16" fill="#94a3b8">
        Full 24-image workflow: Real-ESRGAN x4plus super-resolution, confirmed legacy shift remap, 300 DPI output placement (3375×2475)
      </text>
    </svg>
  `;
  composites.push({ input: Buffer.from(headerSvg), top: 0, left: 0 });

  for (let i = 0; i < pagesMeta.length; i++) {
    const meta = pagesMeta[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = cardPad + col * cardW;
    const top = headerH + row * cardH;

    // Resize image thumbnail
    const thumbBuffer = await sharp(meta.imageBuffer)
      .resize(thumbW, thumbH, { fit: "contain", background: { r: 15, g: 23, b: 42, alpha: 1 } })
      .png()
      .toBuffer();

    // Place thumbnail
    composites.push({
      input: thumbBuffer,
      top: top + cardPad,
      left: left + cardPad,
    });

    // Caption SVG
    const captionSvg = `
      <svg width="${thumbW}" height="110">
        <rect width="100%" height="100%" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        <text x="12" y="24" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#facc15">
          Page ${String(meta.pageNumber).padStart(2, "0")} · ${escapeXml(meta.role)}
        </text>
        <text x="12" y="46" font-family="Arial, sans-serif" font-size="12" fill="#e2e8f0">
          Slot: <tspan fill="#38bdf8">${escapeXml(meta.slotId)}</tspan> (${escapeXml(meta.expectedFilename)})
        </text>
        <text x="12" y="68" font-family="Arial, sans-serif" font-size="12" fill="#cbd5e1">
          Source: <tspan fill="#a7f3d0" font-weight="bold">${escapeXml(meta.sourceFilename)}</tspan> | Native: <tspan fill="#f87171">${meta.nativePpi.toFixed(1)} PPI</tspan>
        </text>
        <text x="12" y="90" font-family="Arial, sans-serif" font-size="12" fill="#94a3b8">
          Status: <tspan fill="#4ade80" font-weight="bold">${escapeXml(meta.status)}</tspan> -> <tspan fill="#38bdf8" font-weight="bold">${meta.enhancedOutputPpi.toFixed(1)} PPI</tspan>
        </text>
      </svg>
    `;

    composites.push({
      input: Buffer.from(captionSvg),
      top: top + cardPad + thumbH + 8,
      left: left + cardPad,
    });
  }

  // Base background
  await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 11, g: 15, b: 25, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);

  console.log(`✓ Contact sheet generated at ${outputPath} (${totalW}x${totalH})`);
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
