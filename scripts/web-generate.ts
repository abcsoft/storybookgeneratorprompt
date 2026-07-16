/**
 * CLI: generate a book's images for FREE by driving the Gemini web app
 * (gemini.google.com) with your logged-in Pro plan, instead of the paid API.
 *
 *   npm run web-generate -- \
 *     --dir "/path/to/run-folder" \
 *     --photos "/path/to/real/photos" \
 *     [--pages 1,2,5] [--out images-v8] [--prompts prompts.md] \
 *     [--anchor <file>] [--anchor-only] [--headful] [--profile <dir>]
 *
 * Prompts come from <dir>/manifest.json (written by `npm run prompts`) or, with
 * --prompts, are parsed from a prompts.md. Each page image is downloaded into
 * the output folder (default <dir>/images) as NN.<ext>.
 *
 * References attached to every page: the character anchor (00-character.*) plus
 * the first real photo if --photos is given. Provide at least one of --anchor /
 * an existing 00-character.* / --photos.
 *
 * RESUMABLE: pages that already have an image file are skipped.
 *
 * ⚠️ Automating the web app to avoid API billing likely violates Google's ToS.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { GeminiWebSession } from "../lib/web/geminiWeb";
import type { ManualPage } from "../lib/manual/manifest";
import { characterAnchorPrompt } from "../lib/story/dreamBigTemplate";
import type { ChildProfile } from "../lib/story/types";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const ANCHOR_BASENAME = "00-character";
const PAGE_DELAY_MS = 4_000; // pacing between generations (rate-limit friendly)
const PAGE_ATTEMPTS = 2; // initial try + 1 retry

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error(
    "Usage: npm run web-generate -- --dir <runDir> [--photos <dir>] [--prompts <file>] " +
      "[--out <imagesDir>] [--pages 1,2,5] [--anchor <file>] [--anchor-only] " +
      "[--headful] [--headless] [--profile <dir>]\n",
  );
  process.exit(1);
}

function isImage(file: string): boolean {
  return IMAGE_EXTS.includes(path.extname(file).toLowerCase());
}

/** Absolute paths of image files in a folder, sorted. */
async function readPhotoPaths(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    fail(`Could not read photos folder: ${dir}`);
  }
  const photos = entries.filter(isImage).sort().map((f) => path.resolve(dir, f));
  if (photos.length === 0) fail(`No usable photos (png/jpg/webp) found in ${dir}`);
  return photos;
}

