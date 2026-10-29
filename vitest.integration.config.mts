import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

loadEnvFile(".env.test.local");

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
