import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";

loadEnvFile(".env.test.local");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
