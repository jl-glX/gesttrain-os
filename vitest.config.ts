import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
  },
});
