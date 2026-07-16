/**
 * Output-path helpers shared by the in-app generator (`saveRun`) and the CLI
 * scripts (`prompts`, `assemble`).
 *
 * Output is non-destructive: a finished run is never overwritten. `uniquePath`
 * returns the desired path if it's free, otherwise it appends `_1`, `_2`, … so
 * an existing folder or file is always preserved.
 */

import { existsSync } from "node:fs";
import path from "node:path";

/** Where books are saved. Override with STORYBOOK_OUT_DIR (default: ./storybook-out). */
export function outputBaseDir(): string {
  return process.env.STORYBOOK_OUT_DIR || path.join(process.cwd(), "storybook-out");
}

/** Filesystem-safe slug for a child's name. */
export function slug(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
    "child"
  );
}

/**
 * Return `desired` if nothing exists there, otherwise the first free
 * `desired_1`, `desired_2`, … Works for both directories and files (the numeric
 * suffix is inserted before the extension).
 */
export function uniquePath(desired: string): string {
  if (!existsSync(desired)) return desired;
  const dir = path.dirname(desired);
  const ext = path.extname(desired); // "" for a directory
  const base = path.basename(desired, ext);
  for (let i = 1; ; i++) {
    const candidate = path.join(dir, `${base}_${i}${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
}
