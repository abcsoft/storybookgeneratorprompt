/**
 * Preflight validation (item 21) — run before any print export writes a
 * single file. Never silently ship an invalid book: `ok: false` means the
 * export function must refuse to write anything.
 *
 * Two distinct concerns, kept separate on purpose (see the request that
 * prompted this split — Printify preflight was previously conflating them):
 *
 * - `validateFinalPrintOutput` — can we structurally produce a valid final
 *   book at all: every required page present and unambiguously mapped,
 *   cover present, spreads aligned, a known book/profile. These are hard
 *   blockers regardless of what the source art looks like.
 * - `validateSourceAssets` — is each individual provided image usable: does
 *   it decode, and is its aspect ratio/orientation compatible with the page
 *   it's going on. A source that merely isn't the IDEAL ratio is not a
 *   blocker — the compositor (lib/print/artworkFrame.ts) always preserves
 *   the full image rather than cropping it, so only a genuinely incompatible
 *   orientation (e.g. portrait art for a wide spread) is a hard error here.
 */

import sharp from "sharp";
import { assertSpreadsAligned } from "../pdf/imposition";
import { indexFromFilename } from "../manual/assemble";
import { buildManifest, type ManualPage } from "../manual/manifest";
import { classifyAspectMatch, orientationOf, parseAspect } from "./aspectCheck";
import { computePageTextGeometry } from "./printifyPageTemplate";
import { getPrintProfile, listPrintProfiles } from "./registry";
import { buildPages, listBooks } from "../story/registry";
import type { ChildProfile } from "../story/types";
import type { PrintProfile } from "./types";

export interface PreflightFile {
  filename: string;
  buffer: Buffer;
}

