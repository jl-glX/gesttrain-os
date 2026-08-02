import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";
import { recordSecurityEvent } from "./security-events.js";

export interface DraftRetentionPolicyInput {
  name: string;
  jurisdiction: string;
  dataCategory: string;
  retentionDays?: number | null;
  legalBasisReference?: string;
}

export const ACCOUNT_DATA_CATEGORIES = [
  "account_profile",
  "preferences",
  "bookings",
  "sessions",
  "authentication_factors",
  "delegations",
  "billing_records",
  "security_events",
] as const;
export type AccountDataCategory = (typeof ACCOUNT_DATA_CATEGORIES)[number];

export const ACCOUNT_DATA_CLASSIFICATION: ReadonlyArray<{
  dataCategory: AccountDataCategory;
  defaultDisposition:
    | "delete"
    | "delete_or_anonymize"
    | "cancel_future_anonymize_history"
    | "revoke_and_delete"
    | "retain_only_if_policy_applies";
  retentionRequiresReviewedPolicy: boolean;
}> = [
  {
    dataCategory: "account_profile",
    defaultDisposition: "delete_or_anonymize",
    retentionRequiresReviewedPolicy: false,
  },
  {
    dataCategory: "preferences",
    defaultDisposition: "delete",
    retentionRequiresReviewedPolicy: false,
  },
  {
    dataCategory: "bookings",
    defaultDisposition: "cancel_future_anonymize_history",
    retentionRequiresReviewedPolicy: false,
  },
  {
    dataCategory: "sessions",
    defaultDisposition: "revoke_and_delete",
    retentionRequiresReviewedPolicy: false,
  },
  {
    dataCategory: "authentication_factors",
    defaultDisposition: "revoke_and_delete",
    retentionRequiresReviewedPolicy: false,
  },
  {
    dataCategory: "delegations",
    defaultDisposition: "revoke_and_delete",
    retentionRequiresReviewedPolicy: false,
  },
  {
    dataCategory: "billing_records",
    defaultDisposition: "retain_only_if_policy_applies",
    retentionRequiresReviewedPolicy: true,
  },
  {
    dataCategory: "security_events",
    defaultDisposition: "retain_only_if_policy_applies",
    retentionRequiresReviewedPolicy: true,
  },
] as const;

class RetentionInputError extends Error {
  readonly statusCode = 400;
}

function retentionId(prefix: "policy" | "retention"): string {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new RetentionInputError(`Invalid ${field}`);
  }
  return normalized;
}

export async function listRetentionOverview() {
  const [policies, records] = await Promise.all([
    db
      .selectFrom("dataRetentionPolicies")
      .selectAll()
      .orderBy("updatedAt", "desc")
      .execute(),
    db
      .selectFrom("dataRetentionRecords")
      .select(["id", "status", "retainUntil", "sourceType", "policyId"])
      .orderBy("updatedAt", "desc")
      .execute(),
  ]);

  return {
    policies,
    records,
    catalog: ACCOUNT_DATA_CLASSIFICATION,
    executionEnabled: false,
    legalValidationProvided: false,
  };
}

export async function getAccountDispositionPreview(userId: string) {
  const [policies, linkedRecords] = await Promise.all([
    db
      .selectFrom("dataRetentionPolicies")
      .select(["dataCategory", "status"])
      .where("status", "in", ["draft", "active"])
      .execute(),
    db
      .selectFrom("dataRetentionRecords")
      .select(["status", "sourceType"])
      .where("userId", "=", userId)
      .where("status", "!=", "released")
      .execute(),
  ]);

  return {
    executionEnabled: false,
    categories: ACCOUNT_DATA_CATEGORIES.map((dataCategory) => {
      const policy = policies.find(
        (candidate) => candidate.dataCategory === dataCategory,
      );
      const retainedRecordCount = linkedRecords.filter(
        (record) => record.sourceType === dataCategory,
      ).length;
      return {
        dataCategory,
        defaultDisposition:
          ACCOUNT_DATA_CLASSIFICATION.find(
            (category) => category.dataCategory === dataCategory,
          )?.defaultDisposition ?? "delete_or_anonymize",
        retentionRequiresReviewedPolicy:
          ACCOUNT_DATA_CLASSIFICATION.find(
            (category) => category.dataCategory === dataCategory,
          )?.retentionRequiresReviewedPolicy ?? false,
        reviewState:
          policy?.status === "active"
            ? ("policy_review_required" as const)
            : policy?.status === "draft"
              ? ("draft_policy" as const)
              : ("unclassified" as const),
        retainedRecordCount,
      };
    }),
  };
}

