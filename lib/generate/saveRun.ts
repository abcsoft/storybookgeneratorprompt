/**
 * Persist a generated run to disk, so every child gets a folder with all their
 * images + a single prompts file (to regenerate any one image later) + the PDF.
 *
 * Output base dir is `STORYBOOK_OUT_DIR` (default `./storybook-out`). Each run
 * goes to its own folder `<base>/<slug>/` — and is never
 * overwritten: a clash becomes `<slug>_1`, `<slug>_2`, … (see `uniquePath`).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderPromptsMarkdown } from "../manual/manifest";
import { bookFilename } from "../story/registry";
import type { ChildProfile } from "../story/types";
import { outputBaseDir, slug, uniquePath } from "./paths";

export { outputBaseDir } from "./paths";

function ext(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

export interface SavedImage {
  index: number; // 0-based page index
  data: Buffer;
  mimeType: string;
}

/**
 * Write the run to `<base>/<slug>/`:
 *  - prompts.md           (Step-0 + every page prompt, for regenerating images)
 *  - 00-character.<ext>   (the character reference, if any)
 *  - 01.<ext> … NN.<ext>  (each generated page image)
 *  - <slug>-dream-big.pdf (the finished book)
 * Returns the folder path.
 */
export async function saveRun(opts: {
  child: ChildProfile;
  bookId?: string;
  images: SavedImage[];
  anchor?: { data: Buffer; mimeType: string } | null;
  pdf?: Buffer | null;
}): Promise<string> {
  // Never overwrite a previous run: a clash becomes <slug>_1, <slug>_2, …
  const dir = uniquePath(path.join(outputBaseDir(), slug(opts.child.name)));
  await mkdir(dir, { recursive: true });

  await writeFile(
    path.join(dir, "prompts.md"),
    renderPromptsMarkdown(opts.child, opts.bookId),
    "utf8",
  );

  if (opts.anchor) {
    await writeFile(
      path.join(dir, `00-character.${ext(opts.anchor.mimeType)}`),
      opts.anchor.data,
    );
  }

  for (const img of opts.images) {
    const name = `${String(img.index + 1).padStart(2, "0")}.${ext(img.mimeType)}`;
    await writeFile(path.join(dir, name), img.data);
  }

  if (opts.pdf) {
    await writeFile(
      path.join(dir, bookFilename(opts.child.name, opts.bookId)),
      opts.pdf,
    );
  }

  return dir;
}
