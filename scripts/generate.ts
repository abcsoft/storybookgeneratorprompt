/**
 * CLI: generate a COMPLETE storybook for one child via the PAID Gemini API
 * (flex service tier by default — set GEMINI_SERVICE_TIER to override), then
 * assemble the PDF. This is the exact pipeline the web /api/generate route uses:
 * generateBook (anchor + every page) → buildBook (PDF) → saveRun (to disk).
 *
 *   npm run generate -- --name Arjun --age 4 --gender boy \
 *     --book great-adventure --photos "/path/to/photos"
 *
 * Writes to <STORYBOOK_OUT_DIR>/<slug>/ (00-character.*, 01..NN images, PDF).
 * Pages that fail on the API become blank fallbacks in the PDF and are listed as
 * "FAILED PAGES" so they can be re-rolled for free with `npm run web-generate`.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { generateBook } from "../lib/generate/orchestrator";
import { saveRun } from "../lib/generate/saveRun";
import { buildBook } from "../lib/pdf/buildBook";
import { preparePhotos } from "../lib/images/preprocess";
import { bookFilename, listBooks, DEFAULT_BOOK_ID } from "../lib/story/registry";
import type { ChildProfile, Gender } from "../lib/story/types";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error(
    "Usage: npm run generate -- --name <name> [--age 4] [--gender boy|girl|neutral] " +
      "[--book great-adventure] --photos <dir> [--concurrency N]\n",
  );
  process.exit(1);
}

/** Read the child's photos (jpg/png/webp) from a folder, sorted. */
async function readPhotoBuffers(dir: string): Promise<Buffer[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    fail(`Could not read photos folder: ${dir}`);
  }
  const files = entries
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) fail(`No usable photos (jpg/png/webp) in ${dir}`);
  return Promise.all(files.map((f) => readFile(path.join(dir, f))));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      age: { type: "string" },
      gender: { type: "string" },
      book: { type: "string" },
      photos: { type: "string" },
      concurrency: { type: "string" },
    },
  });

  if (!values.name) fail("Missing --name");
  if (!values.photos) fail("Missing --photos <dir>");
  const age = Number(values.age ?? "4");
  if (!Number.isInteger(age) || age < 0 || age > 18) fail("--age must be an integer 0–18");
  const gender = (values.gender ?? "boy") as Gender;
  if (!["boy", "girl", "neutral"].includes(gender)) fail("--gender must be boy, girl, or neutral");
  const bookId = values.book ?? DEFAULT_BOOK_ID;
  if (!listBooks().some((b) => b.id === bookId)) {
    fail(`Unknown --book "${bookId}". Available: ${listBooks().map((b) => b.id).join(", ")}`);
  }
  const concurrency = values.concurrency ? Number(values.concurrency) : undefined;

  const child: ChildProfile = { name: values.name, age, gender };
  const buffers = await readPhotoBuffers(values.photos);
  const photos = await preparePhotos(buffers);

  console.log(`\n▶ Generating "${bookId}" for ${child.name} (age ${age}, ${gender})`);
  console.log(`   photos: ${buffers.length} from ${values.photos}`);
  console.log(`   tier:   ${process.env.GEMINI_SERVICE_TIER ?? "flex"} · concurrency ${concurrency ?? "default"}\n`);

  let anchorImg: { data: Buffer; mimeType: string } | null = null;
  const pages = await generateBook(child, photos, {
    bookId,
    concurrency,
    onAnchor: (img) => {
      anchorImg = img;
    },
    onProgress: (completed, total, failed) =>
      process.stdout.write(`\r   pages: ${completed}/${total} (${failed} failed)   `),
  });
  process.stdout.write("\n");

  if (pages.every((p) => p.failed)) {
    fail(`Every page failed for ${child.name}. Check API key/quota/tier and retry.`);
  }

  const pdf = await buildBook(pages, child);
  const dir = await saveRun({
    child,
    bookId,
    anchor: anchorImg,
    pdf,
    images: pages
      .filter((p) => p.image)
      .map((p) => ({ index: p.index, data: p.image as Buffer, mimeType: p.imageMimeType })),
  });

  const failedPages = pages.filter((p) => p.failed).map((p) => p.index + 1);
  console.log(`✓ ${child.name}: ${pages.length - failedPages.length}/${pages.length} pages ok`);
  console.log(`   dir: ${dir}`);
  console.log(`   pdf: ${path.join(dir, bookFilename(child.name, bookId))}`);
  if (failedPages.length > 0) {
    console.log(`   FAILED PAGES: ${failedPages.join(",")}  (re-roll with web-generate)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
