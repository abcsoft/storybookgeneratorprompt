/**
 * CLI: export the 24 personalized prompts for a child so you can generate the
 * images for free in the Gemini app.
 *
 *   npm run prompts -- --name Alex --age 4 --gender boy
 *
 * Writes <out>/prompts.md, <out>/manifest.json, and an empty <out>/images/.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildManifest, renderPromptsMarkdown } from "../lib/manual/manifest";
import { outputBaseDir, slug, uniquePath } from "../lib/generate/paths";
import { DEFAULT_BOOK_ID, listBooks } from "../lib/story/registry";
import type { ChildProfile, Gender } from "../lib/story/types";

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error("Usage: npm run prompts -- --name <name> [--age 4] [--gender boy|girl|neutral] [--book dream-big] [--out <dir>]\n");
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      age: { type: "string" },
      gender: { type: "string" },
      book: { type: "string" },
      out: { type: "string" },
    },
  });

  if (!values.name) fail("Missing --name");
  const age = Number(values.age ?? "4");
  if (!Number.isInteger(age) || age < 0 || age > 18) fail("--age must be an integer 0–18");
  const gender = (values.gender ?? "boy") as Gender;
  if (!["boy", "girl", "neutral"].includes(gender)) fail("--gender must be boy, girl, or neutral");
  const bookId = values.book ?? DEFAULT_BOOK_ID;
  if (!listBooks().some((b) => b.id === bookId)) {
    fail(`Unknown --book "${bookId}". Available: ${listBooks().map((b) => b.id).join(", ")}`);
  }

  const child: ChildProfile = { name: values.name, age, gender };
  const manifest = buildManifest(child, bookId);
  const md = renderPromptsMarkdown(child, bookId);

  // Default to ./storybook-out/<slug>, never overwriting an
  // existing run (clash → <slug>_1, …). An explicit --out is used as given.
  const outDir =
    values.out ?? uniquePath(path.join(outputBaseDir(), slug(child.name)));
  await mkdir(path.join(outDir, "images"), { recursive: true });
  await writeFile(path.join(outDir, "prompts.md"), md, "utf8");
  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ child, bookId, pages: manifest }, null, 2),
    "utf8",
  );

  console.log(`\n✓ Wrote ${manifest.length} prompts for ${child.name}\n`);
  console.log(`   ${path.join(outDir, "prompts.md")}`);
  console.log(`   ${path.join(outDir, "manifest.json")}`);
  console.log(`   ${path.join(outDir, "images")}/  ← save generated images here as 01.png … ${manifest.length}.png\n`);
  console.log("Next:");
  console.log("  1. Open prompts.md and generate each image in the Gemini app (attach photos once).");
  console.log(`  2. Save them into the images/ folder using the filenames shown.`);
  console.log(`  3. Run:  npm run assemble -- --dir ${outDir}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
