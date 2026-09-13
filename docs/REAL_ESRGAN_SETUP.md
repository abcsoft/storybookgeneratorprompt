# Real-ESRGAN Provisioning and Setup Guide

This document describes the deployment, provisioning, and verification workflow for the local Real-ESRGAN NCNN Vulkan super-resolution enhancer.

---

## 1. Supported Operating Systems & Hardware

- **Windows**: Windows 10/11 x64 with Vulkan 1.1+ compatible GPU (NVIDIA, AMD, Intel Iris/Arc).
- **Linux**: Ubuntu 20.04+, Debian 11+, Fedora 36+ x86_64 with Vulkan ICD drivers (`libvulkan1`, `mesa-vulkan-drivers`).
- **macOS**: macOS 11+ with MoltenVK Vulkan compatibility layer.
- **Hardware Requirement**: Vulkan-capable GPU or accelerator.
  > [!IMPORTANT]
  > Real-ESRGAN NCNN Vulkan executes neural network inference through GPU Vulkan compute shaders. If Vulkan acceleration or model weights are unavailable, the provider reports unavailable. Plain CPU resampling (Bicubic/Lanczos) is strictly classified as `resampling` and is NEVER labelled as AI super-resolution.

---

## 2. Official Download Source & Binaries

Official pre-built releases are maintained by Xinntao on GitHub:
- **Repository**: [https://github.com/xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)
- **Official Release**: [Real-ESRGAN v0.2.5.0 Releases](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0)

### Official Release Archives:
- **Windows x64**: `realesrgan-ncnn-vulkan-20220424-windows.zip`
- **Linux x86_64**: `realesrgan-ncnn-vulkan-20220424-ubuntu.zip`
- **macOS**: `realesrgan-ncnn-vulkan-20220424-macos.zip`

---

## 3. SHA-256 Integrity Verification

Verify the SHA-256 checksums of downloaded archives and models before installation:

| Component | Target File | Expected SHA-256 Hash |
| :--- | :--- | :--- |
| Windows Executable | `realesrgan-ncnn-vulkan.exe` | `88c6e282d8c366e5f1f7dcaadba1d563be81a539eb87a9bcad3999961d15bf10` |
| Photorealistic Model Weights | `models/realesrgan-x4plus.bin` | `b68ebf9ef34a053c829e12bfddbeae1f84d6dd2ae2de4ee6f0a300d892d1fa34` |
| Photorealistic Model Config | `models/realesrgan-x4plus.param` | `ff3a71b1e95ca03e0586f784eecfa20a67fa890e0c00ea4353d2bfef2cfd0ee6` |

---

## 4. Model License Notices

- **Real-ESRGAN Code & Architecture**: Licensed under the **BSD 3-Clause License** (Copyright © 2021 Xintao Wang).
- **realesrgan-x4plus Pretrained Weights**: Trained on photographic and realistic datasets for photorealistic super-resolution.
- **Repository Policy**: Binary executables and large weights are excluded from Git commits (`.gitignore`). Provisioning is performed locally or via CI deployment containers.

---

## 5. Configuration & Environment Variables

Configure the provider by adding the following environment variables to `.env.local` or container environment:

```env
# Path to the Real-ESRGAN NCNN Vulkan binary
REAL_ESRGAN_BIN="C:\\path\\to\\realesrgan-ncnn-vulkan.exe"

# Path to directory containing realesrgan-x4plus.param and realesrgan-x4plus.bin
REAL_ESRGAN_MODELS_DIR="C:\\path\\to\\models"

# Optional: Default enhancement provider selection
ENHANCEMENT_PROVIDER="local-realesrgan"

# Cryptographic signing secret (minimum 32 characters, fail-closed in production)
ENHANCEMENT_SIGNING_SECRET="your-high-entropy-production-signing-secret-minimum-32-chars"
```

---

## 6. Native Scaling & Model Rules

1. **Native Scale Only (`-s 4`)**:
   `realesrgan-x4plus` natively operates at scale factor 4. Calling `-s 2` or `-s 3` directly on `realesrgan-x4plus` causes internal coordinate and stride mismatch across tiles, creating grid seams, edge amputations, and corrupted details.
2. **Proportional Contain Downsampling**:
   Inference is run at 4× native scale to exceed destination dimensions, and then downsampled to authoritative print destination dimensions (`3375×2475` px for 11×8 @ 300 PPI) using Sharp Lanczos-3 with `fit: "contain"`.
3. **No Automatic Anime Fallback**:
   Photorealistic children's book illustrations must never automatically switch to `realesr-animevideov3`. If photorealistic weights are unavailable, the health check fails closed.

---

## 7. Health Check & Smoke Test Execution

Execute the inference smoke test to verify Vulkan capability, binary discovery, and model weights:

```bash
npx tsx scripts/smokeTestRealEsrgan.ts
```

- **Pass**: Executes a real 32×32 inference through Vulkan shaders, verifies decoded output and dimensions, and prints confirmation.
- **Fail**: Clearly reports missing binary, missing model files, or Vulkan driver failure with actionable setup steps.
