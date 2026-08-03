import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import type {
  CommercialFacilityType,
  RealDataDeclaration,
} from "../db/types.js";
import {
  COMMERCIAL_TRIAL_ID,
  COMMERCIAL_TRIAL_MS,
  commercialTemplates,
  createTrialSubdomain,
  getTrialNotice,
} from "../lib/commercial-trial.js";

type TrialInput = {
  facilityName: string;
  facilityType: CommercialFacilityType;
  approximateMembers?: number | null;
  trainerCount?: number | null;
  spaceCount?: number | null;
  usualCapacity?: number | null;
  classTypes?: string[];
  scheduleNotes?: string;
  locale?: "es" | "en" | "de" | "de-CH";
  currency?: string;
  usesBookings?: boolean;
  usesWaitlist?: boolean;
};

const conversionCategories = [
  "facility_configuration",
  "classes",
  "schedules",
  "real_members",
  "fictional_members",
  "real_trainers",
  "simulated_invoices",
  "legitimate_invoices",
  "booking_rules",
  "artificial_statistics",
] as const;
type ConversionCategory = (typeof conversionCategories)[number];
type ConversionOrigin = "demo_seed" | "user_created" | "imported" | "converted";
type ConversionDecision = "pending" | "keep" | "discard";
type ConversionDraftItem = {
  category: ConversionCategory;
  origin: ConversionOrigin;
  decision: ConversionDecision;
};

export type CommercialRequestInput = {
  name: string;
  facilityName: string;
  email: string;
  phone?: string | null;
  subject?: string;
  message: string;
  preferredChannel: "email" | "phone" | "whatsapp";
  preferredTime?: string;
  contactConsent: boolean;
  includeEnvironmentSummary?: boolean;
  problemCategory?: string | null;
};

function createConversionDraft(): ConversionDraftItem[] {
  return conversionCategories.map((category) => ({
    category,
    origin: "demo_seed",
    decision: "pending",
  }));
}

function domainError(message: string, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode });
}

function serializeTrial<T extends { classTypes: string }>(trial: T) {
  const publicTrial = { ...trial } as T & { conversionDraft?: string };
  delete publicTrial.conversionDraft;
  return {
    ...publicTrial,
    classTypes: JSON.parse(trial.classTypes) as string[],
    usesBookings: Boolean((trial as T & { usesBookings: number }).usesBookings),
    usesWaitlist: Boolean((trial as T & { usesWaitlist: number }).usesWaitlist),
    notice: getTrialNotice(
      (trial as T & { startedAt: number }).startedAt,
      (trial as T & { expiresAt: number }).expiresAt,
    ),
  };
}

async function recordEvent(
  trialId: string,
  actorUserId: string,
  type: string,
  metadata: Record<string, unknown> = {},
) {
  await db
    .insertInto("commercialTrialEvents")
    .values({
      id: randomUUID(),
      trialId,
      actorUserId,
      type,
      metadata: JSON.stringify(metadata),
      createdAt: Date.now(),
    })
    .execute();
}

async function expireIfNeeded() {
  const trial = await db
    .selectFrom("commercialTrials")
    .selectAll()
    .where("id", "=", COMMERCIAL_TRIAL_ID)
    .executeTakeFirst();
  if (trial?.status === "trial_active" && trial.expiresAt <= Date.now()) {
    await db
      .updateTable("commercialTrials")
      .set({ status: "trial_expired", updatedAt: Date.now() })
      .where("id", "=", trial.id)
      .execute();
    return { ...trial, status: "trial_expired" as const };
  }
  return trial;
}

