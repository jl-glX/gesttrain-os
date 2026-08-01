import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "../db/client.js";

export type DelegationDuration = "24h" | "7d" | "30d" | "indefinite";

const durationMilliseconds: Record<
  Exclude<DelegationDuration, "indefinite">,
  number
> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
const DELEGATION_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isActiveGrant(grant: {
  expiresAt: number | null;
  revokedAt: number | null;
}) {
  return (
    grant.revokedAt === null &&
    (grant.expiresAt === null || grant.expiresAt > Date.now())
  );
}

export async function createDelegationToken(
  ownerUserId: string,
  duration: DelegationDuration,
) {
  const now = Date.now();
  const activeCount = await db
    .selectFrom("delegationGrants")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("ownerUserId", "=", ownerUserId)
    .where("revokedAt", "is", null)
    .where((eb) =>
      eb.or([eb("expiresAt", "is", null), eb("expiresAt", ">", now)]),
    )
    .executeTakeFirst();

  if (Number(activeCount?.count ?? 0) >= 5) {
    throw new Error("DELEGATION_LIMIT_REACHED");
  }

  const token = `hfd_${randomBytes(24).toString("base64url")}`;
  const expiresAt =
    duration === "indefinite" ? null : now + durationMilliseconds[duration];
  const id = randomUUID();

  await db
    .insertInto("delegationGrants")
    .values({
      id,
      ownerUserId,
      delegateUserId: null,
      tokenHash: hashToken(token),
      tokenPreview: token.slice(-6),
      scope: "bookings",
      duration,
      expiresAt,
      createdAt: now,
      redeemedAt: null,
      revokedAt: null,
      ownerHiddenAt: null,
      delegateHiddenAt: null,
    })
    .execute();

  return { id, token, duration, expiresAt };
}

export async function redeemDelegationToken(
  token: string,
  delegateUserId: string,
) {
  const grant = await db
    .selectFrom("delegationGrants")
    .selectAll()
    .where("tokenHash", "=", hashToken(token.trim()))
    .executeTakeFirst();

  if (!grant || !isActiveGrant(grant)) {
    throw new Error("DELEGATION_TOKEN_INVALID");
  }
  if (grant.ownerUserId === delegateUserId) {
    throw new Error("DELEGATION_SELF_NOT_ALLOWED");
  }
  if (grant.delegateUserId) {
    throw new Error("DELEGATION_TOKEN_ALREADY_USED");
  }

  await db
    .updateTable("delegationGrants")
    .set({ delegateUserId, redeemedAt: Date.now() })
    .where("id", "=", grant.id)
    .execute();

  return { id: grant.id, ownerUserId: grant.ownerUserId };
}

export async function revokeDelegationGrant(
  grantId: string,
  ownerUserId: string,
) {
  const result = await db
    .updateTable("delegationGrants")
    .set({ revokedAt: Date.now() })
    .where("id", "=", grantId)
    .where("ownerUserId", "=", ownerUserId)
    .where("revokedAt", "is", null)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    throw new Error("DELEGATION_NOT_FOUND");
  }
}

export async function hasActiveBookingDelegation(
  delegateUserId: string,
  ownerUserId: string,
) {
  const grant = await db
    .selectFrom("delegationGrants")
    .select(["id", "expiresAt", "revokedAt"])
    .where("delegateUserId", "=", delegateUserId)
    .where("ownerUserId", "=", ownerUserId)
    .where("scope", "=", "bookings")
    .where("revokedAt", "is", null)
    .orderBy("createdAt", "desc")
    .executeTakeFirst();

  return Boolean(grant && isActiveGrant(grant));
}

export async function listDelegations(userId: string) {
  await hideStaleDelegationHistory(userId);
  const rows = await db
    .selectFrom("delegationGrants")
    .select([
      "id",
      "ownerUserId",
      "delegateUserId",
      "tokenPreview",
      "scope",
      "duration",
      "expiresAt",
      "createdAt",
      "redeemedAt",
      "revokedAt",
      "ownerHiddenAt",
      "delegateHiddenAt",
    ])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("ownerUserId", "=", userId),
          eb("ownerHiddenAt", "is", null),
        ]),
        eb.and([
          eb("delegateUserId", "=", userId),
          eb("delegateHiddenAt", "is", null),
        ]),
      ]),
    )
    .orderBy("createdAt", "desc")
    .execute();

  return Promise.all(
    rows.map(async (row) => {
      const otherUserId =
        row.ownerUserId === userId ? row.delegateUserId : row.ownerUserId;
      const otherUser = otherUserId
        ? await db
            .selectFrom("users")
            .select(["id", "name", "email", "avatarDataUrl"])
            .where("id", "=", otherUserId)
            .executeTakeFirst()
        : null;
      return {
        ...row,
        direction: row.ownerUserId === userId ? "granted" : "received",
        otherUser,
        active: isActiveGrant(row),
      };
    }),
  );
}

async function hideStaleDelegationHistory(userId: string) {
  const cutoff = Date.now() - DELEGATION_HISTORY_RETENTION_MS;
  await hideInactiveDelegationsForParticipant(userId, cutoff);
  await purgeHiddenDelegationRows();
}

async function hideInactiveDelegationsForParticipant(
  userId: string,
  inactiveBefore: number,
) {
  const now = Date.now();
  await db
    .updateTable("delegationGrants")
    .set({ ownerHiddenAt: now })
    .where("ownerUserId", "=", userId)
    .where("ownerHiddenAt", "is", null)
    .where((eb) =>
      eb.or([
        eb("revokedAt", "<=", inactiveBefore),
        eb("expiresAt", "<=", inactiveBefore),
      ]),
    )
    .execute();
  await db
    .updateTable("delegationGrants")
    .set({ delegateHiddenAt: now })
    .where("delegateUserId", "=", userId)
    .where("delegateHiddenAt", "is", null)
    .where((eb) =>
      eb.or([
        eb("revokedAt", "<=", inactiveBefore),
        eb("expiresAt", "<=", inactiveBefore),
      ]),
    )
    .execute();
}

async function purgeHiddenDelegationRows() {
  await db
    .deleteFrom("delegationGrants")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("delegateUserId", "is", null),
          eb("ownerHiddenAt", "is not", null),
        ]),
        eb.and([
          eb("ownerHiddenAt", "is not", null),
          eb("delegateHiddenAt", "is not", null),
        ]),
      ]),
    )
    .execute();
}

export async function clearInactiveDelegationHistory(userId: string) {
  await hideInactiveDelegationsForParticipant(userId, Date.now());
  await purgeHiddenDelegationRows();
  return listDelegations(userId);
}
