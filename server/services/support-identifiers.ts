import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";
import { generateSupportId } from "../lib/support-id.js";
import { recordSecurityEvent } from "./security-events.js";

export type SupportIdRotationReason =
  "account_recovery" | "security_incident" | "administrative_correction";

export interface SupportIdentifier {
  publicId: string;
  createdAt: number;
}

const MAX_GENERATION_ATTEMPTS = 8;

function recordId(): string {
  return `support-${randomBytes(12).toString("hex")}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("unique constraint failed")
  );
}

export async function ensureSupportIdentifier(
  userId: string,
): Promise<SupportIdentifier> {
  const current = await db
    .selectFrom("accountSupportIdentifiers")
    .select(["publicId", "createdAt"])
    .where("userId", "=", userId)
    .where("status", "=", "active")
    .executeTakeFirst();

  if (current) {
    return current;
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const identifier = {
      publicId: generateSupportId(),
      createdAt: Date.now(),
    };

    try {
      await db
        .insertInto("accountSupportIdentifiers")
        .values({
          id: recordId(),
          userId,
          ...identifier,
          status: "active",
          rotationReason: null,
          revokedAt: null,
        })
        .execute();
      return identifier;
    } catch (error) {
      const concurrentlyCreated = await db
        .selectFrom("accountSupportIdentifiers")
        .select(["publicId", "createdAt"])
        .where("userId", "=", userId)
        .where("status", "=", "active")
        .executeTakeFirst();
      if (concurrentlyCreated) {
        return concurrentlyCreated;
      }
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  throw new Error("Unable to generate a unique support identifier");
}

export async function getSupportIdentifier(
  userId: string,
): Promise<SupportIdentifier> {
  return ensureSupportIdentifier(userId);
}

export async function findUserIdBySupportIdentifier(
  publicId: string,
): Promise<string | null> {
  const result = await db
    .selectFrom("accountSupportIdentifiers")
    .select("userId")
    .where("publicId", "=", publicId.trim().toUpperCase())
    .where("status", "=", "active")
    .executeTakeFirst();

  return result?.userId ?? null;
}

export async function rotateSupportIdentifier(
  userId: string,
  reason: SupportIdRotationReason,
): Promise<SupportIdentifier> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const replacement = {
      publicId: generateSupportId(),
      createdAt: Date.now(),
    };

    try {
      await db.transaction().execute(async (transaction) => {
        const current = await transaction
          .selectFrom("accountSupportIdentifiers")
          .select("id")
          .where("userId", "=", userId)
          .where("status", "=", "active")
          .executeTakeFirst();

        if (current) {
          await transaction
            .updateTable("accountSupportIdentifiers")
            .set({
              status: "revoked",
              rotationReason: reason,
              revokedAt: replacement.createdAt,
            })
            .where("id", "=", current.id)
            .execute();
        }

        await transaction
          .insertInto("accountSupportIdentifiers")
          .values({
            id: recordId(),
            userId,
            ...replacement,
            status: "active",
            rotationReason: null,
            revokedAt: null,
          })
          .execute();
      });

      await recordSecurityEvent("support_id_rotated", userId, { reason });
      return replacement;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  throw new Error("Unable to rotate the support identifier");
}
