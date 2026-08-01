import {
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { db } from "../db/client.js";
import { recordSecurityEvent } from "./security-events.js";

const CHALLENGE_DURATION_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(
  code: string,
  salt = randomBytes(16).toString("hex"),
): string {
  const digest = scryptSync(code, salt, 32).toString("hex");
  return `${salt}:${digest}`;
}

function codeMatches(code: string, stored: string): boolean {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = scryptSync(code, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createEmailVerificationChallenge(
  userId: string,
): Promise<string> {
  const now = Date.now();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db
    .deleteFrom("emailVerificationChallenges")
    .where("userId", "=", userId)
    .execute();
  await db
    .insertInto("emailVerificationChallenges")
    .values({
      id: `email-verification-${randomBytes(12).toString("hex")}`,
      userId,
      codeHash: hashCode(code),
      createdAt: now,
      expiresAt: now + CHALLENGE_DURATION_MS,
      attempts: 0,
      consumedAt: null,
    })
    .execute();
  return code;
}

export async function verifyEmailCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const challenge = await db
    .selectFrom("emailVerificationChallenges")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirst();
  const now = Date.now();
  if (
    !challenge ||
    challenge.consumedAt !== null ||
    challenge.expiresAt <= now ||
    challenge.attempts >= MAX_ATTEMPTS
  ) {
    return false;
  }
  if (!codeMatches(code, challenge.codeHash)) {
    await db
      .updateTable("emailVerificationChallenges")
      .set({ attempts: challenge.attempts + 1 })
      .where("id", "=", challenge.id)
      .execute();
    return false;
  }
  await db.transaction().execute(async (transaction) => {
    await transaction
      .updateTable("emailVerificationChallenges")
      .set({ consumedAt: now })
      .where("id", "=", challenge.id)
      .execute();
    await transaction
      .updateTable("users")
      .set({ emailVerifiedAt: now, accountStatus: "active" })
      .where("id", "=", userId)
      .execute();
  });
  await recordSecurityEvent("email_verified", userId);
  return true;
}
