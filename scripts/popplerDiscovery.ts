import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

export interface PopplerTools {
  pdfinfo: string;
  pdfimages: string;
  pdftoppm: string;
  pdftotext: string;
}

/**
 * Portably discovers Poppler utilities (pdfinfo, pdfimages, pdftoppm).
 *
 * Discovery order:
 * 1. Environment variable `POPPLER_BIN_DIR`
 * 2. System PATH
 * 3. Windows standard user WinGet packages directory via %LOCALAPPDATA%
 *
 * If not found, throws a descriptive error explaining how to install Poppler.
 * Never hardcodes developer-specific user directories.
 */
export function discoverPopplerTools(): PopplerTools {
  const isWin = process.platform === "win32";
  const exeSuffix = isWin ? ".exe" : "";

  // 1. Explicit POPPLER_BIN_DIR env var
  if (process.env.POPPLER_BIN_DIR) {
    const dir = process.env.POPPLER_BIN_DIR;
    const info = path.join(dir, `pdfinfo${exeSuffix}`);
    const images = path.join(dir, `pdfimages${exeSuffix}`);
    const ppm = path.join(dir, `pdftoppm${exeSuffix}`);
    const text = path.join(dir, `pdftotext${exeSuffix}`);
    if (fs.existsSync(info) && fs.existsSync(images) && fs.existsSync(ppm) && fs.existsSync(text)) {
      return { pdfinfo: info, pdfimages: images, pdftoppm: ppm, pdftotext: text };
    }
  }

  // 2. System PATH check
  const tryInPath = (cmd: string): string | null => {
    try {
      const probeCmd = isWin ? "where.exe" : "which";
      const res = spawnSync(probeCmd, [cmd], { encoding: "utf8" });
      if (res.status === 0 && res.stdout) {
        const first = res.stdout.trim().split(/\r?\n/)[0].trim();
        if (first && fs.existsSync(first)) return first;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const pathPdfinfo = tryInPath(`pdfinfo${exeSuffix}`) || tryInPath("pdfinfo");
  const pathPdfimages = tryInPath(`pdfimages${exeSuffix}`) || tryInPath("pdfimages");
  const pathPdftoppm = tryInPath(`pdftoppm${exeSuffix}`) || tryInPath("pdftoppm");
  const pathPdftotext = tryInPath(`pdftotext${exeSuffix}`) || tryInPath("pdftotext");

  if (pathPdfinfo && pathPdfimages && pathPdftoppm && pathPdftotext) {
    return { pdfinfo: pathPdfinfo, pdfimages: pathPdfimages, pdftoppm: pathPdftoppm, pdftotext: pathPdftotext };
  }

  // 3. Windows WinGet local package fallback
  if (isWin && process.env.LOCALAPPDATA) {
    const wingetDir = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetDir)) {
      try {
        const entries = fs.readdirSync(wingetDir);
        for (const entry of entries) {
          if (entry.toLowerCase().includes("poppler")) {
            const pkgPath = path.join(wingetDir, entry);
            // Check direct Library/bin or bin
            for (const sub of ["Library/bin", "bin"]) {
              const cand = path.join(pkgPath, ...sub.split("/"));
              if (fs.existsSync(path.join(cand, "pdfinfo.exe"))) {
                return {
                  pdfinfo: path.join(cand, "pdfinfo.exe"),
                  pdfimages: path.join(cand, "pdfimages.exe"),
                  pdftoppm: path.join(cand, "pdftoppm.exe"),
                  pdftotext: path.join(cand, "pdftotext.exe"),
                };
              }
            }
            // Check nested versions (e.g. poppler-25.07.0/Library/bin)
            const subdirs = fs.readdirSync(pkgPath);
            for (const sub of subdirs) {
              const nestedCand = path.join(pkgPath, sub, "Library", "bin");
              if (fs.existsSync(path.join(nestedCand, "pdfinfo.exe"))) {
                return {
                  pdfinfo: path.join(nestedCand, "pdfinfo.exe"),
                  pdfimages: path.join(nestedCand, "pdfimages.exe"),
                  pdftoppm: path.join(nestedCand, "pdftoppm.exe"),
                  pdftotext: path.join(nestedCand, "pdftotext.exe"),
                };
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 4. Clear dependency error
  throw new Error(
    "Poppler utilities (pdfinfo, pdfimages, pdftoppm) are required for PDF inspection.\n" +
    "Please install poppler:\n" +
    "  - Linux: sudo apt-get install poppler-utils\n" +
    "  - macOS: brew install poppler\n" +
    "  - Windows: winget install oschwartz10612.Poppler\n" +
    "Or set the POPPLER_BIN_DIR environment variable pointing to the poppler bin directory."
  );
}

/**
 * Returns the configurable proof artifacts directory.
 * Defaults to `<repo_root>/artifacts/dream_big_proof`.
 */
export function getProofArtifactsDir(): string {
  if (process.env.PROOF_ARTIFACTS_DIR) {
    return path.resolve(process.env.PROOF_ARTIFACTS_DIR);
  }
  return path.join(process.cwd(), "artifacts", "dream_big_proof");
}
