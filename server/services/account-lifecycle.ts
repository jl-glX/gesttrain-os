import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";
import {
  ACCOUNT_DATA_CATEGORIES,
  getAccountDispositionPreview,
  type AccountDataCategory,
} from "./data-retention.js";
import { recordSecurityEvent } from "./security-events.js";
import { withCoordinatedManagerOperation } from "./manager-coordinator.js";
import { getAccountContinuityBridge } from "./account-continuity.js";

export const INACTIVITY_DELETION_OPTIONS = [6, 12, 18, 24, 36] as const;
export type InactivityDeletionMonths =
  (typeof INACTIVITY_DELETION_OPTIONS)[number];

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export const MEANINGFUL_ACTIVITY_SOURCES = [
  "login_success",
  "booking_created",
  "booking_cancelled",
  "personal_account_action",
  "authenticated_tool_use",
  "user_initiated_payment",
  "account_configuration_changed",
  "account_recovery_completed",
] as const;
export type MeaningfulActivitySource =
  (typeof MEANINGFUL_ACTIVITY_SOURCES)[number];

export const ACCOUNT_LIFECYCLE_STATES = [
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
] as const;
export type AccountLifecycleState = (typeof ACCOUNT_LIFECYCLE_STATES)[number];

function addUtcMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.getTime();
}

function requestId(): string {
  return `deletion-${randomBytes(12).toString("hex")}`;
}

function deletionJobId(): string {
  return `deletion-job-${randomBytes(12).toString("hex")}`;
}

export async function getAccountLifecycle(userId: string) {
  const [preference, request, deletionJob, dataDisposition, user] =
    await Promise.all([
      db
        .selectFrom("accountDeletionPreferences")
        .selectAll()
        .where("userId", "=", userId)
        .executeTakeFirst(),
      db
        .selectFrom("accountDeletionRequests")
        .select(["id", "trigger", "status", "requestedAt", "graceEndsAt"])
        .where("userId", "=", userId)
        .where("status", "=", "scheduled")
        .executeTakeFirst(),
      db
        .selectFrom("accountDeletionJobs")
        .select(["id", "status", "executionEnabled", "createdAt", "updatedAt"])
        .where("userId", "=", userId)
        .where("status", "in", ["planned", "blocked_retention_review"])
        .orderBy("updatedAt", "desc")
        .executeTakeFirst(),
      getAccountDispositionPreview(userId),
      db
        .selectFrom("users")
        .select(["createdAt", "accountStatus"])
        .where("id", "=", userId)
        .executeTakeFirstOrThrow(),
    ]);

  const currentState: AccountLifecycleState = request
    ? request.trigger === "inactivity"
      ? "suspended_pending_deletion"
      : "closure_requested"
    : user.accountStatus;

  return {
    currentState,
    supportedStates: ACCOUNT_LIFECYCLE_STATES,
    inactivityMonths: preference?.inactivityMonths ?? null,
    lastMeaningfulActivityAt:
      preference?.lastMeaningfulActivityAt ?? user.createdAt,
    deletionRequest: request ?? null,
    deletionJob: deletionJob
      ? { ...deletionJob, executionEnabled: false as const }
      : null,
    gracePeriodDays: 30,
    dataDisposition,
    continuityBridge: await getAccountContinuityBridge(userId),
  };
}

export async function updateInactivityDeletionPreference(
  userId: string,
  inactivityMonths: InactivityDeletionMonths | null,
) {
  const now = Date.now();
  await db
    .insertInto("accountDeletionPreferences")
    .values({
      userId,
      inactivityMonths,
      lastMeaningfulActivityAt: now,
      updatedAt: now,
    })
    .onConflict((conflict) =>
      conflict.column("userId").doUpdateSet({
        inactivityMonths,
        lastMeaningfulActivityAt: now,
        updatedAt: now,
      }),
    )
    .execute();
  await recordSecurityEvent("deletion_preference_updated", userId, {
    inactivityMonths: inactivityMonths ?? "disabled",
  });
  return getAccountLifecycle(userId);
}

