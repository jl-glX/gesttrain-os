import { db } from "../db/client.js";
import { recordSecurityEvent } from "./security-events.js";

export const FORM_VERIFICATION_DURATION_MS = 15 * 60 * 1000;

export async function getFormVerificationStatus(sessionId: string) {
  const session = await db
    .selectFrom("sessions")
    .select(["formVerifiedAt", "revokedAt", "expiresAt"])
    .where("id", "=", sessionId)
    .executeTakeFirst();
  const now = Date.now();
  const validUntil = session?.formVerifiedAt
    ? session.formVerifiedAt + FORM_VERIFICATION_DURATION_MS
    : 0;
  return {
    verified: Boolean(
      session &&
      session.revokedAt === null &&
      session.expiresAt > now &&
      validUntil > now,
    ),
    validUntil,
    durationMinutes: FORM_VERIFICATION_DURATION_MS / 60_000,
  };
}

export async function markFormSessionVerified(
  sessionId: string,
  userId: string,
) {
  const now = Date.now();
  const result = await db
    .updateTable("sessions")
    .set({ formVerifiedAt: now })
    .where("id", "=", sessionId)
    .where("userId", "=", userId)
    .where("revokedAt", "is", null)
    .where("expiresAt", ">", now)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) !== 1) {
    const error = new Error("Active session not found") as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  }
  await recordSecurityEvent("form_verification_succeeded", userId, {
    durationMinutes: FORM_VERIFICATION_DURATION_MS / 60_000,
  });
  return getFormVerificationStatus(sessionId);
}
