/**
 * CLI: re-roll specific pages of an already-generated book and rebuild the PDF.
 *
 *   npm run regenerate -- \
 *     --name Virat --age 4 --gender boy --book great-adventure \
 *     --photos "/path/to/real/photos" \
 *     --pages 1,2,4,6,24
 *
 * Why: a full re-generation is slow and burns quota when only a handful of
 * illustrations are off. This regenerates just the pages you list, copies every
 * other page unchanged from the previous run, and assembles a fresh PDF.
 *
 * Likeness is driven REAL-PHOTO-FIRST: the clearest real frontal photo leads the
 * reference list and the existing master anchor (00-character.*) is kept as a
 * strong secondary reference.
 *
 * --pages are PRINTED PDF page numbers (as you see them in the PDF). A two-page
 * spread counts as two printed pages that both map to the same wide illustration,
 * so passing either page number re-rolls that one image.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ASPECT_SINGLE,
  ASPECT_SPREAD,
  MAX_REFERENCE_PHOTOS,
} from "../lib/config";
import { generateIllustration } from "../lib/gemini/imageClient";
import { outputBaseDir, slug, uniquePath } from "../lib/generate/paths";
import { preparePhoto, preparePhotos } from "../lib/images/preprocess";
import {
  assembleFromImages,
  indexFromFilename,
  type ProvidedImage,
} from "../lib/manual/assemble";
import {
  bookFilename,
  buildPages,
  type BuiltPage,
  listBooks,
} from "../lib/story/registry";
import type { ChildProfile, Gender, ReferencePhoto } from "../lib/story/types";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error(
    "Usage: npm run regenerate -- --name <name> [--age 4] [--gender boy] " +
      "[--book great-adventure] --photos <dir> (--pages 1,2,4 | --all)\n" +
      "       [--run <runDir>] [--from <imagesDir>] [--anchor <file>] " +
      "[--front <frontalPhoto>] [--out <imagesDir>]\n",
  );
  process.exit(1);
}

function extFor(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/** Walk pages in order, assigning printed leaf numbers (spreads take two). */
function leafToIndex(pages: BuiltPage[]): Map<number, number> {
  const map = new Map<number, number>();
  let leaf = 1;
  for (const p of pages) {
    map.set(leaf++, p.index);
    if (p.spread) map.set(leaf++, p.index);
  }
  return map;
}

/** Read NN.<ext> page images from a dir into a map of 0-based index -> image. */
async function readPageImages(dir: string): Promise<Map<number, ProvidedImage>> {
  const out = new Map<number, ProvidedImage>();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const file of entries.sort()) {
    const mimeType = IMAGE_MIME[path.extname(file).toLowerCase()];
    if (!mimeType) continue;
    const index = indexFromFilename(file); // "01.jpg" -> 0; "00-character" -> null
    if (index === null) continue;
    out.set(index, { buffer: await readFile(path.join(dir, file)), mimeType });
  }
  return out;
}

/** Count NN.<ext> page images in a dir (cheap — no file reads). */
async function countPageImages(dir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  let n = 0;
  for (const file of entries) {
    if (IMAGE_MIME[path.extname(file).toLowerCase()] && indexFromFilename(file) !== null) {
      n++;
    }
  }
  return n;
}

/** Read every image file in a folder, sorted, as raw buffers. */
async function readPhotoBuffers(
  dir: string,
): Promise<{ name: string; buffer: Buffer }[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    fail(`Could not read photos folder: ${dir}`);
  }
  const photos: { name: string; buffer: Buffer }[] = [];
  for (const file of entries.sort()) {
    if (!IMAGE_MIME[path.extname(file).toLowerCase()]) continue;
    photos.push({ name: file, buffer: await readFile(path.join(dir, file)) });
  }
  if (photos.length === 0) fail(`No usable photos found in ${dir}`);
  return photos;
}

