/**
 * Generation orchestrator.
 *
 * `generateBook` runs every page of the template through the Gemini client with
 * bounded concurrency, reporting progress and surviving individual page
 * failures (a failed page becomes a blank page rather than failing the book).
 * The Gemini call is injectable so it can be unit-tested without the network.
 *
 * `runGenerationJob` is the coordinator wired into the job store + PDF builder.
 */

import {
  ASPECT_SINGLE,
  ASPECT_SPREAD,
  GEN_CONCURRENCY,
  MAX_REFERENCE_PHOTOS,
} from "../config";
import { buildBook } from "../pdf/buildBook";
import { characterAnchorPrompt } from "../story/prompt/characterAnchor";
import { buildPages, DEFAULT_BOOK_ID } from "../story/registry";
import type { ChildProfile, GeneratedPage, ReferencePhoto } from "../story/types";
import { generateIllustration } from "../gemini/imageClient";
import { updateJob } from "./jobStore";
import { saveRun } from "./saveRun";

type IllustrationFn = typeof generateIllustration;

interface GenerateOptions {
  concurrency?: number;
  generate?: IllustrationFn;
  onProgress?: (completed: number, total: number, failed: number) => void;
  bookId?: string;
  /** Generate a character-reference portrait first and reuse it on every page
   *  for consistent likeness. Defaults to true. */
  anchor?: boolean;
  /** Called with the character-reference portrait once generated. */
  onAnchor?: (img: { data: Buffer; mimeType: string }) => void;
}

/** Generate every page's illustration. Returns pages in template order. */
export async function generateBook(
  child: ChildProfile,
  photos: ReferencePhoto[],
  options: GenerateOptions = {},
): Promise<GeneratedPage[]> {
  const {
    concurrency = GEN_CONCURRENCY,
    generate = generateIllustration,
    onProgress,
    bookId = DEFAULT_BOOK_ID,
    anchor = true,
    onAnchor,
  } = options;

  const pages = buildPages(child, bookId);

  // Generate a master "character reference" once and keep it as a strong
  // secondary reference. Likeness is driven REAL-PHOTO-FIRST: the real photos
  // lead (the first uploaded photo is treated as the frontal portrait) so scenes
  // match the actual child rather than a synthesized portrait that can drift.
  // Falls back to the raw photos if the anchor fails.
  let refs = photos;
  if (anchor) {
    try {
      const portrait = await generate(characterAnchorPrompt(child), photos, "1:1");
      onAnchor?.(portrait);
      const anchorRef: ReferencePhoto = {
        mimeType: portrait.mimeType,
        base64: portrait.data.toString("base64"),
      };
      refs = [photos[0], anchorRef, ...photos.slice(1)].slice(
        0,
        MAX_REFERENCE_PHOTOS,
      );
    } catch {
      /* anchor failed — proceed with the original photos */
    }
  }

  const results = new Array<GeneratedPage>(pages.length);
  let completed = 0;
  let failed = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= pages.length) return;
      const page = pages[i];
      const aspect = page.spread ? ASPECT_SPREAD : ASPECT_SINGLE;
      try {
        const image = await generate(page.prompt, refs, aspect);
        results[i] = {
          index: page.index,
          kind: page.kind,
          role: page.role,
          text: page.text,
          image: image.data,
          imageMimeType: image.mimeType,
          failed: false,
          spread: page.spread,
          verseInk: page.ink,
        };
      } catch (err) {
        failed++;
        results[i] = {
          index: page.index,
          kind: page.kind,
          role: page.role,
          text: page.text,
          image: null,
          imageMimeType: "image/png",
          failed: true,
          spread: page.spread,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        completed++;
        onProgress?.(completed, pages.length, failed);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, pages.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/**
 * Run a full generation job: illustrate every page, assemble the PDF, and store
 * the result on the job. Updates progress as it goes. Designed to be started
 * without awaiting (fire-and-forget) from the API route.
 */
export async function runGenerationJob(
  jobId: string,
  child: ChildProfile,
  photos: ReferencePhoto[],
  bookId: string = DEFAULT_BOOK_ID,
): Promise<void> {
  try {
    updateJob(jobId, { status: "running" });

    let anchorImg: { data: Buffer; mimeType: string } | null = null;
    const pages = await generateBook(child, photos, {
      bookId,
      onProgress: (completed, total, failed) =>
        updateJob(jobId, { completed, total, failedPages: failed }),
      onAnchor: (img) => {
        anchorImg = img;
      },
    });

    // If every page failed there's no book worth shipping — surface an error
    // rather than handing back a blank fallback PDF.
    if (pages.every((p) => p.failed)) {
      const reason = pages.find((p) => p.error)?.error;
      updateJob(jobId, {
        status: "error",
        error: reason
          ? `Every illustration failed to generate. Reason: ${reason.slice(0, 240)}`
          : "Every illustration failed to generate. Check your Gemini API key, " +
            "quota, and model access, then try again.",
      });
      return;
    }

    const pdf = await buildBook(pages, child);
    updateJob(jobId, { status: "done", pdf });

    // Persist the run to disk (best-effort — never fail the job over this).
    try {
      const dir = await saveRun({
        child,
        bookId,
        anchor: anchorImg,
        pdf,
        images: pages
          .filter((p) => p.image)
          .map((p) => ({
            index: p.index,
            data: p.image as Buffer,
            mimeType: p.imageMimeType,
          })),
      });
      console.log(`[storybook] saved generated run to ${dir}`);
    } catch (err) {
      console.warn("[storybook] could not save run to disk:", err);
    }
  } catch (error) {
    updateJob(jobId, {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