export async function createDraftRetentionPolicy(
  input: DraftRetentionPolicyInput,
  actorUserId: string | null = null,
) {
  const now = Date.now();
  const retentionDays =
    input.retentionDays === undefined || input.retentionDays === null
      ? null
      : Number(input.retentionDays);
  if (
    retentionDays !== null &&
    (!Number.isInteger(retentionDays) ||
      retentionDays <= 0 ||
      retentionDays > 36500)
  ) {
    throw new RetentionInputError("Invalid retention duration");
  }

  const jurisdiction = requiredText(
    input.jurisdiction,
    "jurisdiction",
    32,
  ).toUpperCase();
  const dataCategory = requiredText(
    input.dataCategory,
    "data category",
    80,
  ) as AccountDataCategory;
  if (!ACCOUNT_DATA_CATEGORIES.includes(dataCategory)) {
    throw new RetentionInputError("Unsupported data category");
  }
  const previousVersion = await db
    .selectFrom("dataRetentionPolicies")
    .select("version")
    .where("jurisdiction", "=", jurisdiction)
    .where("dataCategory", "=", dataCategory)
    .orderBy("version", "desc")
    .executeTakeFirst();

  const policy = {
    id: retentionId("policy"),
    name: requiredText(input.name, "policy name", 120),
    jurisdiction,
    dataCategory,
    retentionDays,
    legalBasisReference: (input.legalBasisReference ?? "").trim().slice(0, 255),
    status: "draft" as const,
    version: (previousVersion?.version ?? 0) + 1,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insertInto("dataRetentionPolicies").values(policy).execute();
  await recordSecurityEvent("retention_policy_drafted", actorUserId, {
    policyId: policy.id,
    jurisdiction: policy.jurisdiction,
  });
  return policy;
}

export async function reviewRetentionPolicy(
  policyId: string,
  input: { decision: "activate" | "retire"; reviewConfirmed: boolean },
  actorUserId: string | null,
) {
  if (!input.reviewConfirmed) {
    throw new RetentionInputError("Internal review confirmation is required");
  }
  const policy = await db
    .selectFrom("dataRetentionPolicies")
    .selectAll()
    .where("id", "=", policyId)
    .executeTakeFirst();
  if (!policy) throw new RetentionInputError("Retention policy not found");
  if (input.decision === "activate") {
    if (!policy.retentionDays || !policy.legalBasisReference.trim()) {
      throw new RetentionInputError(
        "Duration and review reference are required before activation",
      );
    }
    await db.transaction().execute(async (transaction) => {
      await transaction
        .updateTable("dataRetentionPolicies")
        .set({ status: "retired", updatedAt: Date.now() })
        .where("jurisdiction", "=", policy.jurisdiction)
        .where("dataCategory", "=", policy.dataCategory)
        .where("status", "=", "active")
        .where("id", "!=", policy.id)
        .execute();
      await transaction
        .updateTable("dataRetentionPolicies")
        .set({
          status: "active",
          reviewedAt: Date.now(),
          updatedAt: Date.now(),
        })
        .where("id", "=", policy.id)
        .execute();
    });
  } else {
    await db
      .updateTable("dataRetentionPolicies")
      .set({ status: "retired", reviewedAt: Date.now(), updatedAt: Date.now() })
      .where("id", "=", policy.id)
      .execute();
  }
  await recordSecurityEvent("retention_policy_reviewed", actorUserId, {
    policyId,
    decision: input.decision,
    legalValidationProvided: false,
  });
  return listRetentionOverview();
}

export async function registerRetentionRecord(input: {
  userId?: string | null;
  policyId: string;
  sourceType: string;
  sourceId: string;
  retainUntil?: number | null;
}) {
  const policy = await db
    .selectFrom("dataRetentionPolicies")
    .select(["id", "status"])
    .where("id", "=", input.policyId)
    .executeTakeFirst();
  if (!policy) throw new Error("Retention policy not found");
  if (policy.status !== "active") {
    throw new Error("Only reviewed active policies can retain records");
  }

  const now = Date.now();
  const record = {
    id: retentionId("retention"),
    userId: input.userId ?? null,
    policyId: policy.id,
    sourceType: requiredText(input.sourceType, "source type", 80),
    sourceId: requiredText(input.sourceId, "source identifier", 160),
    status: "retained" as const,
    retainUntil: input.retainUntil ?? null,
    createdAt: now,
    updatedAt: now,
    releasedAt: null,
  };
  await db.insertInto("dataRetentionRecords").values(record).execute();
  return record;
}

export async function setRetentionLegalHold(
  recordId: string,
  enabled: boolean,
) {
  const now = Date.now();
  const record = await db
    .selectFrom("dataRetentionRecords")
    .select(["id", "status"])
    .where("id", "=", recordId)
    .executeTakeFirst();
  if (!record) throw new Error("Retention record not found");
  if (record.status === "released") {
    throw new Error("Released retention records cannot be changed");
  }

  await db
    .updateTable("dataRetentionRecords")
    .set({
      status: enabled ? "legal_hold" : "retained",
      updatedAt: now,
    })
    .where("id", "=", recordId)
    .execute();
  await recordSecurityEvent("retention_hold_changed", null, {
    recordId,
    enabled,
  });
}

export async function findRetentionCandidates(now = Date.now()) {
  return db
    .selectFrom("dataRetentionRecords")
    .selectAll()
    .where("status", "=", "retained")
    .where("retainUntil", "is not", null)
    .where("retainUntil", "<=", now)
    .execute();
}
