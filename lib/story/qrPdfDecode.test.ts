/**
 * End-to-end QR decode from an ACTUAL rendered interior PDF page, through
 * the real production pipeline (resolveLayoutPlan -> assembleFromImages ->
 * buildLuluInteriorBook), at realistic print resolution — not just the raw
 * QR PNG buffer (see lib/story/qr.test.ts for that lower-level round trip).
 *
 * Rasterizing a PDF page requires an actual PDF renderer; this repo has no
 * JS-only PDF rasterizer dependency, so this test shells out to Poppler's
 * `pdftoppm` (also used for this task's manual pdfinfo/pdffonts/pdftoppm
 * verification pass). If Poppler isn't on PATH in a given environment, the
 * test skips itself with a clear message rather than failing the whole
 * suite on an environment gap unrelated to the code under test.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import jsQR from "jsqr";
import { resolveLayoutPlan } from "./layoutPlan";
import { assembleFromImages, type ProvidedImage } from "../manual/assemble";
import type { ChildProfile } from "./types";

function findPdftoppm(): string | null {
  const candidates = [
    "pdftoppm", // already on PATH
    "C:\\Program Files\\poppler\\bin\\pdftoppm.exe",
    "C:\\Program Files\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe",
  ];
  // Also probe the WinGet-installed location used elsewhere in this repo's
  // proof scripts, if present, without hardcoding a version number.
  const wingetBase = "C:\\Users\\mehed\\AppData\\Local\\Microsoft\\WinGet\\Packages";
  try {
    if (fs.existsSync(wingetBase)) {
      for (const dir of fs.readdirSync(wingetBase)) {
        if (dir.toLowerCase().includes("poppler")) {
          const found = fs
            .readdirSync(path.join(wingetBase, dir), { recursive: true } as any)
            .find((f: any) => typeof f === "string" && f.endsWith("pdftoppm.exe"));
          if (found) candidates.push(path.join(wingetBase, dir, found as string));
        }
      }
    }
  } catch {
    // ignore probing errors
  }

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-v"], { stdio: "ignore" });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const pdftoppm = findPdftoppm();

describe.skipIf(!pdftoppm)("QR decode from the actual rendered interior PDF (realistic print resolution)", () => {
  const child: ChildProfile = { name: "Ihan", age: 5, gender: "boy" };
  const bookId = "great-adventure";
  const profileId = "lulu-landscape-11x8.5"; // the real interior/cover-split production pipeline

  it("page 24 (video-qr, last interior page) decodes to exactly the configured URL", async () => {
    const plan = resolveLayoutPlan({ child, bookId, profileId, mode: "standard-single" });
    expect(plan.interiorPageCount).toBe(24);

    const resolvedSlotMapping = new Map<string, ProvidedImage>();
    for (const slot of plan.assets) {
      const png = await sharp({ create: { width: 300, height: 220, channels: 3, background: { r: 180, g: 180, b: 200 } } }).png().toBuffer();
      resolvedSlotMapping.set(slot.slotId, { buffer: png, mimeType: "image/png" });
    }

    const targetUrl = "https://storybook.example/v/qr-pdf-decode-test-token";
    const { pdf } = await assembleFromImages(child, new Map(), bookId, profileId, {
      draft: false,
      resolvedSlotMapping,
      videoTarget: { token: "qr-pdf-decode-test-token", redirectBaseUrl: "https://storybook.example/v" },
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ga-qr-decode-"));
    const pdfPath = path.join(tmpDir, "interior.pdf");
    fs.writeFileSync(pdfPath, pdf);
    const outPrefix = path.join(tmpDir, "page");

    execFileSync(pdftoppm!, ["-png", "-f", "24", "-l", "24", "-r", "150", pdfPath, outPrefix]);
    const rendered = fs.readdirSync(tmpDir).find((f) => f.startsWith("page") && f.endsWith(".png"));
    expect(rendered, "pdftoppm did not produce a rendered page").toBeTruthy();

    const { data, info } = await sharp(path.join(tmpDir, rendered!))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    expect(decoded, "QR did not decode from the rendered PDF page").not.toBeNull();
    expect(decoded!.data).toBe(targetUrl);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }, 60000);
});
