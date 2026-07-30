import { createHash, randomBytes } from "node:crypto";
import bcryptjs from "bcryptjs";
import { db } from "../db/client.js";
import { mfaStatus, verifyMfaCode } from "./mfa.js";
import { recordSecurityEvent } from "./security-events.js";
import { ensureSupportIdentifier } from "./support-identifiers.js";
import { markMeaningfulAccountActivity } from "./account-lifecycle.js";

export const SESSION_DURATION = 24 * 60 * 60 * 1000;
export const REMEMBERED_SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
export const MFA_CHALLENGE_DURATION = 5 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;
export const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 7 * 24 * 60;

export interface SessionData {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  avatarDataUrl: string;
  role: "member" | "trainer" | "admin";
  createdAt: number;
  expiresAt: number;
}

export interface AuthResult {
  sessionToken: string;
  rememberDevice: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    avatarDataUrl: string;
    role: "member" | "trainer" | "admin";
  };
}

export type LoginResult =
  | ({ mfaRequired: false } & AuthResult)
  | { mfaRequired: true; challengeToken: string };

export interface SessionMetadata {
  userAgent?: string;
}

export type AccessPortal = "member" | "staff";

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 12);
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export async function verifyUserPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  const user = await db
    .selectFrom("users")
    .select("password")
    .where("id", "=", userId)
    .executeTakeFirst();
  return user ? bcryptjs.compare(password, user.password) : false;
}

function sessionId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  user: AuthResult["user"],
  metadata: SessionMetadata = {},
  rememberDevice = false,
): Promise<AuthResult> {
  const now = Date.now();
  const token = randomBytes(32).toString("hex");

  await db.deleteFrom("sessions").where("expiresAt", "<", now).execute();
  await db
    .insertInto("sessions")
    .values({
      id: sessionId(token),
      userId: user.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt:
        now + (rememberDevice ? REMEMBERED_SESSION_DURATION : SESSION_DURATION),
      revokedAt: null,
      userAgent: (metadata.userAgent ?? "Unknown device").slice(0, 255),
      remembered: rememberDevice ? 1 : 0,
    })
    .execute();

  await markMeaningfulAccountActivity(user.id, now);
  return { sessionToken: token, user, rememberDevice };
}

export async function signup(
  email: string,
  name: string,
  password: string,
  metadata: SessionMetadata = {},
): Promise<AuthResult> {
  if (!isStrongPassword(password)) {
    throw new Error("Password does not meet the security requirements");
  }

  const existingUser = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (existingUser) {
    throw new Error("Unable to create account with these credentials");
  }

  const user = {
    id: `user-${randomBytes(8).toString("hex")}`,
    email,
    phone: null,
    name,
    avatarDataUrl: "",
    role: "member" as const,
    sessionIdleTimeoutMinutes: DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
  };

  await db
    .insertInto("users")
    .values({
      ...user,
      password: await hashPassword(password),
      createdAt: Date.now(),
    })
    .execute();

  await ensureSupportIdentifier(user.id);
  return createSession(user, metadata);
}

export async function login(
  identifier: string,
  password: string,
  accessPortal: AccessPortal = "member",
  rememberDevice = false,
  metadata: SessionMetadata = {},
): Promise<LoginResult> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const normalizedPhone = identifier.replace(/[\s()-]/g, "");
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where((expression) =>
      expression.or([
        expression("email", "=", normalizedIdentifier),
        expression("phone", "=", normalizedPhone),
      ]),
    )
    .executeTakeFirst();

  const portalMatches =
    user &&
    (accessPortal === "member"
      ? user.role === "member"
      : user.role === "trainer" || user.role === "admin");

  if (!user || !portalMatches) {
    await bcryptjs.hash(password, 12);
    await recordSecurityEvent("login_failed", user?.id ?? null, {
      portal: accessPortal,
    });
    throw new Error("Invalid email or password");
  }

  if (!(await bcryptjs.compare(password, user.password))) {
    await recordSecurityEvent("login_failed", user.id);
    throw new Error("Invalid email or password");
  }

  const status = await mfaStatus(user.id);
  if (status.enabled) {
    const now = Date.now();
    const challengeToken = randomBytes(32).toString("hex");
    await db
      .deleteFrom("authChallenges")
      .where("expiresAt", "<", now)
      .execute();
    await db
      .insertInto("authChallenges")
      .values({
        id: sessionId(challengeToken),
        userId: user.id,
        createdAt: now,
        expiresAt: now + MFA_CHALLENGE_DURATION,
        attempts: 0,
        consumedAt: null,
        rememberDevice: rememberDevice ? 1 : 0,
      })
      .execute();
    await recordSecurityEvent("mfa_challenge_created", user.id);
    return { mfaRequired: true, challengeToken };
  }

  const result = await createSession(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarDataUrl: user.avatarDataUrl,
      role: user.role,
    },
    metadata,
    rememberDevice,
  );
  await recordSecurityEvent("login_succeeded", user.id);
  return { mfaRequired: false, ...result };
}

