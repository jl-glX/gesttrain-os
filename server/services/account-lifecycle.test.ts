import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("account lifecycle", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let auth: typeof import("./auth.js");
  let lifecycle: typeof import("./account-lifecycle.js");
  let userId: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gesttrain-os-lifecycle-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.resetModules();
    database = await import("../db/client.js");
    auth = await import("./auth.js");
    lifecycle = await import("./account-lifecycle.js");
    await database.initializeDatabase();
    const account = await auth.signup(
      "lifecycle@example.com",
      "Lifecycle Member",
      "StrongPassword123",
    );
    userId = account.user.id;
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("stores an optional inactivity period", async () => {
    const configured = await lifecycle.updateInactivityDeletionPreference(
      userId,
      12,
    );
    expect(configured.inactivityMonths).toBe(12);
    expect(configured.dataDisposition.executionEnabled).toBe(false);
    expect(configured.dataDisposition.categories).toHaveLength(5);

    const disabled = await lifecycle.updateInactivityDeletionPreference(
      userId,
      null,
    );
    expect(disabled.inactivityMonths).toBeNull();
  });

  it("schedules one reversible request with a thirty-day grace period", async () => {
    const scheduled = await lifecycle.scheduleAccountDeletion(userId, "manual");
    expect(scheduled.deletionRequest?.status).toBe("scheduled");
    expect(
      scheduled.deletionRequest!.graceEndsAt -
        scheduled.deletionRequest!.requestedAt,
    ).toBe(30 * 24 * 60 * 60 * 1000);

    const duplicate = await lifecycle.scheduleAccountDeletion(userId, "manual");
    expect(duplicate.deletionRequest?.id).toBe(scheduled.deletionRequest?.id);

    const cancelled = await lifecycle.cancelScheduledAccountDeletion(userId);
    expect(cancelled.deletionRequest).toBeNull();
  });

  it("stores a data-only deletion review without scheduling account closure", async () => {
    const review = await lifecycle.saveDataDeletionReview(
      userId,
      ["bookings", "preferences"],
      "selected_data",
    );

    expect(review.deletionDraft).toMatchObject({
      selectedCategories: ["bookings", "preferences"],
      intent: "selected_data",
    });
    expect(review.deletionRequest).toBeNull();
    expect(review.dataDisposition.executionEnabled).toBe(false);
  });

  it("requires at least one category for a data-only review", async () => {
    await expect(
      lifecycle.saveDataDeletionReview(userId, [], "selected_data"),
    ).rejects.toThrow("Select at least one data category");
  });
});
