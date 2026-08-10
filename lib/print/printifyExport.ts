/**
 * Printify export orchestrator (item 20). Runs preflight first and refuses to
 * write anything if it fails (item 21). On success, writes a self-contained
 * folder under `storybook-out/<child-slug>/<profile-id>/`:
 *
 *   cover.png            — composed wrap cover (front + back + spine)
 *   page-01.png … NN.png — one file per physical interior page (spreads
 *                          expand to two consecutive files)
 *   proof.pdf            — visual flip-through check (not the deliverable)
 *   prompts.md           — same manual-workflow prompts, profile-aware aspect
 *   order-info.txt       — child/book/profile/page-count summary
 */

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer, { type Browser } from "puppeteer";
import sharp from "sharp";
import type { ProvidedImage } from "../manual/assemble";
import { imageFilename, renderPromptsMarkdown } from "../manual/manifest";
import { outputBaseDir, slug, uniquePath } from "../generate/paths";
import { buildPages, getBook } from "../story/registry";
import type { ChildProfile } from "../story/types";
import {
  ARTWORK_FRAME_BACKDROP_BLUR_SIGMA,
  ARTWORK_FRAME_BACKDROP_BRIGHTNESS,
} from "./artworkFrame";
import { composeCover } from "./coverComposer";
import {
  renderPrintifyPageHtml,
  renderPrintifyProofHtml,
} from "./printifyPageTemplate";
import { runPreflight, type PreflightResult } from "./preflight";
import { getPrintProfile } from "./registry";
import type { PrintProfile, PxSize } from "./types";

import { getEditionForProfile, resolvePhysicalPageText } from "../story/editions";

export interface PrintifyExportOptions {
  child: ChildProfile;
  bookId?: string;
  profileId: string;
  /** 0-based template page index -> the image provided for it. */
  images: Map<number, ProvidedImage>;
  /** Optional raw file list (for duplicate filename detection before Map assignment). */
  rawFiles?: { filename: string; buffer: Buffer }[];
}

export interface PrintifyExportResult {
  ok: boolean;
  dir: string | null;
  files: string[];
  preflight: PreflightResult;
}

function dataUri(image: ProvidedImage): string {
  return `data:${image.mimeType};base64,${image.buffer.toString("base64")}`;
}

import { computeTransformGeometry, sanitizeTransform } from "./artworkTransform";

async function splitSpread(
  image: ProvidedImage,
  canvasPx: PxSize,
): Promise<[Buffer, Buffer]> {
  const wideWidth = canvasPx.width * 2;
  const wideHeight = canvasPx.height;
  const destPx = { width: wideWidth, height: wideHeight };

  const meta = await sharp(image.buffer).rotate().metadata();
  const sourcePx = { width: meta.width || wideWidth, height: meta.height || wideHeight };
  const transform = sanitizeTransform(image.transform);

  const geo = computeTransformGeometry(sourcePx, destPx, transform);

  console.log(
    `[PDF Render] Spread Layout | Source: ${sourcePx.width}x${sourcePx.height} | Target: ${destPx.width}x${destPx.height} | Scale: ${transform.scale.toFixed(2)}x | Translation: (${transform.offsetX}, ${transform.offsetY}) | Crop: ${geo.width}x${geo.height}`,
  );

  const backdrop = geo.showBackdrop
    ? await sharp(image.buffer)
        .rotate()
        .resize(wideWidth, wideHeight, {
          fit: "contain",
          background: { r: 28, g: 20, b: 64, alpha: 1 },
        })
        .blur(48)
        .modulate({ brightness: 0.75, saturation: 0.9 })
        .png()
        .toBuffer()
    : await sharp({
        create: {
          width: wideWidth,
          height: wideHeight,
          channels: 4,
          background: { r: 28, g: 20, b: 64, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

  const srcCropLeft = Math.max(0, -geo.left);
  const srcCropTop = Math.max(0, -geo.top);
  const srcCropWidth = Math.min(geo.width - srcCropLeft, wideWidth - Math.max(0, geo.left));
  const srcCropHeight = Math.min(geo.height - srcCropTop, wideHeight - Math.max(0, geo.top));

  const destLeft = Math.max(0, geo.left);
  const destTop = Math.max(0, geo.top);

  let compositableSubject = await sharp(image.buffer)
    .rotate()
    .resize(geo.width, geo.height, { fit: "fill" })
    .png()
    .toBuffer();

  if (
    srcCropLeft > 0 ||
    srcCropTop > 0 ||
    srcCropWidth < geo.width ||
    srcCropHeight < geo.height
  ) {
    compositableSubject = await sharp(compositableSubject)
      .extract({
        left: srcCropLeft,
        top: srcCropTop,
        width: Math.max(1, srcCropWidth),
        height: Math.max(1, srcCropHeight),
      })
      .png()
      .toBuffer();
  }

  const subjectCanvas = await sharp({
    create: {
      width: wideWidth,
      height: wideHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: compositableSubject, left: destLeft, top: destTop }])
    .png()
    .toBuffer();

  const composed = await sharp(backdrop)
    .composite([{ input: subjectCanvas }])
    .png()
    .toBuffer();

  const left = await sharp(composed)
    .extract({ left: 0, top: 0, width: canvasPx.width, height: canvasPx.height })
    .png()
    .toBuffer();
  const right = await sharp(composed)
    .extract({
      left: canvasPx.width,
      top: 0,
      width: canvasPx.width,
      height: canvasPx.height,
    })
    .png()
    .toBuffer();
  return [left, right];
}

async function screenshotPage(
  browser: Browser,
  canvasPx: PxSize,
  html: string,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: canvasPx.width,
      height: canvasPx.height,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: canvasPx.width, height: canvasPx.height },
    });
    return Buffer.from(png);
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore cleanup close error */
    }
  }
}

