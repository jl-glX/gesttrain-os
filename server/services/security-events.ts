import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";

export type SecurityEventType =
  | "login_succeeded"
  | "login_failed"
  | "mfa_challenge_created"
  | "mfa_challenge_failed"
  | "mfa_succeeded"
  | "mfa_enabled"
  | "mfa_disabled"
  | "passkey_registered"
  | "passkey_removed"
  | "passkey_login_succeeded"
  | "recovery_codes_regenerated"
  | "session_revoked"
  | "all_other_sessions_revoked"
  | "support_id_rotated";

export async function recordSecurityEvent(
  type: SecurityEventType,
  userId: string | null,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  await db
    .insertInto("securityEvents")
    .values({
      id: `security-${randomBytes(12).toString("hex")}`,
      userId,
      type,
      createdAt: Date.now(),
      metadata: JSON.stringify(metadata),
    })
    .execute();
}
