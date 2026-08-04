import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import { db } from "../db/client.js";
import type { BookingReputationEventType, Database } from "../db/types.js";

const STARTING_SCORE = 100;
const MIN_SCORE = 0;
const MAX_SCORE = 100;
const LATE_CANCELLATION_PENALTY_MS = 7 * 24 * 60 * 60 * 1_000;
const ABSENCE_PENALTY_MS = 14 * 24 * 60 * 60 * 1_000;

export const reputationPolicy = {
  attended: 4,
  confirmed_attended: 2,
  cancelled_on_time: 1,
  cancelled_neutral: 0,
  cancelled_late: -12,
  absent: -20,
  excused: 0,
  uncertain: -1,
  penalty_cleared: 0,
} as const;

function clampScore(score: number) {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

function penaltyDuration(type: BookingReputationEventType) {
  if (type === "absent") return ABSENCE_PENALTY_MS;
  if (type === "cancelled_late") return LATE_CANCELLATION_PENALTY_MS;
  return 0;
}

export async function ensureBookingReputation(
  transaction: Transaction<Database>,
  userId: string,
) {
  const existing = await transaction
    .selectFrom("bookingReputations")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirst();
  if (existing) return existing;

  const created = {
    userId,
    score: STARTING_SCORE,
    penaltyUntil: null,
    updatedAt: Date.now(),
  };
  await transaction
    .insertInto("bookingReputations")
    .values(created)
    .onConflict((conflict) => conflict.column("userId").doNothing())
    .execute();
  return transaction
    .selectFrom("bookingReputations")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirstOrThrow();
}

async function recalculateBookingReputation(
  transaction: Transaction<Database>,
  userId: string,
  now: number,
) {
  const events = await transaction
    .selectFrom("bookingReputationEvents")
    .selectAll()
    .where("userId", "=", userId)
    .orderBy("createdAt", "asc")
    .orderBy("id", "asc")
    .execute();
  const excusedBookingIds = new Set(
    events
      .filter((event) => event.type === "excused" && event.bookingId)
      .map((event) => event.bookingId as string),
  );
  let score = STARTING_SCORE;
  let penaltyUntil: number | null = null;

  for (const event of events) {
    if (event.type === "penalty_cleared") {
      penaltyUntil = null;
      continue;
    }
    if (
      event.type === "absent" &&
      event.bookingId &&
      excusedBookingIds.has(event.bookingId)
    ) {
      continue;
    }
    score = clampScore(score + event.pointsDelta);
    const duration = penaltyDuration(event.type);
    if (duration > 0) {
      penaltyUntil = Math.max(penaltyUntil ?? 0, event.createdAt + duration);
    }
  }

  await transaction
    .updateTable("bookingReputations")
    .set({
      score,
      penaltyUntil: (penaltyUntil ?? 0) > now ? penaltyUntil : null,
      updatedAt: now,
    })
    .where("userId", "=", userId)
    .execute();
}

export async function recordBookingReputationEvent(
  transaction: Transaction<Database>,
  input: {
    userId: string;
    bookingId?: string | null;
    type: BookingReputationEventType;
    reason: string;
    pointsDelta?: number;
    now?: number;
  },
) {
  const now = input.now ?? Date.now();
  await ensureBookingReputation(transaction, input.userId);
  const pointsDelta =
    input.pointsDelta ??
    reputationPolicy[input.type as keyof typeof reputationPolicy] ??
    0;
  await transaction
    .insertInto("bookingReputationEvents")
    .values({
      id: `reputation-${randomUUID()}`,
      userId: input.userId,
      bookingId: input.bookingId ?? null,
      type: input.type,
      pointsDelta,
      reason: input.reason,
      createdAt: now,
    })
    .execute();
  await recalculateBookingReputation(transaction, input.userId, now);
}

export async function getBookingReputation(userId: string) {
  const user = await db
    .selectFrom("users")
    .select("id")
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user) throw new Error("User not found");

  let reputation = await db
    .selectFrom("bookingReputations")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!reputation) {
    await db.transaction().execute(async (transaction) => {
      reputation = await ensureBookingReputation(transaction, userId);
    });
  }

  const events = await db
    .selectFrom("bookingReputationEvents")
    .selectAll()
    .where("userId", "=", userId)
    .orderBy("createdAt", "desc")
    .limit(20)
    .execute();
  const now = Date.now();
  const penaltyActive = (reputation?.penaltyUntil ?? 0) > now;

  return {
    score: reputation?.score ?? STARTING_SCORE,
    penaltyActive,
    penaltyUntil: penaltyActive ? (reputation?.penaltyUntil ?? null) : null,
    tier: penaltyActive
      ? "reduced"
      : (reputation?.score ?? STARTING_SCORE) >= 80
        ? "reliable"
        : "standard",
    explanationCode: penaltyActive ? "temporary_penalty" : "no_penalty",
    recoveryActions: [
      "attend",
      "honor_confirmation",
      "cancel_on_time",
      "request_review",
    ],
    events,
  };
}

export function calculateWaitlistPriority(input: {
  score: number;
  penaltyUntil: number | null;
  createdAt: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const penalty = (input.penaltyUntil ?? 0) > now ? 25 : 0;
  return input.score - penalty;
}

export async function adjustBookingReputation(input: {
  userId: string;
  pointsDelta: number;
  reason: string;
  clearPenalty?: boolean;
}) {
  const user = await db
    .selectFrom("users")
    .select("id")
    .where("id", "=", input.userId)
    .executeTakeFirst();
  if (!user) throw new Error("User not found");

  await db.transaction().execute(async (transaction) => {
    await recordBookingReputationEvent(transaction, {
      userId: input.userId,
      type: "manual_adjustment",
      pointsDelta: input.pointsDelta,
      reason: input.reason,
    });
    if (input.clearPenalty) {
      await recordBookingReputationEvent(transaction, {
        userId: input.userId,
        type: "penalty_cleared",
        pointsDelta: 0,
        reason: `Penalización retirada manualmente: ${input.reason}`,
      });
    }
  });
  return getBookingReputation(input.userId);
}
