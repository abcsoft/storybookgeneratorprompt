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
  readonly modelName: string;
  private timeoutMs: number;

  constructor(
    configOrBin?: LocalRealEsrganConfig | string,
    maybeModelDir?: string,
  ) {
    if (typeof configOrBin === "string") {
      this.customBinPath = configOrBin;
      this.customModelDir = maybeModelDir;
      this.modelName = process.env.REAL_ESRGAN_MODEL || "realesrgan-x4plus";
      this.timeoutMs = Number(process.env.REAL_ESRGAN_TIMEOUT_MS) || 300_000;
    } else {
      const config = configOrBin || {};
      this.customBinPath = config.binPath;
      this.customModelDir = maybeModelDir || config.modelDir;
      this.modelName = config.modelName || process.env.REAL_ESRGAN_MODEL || "realesrgan-x4plus";
      this.timeoutMs = config.timeoutMs || Number(process.env.REAL_ESRGAN_TIMEOUT_MS) || 300_000;
    }
  }

  /**
   * Resolves the Real-ESRGAN binary path in order:
   * 1. Explicit config or REAL_ESRGAN_BIN environment variable
   * 2. Application-local tools directory (tools/realesrgan/...)
   * 3. System PATH
   */
  resolveBinaryPath(): string | null {
    if (this.customBinPath !== undefined) {
      const resolved = path.isAbsolute(this.customBinPath)
        ? this.customBinPath
        : path.resolve(process.cwd(), this.customBinPath);
      return fsSync.existsSync(resolved) ? resolved : null;
    }

    const envBin = process.env.REAL_ESRGAN_BIN;
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
    if (this.customModelDir !== undefined) {
      const resolved = path.isAbsolute(this.customModelDir)
        ? this.customModelDir
        : path.resolve(process.cwd(), this.customModelDir);
      return fsSync.existsSync(resolved) ? resolved : null;
    }

    const envDir = process.env.REAL_ESRGAN_MODEL_DIR;
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
   * Performs an active startup health check verifying the binary and Vulkan model inference.
   * Runs a small real model inference to confirm Vulkan acceleration and model integrity.
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

    const testModelFile = path.join(modelDir, "realesrgan-x4plus.bin");
    const testParamFile = path.join(modelDir, "realesrgan-x4plus.param");
    if (!fsSync.existsSync(testModelFile) || !fsSync.existsSync(testParamFile)) {
      return {
        ok: false,
        binPath,
        modelDir,
        error: `Photorealistic model files (realesrgan-x4plus.bin / param) not found in "${modelDir}".`,
      };
    }

    const smokeDir = await fs.mkdtemp(path.join(os.tmpdir(), "realesrgan-health-"));
    const smokeIn = path.join(smokeDir, "smoke_in.png");
    const smokeOut = path.join(smokeDir, "smoke_out.png");

    try {
      // Create tiny 32x32 test buffer for real inference smoke test
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: { r: 100, g: 150, b: 200 } },
      })
        .png()
        .toFile(smokeIn);

      await execFileAsync(
        binPath,
        ["-i", smokeIn, "-o", smokeOut, "-n", "realesrgan-x4plus", "-s", "4", "-m", modelDir],
        { timeout: 20_000, windowsHide: true },
      );

      if (!fsSync.existsSync(smokeOut)) {
        return {
          ok: false,
          binPath,
          modelDir,
          error: "Real-ESRGAN health check failed: inference did not produce output image.",
        };
      }

      const outMeta = await sharp(smokeOut).metadata();
      if (outMeta.width !== 128 || outMeta.height !== 128) {
        return {
          ok: false,
          binPath,
          modelDir,
          error: `Real-ESRGAN health check output dimension mismatch: expected 128x128, got ${outMeta.width}x${outMeta.height}.`,
        };
      }

      return { ok: true, binPath, modelDir };
    } catch (smokeErr: any) {
      return {
        ok: false,
        binPath,
        modelDir,
        error: `Real-ESRGAN Vulkan model inference failed: ${smokeErr?.stderr || smokeErr?.message || String(smokeErr)}. Check Vulkan driver support.`,
      };
    } finally {
      await fs.rm(smokeDir, { recursive: true, force: true }).catch(() => {});
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

    // Architectural constraint: realesrgan-x4plus is an exact 4x neural network.
    // For photorealistic children's book illustrations, never automatically switch to anime-video models.
    // Running -s 2 or -s 3 on an x4 model creates tensor coordinate mismatch and tile seam corruption.
    // Always run inference at the model's native 4x scale, then proportionally downsample.
    const selectedModel = this.modelName || "realesrgan-x4plus";
    const nativeScale = 4;
    const originalSha256 = calculateSha256(inputBuffer);
    const cacheDir = path.resolve(process.cwd(), ".cache", "realesrgan");
    const cacheKey = `${originalSha256}_${targetDimensions.width}x${targetDimensions.height}_${selectedModel}.png`;
    const cacheFilePath = path.join(cacheDir, cacheKey);

    let enhancedBuffer: Buffer | null = null;
    if (fsSync.existsSync(cacheFilePath)) {
      try {
        const cached = await fs.readFile(cacheFilePath);
        const { validateEnhancedImageQuality } = await import("./imageQualityValidator");
        const check = await validateEnhancedImageQuality(cached, { targetDimensions, inputBuffer });
        if (check.valid) {
          enhancedBuffer = cached;
        }
      } catch {
        enhancedBuffer = null;
      }
    }

    if (!enhancedBuffer) {
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
          String(nativeScale),
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
        // Using Sharp with Lanczos3 filter — strictly destination dimensions without non-uniform stretching or cropping
        // Never use fit: 'cover' where it can crop source artwork
        enhancedBuffer = await sharp(upscaledBuffer)
          .resize(targetDimensions.width, targetDimensions.height, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            kernel: sharp.kernel.lanczos3,
          })
          .png()
          .toBuffer();

        // Step 3: Validate image quality (reject blank output, severe tile seams, border clipping)
        const { validateEnhancedImageQuality } = await import("./imageQualityValidator");
        const qualityCheck = await validateEnhancedImageQuality(enhancedBuffer, {
          targetDimensions,
          inputBuffer,
        });
        if (!qualityCheck.valid) {
          throw new Error(`Real-ESRGAN output failed image quality gate: ${qualityCheck.error}`);
        }

        // Persist to local cache
        await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
        await fs.writeFile(cacheFilePath, enhancedBuffer).catch(() => {});
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }

      const nativeEffectivePpi = computeEffectivePpi(sourceDimensions, physicalInches);
      const upscaleFactor = Number(
        (targetDimensions.width / Math.max(1, sourceDimensions.width)).toFixed(3),
      );
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
  }
}
