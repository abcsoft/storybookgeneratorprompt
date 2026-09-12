/**
 * Filename -> page-index parsing. Dependency-free (no fs/sharp/puppeteer), so
 * it's safe to import from a client component as well as server code —
 * unlike `assemble.ts`, which transitively pulls in the PDF/Puppeteer stack.
 */

export interface ParsedFilename {
  kind: "front-cover" | "back-cover" | "spread" | "page" | "slot" | "legacy-numbered" | "unknown";
  slotId?: string;
  roleSlug?: string;
  pageNumber?: number;
  spreadPages?: [number, number];
  index?: number;
  isLegacy: boolean;
}

/**
 * Parse an incoming filename into its structural kind and page info.
 */
export function parseFilename(filename: string): ParsedFilename {
  const base = filename.replace(/\.[^/.]+$/, "").trim().toLowerCase();

  // Canonical slot format: e.g. "01-cover", "02-intro", "03-pilot", "24-backcover"
  const slotMatch = base.match(/^(\d{2})-([a-z0-9-]+)$/);
  if (slotMatch) {
    const pageNum = parseInt(slotMatch[1], 10);
    const roleSlug = slotMatch[2];
    return {
      kind: "slot",
      slotId: base,
      roleSlug,
      pageNumber: pageNum,
      index: pageNum - 1,
      isLegacy: false,
    };
  }

  if (base === "front-cover" || base === "cover") {
    return { kind: "front-cover", index: 0, isLegacy: false };
  }
  if (base === "back-cover" || base === "backcover") {
    return { kind: "back-cover", isLegacy: false };
  }

  const spreadMatch = base.match(/^spread-(\d+)-(\d+)(?:-([a-z0-9-]+))?$/);
  if (spreadMatch) {
    const p1 = parseInt(spreadMatch[1], 10);
    const p2 = parseInt(spreadMatch[2], 10);
    return {
      kind: "spread",
      slotId: base,
      roleSlug: spreadMatch[3],
      spreadPages: [p1, p2],
      isLegacy: false,
    };
  }

  const pageMatch = base.match(/^page-(\d+)(?:-([a-z0-9-]+))?$/);
  if (pageMatch) {
    const p = parseInt(pageMatch[1], 10);
    return {
      kind: "page",
      slotId: base,
      roleSlug: pageMatch[2],
      pageNumber: p,
      index: p - 1,
      isLegacy: false,
    };
  }

  // Legacy numbered format like "01", "02", "page-1"
  const numMatch = base.match(/^\d+$/);
  if (numMatch) {
    const n = parseInt(numMatch[0], 10);
    if (Number.isFinite(n) && n >= 1) {
      return { kind: "legacy-numbered", pageNumber: n, index: n - 1, isLegacy: true };
    }
  }

  const anyNumMatch = base.match(/\d+/);
  if (anyNumMatch) {
    const n = parseInt(anyNumMatch[0], 10);
    if (Number.isFinite(n) && n >= 1) {
      return { kind: "legacy-numbered", pageNumber: n, index: n - 1, isLegacy: true };
    }
  }

  return { kind: "unknown", isLegacy: false };
}

/**
 * Extract the leading 1-based page number from a filename like "01.png", "01-cover.png",
 * or "page-3.jpg" and return the matching 0-based index, or null if none.
 */
export function indexFromFilename(filename: string): number | null {
  const match = filename.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1;
}