export async function completeMfaLogin(
  challengeToken: string,
  code: string,
  metadata: SessionMetadata = {},
): Promise<AuthResult> {
  const now = Date.now();
  const challengeId = sessionId(challengeToken);
  const challenge = await db
    .selectFrom("authChallenges")
    .innerJoin("users", "users.id", "authChallenges.userId")
    .select([
      "authChallenges.userId",
      "authChallenges.expiresAt",
      "authChallenges.attempts",
      "authChallenges.consumedAt",
      "authChallenges.rememberDevice",
      "users.email",
      "users.name",
      "users.avatarDataUrl",
      "users.role",
    ])
    .where("authChallenges.id", "=", challengeId)
    .executeTakeFirst();

  if (
    !challenge ||
    challenge.consumedAt !== null ||
    challenge.expiresAt <= now ||
    challenge.attempts >= MFA_MAX_ATTEMPTS
  ) {
    throw new Error("Invalid or expired verification challenge");
  }

  const verification = await verifyMfaCode(
    challenge.userId,
    challenge.email,
    code,
  );
  if (!verification.valid) {
    await db
      .updateTable("authChallenges")
      .set({ attempts: challenge.attempts + 1 })
      .where("id", "=", challengeId)
      .execute();
    await recordSecurityEvent("mfa_challenge_failed", challenge.userId);
    throw new Error("Invalid verification code");
  }

  await db
    .updateTable("authChallenges")
    .set({ consumedAt: now })
    .where("id", "=", challengeId)
    .execute();
  const result = await createSession(
    {
      id: challenge.userId,
      email: challenge.email,
      name: challenge.name,
      avatarDataUrl: challenge.avatarDataUrl,
      role: challenge.role,
    },
    metadata,
    challenge.rememberDevice === 1,
  );
  await recordSecurityEvent("mfa_succeeded", challenge.userId, {
    recoveryCode: verification.usedRecoveryCode,
  });
  return result;
}

export async function verifyToken(token: string): Promise<SessionData | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return null;
  }

  const now = Date.now();
  const record = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.userId")
    .select([
      "sessions.userId",
      "sessions.createdAt",
      "sessions.expiresAt",
      "sessions.revokedAt",
      "sessions.lastSeenAt",
      "users.sessionIdleTimeoutMinutes",
      "users.email",
      "users.name",
      "users.avatarDataUrl",
      "users.role",
    ])
    .where("sessions.id", "=", sessionId(token))
    .executeTakeFirst();

  if (!record) {
    return null;
  }

  const idleExpiresAt =
    record.lastSeenAt + record.sessionIdleTimeoutMinutes * 60 * 1000;

  if (
    record.revokedAt !== null ||
    record.expiresAt <= now ||
    idleExpiresAt <= now
  ) {
    if (record.revokedAt === null && idleExpiresAt <= now) {
      await db
        .updateTable("sessions")
        .set({ revokedAt: now })
        .where("id", "=", sessionId(token))
        .execute();
    }
    return null;
  }

  if (now - record.lastSeenAt > 5 * 60 * 1000) {
    await db
      .updateTable("sessions")
      .set({ lastSeenAt: now })
      .where("id", "=", sessionId(token))
      .execute();
  }

  return {
    userId: record.userId,
    email: record.email,
    name: record.name,
    avatarDataUrl: record.avatarDataUrl,
    role: record.role,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    sessionId: sessionId(token),
  };
}

export async function logout(token: string): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revokedAt: Date.now() })
    .where("id", "=", sessionId(token))
    .execute();
}

export async function logoutAll(userId: string): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revokedAt: Date.now() })
    .where("userId", "=", userId)
    .where("revokedAt", "is", null)
    .execute();
}
