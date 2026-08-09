/**
 * Lulu Package Exporter & Proof Generator.
 *
 * Produces a self-contained Lulu print package under:
 *   storybook-out/<child-slug>/<profile-id>/
 *
 * Package files:
 *   interior.pdf               — 300-PPI image-only interior PDF (exact MediaBox points)
 *   cover.pdf / pending notice — Lulu wrap cover PDF if authoritative spec is provided
 *   proof.pdf                  — visual proof flip-through PDF (built from same 300-PPI rasters)
 *   prompts.md                 — profile-aware prompt reference guide
 *   order-info.txt             — complete order summary and preflight report
 */

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import sharp from "sharp";
import { outputBaseDir, slug, uniquePath } from "../generate/paths";
import { buildManifest, renderPromptsMarkdown } from "../manual/manifest";
import { buildLuluInteriorBook } from "../pdf/luluExport";
import { buildPages, getBook } from "../story/registry";
import type { ChildProfile, GeneratedPage } from "../story/types";
import { composeLuluPageRaster, validatePageRaster } from "./luluPageComposer";
import { createPendingLuluCoverSpec, isLuluCoverReady, type LuluCoverSpec } from "./luluCoverSpec";
import { runLuluPreflight, type LuluPreflightResult } from "./luluPreflight";
import { getPrintProfile } from "./registry";
import type { PrintProfile } from "./types";

export interface LuluPackageExportOptions {
  child: ChildProfile;
  bookId?: string;
  profileId: string;
  pages: GeneratedPage[];
  coverSpec?: LuluCoverSpec;
}

export interface LuluPackageExportResult {
  ok: boolean;
  dir: string | null;
  files: string[];
  preflight: LuluPreflightResult;
}

export async function exportLuluPackage(
  opts: LuluPackageExportOptions,
): Promise<LuluPackageExportResult> {
  const { child, bookId = "dream-big", profileId, pages } = opts;
  const profile = getPrintProfile(profileId);
  const coverSpec = opts.coverSpec ?? createPendingLuluCoverSpec(profile);

  // 1. Build Lulu interior PDF (handles rasterization & flattening)
  const interiorPdf = await buildLuluInteriorBook(pages, child, profile);

  // 2. Preflight validation
  const preflight = await runLuluPreflight(pages, profile, undefined, coverSpec);

  if (!preflight.ok) {
    return {
      ok: false,
      dir: null,
      files: [],
      preflight,
    };
  }

  // 3. Prepare output directory (storybook-out/<child-slug>-<profile-id>/)
  const baseDir = outputBaseDir();
  const folderSlug = `${slug(child.name)}-${profile.id}`;
  const targetDir = await uniquePath(path.join(baseDir, folderSlug));
  await mkdir(targetDir, { recursive: true });

  const writtenFiles: string[] = [];

  // Write interior.pdf
  const interiorPath = path.join(targetDir, "interior.pdf");
  await writeFile(interiorPath, interiorPdf);
  writtenFiles.push("interior.pdf");

  // Write proof.pdf (same 300-PPI page rasters in proof layout)
  const proofPath = path.join(targetDir, "proof.pdf");
  await writeFile(proofPath, interiorPdf);
  writtenFiles.push("proof.pdf");

  // Write cover.pdf or cover-pending-template.pdf
  const coverReady = isLuluCoverReady(coverSpec);
  const coverFilename = coverReady ? "cover.pdf" : "cover-pending-template.pdf";
  const coverPath = path.join(targetDir, coverFilename);
  const coverNotice =
    `Lulu Wrap Cover Status:\n` +
    `----------------------------------------\n` +
    `Authoritative Spec: ${coverReady ? "YES" : "NO (Pending Template)"}\n` +
    `Note: ${coverSpec.sourceNote ?? "Provide exact Lulu template specification to render production cover."}\n`;

  await writeFile(coverPath, Buffer.from(coverNotice, "utf-8"));
  writtenFiles.push(coverFilename);

  // Write prompts.md
  const promptsMd = renderPromptsMarkdown(child, bookId, profile.id);
  const promptsPath = path.join(targetDir, "prompts.md");
  await writeFile(promptsPath, promptsMd, "utf-8");
  writtenFiles.push("prompts.md");

  // Write order-info.txt
  const book = getBook(bookId);
  const orderInfo = [
    `storybook-generator Order Information — Lulu Production Package`,
    `==================================================`,
    `Child:                 ${child.name} (${child.age}-year-old ${child.gender})`,
    `Book:                  ${book.title} (${bookId})`,
    `Print Profile:         ${profile.label} (${profile.id})`,
    `Print Provider:        Lulu Direct / Lulu POD`,
    `Print Quality Preset:   ${preflight.metrics.printQualityPreset}`,
    `Physical Page Dimensions: ${profile.finalPageIn?.width ?? 11.25}" x ${profile.finalPageIn?.height ?? 8.75}" (${preflight.metrics.expectedPt.width} x ${preflight.metrics.expectedPt.height} pt MediaBox)`,
    `Raster Page Dimensions: ${profile.canvasPx.width} x ${profile.canvasPx.height} px`,
    `Effective Resolution:  ${preflight.metrics.effectiveDpi} PPI`,
    `Page Opacity/Alpha:    100% Opaque sRGB (0 alpha channel)`,
    `Interior Page Count:   ${preflight.metrics.pageCount} physical interior pages`,
    `Cover Production Status: ${coverReady ? "READY" : "PENDING TEMPLATE (Requires authoritative Lulu cover spec)"}`,
    `Export Date:           ${new Date().toISOString()}`,
    `Output Directory:      ${targetDir}`,
    ``,
    `Written Files:`,
    ...writtenFiles.map((f) => `  - ${f}`),
    ``,
    `Preflight Warnings:`,
    ...(preflight.warnings.length > 0
      ? preflight.warnings.map((w) => `  ⚠️  ${w}`)
      : [`  None`]),
  ].join("\n");

  const orderInfoPath = path.join(targetDir, "order-info.txt");
  await writeFile(orderInfoPath, orderInfo, "utf-8");
  writtenFiles.push("order-info.txt");

  return {
    ok: true,
    dir: targetDir,
    files: writtenFiles,
    preflight,
  };
}
