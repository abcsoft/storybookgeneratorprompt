import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    testTimeout: 120_000, // the PDF integration test launches a browser
    // Several test files launch their own real headless Chrome instance
    // (buildBook, coverComposer, printifyExport). Running those files
    // concurrently under load can exhaust local resources and drop a CDP
    // connection mid-test — run test files one at a time instead. Slower
    // wall-clock, but reliable.
    fileParallelism: false,
  },
});
