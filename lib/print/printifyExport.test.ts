import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { exportPrintifyBook } from "./printifyExport";
import { buildManifest } from "../manual/manifest";
import { resolveLayoutPlan, type ResolvedLayoutPlan } from "../story/layoutPlan";
import { getEditionForProfile } from "../story/editions";
import { getPrintProfile } from "./registry";
import type { ProvidedImage } from "../manual/assemble";
import type { ChildProfile } from "../story/types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };
const PROFILE_ID = "printify-hardcover-square-8x8";

const original = process.env.STORYBOOK_OUT_DIR;
afterEach(() => {
  if (original === undefined) delete process.env.STORYBOOK_OUT_DIR;
  else process.env.STORYBOOK_OUT_DIR = original;
});

/** `seed` varies pixel content — real artwork is never byte-identical
 *  across slots, and the duplicate-artwork-across-slots gate now correctly
 *  flags it if it is. */
async function makeImage(ratio: number, seed = 0): Promise<Buffer> {
  const height = 40;
  const width = Math.round(height * ratio);
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: (150 + seed * 7) % 255, b: (120 + seed * 11) % 255 } },
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

/** Mirrors exportPrintifyBook's page-numbering so the test can find the exact
 *  page-NN.png file(s) a given asset ends up as. Reads it directly off the
 *  real resolveLayoutPlan() authority (slot.physicalPages), rather than
 *  guessing from the legacy PrintEdition registry — great-adventure (like
 *  every registered story) now resolves through its standard-24
 *  StoryEdition on every profile, which takes priority over the legacy
 *  great-adventure-printify-24 PrintEdition getEditionForProfile() would
 *  still return, so that edition's own physicalPages numbering no longer
 *  matches what exportPrintifyBook actually produces. */
function pageFileNumbers(plan: ResolvedLayoutPlan): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const slot of plan.interiorAssets) {
    map.set(slot.illustrationIndex, slot.physicalPages);
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
            buffer: await makeImage(m.spread ? 2 : 1, m.index),
            mimeType: "image/png",
          });
        }

        const result = await exportPrintifyBook({
          child,
          bookId: "great-adventure",
          profileId: PROFILE_ID,
          images,
          allowLowResolutionForTesting: true,
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
      // Great Adventure (like every registered story) now resolves through
      // its standard-24 StoryEdition on every profile, which has no
      // approvedSpreadPairs, so there's no longer a reachable "spread" asset
      // to exercise the split-into-two-halves half of this regression (the
      // underlying splitSpread() geometry itself is still directly covered
      // by lib/story/layoutPlan.test.ts's "seamless split without center
      // line" test). This still exercises the real, fully-reachable part of
      // the regression: a single interior page whose source is drastically
      // off-ratio (in either direction) must survive intact via
      // contain+backdrop, never a cover-fit crop that throws content away.
      const base = await mkdtemp(path.join(os.tmpdir(), "sbtest-"));
      process.env.STORYBOOK_OUT_DIR = base;
      try {
        const plan = resolveLayoutPlan({
          child,
          bookId: "great-adventure",
          profileId: PROFILE_ID,
          mode: "standard-single",
        });
        const numbers = pageFileNumbers(plan);
        const singleScenes = plan.interiorAssets.filter((a) => a.assetKind === "single-page");
        const [portraitSlot, wideSlot] = singleScenes;
        if (!portraitSlot || !wideSlot || portraitSlot.slotId === wideSlot.slotId) {
          throw new Error("Test fixture assumption broken: expected at least 2 distinct single-page interior assets.");
        }

        const portraitMarker = await makePortraitMarkerImage();
        const wideMarker = await makeWideMarkerImage();

        const images = new Map<number, ProvidedImage>();
        for (const slot of plan.assets) {
          if (slot.slotId === portraitSlot.slotId) {
            images.set(slot.sourceSceneIndex, { buffer: portraitMarker, mimeType: "image/png" });
          } else if (slot.slotId === wideSlot.slotId) {
            images.set(slot.sourceSceneIndex, { buffer: wideMarker, mimeType: "image/png" });
          } else {
            images.set(slot.sourceSceneIndex, {
              buffer: await makeImage(1, slot.sourceSceneIndex),
              mimeType: "image/png",
            });
          }
        }

        const result = await exportPrintifyBook({
          child,
          bookId: "great-adventure",
          profileId: PROFILE_ID,
          images,
          allowLowResolutionForTesting: true,
        });

        expect(result.ok).toBe(true);
        // A source that's merely off-ratio (not opposite-orientation) never
        // blocks export — it's a warning, not an error.
        expect(result.preflight.warnings.some((w) => w.includes("aspect ratio"))).toBe(true);

        const dir = result.dir as string;

        // Strongly-portrait source into a square page: the marker at its
        // top edge must survive (an old cover-fit crop would have cropped
        // it away entirely).
        const [portraitPageNum] = numbers.get(portraitSlot.illustrationIndex)!;
        expect(await containsColor(path.join(dir, pageFilename(portraitPageNum)), RED)).toBe(true);

        // Strongly-wide (6:1) source into the same square page: both its
        // left (red) and right (blue) edge markers must survive in the one
        // output file (an old cover-fit crop would have cropped both away,
        // keeping only the dead center).
        const [widePageNum] = numbers.get(wideSlot.illustrationIndex)!;
        expect(await containsColor(path.join(dir, pageFilename(widePageNum)), RED)).toBe(true);
        expect(await containsColor(path.join(dir, pageFilename(widePageNum)), BLUE)).toBe(true);

        // Final geometry is never weakened by any of this.
        const portraitMeta = await sharp(path.join(dir, pageFilename(portraitPageNum))).metadata();
        expect(portraitMeta.width).toBe(2400);
        expect(portraitMeta.height).toBe(2400);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