/** Build the reference list: real frontal photo first, anchor second, then rest. */
async function buildRefs(
  photosDir: string,
  frontPath: string | undefined,
  anchorPath: string | undefined,
): Promise<ReferencePhoto[]> {
  const photos = await readPhotoBuffers(photosDir);

  let ordered: Buffer[];
  if (frontPath) {
    const frontBuf = await readFile(frontPath);
    const frontName = path.basename(frontPath);
    ordered = [frontBuf, ...photos.filter((p) => p.name !== frontName).map((p) => p.buffer)];
  } else {
    ordered = photos.map((p) => p.buffer); // first sorted photo is treated as frontal
  }

  const prepared = await preparePhotos(ordered);

  if (anchorPath && existsSync(anchorPath)) {
    const anchorRef = await preparePhoto(await readFile(anchorPath));
    return [prepared[0], anchorRef, ...prepared.slice(1)].slice(
      0,
      MAX_REFERENCE_PHOTOS,
    );
  }
  return prepared;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      age: { type: "string" },
      gender: { type: "string" },
      book: { type: "string" },
      photos: { type: "string" },
      front: { type: "string" },
      anchor: { type: "string" },
      run: { type: "string" },
      from: { type: "string" },
      out: { type: "string" },
      pages: { type: "string" },
      all: { type: "boolean" },
      "assemble-only": { type: "boolean" },
      append: { type: "string" },
    },
  });

  if (!values.name) fail("Missing --name");
  const assembleOnly = Boolean(values["assemble-only"]);
  if (!assembleOnly) {
    if (!values.photos) fail("Missing --photos <dir> (the child's real photos)");
    if (!values.all && !values.pages) {
      fail("Pass --pages 1,2,4 or --all (or --assemble-only to just rebuild the PDF)");
    }
  }

  const age = Number(values.age ?? "4");
  if (!Number.isInteger(age) || age < 0 || age > 18) fail("--age must be 0–18");
  const gender = (values.gender ?? "boy") as Gender;
  if (!["boy", "girl", "neutral"].includes(gender)) {
    fail("--gender must be boy, girl, or neutral");
  }
  const bookId = values.book ?? "great-adventure";
  if (!listBooks().some((b) => b.id === bookId)) {
    fail(`Unknown --book "${bookId}". Available: ${listBooks().map((b) => b.id).join(", ")}`);
  }

  const child: ChildProfile = { name: values.name, age, gender };
  const run = values.run ?? path.join(outputBaseDir(), slug(child.name));
  if (!existsSync(run)) fail(`Run folder not found: ${run} (pass --run)`);

  // Where to copy unchanged images from: explicit --from, else the highest
  // existing images-vN folder, else the run folder's top-level NN images.
  const versionDirs = (await readdir(run))
    .map((e) => /^images-v(\d+)$/.exec(e))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => b - a); // newest first
  const latestVersion = versionDirs.length ? versionDirs[0] : 1;
  const nextVersion = latestVersion + 1;

  // Default source = the existing image set with the MOST images (newest wins on
  // a tie); an explicit --from overrides. Stops a sparse folder — a few manually
  // generated pages or a prior single-page test — from being chosen over a
  // complete set just because it has a higher version number.
  let fromDir: string;
  if (values.from) {
    fromDir = values.from;
  } else {
    const candidates = [
      ...versionDirs.map((v) => path.join(run, `images-v${v}`)),
      run, // top-level NN images (oldest)
    ];
    fromDir = run;
    let bestCount = -1;
    for (const dir of candidates) {
      const count = await countPageImages(dir);
      if (count > bestCount) {
        bestCount = count;
        fromDir = dir;
      }
    }
  }
  const outDir = values.out ?? path.join(run, `images-v${nextVersion}`);
  const anchorPath =
    values.anchor ??
    ["00-character.jpg", "00-character.png", "00-character.webp"]
      .map((f) => path.join(run, f))
      .find((p) => existsSync(p));

  // Which logical page indices to regenerate.
  const pages = buildPages(child, bookId);
  const leafMap = leafToIndex(pages);
  let targets: number[];
  if (assembleOnly) {
    targets = [];
  } else if (values.all) {
    targets = pages.map((p) => p.index);
  } else {
    const requested = values
      .pages!.split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const indices = new Set<number>();
    for (const leaf of requested) {
      const idx = leafMap.get(leaf);
      if (idx === undefined) {
        console.warn(`  ⚠ printed page ${leaf} is out of range — skipping`);
        continue;
      }
      indices.add(idx);
    }
    targets = [...indices].sort((a, b) => a - b);
  }
  if (!assembleOnly && targets.length === 0) fail("No valid pages to regenerate.");

  // Carry forward every existing page image; we'll overwrite the regenerated ones.
  const existing = await readPageImages(fromDir);
  if (existing.size === 0 && !values.all) {
    console.warn(
      `  ⚠ no existing images found in ${fromDir}; un-regenerated pages will be blank.`,
    );
  }

  console.log(`\n${assembleOnly ? "Rebuilding PDF for" : "Regenerating"} "${bookId}" for ${child.name}`);
  if (!assembleOnly) {
    console.log(`  refs:   real photos first + anchor (${anchorPath ? path.basename(anchorPath) : "none"})`);
  }
  console.log(`  from:   ${fromDir}`);
  if (!assembleOnly) {
    console.log(`  out:    ${outDir}`);
    console.log(`  pages:  ${targets.map((i) => i + 1).join(", ")} (image files NN)\n`);
  }

  const finalImages = new Map<number, ProvidedImage>(existing);

  if (!assembleOnly) {
    const refs = await buildRefs(values.photos!, values.front, anchorPath);
    await mkdir(outDir, { recursive: true });

    // Regenerate the targeted pages (sequentially, to respect rate limits).
    for (const index of targets) {
      const page = pages[index];
      const aspect = page.spread ? ASPECT_SPREAD : ASPECT_SINGLE;
      const label = `${String(index + 1).padStart(2, "0")} (${page.kind}${page.spread ? ", spread" : ""})`;
      process.stdout.write(`  • ${label} … `);
      try {
        const prompt = values.append ? `${page.prompt} ${values.append}` : page.prompt;
        const img = await generateIllustration(prompt, refs, aspect);
        finalImages.set(index, { buffer: img.data, mimeType: img.mimeType });
        console.log("done");
      } catch (err) {
        console.log("FAILED");
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Write the complete image set (copied + regenerated) into the new folder.
    for (const [index, img] of finalImages) {
      const name = `${String(index + 1).padStart(2, "0")}.${extFor(img.mimeType)}`;
      await writeFile(path.join(outDir, name), img.buffer);
    }
  }

  // Rebuild the PDF (this also re-renders the verse with the latest story copy).
  console.log(`\nAssembling PDF …`);
  const { pdf, usedPages, totalPages } = await assembleFromImages(
    child,
    finalImages,
    bookId,
  );
  const pdfName = bookFilename(child.name, bookId).replace(
    /\.pdf$/,
    `-v${nextVersion}.pdf`,
  );
  const pdfPath = uniquePath(path.join(run, pdfName));
  await writeFile(pdfPath, pdf);

  console.log(
    `\n✓ ${assembleOnly ? "Rebuilt PDF (images unchanged)" : `Regenerated ${targets.length} page(s)`}`,
  );
  if (!assembleOnly) console.log(`   images: ${outDir}`);
  console.log(`   pdf:    ${pdfPath}`);
  console.log(
    `   ${usedPages}/${totalPages} pages had images` +
      (usedPages < totalPages ? " (missing pages use a soft fallback).\n" : ".\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