const SCREENSHOT_CONCURRENCY = 4;

async function screenshotAll(
  browser: Browser,
  canvasPx: PxSize,
  jobs: { name: string; html: string }[],
): Promise<Buffer[]> {
  const results = new Array<Buffer>(jobs.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= jobs.length) return;
      results[i] = await screenshotPage(browser, canvasPx, jobs[i].html);
    }
  }

  const workerCount = Math.max(1, Math.min(SCREENSHOT_CONCURRENCY, jobs.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function validateExportedFolder(
  dir: string,
  profile: PrintProfile,
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const requiredInteriorCount = profile.interiorPageCount ?? 24;

  // Check for unexpected extra interior page files (e.g. page-25.png)
  try {
    const { readdir } = await import("node:fs/promises");
    const allFiles = await readdir(dir);
    const extraPages = allFiles.filter((f) => {
      if (!/^page-\d+\.png$/i.test(f)) return false;
      const num = parseInt(f.replace(/^page-/i, "").replace(/\.png$/i, ""), 10);
      return num < 1 || num > requiredInteriorCount;
    });
    if (extraPages.length > 0) {
      errors.push(`Unexpected extra interior page file(s) found in export folder: ${extraPages.join(", ")}.`);
    }

    // Verify proof.pdf, prompts.md, order-info.txt
    for (const reqFile of ["proof.pdf", "prompts.md", "order-info.txt"]) {
      const { stat } = await import("node:fs/promises");
      const filePath = path.join(dir, reqFile);
      try {
        const s = await stat(filePath);
        if (s.size === 0) {
          errors.push(`Exported file "${reqFile}" is empty (0 bytes).`);
        }
      } catch {
        errors.push(`Exported file "${reqFile}" is missing.`);
      }
    }
  } catch {
    errors.push(`Could not read export directory "${dir}".`);
  }

  const expectedPageFiles = Array.from(
    { length: requiredInteriorCount },
    (_, i) => `page-${String(i + 1).padStart(2, "0")}.png`,
  );

  const foundPageFiles: string[] = [];
  for (const file of expectedPageFiles) {
    const filePath = path.join(dir, file);
    try {
      const meta = await sharp(filePath).metadata();
      if (!meta.width || !meta.height) {
        errors.push(`Exported file "${file}" is unreadable.`);
        continue;
      }
      if (meta.width !== profile.canvasPx.width || meta.height !== profile.canvasPx.height) {
        errors.push(
          `Exported file "${file}" has dimensions ${meta.width}x${meta.height}, expected ${profile.canvasPx.width}x${profile.canvasPx.height}.`,
        );
      }
      foundPageFiles.push(file);
    } catch {
      errors.push(`Exported file "${file}" is missing or unreadable.`);
    }
  }

  if (foundPageFiles.length !== requiredInteriorCount) {
    errors.push(
      `Exported folder contains ${foundPageFiles.length} interior pages, expected exactly ${requiredInteriorCount}.`,
    );
  }

  if (profile.coverGeometryPx) {
    const coverPath = path.join(dir, "cover.png");
    try {
      const meta = await sharp(coverPath).metadata();
      if (!meta.width || !meta.height) {
        errors.push(`Exported cover.png is unreadable.`);
      } else if (
        meta.width !== profile.coverGeometryPx.width ||
        meta.height !== profile.coverGeometryPx.height
      ) {
        errors.push(
          `Exported cover.png has dimensions ${meta.width}x${meta.height}, expected ${profile.coverGeometryPx.width}x${profile.coverGeometryPx.height}.`,
        );
      }
    } catch {
      errors.push(`Exported cover.png is missing or unreadable.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export async function exportPrintifyBook(
  opts: PrintifyExportOptions,
): Promise<PrintifyExportResult> {
  const profile = getPrintProfile(opts.profileId);
  if (profile.exportMode !== "printify-folder") {
    throw new Error(
      `Print profile "${profile.id}" doesn't use the Printify export pipeline.`,
    );
  }

  const filesForPreflight =
    opts.rawFiles && opts.rawFiles.length > 0
      ? opts.rawFiles
      : [...opts.images.entries()].map(([index, img]) => ({
          filename: imageFilename(index),
          buffer: img.buffer,
        }));

  const preflight = await runPreflight({
    child: opts.child,
    bookId: opts.bookId,
    profileId: opts.profileId,
    files: filesForPreflight,
  });
  if (!preflight.ok) {
    return { ok: false, dir: null, files: [], preflight };
  }

  const pages = buildPages(opts.child, opts.bookId);
  const book = getBook(opts.bookId);
  const coverPage = pages.find((p) => p.kind === "cover");
  const backCoverPage = pages.find((p) => p.kind === "backcover");
  const interiorPages = pages.filter(
    (p) => p.kind !== "cover" && p.kind !== "backcover",
  );

  const dir = uniquePath(
    path.join(outputBaseDir(), slug(opts.child.name), profile.id),
  );
  await mkdir(dir, { recursive: true });
  const written: string[] = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // Cover — composed from the front (cover) + back (backcover) page images.
    const frontImg = coverPage ? opts.images.get(coverPage.index) : undefined;
    if (frontImg) {
      const backImg = backCoverPage ? opts.images.get(backCoverPage.index) : undefined;
      const coverPng = await composeCover(
        profile,
        {
          front: { data: frontImg.buffer, mimeType: frontImg.mimeType },
          back: backImg ? { data: backImg.buffer, mimeType: backImg.mimeType } : null,
        },
        { title: book.title, childName: opts.child.name },
      );
      await writeFile(path.join(dir, "cover.png"), coverPng);
      written.push("cover.png");
    }

    const edition = getEditionForProfile(opts.bookId ?? "great-adventure", profile);
    const jobs: { name: string; html: string }[] = [];

    if (edition) {
      const spreadSplits = new Map<number, [Buffer, Buffer]>();
      for (const p of edition.physicalPages) {
        if ((p.side === "left" || p.side === "right") && !spreadSplits.has(p.illustrationIndex)) {
          const provided = opts.images.get(p.illustrationIndex);
          if (provided) {
            const [left, right] = await splitSpread(provided, profile.canvasPx);
            spreadSplits.set(p.illustrationIndex, [left, right]);
          }
        }
      }

      for (const p of edition.physicalPages) {
        const provided = opts.images.get(p.illustrationIndex);
        let pageDataUri: string | null = null;
        if (provided) {
          if (p.side === "left") {
            const split = spreadSplits.get(p.illustrationIndex);
            if (split) pageDataUri = dataUri({ buffer: split[0], mimeType: "image/png" });
          } else if (p.side === "right") {
            const split = spreadSplits.get(p.illustrationIndex);
            if (split) pageDataUri = dataUri({ buffer: split[1], mimeType: "image/png" });
          } else {
            pageDataUri = dataUri(provided);
          }
        }

        jobs.push({
          name: `page-${String(p.physicalPageNumber).padStart(2, "0")}.png`,
          html: renderPrintifyPageHtml(profile, {
            imageDataUri: pageDataUri,
            text: resolvePhysicalPageText(p, opts.child),
            ink: p.ink,
            transform: p.side === "full" ? provided?.transform : undefined,
          }),
        });
      }
    } else {
      let pageNumber = 1;
      for (const p of interiorPages) {
        const provided = opts.images.get(p.index);

        if (p.spread && provided) {
          const [left, right] = await splitSpread(provided, profile.canvasPx);
          jobs.push({
            name: `page-${String(pageNumber++).padStart(2, "0")}.png`,
            html: renderPrintifyPageHtml(profile, {
              imageDataUri: dataUri({ buffer: left, mimeType: "image/png" }),
              text: p.text,
              ink: p.ink,
            }),
          });
          jobs.push({
            name: `page-${String(pageNumber++).padStart(2, "0")}.png`,
            html: renderPrintifyPageHtml(profile, {
              imageDataUri: dataUri({ buffer: right, mimeType: "image/png" }),
              text: null,
              ink: p.ink,
            }),
          });
        } else {
          jobs.push({
            name: `page-${String(pageNumber++).padStart(2, "0")}.png`,
            html: renderPrintifyPageHtml(profile, {
              imageDataUri: provided ? dataUri(provided) : null,
              text: p.text,
              ink: p.ink,
            }),
          });
        }
      }
    }

    const screenshots = await screenshotAll(browser, profile.canvasPx, jobs);
    for (let i = 0; i < jobs.length; i++) {
      await writeFile(path.join(dir, jobs[i].name), screenshots[i]);
      written.push(jobs[i].name);
    }
    const proofDataUris = screenshots.map((png) =>
      dataUri({ buffer: png, mimeType: "image/png" }),
    );

    // proof.pdf — built from the already-screenshotted pixels above.
    const proofPage = await browser.newPage();
    try {
      await proofPage.setContent(
        renderPrintifyProofHtml(profile, proofDataUris),
        { waitUntil: "load" },
      );
      const proofPdf = await proofPage.pdf({
        width: `${profile.canvasPx.width / profile.dpi}in`,
        height: `${profile.canvasPx.height / profile.dpi}in`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      await writeFile(path.join(dir, "proof.pdf"), Buffer.from(proofPdf));
      written.push("proof.pdf");
    } finally {
      await proofPage.close();
    }
  } finally {
    await browser.close();
  }

  const promptsMd = renderPromptsMarkdown(opts.child, opts.bookId, profile.id);
  await writeFile(path.join(dir, "prompts.md"), promptsMd, "utf8");
  written.push("prompts.md");

  const orderInfo = [
    `Child: ${opts.child.name} (age ${opts.child.age}, ${opts.child.gender})`,
    `Book: ${book.title} (${book.id})`,
    `Print profile: ${profile.label} — ${profile.provider} / ${profile.product}`,
    `Interior pages: ${written.filter((f) => f.startsWith("page-")).length}`,
    `Cover: ${written.includes("cover.png") ? "cover.png" : "MISSING"}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Files:",
    ...written.map((f) => `  ${f}`),
    "",
    ...(preflight.warnings.length > 0
      ? ["Warnings (review before ordering):", ...preflight.warnings.map((w) => `  - ${w}`)]
      : []),
  ].join("\n");
  await writeFile(path.join(dir, "order-info.txt"), orderInfo, "utf8");
  written.push("order-info.txt");

  const finalValidation = await validateExportedFolder(dir, profile);
  if (!finalValidation.ok) {
    return {
      ok: false,
      dir,
      files: written,
      preflight: {
        ok: false,
        errors: [...preflight.errors, ...finalValidation.errors],
        warnings: preflight.warnings,
      },
    };
  }

  return { ok: true, dir, files: written, preflight };
}
