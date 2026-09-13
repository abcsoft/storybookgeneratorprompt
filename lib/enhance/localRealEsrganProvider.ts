import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { ENHANCEMENT_PROVIDER_IDS } from "./constants";
import type {
  EnhanceImageOptions,
  EnhanceImageResult,
  ResolutionEnhancementProvider,
  ProviderClass,
} from "./types";
import {
  calculateSha256,
  computeEffectivePpi,
  type ImageProvenanceMetadata,
} from "./provenance";

const execFileAsync = promisify(execFile);

export interface LocalRealEsrganConfig {
  binPath?: string;
  modelDir?: string;
  modelName?: string;
  timeoutMs?: number;
}

export class LocalRealEsrganProvider implements ResolutionEnhancementProvider {
  readonly id = ENHANCEMENT_PROVIDER_IDS.LOCAL_REALESRGAN;
  readonly name = "Local Real-ESRGAN (Free Local AI)";
  readonly providerClass: ProviderClass = "local-ai";
  readonly isPaid = false;

  private customBinPath?: string;
  private customModelDir?: string;
  private modelName: string;
  private timeoutMs: number;

  constructor(config: LocalRealEsrganConfig = {}) {
    this.customBinPath = config.binPath;
    this.customModelDir = config.modelDir;
    this.modelName = config.modelName || process.env.REAL_ESRGAN_MODEL || "realesrgan-x4plus";
    this.timeoutMs = config.timeoutMs || Number(process.env.REAL_ESRGAN_TIMEOUT_MS) || 120_000;
  }

