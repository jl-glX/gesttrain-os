import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("development runtime registry", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "umbravia-forge-runtime-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("blocks a duplicate development instance and releases its own lease", async () => {
    const registry = await import("./runtime-registry.js");
    await registry.acquireDevelopmentLease();
    await expect(registry.acquireDevelopmentLease()).rejects.toThrow(
      /already active/,
    );
    await registry.releaseDevelopmentLease();
    await expect(registry.cleanupStaleRuntimeRecords()).resolves.toBe(0);
  });

  it("removes an invalid residual record in the project runtime directory", async () => {
    const runtimeDirectory = path.join(directory, "runtime");
    await mkdir(runtimeDirectory, { recursive: true });
    await writeFile(
      path.join(runtimeDirectory, "development-instance.json"),
      "obsolete runtime state",
    );
    const registry = await import("./runtime-registry.js");
    await expect(registry.cleanupStaleRuntimeRecords()).resolves.toBe(1);
  });
});