async function count(
  table:
    "users" | "gymClasses" | "bookings" | "waitlistEntries" | "billingRecords",
) {
  const row = await db
    .selectFrom(table)
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function createEnvironmentSummary() {
  const [users, classes, bookings, waitlist, billingRecords] =
    await Promise.all([
      count("users"),
      count("gymClasses"),
      count("bookings"),
      count("waitlistEntries"),
      count("billingRecords"),
    ]);
  return { users, classes, bookings, waitlist, billingRecords };
}

async function insertCommercialRequest(
  actorUserId: string,
  kind: "commercial_contact" | "support" | "problem",
  input: CommercialRequestInput,
) {
  const trial = await expireIfNeeded();
  if (!trial) throw domainError("Commercial trial not found", 404);
  if (!input.contactConsent)
    throw domainError("Contact consent is required", 400);

  const id = `commercial-request-${randomUUID()}`;
  const now = Date.now();
  const environmentSummary = input.includeEnvironmentSummary
    ? JSON.stringify(await createEnvironmentSummary())
    : null;
  await db
    .insertInto("commercialRequests")
    .values({
      id,
      trialId: trial.id,
      requesterUserId: actorUserId,
      kind,
      status: "open",
      name: input.name,
      facilityName: input.facilityName,
      email: input.email,
      phone: input.phone ?? null,
      subject: input.subject ?? "",
      message: input.message,
      preferredChannel: input.preferredChannel,
      preferredTime: input.preferredTime ?? "",
      contactConsent: 1,
      includeEnvironmentSummary: input.includeEnvironmentSummary ? 1 : 0,
      environmentSummary,
      problemCategory: input.problemCategory ?? null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    })
    .execute();
  await recordEvent(trial.id, actorUserId, `${kind}_requested`, {
    requestId: id,
    preferredChannel: input.preferredChannel,
    environmentSummaryShared: Boolean(environmentSummary),
  });
  return { id, kind, status: "open" as const };
}

export async function getCommercialTrialOverview() {
  const trial = await expireIfNeeded();
  if (!trial) return null;
  const [users, classes, bookings, waitlist, billingRecords, events, requests] =
    await Promise.all([
      count("users"),
      count("gymClasses"),
      count("bookings"),
      count("waitlistEntries"),
      count("billingRecords"),
      db
        .selectFrom("commercialTrialEvents")
        .select(["id", "type", "metadata", "createdAt"])
        .where("trialId", "=", trial.id)
        .orderBy("createdAt", "desc")
        .limit(12)
        .execute(),
      db
        .selectFrom("commercialRequests")
        .select([
          "id",
          "kind",
          "status",
          "preferredChannel",
          "problemCategory",
          "createdAt",
          "resolvedAt",
        ])
        .where("trialId", "=", trial.id)
        .orderBy("createdAt", "desc")
        .limit(12)
        .execute(),
    ]);
  return {
    trial: serializeTrial(trial),
    environment: {
      isolation: "shared_local_demo" as const,
      counts: { users, classes, bookings, waitlist, billingRecords },
      modules: [
        "bookings",
        "waitlist",
        "billing",
        "analytics",
        "account_control",
        "security",
      ],
      restorationScope: "commercial_configuration_only" as const,
      operationsLocked: trial.status === "trial_paused_support",
    },
    events: events.map((event) => ({
      ...event,
      metadata: JSON.parse(event.metadata) as Record<string, unknown>,
    })),
    requests,
  };
}

export async function requestCommercialContact(
  actorUserId: string,
  input: CommercialRequestInput,
) {
  return insertCommercialRequest(actorUserId, "commercial_contact", input);
}

export async function createCommercialTrial(
  actorUserId: string,
  input: TrialInput,
) {
  if (await expireIfNeeded())
    throw domainError("A commercial trial already exists");
  const template = commercialTemplates[input.facilityType];
  const now = Date.now();
  const values = {
    id: COMMERCIAL_TRIAL_ID,
    ownerUserId: actorUserId,
    facilityName: input.facilityName,
    facilityType: input.facilityType,
    approximateMembers: input.approximateMembers ?? null,
    trainerCount: input.trainerCount ?? null,
    spaceCount: input.spaceCount ?? null,
    usualCapacity: input.usualCapacity ?? template.usualCapacity,
    classTypes: JSON.stringify(input.classTypes ?? template.classTypes),
    scheduleNotes: input.scheduleNotes ?? "",
    locale: input.locale ?? ("es" as const),
    currency: (input.currency ?? "EUR").toUpperCase(),
    usesBookings: input.usesBookings === false ? 0 : 1,
    usesWaitlist: (input.usesWaitlist ?? template.usesWaitlist) ? 1 : 0,
    templateKey: input.facilityType,
    status: "trial_active" as const,
    subdomain: createTrialSubdomain(input.facilityName),
    realDataDeclaration: "undeclared" as const,
    conversionDraft: "[]",
    startedAt: now,
    expiresAt: now + COMMERCIAL_TRIAL_MS,
    pausedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction().execute(async (trx) => {
    await trx.insertInto("commercialTrials").values(values).execute();
    await trx
      .updateTable("facilityProfiles")
      .set({ name: input.facilityName, updatedAt: now })
      .where("id", "=", "primary")
      .execute();
  });
  await recordEvent(values.id, actorUserId, "trial_created", {
    facilityType: input.facilityType,
  });
  return getCommercialTrialOverview();
}

export async function updateCommercialTrial(
  actorUserId: string,
  input: Partial<TrialInput>,
) {
  const trial = await expireIfNeeded();
  if (!trial) throw domainError("Commercial trial not found", 404);
  if (trial.status !== "trial_active")
    throw domainError("Only an active trial can be edited");
  const update = {
    ...(input.facilityName !== undefined
      ? { facilityName: input.facilityName }
      : {}),
    ...(input.facilityType !== undefined
      ? { facilityType: input.facilityType, templateKey: input.facilityType }
      : {}),
    ...(input.approximateMembers !== undefined
      ? { approximateMembers: input.approximateMembers }
      : {}),
    ...(input.trainerCount !== undefined
      ? { trainerCount: input.trainerCount }
      : {}),
    ...(input.spaceCount !== undefined ? { spaceCount: input.spaceCount } : {}),
    ...(input.usualCapacity !== undefined
      ? { usualCapacity: input.usualCapacity }
      : {}),
    ...(input.classTypes !== undefined
      ? { classTypes: JSON.stringify(input.classTypes) }
      : {}),
    ...(input.scheduleNotes !== undefined
      ? { scheduleNotes: input.scheduleNotes }
      : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.currency !== undefined
      ? { currency: input.currency.toUpperCase() }
      : {}),
    ...(input.usesBookings !== undefined
      ? { usesBookings: input.usesBookings ? 1 : 0 }
      : {}),
    ...(input.usesWaitlist !== undefined
      ? { usesWaitlist: input.usesWaitlist ? 1 : 0 }
      : {}),
    updatedAt: Date.now(),
  };
  await db
    .updateTable("commercialTrials")
    .set(update)
    .where("id", "=", trial.id)
    .execute();
  if (input.facilityName) {
    await db
      .updateTable("facilityProfiles")
      .set({ name: input.facilityName, updatedAt: Date.now() })
      .where("id", "=", "primary")
      .execute();
  }
  await recordEvent(trial.id, actorUserId, "trial_configuration_updated", {
    fields: Object.keys(input),
  });
  return getCommercialTrialOverview();
}

export async function restoreCommercialTrialConfiguration(actorUserId: string) {
  const trial = await expireIfNeeded();
  if (!trial) throw domainError("Commercial trial not found", 404);
  if (trial.status !== "trial_active")
    throw domainError("Only an active trial can be restored");
  const template = commercialTemplates[trial.facilityType];
  await db
    .updateTable("commercialTrials")
    .set({
      usualCapacity: template.usualCapacity,
      classTypes: JSON.stringify(template.classTypes),
      usesBookings: 1,
      usesWaitlist: template.usesWaitlist ? 1 : 0,
      scheduleNotes: "",
      updatedAt: Date.now(),
    })
    .where("id", "=", trial.id)
    .execute();
  await recordEvent(
    trial.id,
    actorUserId,
    "commercial_configuration_restored",
    {
      templateKey: trial.templateKey,
      scope: "commercial_configuration_only",
    },
  );
  return getCommercialTrialOverview();
}

export async function declareCommercialTrialData(
  actorUserId: string,
  decision: Exclude<RealDataDeclaration, "undeclared">,
) {
  const trial = await expireIfNeeded();
  if (!trial) throw domainError("Commercial trial not found", 404);
  if (trial.status !== "trial_active" && trial.status !== "trial_expired") {
    throw domainError("This trial cannot enter another data review");
  }
  const now = Date.now();
  const status =
    decision === "yes"
      ? ("trial_conversion_review" as const)
      : decision === "assistance"
        ? ("trial_paused_support" as const)
        : trial.status;
  await db
    .updateTable("commercialTrials")
    .set({
      realDataDeclaration: decision,
      conversionDraft:
        decision === "yes"
          ? JSON.stringify(createConversionDraft())
          : trial.conversionDraft,
      status,
      pausedAt: decision === "no" ? null : now,
      updatedAt: now,
    })
    .where("id", "=", trial.id)
    .execute();
  await recordEvent(trial.id, actorUserId, "real_data_declared", { decision });
  return getCommercialTrialOverview();
}

export async function getCommercialConversionDraft() {
  const trial = await expireIfNeeded();
  if (!trial) throw domainError("Commercial trial not found", 404);
  if (trial.realDataDeclaration !== "yes") {
    throw domainError("Real data must be declared before classification");
  }
  return {
    mode: "classification_only" as const,
    conversionExecuted: false,
    items: JSON.parse(trial.conversionDraft) as ConversionDraftItem[],
  };
}

export async function updateCommercialConversionDraft(
  actorUserId: string,
  category: ConversionCategory,
  origin: ConversionOrigin,
  decision: ConversionDecision,
) {
  const current = await getCommercialConversionDraft();
  const items = current.items.map((item) =>
    item.category === category ? { ...item, origin, decision } : item,
  );
  if (!current.items.some((item) => item.category === category)) {
    throw domainError("Conversion category not found", 404);
  }
  await db
    .updateTable("commercialTrials")
    .set({ conversionDraft: JSON.stringify(items), updatedAt: Date.now() })
    .where("id", "=", COMMERCIAL_TRIAL_ID)
    .execute();
  await recordEvent(
    COMMERCIAL_TRIAL_ID,
    actorUserId,
    "conversion_draft_updated",
    { category, origin, decision },
  );
  return { ...current, items };
}

export async function closeCommercialTrial(actorUserId: string) {
  const trial = await expireIfNeeded();
  if (!trial) throw domainError("Commercial trial not found", 404);
  if (trial.realDataDeclaration !== "no") {
    throw domainError(
      "Confirm that the environment contains no real data before closing it",
    );
  }
  const now = Date.now();
  await db
    .updateTable("commercialTrials")
    .set({ status: "trial_closed", closedAt: now, updatedAt: now })
    .where("id", "=", trial.id)
    .execute();
  await recordEvent(trial.id, actorUserId, "trial_closed");
  return getCommercialTrialOverview();
}