export async function markMeaningfulAccountActivity(
  userId: string,
  source: MeaningfulActivitySource,
  occurredAt = Date.now(),
): Promise<void> {
  if (!MEANINGFUL_ACTIVITY_SOURCES.includes(source)) {
    throw new Error("Invalid meaningful account activity source");
  }
  await db
    .insertInto("accountDeletionPreferences")
    .values({
      userId,
      inactivityMonths: null,
      lastMeaningfulActivityAt: occurredAt,
      updatedAt: occurredAt,
    })
    .onConflict((conflict) =>
      conflict.column("userId").doUpdateSet({
        lastMeaningfulActivityAt: occurredAt,
        updatedAt: occurredAt,
      }),
    )
    .execute();
}

export async function hasScheduledAccountDeletion(
  userId: string,
): Promise<boolean> {
  const request = await db
    .selectFrom("accountDeletionRequests")
    .select("id")
    .where("userId", "=", userId)
    .where("status", "=", "scheduled")
    .executeTakeFirst();
  return Boolean(request);
}

export async function evaluateDueInactivityDeletions(
  now = Date.now(),
): Promise<{ evaluated: number; scheduled: number }> {
  const preferences = await db
    .selectFrom("accountDeletionPreferences")
    .select(["userId", "inactivityMonths", "lastMeaningfulActivityAt"])
    .where("inactivityMonths", "is not", null)
    .execute();
  let scheduled = 0;
  for (const preference of preferences) {
    if (
      preference.inactivityMonths !== null &&
      addUtcMonths(
        preference.lastMeaningfulActivityAt,
        preference.inactivityMonths,
      ) <= now
    ) {
      const before = await db
        .selectFrom("accountDeletionRequests")
        .select("id")
        .where("userId", "=", preference.userId)
        .where("status", "=", "scheduled")
        .executeTakeFirst();
      if (!before) {
        await scheduleAccountDeletion(preference.userId, "inactivity", now);
        scheduled += 1;
      }
    }
  }
  return { evaluated: preferences.length, scheduled };
}

export async function scheduleAccountDeletion(
  userId: string,
  trigger: "manual" | "inactivity",
  requestedAt = Date.now(),
) {
  return withCoordinatedManagerOperation(
    "account",
    "schedule-account-deletion",
    ["account-records"],
    async () => {
      const existing = await db
        .selectFrom("accountDeletionRequests")
        .selectAll()
        .where("userId", "=", userId)
        .where("status", "=", "scheduled")
        .executeTakeFirst();
      if (existing) return getAccountLifecycle(userId);

      const now = requestedAt;
      const newRequestId = requestId();
      const result = await db.transaction().execute(async (transaction) => {
        const insertResult = await transaction
          .insertInto("accountDeletionRequests")
          .values({
            id: newRequestId,
            userId,
            trigger,
            status: "scheduled",
            requestedAt: now,
            graceEndsAt: now + DELETION_GRACE_PERIOD_MS,
            cancelledAt: null,
            completedAt: null,
          })
          .onConflict((conflict) => conflict.doNothing())
          .executeTakeFirst();
        if (Number(insertResult.numInsertedOrUpdatedRows) > 0) {
          await transaction
            .insertInto("accountDeletionJobs")
            .values({
              id: deletionJobId(),
              requestId: newRequestId,
              userId,
              status: "blocked_retention_review",
              executionEnabled: 0,
              createdAt: now,
              updatedAt: now,
              completedAt: null,
            })
            .execute();
        }
        return insertResult;
      });
      if (Number(result.numInsertedOrUpdatedRows) > 0) {
        await recordSecurityEvent("account_deletion_scheduled", userId, {
          trigger,
        });
      }
      return getAccountLifecycle(userId);
    },
  );
}

