import { LocalRealEsrganProvider } from "../lib/enhance/localRealEsrganProvider";

async function main() {
  console.log("=== Real-ESRGAN Provider Startup Health & Smoke Test ===");
  const provider = new LocalRealEsrganProvider();

  const binPath = provider.resolveBinaryPath();
  console.log(`Binary path: ${binPath ?? "(not found)"}`);

  if (binPath) {
    const modelDir = provider.resolveModelDir(binPath);
    console.log(`Model directory: ${modelDir ?? "(not found)"}`);
  }

  console.log("Running real model inference health check...");
  const health = await provider.checkHealth();

  if (health.ok) {
    console.log("✓ Real-ESRGAN health check passed!");
    console.log(`  Binary: ${health.binPath}`);
    console.log(`  Model Dir: ${health.modelDir}`);
    console.log("  Inference: Vulkan acceleration and 32x32 -> 128x128 upscale verified.");
    process.exit(0);
  } else {
    console.error("✗ Real-ESRGAN is not currently provisioned or available:");
    console.error(`  Error: ${health.error}`);
    console.error("\nActionable Setup Steps:");
    console.error("  1. Download Real-ESRGAN v0.2.5.0 from https://github.com/xinntao/Real-ESRGAN/releases");
    console.error("  2. Extract binaries and models to tools/realesrgan or set REAL_ESRGAN_BIN and REAL_ESRGAN_MODELS_DIR");
    console.error("  3. Ensure Vulkan GPU drivers are installed and up to date.");
    console.error("  4. See docs/REAL_ESRGAN_SETUP.md for full instructions.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Smoke test failed with unexpected error:", err);
  process.exit(1);
});
