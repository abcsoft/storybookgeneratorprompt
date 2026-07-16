import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    testTimeout: 60_000, // the PDF integration test launches a browser
  },
});