export interface PreflightOptions {
  child: ChildProfile;
  bookId?: string;
  profileId?: string;
  /** Every file the user provided, filename as given (not deduped) — needed
   *  to catch duplicate filenames that resolve to the same page index. */
  files: PreflightFile[];
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Resolve each provided filename to a page index, catching duplicates (two
 *  files mapping to the same page) and unrecognized filenames along the way.
 *  Shared by both validation stages below. */
function resolveByIndex(
  files: PreflightFile[],
  manifest: ManualPage[],
  errors: string[],
  warnings: string[],
): Map<number, PreflightFile> {
  const byIndex = new Map<number, PreflightFile>();
  const seenFilenames = new Set<string>();
  for (const file of files) {
    if (seenFilenames.has(file.filename)) {
      errors.push(`Duplicate filename "${file.filename}".`);
      continue;
    }
    seenFilenames.add(file.filename);

    const index = indexFromFilename(file.filename);
    if (index === null) {
      warnings.push(`Could not match "${file.filename}" to a page — ignored.`);
      continue;
    }
    if (byIndex.has(index)) {
      errors.push(
        `"${file.filename}" and "${byIndex.get(index)?.filename}" both resolve ` +
          `to page ${index + 1} — rename one.`,
      );
      continue;
    }
    if (index < 0 || index >= manifest.length) {
      warnings.push(`"${file.filename}" doesn't match any page in this book — ignored.`);
      continue;
    }
    byIndex.set(index, file);
  }
  return byIndex;
}

import { getEditionForProfile } from "../story/editions";

/** Structural checks: can a valid final book be assembled at all from what
 *  was provided. Always hard errors (except the spine-width placeholder
 *  note, which is informational). */
function validateFinalPrintOutput(
  opts: PreflightOptions,
  profile: PrintProfile,
  manifest: ManualPage[],
  byIndex: Map<number, PreflightFile>,
  errors: string[],
  warnings: string[],
): void {
  if (opts.bookId && !listBooks().some((b) => b.id === opts.bookId)) {
    errors.push(`Unknown book id "${opts.bookId}".`);
  }
  if (opts.profileId && !listPrintProfiles().some((p) => p.id === opts.profileId)) {
    errors.push(`Unknown print profile id "${opts.profileId}".`);
  }

  // Profile-story compatibility check: if the profile enforces a fixed interior page count,
  // the selected story MUST have a matching edition.
  if (profile.interiorPageCount && opts.bookId) {
    const edition = getEditionForProfile(opts.bookId, profile);
    if (!edition || edition.interiorPageCount !== profile.interiorPageCount) {
      errors.push(`This story does not yet have a ${profile.interiorPageCount}-page Printify edition.`);
    }
  }

  const missing = manifest.filter((m) => !byIndex.has(m.index));
  if (missing.length > 0) {
    errors.push(
      `${missing.length} of ${manifest.length} required images are missing: ` +
        missing.map((m) => m.filename).join(", "),
    );
  }

  const cover = manifest.find((m) => m.kind === "cover");
  if (cover && !byIndex.has(cover.index)) {
    errors.push(`Cover image ("${cover.filename}") is missing.`);
  }

  // Spread alignment — reuse the same check the landscape PDF builder relies
  // on, so a misaligned spread is caught here instead of failing deep inside
  // export.
  try {
    assertSpreadsAligned(buildPages(opts.child, opts.bookId));
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // Printify's exact spine width depends on final page count/paper, which
  // isn't part of the numbers this profile was given — surface it every time
  // rather than silently trusting a placeholder (see profiles/printifyHardcoverSquare8x8.ts).
  if (profile.provider === "printify" && profile.spineWidthPx) {
    warnings.push(
      `Spine width is a placeholder (${profile.spineWidthPx}px) — confirm the ` +
        `exact spine width against Printify's live spec sheet for your page ` +
        `count before ordering.`,
    );
  }
}

/** Per-image checks: is each provided file itself usable. A ratio mismatch
 *  alone is a warning — the compositor never crops the source to force a
 *  match. Only an orientation genuinely incompatible with the page (e.g.
 *  portrait art for a wide spread) is an error. */
async function validateSourceAssets(
  manifest: ManualPage[],
  byIndex: Map<number, PreflightFile>,
  profile: PrintProfile,
  errors: string[],
  warnings: string[],
): Promise<void> {
  for (const [index, file] of byIndex) {
    const page = manifest.find((m) => m.index === index);
    if (!page) continue;
    const illoNum = page.illustrationNumber ?? (page.index + 1);
    try {
      const meta = await sharp(file.buffer).metadata();
      if (!meta.width || !meta.height) {
        errors.push(`Could not read "${file.filename}" as an image.`);
        continue;
      }
      const actual = meta.width / meta.height;
      const expected = parseAspect(page.aspect);
      const match = classifyAspectMatch(actual, expected);
      if (match === "error") {
        const actualOrientation = orientationOf(actual);
        const expectedOrientation = orientationOf(expected);
        errors.push(
          `Illustration ${illoNum} (${file.filename}) is ${actualOrientation}, but needs a ` +
            `${expectedOrientation} layout (recommended ${page.aspect}) — this can't be ` +
            `used here without cropping or padding out the artwork. Regenerate with a ` +
            `${expectedOrientation} aspect ratio.`,
        );
      } else if (match === "warn") {
        warnings.push(
          `Illustration ${illoNum} (${file.filename})'s aspect ratio doesn't closely match the recommended ` +
            `${page.aspect} — the full image will still be used ` +
            `(no cropping); check the final composition in Book Review before printing.`,
        );
      }
      // Story text safe area and gutter bounds validation
      const isSpread = page.pageLayout ? page.pageLayout === "spread" : (page.spread ?? false);
      const textGeom = computePageTextGeometry(profile, isSpread);
      if (isSpread) {
        // Gutter starts at 47% on wide 2:1 spread canvas
        const textRightEdgePct = textGeom.leftPct + textGeom.maxWidthPct;
        if (textRightEdgePct > 47) {
          errors.push(
            `Illustration ${illoNum} (${file.filename}) story text extends into spine gutter area (${textRightEdgePct.toFixed(1)}% > 47%).`,
          );
        }
      } else {
        const textRightEdgePct = textGeom.leftPct + textGeom.maxWidthPct;
        if (textRightEdgePct > 94) {
          errors.push(
            `Illustration ${illoNum} (${file.filename}) story text exceeds safe area bounds (${textRightEdgePct.toFixed(1)}% > 94%).`,
          );
        }
      }
    } catch {
      errors.push(`Could not read "${file.filename}" as an image.`);
    }
  }
}

export async function runPreflight(
  opts: PreflightOptions,
): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Both fall back to a default rather than throwing, so the rest of the
  // checks can still run meaningfully even after an unknown-id error above.
  const profile = getPrintProfile(opts.profileId);
  const manifest = buildManifest(opts.child, opts.bookId, opts.profileId);
  const byIndex = resolveByIndex(opts.files, manifest, errors, warnings);

  validateFinalPrintOutput(opts, profile, manifest, byIndex, errors, warnings);
  await validateSourceAssets(manifest, byIndex, profile, errors, warnings);

  return { ok: errors.length === 0, errors, warnings };
}
