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
    expect(configured.dataDisposition.categories).toHaveLength(8);
    expect(configured.continuityBridge).toMatchObject({
      status: "draft_available",
      executionEnabled: false,
      identityTransferAllowed: false,
      representations: [],
    });

    const disabled = await lifecycle.updateInactivityDeletionPreference(
      userId,
      null,
    );
    expect(disabled.inactivityMonths).toBeNull();
  });

  it("starts one grace period after the user-defined inactivity threshold", async () => {
    await lifecycle.updateInactivityDeletionPreference(userId, 6);
    await database.db
      .updateTable("accountDeletionPreferences")
      .set({
        lastMeaningfulActivityAt: Date.now() - 7 * 30 * 24 * 60 * 60 * 1000,
      })
      .where("userId", "=", userId)
      .execute();

    const result = await lifecycle.evaluateDueInactivityDeletions();
    expect(result).toMatchObject({ evaluated: 1, scheduled: 1 });
    expect(await lifecycle.getAccountLifecycle(userId)).toMatchObject({
      currentState: "suspended_pending_deletion",
      deletionRequest: { trigger: "inactivity", status: "scheduled" },
      deletionJob: {
        status: "blocked_retention_review",
        executionEnabled: false,
      },
    });
    await lifecycle.cancelScheduledAccountDeletion(userId);
  });

  it("uses calendar months instead of fixed thirty-day approximations", async () => {
    await lifecycle.updateInactivityDeletionPreference(userId, 6);
    await database.db
      .updateTable("accountDeletionPreferences")
      .set({ lastMeaningfulActivityAt: Date.UTC(2025, 7, 31) })
      .where("userId", "=", userId)
      .execute();

    expect(
      await lifecycle.evaluateDueInactivityDeletions(Date.UTC(2026, 1, 27)),
    ).toMatchObject({ scheduled: 0 });
    expect(
      await lifecycle.evaluateDueInactivityDeletions(Date.UTC(2026, 1, 28)),
    ).toMatchObject({ scheduled: 1 });
    await lifecycle.cancelScheduledAccountDeletion(userId);
  });

  it("schedules one reversible request with a thirty-day grace period", async () => {
    const scheduled = await lifecycle.scheduleAccountDeletion(userId, "manual");
    expect(scheduled.deletionRequest?.status).toBe("scheduled");
    expect(scheduled.currentState).toBe("closure_requested");
    expect(scheduled.deletionJob).toMatchObject({
      status: "blocked_retention_review",
      executionEnabled: false,
    });
    expect(scheduled.supportedStates).toEqual(
      expect.arrayContaining([
        "pending_verification",
        "active",
        "security_review",
        "recovery_in_progress",
        "inactive",
        "suspended_pending_deletion",
        "deletion_cancelled",
        "closure_requested",
        "deletion_processing",
        "retained_legal",
        "legal_hold",
        "anonymized",
        "deleted",
      ]),
    );
    expect(
      scheduled.deletionRequest!.graceEndsAt -
        scheduled.deletionRequest!.requestedAt,
    ).toBe(30 * 24 * 60 * 60 * 1000);

    const duplicate = await lifecycle.scheduleAccountDeletion(userId, "manual");
    expect(duplicate.deletionRequest?.id).toBe(scheduled.deletionRequest?.id);

    const cancelled = await lifecycle.cancelScheduledAccountDeletion(userId);
    expect(cancelled.deletionRequest).toBeNull();
    expect(cancelled.deletionJob).toBeNull();
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

  it("cancels pending deletion only after a completed recovery event", async () => {
    const recovery = await import("./account-recovery.js");
    await lifecycle.scheduleAccountDeletion(userId, "manual");

    const completed = await recovery.completeAccountRecovery(
      userId,
      "password_reset_completed",
    );

    expect(completed.cancelledPendingDeletion).toBe(true);
    expect(completed.lifecycle?.deletionRequest).toBeNull();
  });

  it("reports only genuinely active sessions and keeps data export disabled", async () => {
    await database.db
      .updateTable("users")
      .set({ sessionIdleTimeoutMinutes: 15 })
      .where("id", "=", userId)
      .execute();
    await database.db
      .updateTable("sessions")
      .set({ lastSeenAt: Date.now() - 16 * 60 * 1000 })
      .where("userId", "=", userId)
      .execute();

    const review = await lifecycle.getDataDeletionReview(userId);
    expect(review.closureImpact).toMatchObject({
      activeSessions: 0,
      dataExportStatus: "planned",
      executionEnabled: false,
    });
  });
});
