import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { exportPrintifyBook } from "./printifyExport";
import { buildManifest } from "../manual/manifest";
import type { ProvidedImage } from "../manual/assemble";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
const PROFILE_ID = "printify-hardcover-square-8x8";

const original = process.env.STORYBOOK_OUT_DIR;
afterEach(() => {
  if (original === undefined) delete process.env.STORYBOOK_OUT_DIR;
  else process.env.STORYBOOK_OUT_DIR = original;
});

async function makeImage(ratio: number): Promise<Buffer> {
  const height = 40;
  const width = Math.round(height * ratio);
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 150, b: 120 } },
  })
    .png()
    .toBuffer();
}

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const NEUTRAL = { r: 128, g: 128, b: 128 };

/** A strongly-portrait source (for a square single page) with a marker
 *  stripe at its very top edge. Under the OLD cover-crop behavior this
 *  100x300 image, cover-fit into a 2400x2400 square, would have its top and
 *  bottom 100px cropped away entirely — the marker would never survive.
 *  Under contain+backdrop it must always survive (full source preserved). */
async function makePortraitMarkerImage(): Promise<Buffer> {
  const width = 100;
  const height = 300;
  const base = sharp({
    create: { width, height, channels: 3, background: NEUTRAL },
  });
  const stripe = await sharp({
    create: { width, height: 10, channels: 3, background: RED },
  })
    .png()
    .toBuffer();
  return base
    .composite([{ input: stripe, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/** A strongly-wide (6:1) source for a spread, with distinct markers at its
 *  extreme left and right edges. Under the OLD cover-crop behavior, fitting
 *  this into a 2:1 wide canvas crops off everything outside the dead-center
 *  400 of its 1200 original width — both edge markers would be cropped
 *  away. Under contain+backdrop the full width is preserved (letterboxed
 *  top/bottom instead), so both markers must survive on their respective
 *  half of the split spread. */
async function makeWideMarkerImage(): Promise<Buffer> {
  const width = 1200;
  const height = 200;
  const base = sharp({
    create: { width, height, channels: 3, background: NEUTRAL },
  });
  const leftStripe = await sharp({
    create: { width: 20, height, channels: 3, background: RED },
  })
    .png()
    .toBuffer();
  const rightStripe = await sharp({
    create: { width: 20, height, channels: 3, background: BLUE },
  })
    .png()
    .toBuffer();
  return base
    .composite([
      { input: leftStripe, left: 0, top: 0 },
      { input: rightStripe, left: width - 20, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** Whether any pixel in `buffer` is within `tolerance` of `color` — a
 *  presence check, not a position check, so it's robust to exactly where
 *  resizing/compositing landed the marker. */
async function containsColor(
  source: Buffer | string,
  color: { r: number; g: number; b: number },
  tolerance = 40,
): Promise<boolean> {
  const { data, info } = await sharp(source)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  for (let i = 0; i + 2 < data.length; i += channels) {
    if (
      Math.abs(data[i] - color.r) <= tolerance &&
      Math.abs(data[i + 1] - color.g) <= tolerance &&
      Math.abs(data[i + 2] - color.b) <= tolerance
    ) {
      return true;
    }
  }
  return false;
}

import { getEditionForProfile } from "../story/editions";
import { getPrintProfile } from "./registry";

/** Mirrors exportPrintifyBook's page-numbering so the test can find the exact
 *  page-NN.png file(s) a given manifest page ends up as. */
function pageFileNumbers(
  bookId: string,
  profileId: string,
  manifest: { index: number; kind: string; spread: boolean }[],
): Map<number, number[]> {
  const edition = getEditionForProfile(bookId, getPrintProfile(profileId));
  if (edition) {
    const map = new Map<number, number[]>();
    for (const p of edition.physicalPages) {
      const existing = map.get(p.illustrationIndex) ?? [];
      existing.push(p.physicalPageNumber);
      map.set(p.illustrationIndex, existing);
    }
    return map;
  }
  const map = new Map<number, number[]>();
  let pageNumber = 1;
  for (const m of manifest) {
    if (m.kind === "cover" || m.kind === "backcover") continue;
    if (m.spread) {
      map.set(m.index, [pageNumber, pageNumber + 1]);
      pageNumber += 2;
    } else {
      map.set(m.index, [pageNumber]);
      pageNumber += 1;
    }
  }
  return map;
}

function pageFilename(n: number): string {
  return `page-${String(n).padStart(2, "0")}.png`;
}

describe("exportPrintifyBook", () => {
  it("refuses to write anything when preflight fails", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "sbtest-"));
    process.env.STORYBOOK_OUT_DIR = base;
    try {
      const images = new Map<number, ProvidedImage>([
        [0, { buffer: await makeImage(1), mimeType: "image/png" }],
      ]);

      const result = await exportPrintifyBook({
        child,
        bookId: "great-adventure",
        profileId: PROFILE_ID,
        images,
      });

      expect(result.ok).toBe(false);
      expect(result.dir).toBeNull();
      expect(result.files).toEqual([]);
      expect(result.preflight.errors.length).toBeGreaterThan(0);

      const dirs = await readdir(base).catch(() => []);
      expect(dirs).toEqual([]); // nothing written
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it(
    "exports cover.png, page-NN.png (spreads expanded), proof.pdf, prompts.md, order-info.txt",
    async () => {
      const base = await mkdtemp(path.join(os.tmpdir(), "sbtest-"));
      process.env.STORYBOOK_OUT_DIR = base;
      try {
        const manifest = buildManifest(child, "great-adventure", PROFILE_ID);
        const images = new Map<number, ProvidedImage>();
        for (const m of manifest) {
          images.set(m.index, {
            buffer: await makeImage(m.spread ? 2 : 1),
            mimeType: "image/png",
          });
        }

        const result = await exportPrintifyBook({
          child,
          bookId: "great-adventure",
          profileId: PROFILE_ID,
          images,
        });

        expect(result.ok).toBe(true);
        expect(result.dir).toBeTruthy();

        const files = await readdir(result.dir as string);
        expect(files).toContain("cover.png");
        expect(files).toContain("proof.pdf");
        expect(files).toContain("prompts.md");
        expect(files).toContain("order-info.txt");

        const edition = getEditionForProfile("great-adventure", getPrintProfile(PROFILE_ID));
        const expectedPageFiles = edition ? edition.interiorPageCount : 24;
        const pageFiles = files.filter((f) => f.startsWith("page-"));
        expect(pageFiles.length).toBe(expectedPageFiles);
        expect(pageFiles).toContain("page-01.png");

        const coverMeta = await sharp(path.join(result.dir as string, "cover.png")).metadata();
        expect(coverMeta.width).toBe(5370);
        expect(coverMeta.height).toBe(2850);

        const pageMeta = await sharp(
          path.join(result.dir as string, "page-01.png"),
        ).metadata();
        expect(pageMeta.width).toBe(2400);
        expect(pageMeta.height).toBe(2400);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    },
    // 26 concurrent full-resolution Puppeteer screenshots — genuinely heavy,
    // and slow further under load on a shared dev machine.
    180_000,
  );

  it(
    "never blind-crops a mismatched-aspect source — the full artwork survives via " +
      "contain+backdrop instead of a cover-fit crop (regression for the Printify " +
      "preflight/composition bug)",
    async () => {
      const base = await mkdtemp(path.join(os.tmpdir(), "sbtest-"));
      process.env.STORYBOOK_OUT_DIR = base;
      try {
        const manifest = buildManifest(child, "great-adventure", PROFILE_ID);
        const numbers = pageFileNumbers("great-adventure", PROFILE_ID, manifest);
        const firstSingle = manifest.find((m) => !m.spread && m.kind !== "cover" && m.kind !== "backcover");
        const firstSpread = manifest.find((m) => m.spread);
        if (!firstSingle || !firstSpread) {
          throw new Error("Test fixture assumption broken: expected both a single and a spread page.");
        }

        const portraitMarker = await makePortraitMarkerImage();
        const wideMarker = await makeWideMarkerImage();

        const images = new Map<number, ProvidedImage>();
        for (const m of manifest) {
          if (m.index === firstSingle.index) {
            images.set(m.index, { buffer: portraitMarker, mimeType: "image/png" });
          } else if (m.index === firstSpread.index) {
            images.set(m.index, { buffer: wideMarker, mimeType: "image/png" });
          } else {
            images.set(m.index, {
              buffer: await makeImage(m.spread ? 2 : 1),
              mimeType: "image/png",
            });
          }
        }

        const result = await exportPrintifyBook({
          child,
          bookId: "great-adventure",
          profileId: PROFILE_ID,
          images,
        });

        expect(result.ok).toBe(true);
        // A source that's merely off-ratio (not opposite-orientation) never
        // blocks export — it's a warning, not an error.
        expect(result.preflight.warnings.some((w) => w.includes("aspect ratio"))).toBe(true);

        const dir = result.dir as string;

        const [singlePageNum] = numbers.get(firstSingle.index)!;
        expect(await containsColor(path.join(dir, pageFilename(singlePageNum)), RED)).toBe(true);

        const [leftNum, rightNum] = numbers.get(firstSpread.index)!;
        expect(await containsColor(path.join(dir, pageFilename(leftNum)), RED)).toBe(true);
        expect(await containsColor(path.join(dir, pageFilename(rightNum)), BLUE)).toBe(true);

        // Final geometry is never weakened by any of this.
        const singleMeta = await sharp(path.join(dir, pageFilename(singlePageNum))).metadata();
        expect(singleMeta.width).toBe(2400);
        expect(singleMeta.height).toBe(2400);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
