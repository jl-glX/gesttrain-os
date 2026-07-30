import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";
import { getAccountDispositionPreview } from "./data-retention.js";
import { recordSecurityEvent } from "./security-events.js";

export const INACTIVITY_DELETION_OPTIONS = [6, 12, 18, 24, 36] as const;
export type InactivityDeletionMonths =
  (typeof INACTIVITY_DELETION_OPTIONS)[number];

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function requestId(): string {
  return `deletion-${randomBytes(12).toString("hex")}`;
}

export async function getAccountLifecycle(userId: string) {
  const [preference, request, dataDisposition] = await Promise.all([
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
    getAccountDispositionPreview(userId),
  ]);

  return {
    inactivityMonths: preference?.inactivityMonths ?? null,
    lastMeaningfulActivityAt:
      preference?.lastMeaningfulActivityAt ?? Date.now(),
    deletionRequest: request ?? null,
    gracePeriodDays: 30,
    dataDisposition,
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
  occurredAt = Date.now(),
): Promise<void> {
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

export async function scheduleAccountDeletion(
  userId: string,
  trigger: "manual" | "inactivity",
) {
  const existing = await db
    .selectFrom("accountDeletionRequests")
    .selectAll()
    .where("userId", "=", userId)
    .where("status", "=", "scheduled")
    .executeTakeFirst();
  if (existing) return getAccountLifecycle(userId);

  const now = Date.now();
  await db
    .insertInto("accountDeletionRequests")
    .values({
      id: requestId(),
      userId,
      trigger,
      status: "scheduled",
      requestedAt: now,
      graceEndsAt: now + DELETION_GRACE_PERIOD_MS,
      cancelledAt: null,
      completedAt: null,
    })
    .execute();
  await recordSecurityEvent("account_deletion_scheduled", userId, { trigger });
  return getAccountLifecycle(userId);
}

export async function cancelScheduledAccountDeletion(userId: string) {
  const now = Date.now();
  const result = await db
    .updateTable("accountDeletionRequests")
    .set({ status: "cancelled", cancelledAt: now })
    .where("userId", "=", userId)
    .where("status", "=", "scheduled")
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) > 0) {
    await markMeaningfulAccountActivity(userId, now);
    await recordSecurityEvent("account_deletion_cancelled", userId);
  }
  return getAccountLifecycle(userId);
}
