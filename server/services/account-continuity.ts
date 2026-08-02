import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";
import { findUserIdBySupportIdentifier } from "./support-identifiers.js";
import { recordSecurityEvent } from "./security-events.js";

export const ACCOUNT_REPRESENTATION_SCOPES = [
  "cancel_bookings",
  "stop_subscriptions",
  "download_authorized_documents",
  "manage_pending_payments",
  "contact_support",
  "request_account_closure",
] as const;
export type AccountRepresentationScope =
  (typeof ACCOUNT_REPRESENTATION_SCOPES)[number];

export const ACCOUNT_REPRESENTATION_REASONS = [
  "hospitalization",
  "temporary_incapacity",
  "permanent_incapacity",
  "death_contingency",
  "other",
] as const;
export type AccountRepresentationReason =
  (typeof ACCOUNT_REPRESENTATION_REASONS)[number];

class AccountContinuityInputError extends Error {
  readonly statusCode = 400;
}

function representationId(): string {
  return `representative-${randomBytes(12).toString("hex")}`;
}

function normalizeScopes(
  scopes: AccountRepresentationScope[],
): AccountRepresentationScope[] {
  return [
    ...new Set(
      scopes.filter((scope) => ACCOUNT_REPRESENTATION_SCOPES.includes(scope)),
    ),
  ];
}

function parseScopes(value: string): AccountRepresentationScope[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (scope): scope is AccountRepresentationScope =>
            typeof scope === "string" &&
            ACCOUNT_REPRESENTATION_SCOPES.includes(
              scope as AccountRepresentationScope,
            ),
        )
      : [];
  } catch {
    return [];
  }
}

export async function listAccountRepresentations(ownerUserId: string) {
  const now = Date.now();
  await db
    .updateTable("accountRepresentatives")
    .set({ status: "expired", updatedAt: now })
    .where("ownerUserId", "=", ownerUserId)
    .where("status", "in", ["draft", "pending_review", "approved"])
    .where("expiresAt", "is not", null)
    .where("expiresAt", "<=", now)
    .execute();

  const rows = await db
    .selectFrom("accountRepresentatives as representation")
    .innerJoin(
      "accountSupportIdentifiers as identifier",
      "identifier.userId",
      "representation.representativeUserId",
    )
    .select([
      "representation.id",
      "representation.scopes",
      "representation.reason",
      "representation.status",
      "representation.startsAt",
      "representation.expiresAt",
      "representation.createdAt",
      "representation.updatedAt",
      "identifier.publicId as supportIdentifier",
    ])
    .where("representation.ownerUserId", "=", ownerUserId)
    .where("identifier.status", "=", "active")
    .orderBy("representation.updatedAt", "desc")
    .execute();

  return rows.map((row) => ({ ...row, scopes: parseScopes(row.scopes) }));
}

export async function getAccountContinuityBridge(userId: string) {
  return {
    status: "draft_available" as const,
    executionEnabled: false as const,
    identityTransferAllowed: false as const,
    scopes: ACCOUNT_REPRESENTATION_SCOPES,
    reasons: ACCOUNT_REPRESENTATION_REASONS,
    representations: await listAccountRepresentations(userId),
    excludedCapabilities: [
      "inherit_identity",
      "inherit_credentials",
      "impersonate_owner",
      "unrestricted_private_data_access",
    ] as const,
  };
}

export async function createAccountRepresentationDraft(
  ownerUserId: string,
  input: {
    supportIdentifier: string;
    scopes: AccountRepresentationScope[];
    reason: AccountRepresentationReason;
    expiresAt?: number | null;
  },
) {
  const scopes = normalizeScopes(input.scopes);
  if (scopes.length === 0) {
    throw new AccountContinuityInputError("Select at least one scope");
  }
  if (!ACCOUNT_REPRESENTATION_REASONS.includes(input.reason)) {
    throw new AccountContinuityInputError("Invalid representation reason");
  }
  const representativeUserId = await findUserIdBySupportIdentifier(
    input.supportIdentifier,
  );
  if (!representativeUserId || representativeUserId === ownerUserId) {
    throw new AccountContinuityInputError(
      "Representative account is unavailable",
    );
  }
  const now = Date.now();
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt !== null && expiresAt <= now) {
    throw new AccountContinuityInputError(
      "Representation expiry must be in the future",
    );
  }

  const existing = await db
    .selectFrom("accountRepresentatives")
    .select("id")
    .where("ownerUserId", "=", ownerUserId)
    .where("representativeUserId", "=", representativeUserId)
    .where("status", "in", ["draft", "pending_review", "approved"])
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("accountRepresentatives")
      .set({
        scopes: JSON.stringify(scopes),
        reason: input.reason,
        expiresAt,
        updatedAt: now,
      })
      .where("id", "=", existing.id)
      .execute();
  } else {
    await db
      .insertInto("accountRepresentatives")
      .values({
        id: representationId(),
        ownerUserId,
        representativeUserId,
        scopes: JSON.stringify(scopes),
        reason: input.reason,
        status: "draft",
        startsAt: now,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
      })
      .execute();
  }
  await recordSecurityEvent("account_representation_draft_saved", ownerUserId, {
    scopeCount: scopes.length,
    reason: input.reason,
  });
  return getAccountContinuityBridge(ownerUserId);
}

export async function revokeAccountRepresentation(
  ownerUserId: string,
  representationIdValue: string,
) {
  const now = Date.now();
  const result = await db
    .updateTable("accountRepresentatives")
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where("id", "=", representationIdValue)
    .where("ownerUserId", "=", ownerUserId)
    .where("status", "in", ["draft", "pending_review", "approved"])
    .executeTakeFirst();
  if (Number(result.numUpdatedRows) > 0) {
    await recordSecurityEvent("account_representation_revoked", ownerUserId, {
      representationId: representationIdValue,
    });
  }
  return getAccountContinuityBridge(ownerUserId);
}