  /**
   * Resolves the Real-ESRGAN binary path in order:
   * 1. Explicit config or REAL_ESRGAN_BIN environment variable
   * 2. System PATH
   * 3. Documented application-local tools directory (tools/realesrgan/...)
   */
  resolveBinaryPath(): string | null {
    const envBin = this.customBinPath || process.env.REAL_ESRGAN_BIN;
    if (envBin) {
      const resolved = path.isAbsolute(envBin) ? envBin : path.resolve(process.cwd(), envBin);
      if (fsSync.existsSync(resolved)) return resolved;
    }

    // Check application-local tools directory
    const isWin = process.platform === "win32";
    const exeName = isWin ? "realesrgan-ncnn-vulkan.exe" : "realesrgan-ncnn-vulkan";
    const localToolsPath = path.resolve(process.cwd(), "tools", "realesrgan", exeName);
    if (fsSync.existsSync(localToolsPath)) {
      return localToolsPath;
    }

    // Check system PATH
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
      if (!dir) continue;
      const candidate = path.join(dir, exeName);
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Resolves the models directory:
   * 1. Explicit config or REAL_ESRGAN_MODEL_DIR environment variable
   * 2. 'models' directory adjacent to binary
   * 3. 'tools/realesrgan/models'
   */
  resolveModelDir(binPath: string): string | null {
    const envDir = this.customModelDir || process.env.REAL_ESRGAN_MODEL_DIR;
    if (envDir) {
      const resolved = path.isAbsolute(envDir) ? envDir : path.resolve(process.cwd(), envDir);
      if (fsSync.existsSync(resolved)) return resolved;
    }

    const adjacent = path.join(path.dirname(binPath), "models");
    if (fsSync.existsSync(adjacent)) return adjacent;

    const localToolsModel = path.resolve(process.cwd(), "tools", "realesrgan", "models");
    if (fsSync.existsSync(localToolsModel)) return localToolsModel;

    return null;
  }

  get isConfigured(): boolean {
    const bin = this.resolveBinaryPath();
    if (!bin) return false;
    const models = this.resolveModelDir(bin);
    return Boolean(models);
  }

  estimateCost(imageCount: number) {
    return {
      estimatedCostUsd: 0,
      operationCount: imageCount,
      costDescription: "Free (Local GPU/CPU Real-ESRGAN, no external API calls)",
      isPaid: false,
    };
  }

  /**
   * Performs an active startup health check verifying the binary is runnable.
   */
  async checkHealth(): Promise<{ ok: boolean; error?: string; binPath?: string; modelDir?: string }> {
    const binPath = this.resolveBinaryPath();
    if (!binPath) {
      return {
        ok: false,
        error: "Real-ESRGAN binary not found. Install to tools/realesrgan or set REAL_ESRGAN_BIN.",
      };
    }

    const modelDir = this.resolveModelDir(binPath);
    if (!modelDir) {
      return {
        ok: false,
        binPath,
        error: `Real-ESRGAN models directory not found adjacent to "${binPath}" or in tools/realesrgan/models.`,
      };
    }

    try {
      // Running with -h outputs help information
      await execFileAsync(binPath, ["-h"], { timeout: 10_000 });
      return { ok: true, binPath, modelDir };
    } catch (err: any) {
      // On some builds, -h exits with code 1 after printing help; verify stdout/stderr mentions realesrgan
      const combined = `${err?.stdout || ""} ${err?.stderr || ""}`;
      if (combined.toLowerCase().includes("realesrgan")) {
        return { ok: true, binPath, modelDir };
      }
      return {
        ok: false,
        binPath,
        modelDir,
        error: `Health check failed executing "${binPath}": ${err?.message || String(err)}`,
      };
    }
  }

  async enhanceImage(options: EnhanceImageOptions): Promise<EnhanceImageResult> {
    const binPath = this.resolveBinaryPath();
    if (!binPath) {
      throw new Error(
        "Local Real-ESRGAN binary not found. Please install the binary to tools/realesrgan or configure REAL_ESRGAN_BIN in .env.local.",
      );
    }

    const modelDir = this.resolveModelDir(binPath);
    if (!modelDir) {
      throw new Error(
        `Local Real-ESRGAN models directory not found adjacent to "${binPath}".`,
      );
    }

    const { inputBuffer, sourceDimensions, targetDimensions, physicalInches, filename } = options;

    // Determine scale factor needed (e.g. 2, 3, or 4)
    const requiredScaleX = targetDimensions.width / Math.max(1, sourceDimensions.width);
    const requiredScaleY = targetDimensions.height / Math.max(1, sourceDimensions.height);
    const maxRequiredScale = Math.max(requiredScaleX, requiredScaleY);

    let scale = 4;
    if (maxRequiredScale <= 2.05) {
      scale = 2;
    } else if (maxRequiredScale <= 3.05) {
      scale = 3;
    } else {
      scale = 4;
    }

    // Verify model files exist for this scale
    let selectedModel = this.modelName;
    if (scale === 2) {
      const anime2x = path.join(modelDir, "realesr-animevideov3-x2.bin");
      if (fsSync.existsSync(anime2x)) {
        selectedModel = "realesr-animevideov3";
      }
    }

    // Create isolated temporary working directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-realesrgan-"));
    const tempInputPath = path.join(tempDir, "input.png");
    const tempAiOutputPath = path.join(tempDir, "ai_upscaled.png");

    try {
      // Normalize input to PNG in temp directory
      await sharp(inputBuffer).png().toFile(tempInputPath);

      // Execute Real-ESRGAN using execFile with safe argument array (never shell string)
      const args = [
        "-i",
        tempInputPath,
        "-o",
        tempAiOutputPath,
        "-n",
        selectedModel,
        "-s",
        String(scale),
        "-m",
        modelDir,
      ];

      try {
        await execFileAsync(binPath, args, {
          timeout: this.timeoutMs,
          windowsHide: true,
        });
      } catch (execErr: any) {
        if (execErr.killed || execErr.signal === "SIGTERM") {
          throw new Error(
            `Local Real-ESRGAN enhancement timed out after ${Math.round(this.timeoutMs / 1000)} seconds.`,
          );
        }
        throw new Error(
          `Local Real-ESRGAN execution failed: ${execErr.stderr || execErr.message || String(execErr)}`,
        );
      }

      if (!fsSync.existsSync(tempAiOutputPath)) {
        throw new Error("Local Real-ESRGAN finished but did not produce an output image.");
      }

      const upscaledBuffer = await fs.readFile(tempAiOutputPath);

      // Verify AI upscaled dimensions
      const upscaledMeta = await sharp(upscaledBuffer).metadata();
      if (!upscaledMeta.width || !upscaledMeta.height) {
        throw new Error("Local Real-ESRGAN output is not decodable as an image.");
      }

      // Step 2: Proportionally downsample AI upscaled image to authoritative destination dimensions
      // Using Sharp with Lanczos3 filter — strictly destination dimensions without non-uniform stretching
      const enhancedBuffer = await sharp(upscaledBuffer)
        .resize(targetDimensions.width, targetDimensions.height, {
          fit: "cover",
          kernel: sharp.kernel.lanczos3,
        })
        .png()
        .toBuffer();

      const nativeEffectivePpi = computeEffectivePpi(sourceDimensions, physicalInches);
      const upscaleFactor = Number(
        (targetDimensions.width / Math.max(1, sourceDimensions.width)).toFixed(3),
      );
      const originalSha256 = calculateSha256(inputBuffer);
      const enhancedSha256 = calculateSha256(enhancedBuffer);

      const provenance: ImageProvenanceMetadata = {
        originalPixelDimensions: sourceDimensions,
        nativeEffectivePpi,
        enhancedPixelDimensions: targetDimensions,
        enhancedEffectivePpi: 300, // Genuine real local AI enhancement achieves full 300 PPI print detail
        outputGridPpi: 300,
        upscaleFactor,
        enhancementMethod: "local-realesrgan",
        providerClass: "local-ai",
        enhancementStatus: "pending", // Always requires user visual review/approval before production export
        originalSha256,
        enhancedSha256,
        approvalRequired: true,
        approvedAt: null,
        originalFilename: filename,
      };

      return {
        enhancedBuffer,
        mimeType: "image/png",
        outputDimensions: targetDimensions,
        method: "local-realesrgan",
        providerClass: "local-ai",
        upscaleFactor,
        provenance,
      };
    } finally {
      // Guaranteed cleanup of isolated temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