export async function cancelScheduledAccountDeletion(
  userId: string,
  options: { recoveryEvent?: string } = {},
) {
  return withCoordinatedManagerOperation(
    "account",
    "cancel-account-deletion",
    ["account-records"],
    async () => {
      const now = Date.now();
      const result = await db
        .updateTable("accountDeletionRequests")
        .set({ status: "cancelled", cancelledAt: now })
        .where("userId", "=", userId)
        .where("status", "=", "scheduled")
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) > 0) {
        await db
          .updateTable("accountDeletionJobs")
          .set({ status: "cancelled", updatedAt: now })
          .where("userId", "=", userId)
          .where("status", "in", ["planned", "blocked_retention_review"])
          .execute();
        await markMeaningfulAccountActivity(
          userId,
          options.recoveryEvent
            ? "account_recovery_completed"
            : "personal_account_action",
          now,
        );
        await recordSecurityEvent("account_deletion_cancelled", userId);
      }
      return getAccountLifecycle(userId);
    },
  );
}

export async function getDataDeletionReview(userId: string) {
  const now = Date.now();
  const [
    lifecycle,
    draft,
    affectedBookings,
    activeSessionRows,
    sessionSettings,
    affectedDelegations,
  ] = await Promise.all([
    getAccountLifecycle(userId),
    db
      .selectFrom("accountDataDeletionDrafts")
      .select(["selectedCategories", "intent", "updatedAt"])
      .where("userId", "=", userId)
      .executeTakeFirst(),
    db
      .selectFrom("bookings")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("userId", "=", userId)
      .where("status", "!=", "cancelled")
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("sessions")
      .select("lastSeenAt")
      .where("userId", "=", userId)
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", now)
      .execute(),
    db
      .selectFrom("users")
      .select("sessionIdleTimeoutMinutes")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("delegationGrants")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where((expression) =>
        expression.or([
          expression("ownerUserId", "=", userId),
          expression("delegateUserId", "=", userId),
        ]),
      )
      .where("revokedAt", "is", null)
      .where((expression) =>
        expression.or([
          expression("expiresAt", "is", null),
          expression("expiresAt", ">", now),
        ]),
      )
      .executeTakeFirstOrThrow(),
  ]);

  let selectedCategories: AccountDataCategory[] = [];
  if (draft) {
    try {
      const parsed = JSON.parse(draft.selectedCategories) as unknown;
      if (Array.isArray(parsed)) {
        selectedCategories = parsed.filter(
          (category): category is AccountDataCategory =>
            typeof category === "string" &&
            ACCOUNT_DATA_CATEGORIES.includes(category as AccountDataCategory),
        );
      }
    } catch {
      selectedCategories = [];
    }
  }

  return {
    ...lifecycle,
    deletionDraft: draft
      ? {
          selectedCategories,
          intent: draft.intent,
          updatedAt: draft.updatedAt,
        }
      : null,
    legalRetentionNoticeRequired: true,
    closureImpact: {
      reservationsAffected: Number(affectedBookings.count),
      activeSessions: activeSessionRows.filter(
        (session) =>
          session.lastSeenAt +
            sessionSettings.sessionIdleTimeoutMinutes * 60 * 1000 >
          now,
      ).length,
      delegationGrantsAffected: Number(affectedDelegations.count),
      dataExportStatus: "planned" as const,
      executionEnabled: false as const,
    },
  };
}

export async function saveDataDeletionReview(
  userId: string,
  selectedCategories: AccountDataCategory[],
  intent: "selected_data" | "account_closure",
) {
  const normalizedCategories = [
    ...new Set(
      selectedCategories.filter((category) =>
        ACCOUNT_DATA_CATEGORIES.includes(category),
      ),
    ),
  ];
  if (intent === "selected_data" && normalizedCategories.length === 0) {
    throw new Error("Select at least one data category");
  }

  const now = Date.now();
  await db
    .insertInto("accountDataDeletionDrafts")
    .values({
      userId,
      selectedCategories: JSON.stringify(normalizedCategories),
      intent,
      updatedAt: now,
    })
    .onConflict((conflict) =>
      conflict.column("userId").doUpdateSet({
        selectedCategories: JSON.stringify(normalizedCategories),
        intent,
        updatedAt: now,
      }),
    )
    .execute();
  await recordSecurityEvent("account_data_deletion_draft_updated", userId, {
    intent,
    categoryCount: normalizedCategories.length,
  });
  return getDataDeletionReview(userId);
}
