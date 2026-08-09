/**
 * Filename -> page-index parsing. Dependency-free (no fs/sharp/puppeteer), so
 * it's safe to import from a client component as well as server code —
 * unlike `assemble.ts`, which transitively pulls in the PDF/Puppeteer stack.
 */

/**
 * Extract the leading 1-based page number from a filename like "01.png" or
 * "page-3.jpg" and return the matching 0-based index, or null if none.
 */
export function indexFromFilename(filename: string): number | null {
  const match = filename.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1;
}
