import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("account lifecycle scheduler", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let scheduler: typeof import("./account-lifecycle-scheduler.js");

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gesttrain-account-scheduler-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("ACCOUNT_LIFECYCLE_REVIEW_INTERVAL_MS", "60000");
    vi.resetModules();
    database = await import("../db/client.js");
    const auth = await import("./auth.js");
    const lifecycle = await import("./account-lifecycle.js");
    scheduler = await import("./account-lifecycle-scheduler.js");
    await database.initializeDatabase();
    const account = await auth.signup(
      "scheduler@example.com",
      "Scheduler Member",
      "StrongPassword123",
    );
    await lifecycle.updateInactivityDeletionPreference(account.user.id, 6);
    await database.db
      .updateTable("accountDeletionPreferences")
      .set({ lastMeaningfulActivityAt: Date.UTC(2025, 0, 31) })
      .where("userId", "=", account.user.id)
      .execute();
  });

  afterAll(async () => {
    await scheduler.stopAccountLifecycleScheduler();
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("coalesces overlapping reviews and exposes a truthful status", async () => {
    const first = scheduler.runAccountLifecycleReview();
    const second = scheduler.runAccountLifecycleReview();
    expect(second).toBe(first);
    await first;

    expect(scheduler.getAccountLifecycleSchedulerStatus()).toMatchObject({
      running: false,
      runInProgress: false,
      lastResult: { evaluated: 1, scheduled: 1 },
      lastError: null,
      intervalMs: 60_000,
    });
  });

  it("starts and stops without leaving a background review active", async () => {
    await Promise.all([
      scheduler.startAccountLifecycleScheduler(),
      scheduler.startAccountLifecycleScheduler(),
    ]);
    expect(scheduler.getAccountLifecycleSchedulerStatus()).toMatchObject({
      running: true,
      runInProgress: false,
    });

    await scheduler.stopAccountLifecycleScheduler();
    expect(scheduler.getAccountLifecycleSchedulerStatus()).toMatchObject({
      running: false,
      runInProgress: false,
    });
  });
});