/** Existing image file for a base name (e.g. "01" or "00-character"), or null. */
function findExistingImage(dir: string, baseName: string): string | null {
  for (const ext of IMAGE_EXTS) {
    const p = path.join(dir, `${baseName}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Parse the prompts.md produced by `renderPromptsMarkdown` into pages. */
function parsePromptsMarkdown(md: string): ManualPage[] {
  const pages: ManualPage[] = [];
  // Each page section begins with a line "### Page NN · ROLE · ASPECT …".
  const blocks = md.split(/^### Page /m).slice(1);
  for (const block of blocks) {
    const header = block.split("\n", 1)[0]; // "01 · COVER · 3:2 → save as `01.png`"
    const page = parseInt(header, 10);
    if (!Number.isInteger(page)) continue;
    const parts = header.split("·").map((s) => s.trim());
    const role = parts[1] || undefined;
    const aspect = (header.match(/(\d+:\d+)/) || [])[1] ?? "3:2";
    const spread = /WIDE SPREAD/i.test(header);
    const filename =
      (header.match(/save as `([^`]+)`/) || [])[1] ??
      `${String(page).padStart(2, "0")}.png`;

    let prompt = (block.match(/\*\*Prompt:\*\*\s*\n([\s\S]*?)\n\s*\n_Page text/) || [])[1];
    if (!prompt) {
      prompt = (block.match(/\*\*Prompt:\*\*\s*\n([\s\S]*?)(?:\n\s*\n---|\s*$)/) || [])[1];
    }
    if (!prompt) continue;

    pages.push({
      page,
      index: page - 1,
      kind: role?.toLowerCase() ?? "scene",
      role,
      filename,
      prompt: prompt.trim(),
      text: "",
      spread,
      aspect,
    });
  }
  if (pages.length === 0) fail("Could not parse any pages from the prompts file.");
  return pages.sort((a, b) => a.page - b.page);
}

/** Load pages + optional child profile from --prompts md or <dir>/manifest.json. */
async function loadPages(
  dir: string,
  promptsPath: string | undefined,
): Promise<{ pages: ManualPage[]; child?: ChildProfile }> {
  if (promptsPath) {
    let md: string;
    try {
      md = await readFile(promptsPath, "utf8");
    } catch {
      fail(`Could not read prompts file: ${promptsPath}`);
    }
    return { pages: parsePromptsMarkdown(md) };
  }

  let parsed: { child?: ChildProfile; pages?: ManualPage[] };
  try {
    parsed = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  } catch {
    fail(`No manifest.json in ${dir} (and no --prompts given). Run \`npm run prompts\` first.`);
  }
  if (!parsed.child?.name || !Array.isArray(parsed.pages)) {
    fail(`manifest.json in ${dir} is malformed.`);
  }
  return { pages: parsed.pages, child: parsed.child };
}

function parsePages(spec: string | undefined, all: ManualPage[]): ManualPage[] {
  if (!spec) return all;
  const wanted = new Set(
    spec.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0),
  );
  const picked = all.filter((p) => wanted.has(p.page));
  if (picked.length === 0) fail(`--pages "${spec}" matched no pages (1–${all.length}).`);
  return picked;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      photos: { type: "string" },
      prompts: { type: "string" },
      out: { type: "string" },
      pages: { type: "string" },
      profile: { type: "string" },
      anchor: { type: "string" },
      model: { type: "string" },
      headful: { type: "boolean" },
      headless: { type: "boolean" },
      "anchor-only": { type: "boolean" },
      append: { type: "string" },
    },
  });
  const anchorOnly = Boolean(values["anchor-only"]);
  const append = values.append ? ` ${values.append}` : "";
  // Default to the cheapest/fastest image model; override with --model "3.1 Pro".
  const model = values.model ?? "3.1 Flash-Lite";

  if (!values.dir) fail("Missing --dir <runDir>");
  const dir = path.resolve(values.dir);
  if (!existsSync(dir)) fail(`Run folder not found: ${dir}`);

  const promptsPath = values.prompts ? path.resolve(values.prompts) : undefined;
  const { pages: allPages, child } = await loadPages(dir, promptsPath);
  const targets = parsePages(values.pages, allPages);

  // Reference photos are optional — the anchor alone is a valid reference.
  const realPhotos = values.photos ? await readPhotoPaths(values.photos) : [];

  // Output folder: --out (absolute or relative to dir), default <dir>/images.
  const imagesDir = values.out
    ? path.isAbsolute(values.out) ? values.out : path.join(dir, values.out)
    : path.join(dir, "images");
  await mkdir(imagesDir, { recursive: true });

  const profileDir =
    values.profile ??
    process.env.GEMINI_WEB_PROFILE_DIR ??
    path.join(os.homedir(), ".storybook-gemini-profile");
  const headless = Boolean(values.headless) && !values.headful;

  console.log(`\nGenerating images via the Gemini web app`);
  console.log(`  run:     ${dir}`);
  console.log(`  prompts: ${promptsPath ?? path.join(dir, "manifest.json")}`);
  console.log(`  output:  ${imagesDir}`);
  console.log(`  refs:    ${realPhotos.length ? `${realPhotos.length} photo(s) + ` : ""}anchor`);
  console.log(`  model:   ${model}`);
  console.log(`  pages:   ${anchorOnly ? "(anchor only)" : targets.map((p) => p.page).join(", ")}`);
  console.log(`  mode:    ${headless ? "headless" : "headful"}\n`);

  const session = new GeminiWebSession({ userDataDir: profileDir, headless, model });
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    await session.open();
    await session.ensureLoggedIn();
    await session.newChat(); // one clean chat keeps the character consistent

    // ── Step 0: character anchor ──────────────────────────────────────────
    let anchorPath =
      values.anchor ?? (anchorOnly ? null : findExistingImage(dir, ANCHOR_BASENAME));
    if (anchorPath) {
      console.log(`• anchor … reuse ${path.basename(anchorPath)}`);
    } else if (realPhotos.length > 0) {
      if (!child) fail("Need a manifest (for the child profile) to generate the anchor, or pass --anchor.");
      process.stdout.write("• anchor (00-character) … ");
      try {
        const { savedPath } = await session.generate({
          prompt: characterAnchorPrompt(child),
          files: realPhotos,
          aspect: "1:1",
          destDir: dir,
          baseName: ANCHOR_BASENAME,
        });
        anchorPath = savedPath;
        console.log(`done → ${path.basename(savedPath)}`);
      } catch (err) {
        console.log("FAILED");
        console.error(`    ${msg(err)}`);
        fail("Could not create the character anchor — aborting (pages depend on it).");
      }
    } else {
      fail("No reference available — pass --anchor <file> or --photos <dir>.");
    }

    if (anchorOnly) {
      console.log(`\n✓ Anchor-only test complete → ${anchorPath}\n`);
      return;
    }

    // References attached to every page.
    const refs = [anchorPath, ...(realPhotos[0] ? [realPhotos[0]] : [])].filter(
      (p): p is string => Boolean(p),
    );

    // ── Pages ─────────────────────────────────────────────────────────────
    for (const page of targets) {
      const base = String(page.page).padStart(2, "0");
      const existing = findExistingImage(imagesDir, base);
      if (existing) {
        console.log(`• ${base} … skip (have ${path.basename(existing)})`);
        skipped++;
        continue;
      }

      process.stdout.write(`• ${base} (${page.role ?? page.kind}${page.spread ? ", spread" : ""}) … `);
      let ok = false;
      for (let attempt = 1; attempt <= PAGE_ATTEMPTS && !ok; attempt++) {
        try {
          // Fresh chat per page: each generation is isolated (one image, one
          // download button), and the attached anchor carries consistency.
          await session.newChat();
          const { savedPath } = await session.generate({
            prompt: page.prompt + append,
            files: refs,
            aspect: page.aspect,
            destDir: imagesDir,
            baseName: base,
          });
          console.log(`done → ${path.basename(savedPath)}`);
          generated++;
          ok = true;
        } catch (err) {
          if (attempt < PAGE_ATTEMPTS) {
            process.stdout.write(`retry (${msg(err)}) … `);
          } else {
            console.log("FAILED");
            console.error(`    ${msg(err)}`);
            failed++;
          }
        }
      }
      await sleep(PAGE_DELAY_MS);
    }
  } finally {
    await session.close();
  }

  console.log(`\n✓ Done — ${generated} generated, ${skipped} skipped, ${failed} failed.`);
  console.log(`   images: ${imagesDir}`);
  if (failed > 0) {
    console.log("   Re-run the same command to retry failed pages (existing ones are skipped).");
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
