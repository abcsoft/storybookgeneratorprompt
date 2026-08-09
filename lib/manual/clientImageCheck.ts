/**
 * Client-side image validation on import (item 3) — instant feedback in the
 * browser, no round trip. Browser-only (`createImageBitmap`); deliberately
 * thin — all the actual tolerance logic lives in the shared, unit-tested
 * `lib/print/aspectCheck.ts` (the exact same rule the server-side Phase 2
 * preflight uses), so this file has nothing of its own to get wrong. Not
 * unit-tested itself: there's no DOM in this repo's test environment (see
 * vitest.config.ts — `environment: "node"`).
 *
 * This never rejects an image merely for being larger than the final output
 * — only for being unreadable or a poor aspect-ratio match.
 */

import { classifyAspectMatch, parseAspect } from "../print/aspectCheck";

export interface ClientImageCheckResult {
  readable: boolean;
  aspectStatus: "ok" | "warn" | "error" | "unknown";
  width?: number;
  height?: number;
}

export async function checkImportedImage(
  file: File,
  expectedAspect: string,
): Promise<ClientImageCheckResult> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    if (!width || !height) {
      return { readable: false, aspectStatus: "unknown" };
    }
    const aspectStatus = classifyAspectMatch(width / height, parseAspect(expectedAspect));
    return { readable: true, aspectStatus, width, height };
  } catch {
    return { readable: false, aspectStatus: "unknown" };
  }
}
