import type { Pool, PoolClient } from "pg";

type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const postgresInitialSchema = String.raw`
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "phone" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "lastName" TEXT NOT NULL DEFAULT '',
  "countryCode" TEXT NOT NULL DEFAULT 'ES',
  "locale" TEXT NOT NULL DEFAULT 'es',
  "accountStatus" TEXT NOT NULL DEFAULT 'active' CHECK ("accountStatus" IN ('pending_verification', 'active', 'security_review')),
  "emailVerifiedAt" BIGINT,
  "termsVersion" TEXT NOT NULL DEFAULT 'draft-v1',
  "termsAcceptedAt" BIGINT,
  "privacyVersion" TEXT NOT NULL DEFAULT 'draft-v1',
  "privacyAcceptedAt" BIGINT,
  "avatarDataUrl" TEXT NOT NULL DEFAULT '',
  "password" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT 'member' CHECK ("role" IN ('member', 'trainer', 'admin')),
  "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 10080,
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_phone" ON "users" ("phone") WHERE "phone" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" ("role");

CREATE TABLE IF NOT EXISTS "accountSupportIdentifiers" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "publicId" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'revoked')),
  "rotationReason" TEXT CHECK ("rotationReason" IS NULL OR "rotationReason" IN ('account_recovery', 'security_incident', 'administrative_correction')),
  "createdAt" BIGINT NOT NULL,
  "revokedAt" BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_supportIdentifiers_active_user" ON "accountSupportIdentifiers" ("userId") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "idx_supportIdentifiers_publicId" ON "accountSupportIdentifiers" ("publicId");
CREATE INDEX IF NOT EXISTS "idx_supportIdentifiers_userId" ON "accountSupportIdentifiers" ("userId");

CREATE TABLE IF NOT EXISTS "emailVerificationChallenges" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "codeHash" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_emailVerificationChallenges_userId" ON "emailVerificationChallenges" ("userId");
CREATE INDEX IF NOT EXISTS "idx_emailVerificationChallenges_expiresAt" ON "emailVerificationChallenges" ("expiresAt");

CREATE TABLE IF NOT EXISTS "accountDeletionPreferences" (
  "userId" TEXT PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "inactivityMonths" INTEGER CHECK ("inactivityMonths" IS NULL OR "inactivityMonths" IN (6, 12, 18, 24, 36)),
  "lastMeaningfulActivityAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "accountDeletionRequests" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "trigger" TEXT NOT NULL CHECK ("trigger" IN ('manual', 'inactivity')),
  "status" TEXT NOT NULL CHECK ("status" IN ('scheduled', 'cancelled', 'processing', 'completed')),
  "requestedAt" BIGINT NOT NULL,
  "graceEndsAt" BIGINT NOT NULL,
  "cancelledAt" BIGINT,
  "completedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_deletionRequests_userId" ON "accountDeletionRequests" ("userId");
CREATE INDEX IF NOT EXISTS "idx_deletionRequests_status_grace" ON "accountDeletionRequests" ("status", "graceEndsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_deletionRequests_scheduled_user" ON "accountDeletionRequests" ("userId") WHERE "status" = 'scheduled';

CREATE TABLE IF NOT EXISTS "accountDeletionJobs" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE REFERENCES "accountDeletionRequests" ("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'planned' CHECK ("status" IN ('planned', 'blocked_retention_review', 'cancelled', 'completed')),
  "executionEnabled" SMALLINT NOT NULL DEFAULT 0 CHECK ("executionEnabled" IN (0, 1)),
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  "completedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_accountDeletionJobs_user_status" ON "accountDeletionJobs" ("userId", "status");

CREATE TABLE IF NOT EXISTS "accountDataDeletionDrafts" (
  "userId" TEXT PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "selectedCategories" TEXT NOT NULL DEFAULT '[]',
  "intent" TEXT NOT NULL CHECK ("intent" IN ('selected_data', 'account_closure')),
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "accountRepresentatives" (
  "id" TEXT PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "representativeUserId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "reason" TEXT NOT NULL CHECK ("reason" IN ('hospitalization', 'temporary_incapacity', 'permanent_incapacity', 'death_contingency', 'other')),
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'pending_review', 'approved', 'revoked', 'expired')),
  "startsAt" BIGINT NOT NULL,
  "expiresAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  "revokedAt" BIGINT,
  CHECK ("ownerUserId" <> "representativeUserId")
);
CREATE INDEX IF NOT EXISTS "idx_accountRepresentatives_owner" ON "accountRepresentatives" ("ownerUserId", "status");
CREATE INDEX IF NOT EXISTS "idx_accountRepresentatives_representative" ON "accountRepresentatives" ("representativeUserId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_accountRepresentatives_open_pair" ON "accountRepresentatives" ("ownerUserId", "representativeUserId") WHERE "status" IN ('draft', 'pending_review', 'approved');

CREATE TABLE IF NOT EXISTS "dataRetentionPolicies" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "dataCategory" TEXT NOT NULL,
  "retentionDays" INTEGER CHECK ("retentionDays" IS NULL OR "retentionDays" > 0),
  "legalBasisReference" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'active', 'retired')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "reviewedAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_retentionPolicies_jurisdiction" ON "dataRetentionPolicies" ("jurisdiction");
CREATE INDEX IF NOT EXISTS "idx_retentionPolicies_status" ON "dataRetentionPolicies" ("status");

CREATE TABLE IF NOT EXISTS "dataRetentionRecords" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "users" ("id") ON DELETE SET NULL,
  "policyId" TEXT NOT NULL REFERENCES "dataRetentionPolicies" ("id"),
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'retained' CHECK ("status" IN ('retained', 'legal_hold', 'scheduled_deletion', 'released')),
  "retainUntil" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  "releasedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_retentionRecords_userId" ON "dataRetentionRecords" ("userId");
CREATE INDEX IF NOT EXISTS "idx_retentionRecords_status_until" ON "dataRetentionRecords" ("status", "retainUntil");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_retentionRecords_source" ON "dataRetentionRecords" ("sourceType", "sourceId");

CREATE TABLE IF NOT EXISTS "gymClasses" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "trainerId" TEXT NOT NULL,
  "trainerName" TEXT NOT NULL,
  "maxCapacity" INTEGER NOT NULL,
  "scheduledAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_gymClasses_scheduledAt" ON "gymClasses" ("scheduledAt");

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" TEXT PRIMARY KEY,
  "classId" TEXT NOT NULL REFERENCES "gymClasses" ("id"),
  "userId" TEXT NOT NULL REFERENCES "users" ("id"),
  "status" TEXT NOT NULL CHECK ("status" IN ('confirmed', 'cancelled', 'waitlist')),
  "createdAt" BIGINT NOT NULL,
  "cancelledAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_bookings_classId" ON "bookings" ("classId");
CREATE INDEX IF NOT EXISTS "idx_bookings_userId" ON "bookings" ("userId");
CREATE INDEX IF NOT EXISTS "idx_bookings_status" ON "bookings" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookings_active_user_class" ON "bookings" ("classId", "userId") WHERE "status" IN ('confirmed', 'waitlist');

CREATE TABLE IF NOT EXISTS "waitlistEntries" (
  "id" TEXT PRIMARY KEY,
  "classId" TEXT NOT NULL REFERENCES "gymClasses" ("id"),
  "userId" TEXT NOT NULL REFERENCES "users" ("id"),
  "position" INTEGER NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "promotedAt" BIGINT,
  UNIQUE ("classId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_waitlistEntries_classId" ON "waitlistEntries" ("classId");
CREATE INDEX IF NOT EXISTS "idx_waitlistEntries_userId" ON "waitlistEntries" ("userId");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "createdAt" BIGINT NOT NULL,
  "lastSeenAt" BIGINT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  "revokedAt" BIGINT,
  "userAgent" TEXT NOT NULL DEFAULT '',
  "remembered" SMALLINT NOT NULL DEFAULT 0 CHECK ("remembered" IN (0, 1)),
  "formVerifiedAt" BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "idx_sessions_userId" ON "sessions" ("userId");
CREATE INDEX IF NOT EXISTS "idx_sessions_expiresAt" ON "sessions" ("expiresAt");

CREATE TABLE IF NOT EXISTS "mfaCredentials" (
  "userId" TEXT PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "secretEncrypted" TEXT NOT NULL,
  "recoveryCodeHashes" TEXT NOT NULL DEFAULT '[]',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  "enabledAt" BIGINT
);

CREATE TABLE IF NOT EXISTS "authChallenges" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "createdAt" BIGINT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" BIGINT,
  "rememberDevice" SMALLINT NOT NULL DEFAULT 0 CHECK ("rememberDevice" IN (0, 1))
);
CREATE INDEX IF NOT EXISTS "idx_authChallenges_userId" ON "authChallenges" ("userId");
CREATE INDEX IF NOT EXISTS "idx_authChallenges_expiresAt" ON "authChallenges" ("expiresAt");

CREATE TABLE IF NOT EXISTS "passkeyCredentials" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "publicKey" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT NOT NULL DEFAULT '[]',
  "deviceType" TEXT NOT NULL,
  "backedUp" SMALLINT NOT NULL DEFAULT 0 CHECK ("backedUp" IN (0, 1)),
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_passkeyCredentials_userId" ON "passkeyCredentials" ("userId");

CREATE TABLE IF NOT EXISTS "webauthnChallenges" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "challenge" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('registration', 'authentication')),
  "rememberDevice" SMALLINT NOT NULL DEFAULT 0 CHECK ("rememberDevice" IN (0, 1)),
  "createdAt" BIGINT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  "consumedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_webauthnChallenges_userId" ON "webauthnChallenges" ("userId");
CREATE INDEX IF NOT EXISTS "idx_webauthnChallenges_expiresAt" ON "webauthnChallenges" ("expiresAt");

CREATE TABLE IF NOT EXISTS "securityEvents" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "users" ("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS "idx_securityEvents_userId" ON "securityEvents" ("userId");
CREATE INDEX IF NOT EXISTS "idx_securityEvents_createdAt" ON "securityEvents" ("createdAt");

CREATE TABLE IF NOT EXISTS "feedback" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "users" ("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL CHECK ("category" IN ('suggestion', 'problem', 'accessibility', 'other')),
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new' CHECK ("status" IN ('new', 'reviewed', 'closed')),
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_feedback_userId" ON "feedback" ("userId");
CREATE INDEX IF NOT EXISTS "idx_feedback_createdAt" ON "feedback" ("createdAt");

CREATE TABLE IF NOT EXISTS "billingRecords" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "users" ("id") ON DELETE SET NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL DEFAULT '',
  "concept" TEXT NOT NULL,
  "billingCycle" TEXT NOT NULL CHECK ("billingCycle" IN ('monthly', 'quarterly', 'semiannual', 'annual', 'trial_day', 'custom')),
  "customCycleLabel" TEXT NOT NULL DEFAULT '',
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "status" TEXT NOT NULL CHECK ("status" IN ('paid', 'unpaid', 'pending')),
  "dueAt" BIGINT,
  "paidAt" BIGINT,
  "invoiceNumber" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "archivedAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_billingRecords_userId" ON "billingRecords" ("userId");
CREATE INDEX IF NOT EXISTS "idx_billingRecords_status" ON "billingRecords" ("status");
CREATE INDEX IF NOT EXISTS "idx_billingRecords_dueAt" ON "billingRecords" ("dueAt");
CREATE INDEX IF NOT EXISTS "idx_billingRecords_archivedAt" ON "billingRecords" ("archivedAt");

CREATE TABLE IF NOT EXISTS "facilityProfiles" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "logoDataUrl" TEXT NOT NULL DEFAULT '',
  "accentColor" TEXT NOT NULL DEFAULT '#2563eb',
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "commercialTrials" (
  "id" TEXT PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "facilityName" TEXT NOT NULL,
  "facilityType" TEXT NOT NULL CHECK ("facilityType" IN ('traditional_gym', 'crossfit', 'hyrox', 'functional_training', 'personal_training', 'powerlifting', 'strongman', 'bodybuilding', 'martial_arts', 'yoga', 'pilates', 'indoor_cycling', 'multidisciplinary', 'custom')),
  "approximateMembers" INTEGER,
  "trainerCount" INTEGER,
  "spaceCount" INTEGER,
  "usualCapacity" INTEGER,
  "classTypes" TEXT NOT NULL DEFAULT '[]',
  "scheduleNotes" TEXT NOT NULL DEFAULT '',
  "locale" TEXT NOT NULL CHECK ("locale" IN ('es', 'en', 'de', 'de-CH')),
  "currency" TEXT NOT NULL,
  "usesBookings" SMALLINT NOT NULL DEFAULT 1 CHECK ("usesBookings" IN (0, 1)),
  "usesWaitlist" SMALLINT NOT NULL DEFAULT 1 CHECK ("usesWaitlist" IN (0, 1)),
  "templateKey" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('trial_active', 'trial_paused_support', 'trial_conversion_review', 'trial_expired', 'trial_closed')),
  "subdomain" TEXT NOT NULL,
  "realDataDeclaration" TEXT NOT NULL DEFAULT 'undeclared' CHECK ("realDataDeclaration" IN ('undeclared', 'yes', 'no', 'assistance')),
  "conversionDraft" TEXT NOT NULL DEFAULT '[]',
  "startedAt" BIGINT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  "pausedAt" BIGINT,
  "closedAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_commercialTrials_status" ON "commercialTrials" ("status");
CREATE INDEX IF NOT EXISTS "idx_commercialTrials_expiry" ON "commercialTrials" ("expiresAt");

CREATE TABLE IF NOT EXISTS "commercialTrialEvents" (
  "id" TEXT PRIMARY KEY,
  "trialId" TEXT NOT NULL REFERENCES "commercialTrials" ("id") ON DELETE CASCADE,
  "actorUserId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "type" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_commercialTrialEvents_trial" ON "commercialTrialEvents" ("trialId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "delegationGrants" (
  "id" TEXT PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "delegateUserId" TEXT REFERENCES "users" ("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "tokenPreview" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'bookings' CHECK ("scope" = 'bookings'),
  "duration" TEXT NOT NULL CHECK ("duration" IN ('24h', '7d', '30d', 'indefinite')),
  "expiresAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "redeemedAt" BIGINT,
  "revokedAt" BIGINT,
  "ownerHiddenAt" BIGINT,
  "delegateHiddenAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_delegationGrants_owner" ON "delegationGrants" ("ownerUserId");
CREATE INDEX IF NOT EXISTS "idx_delegationGrants_delegate" ON "delegationGrants" ("delegateUserId");
CREATE INDEX IF NOT EXISTS "idx_delegationGrants_expiry" ON "delegationGrants" ("expiresAt");

INSERT INTO "facilityProfiles" ("id", "name", "logoDataUrl", "accentColor", "updatedAt")
VALUES ('primary', 'Centro Umbravia Forge', '', '#2563eb', 0)
ON CONFLICT ("id") DO NOTHING;
`;

const migrations: Migration[] = [
  { version: 1, name: "initial-production-schema", sql: postgresInitialSchema },
  {
    version: 2,
    name: "commercial-workflow-and-booking-lifecycle",
    sql: String.raw`
CREATE TABLE IF NOT EXISTS "classBookingConfigurations" (
  "classId" TEXT PRIMARY KEY REFERENCES "gymClasses" ("id") ON DELETE CASCADE,
  "configuration" TEXT NOT NULL DEFAULT '{}',
  "lifecycleState" TEXT NOT NULL DEFAULT 'active' CHECK ("lifecycleState" IN ('active', 'suspended', 'cancelled')),
  "seriesId" TEXT,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_classBookingConfigurations_series"
  ON "classBookingConfigurations" ("seriesId");

CREATE TABLE IF NOT EXISTS "bookingLifecycles" (
  "bookingId" TEXT PRIMARY KEY REFERENCES "bookings" ("id") ON DELETE CASCADE,
  "lifecycleStatus" TEXT NOT NULL,
  "attendanceIntention" TEXT NOT NULL DEFAULT 'unanswered',
  "intentionUpdatedAt" BIGINT,
  "confirmedAt" BIGINT,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_bookingLifecycles_status"
  ON "bookingLifecycles" ("lifecycleStatus", "attendanceIntention");

CREATE TABLE IF NOT EXISTS "commercialRequests" (
  "id" TEXT PRIMARY KEY,
  "trialId" TEXT NOT NULL REFERENCES "commercialTrials" ("id") ON DELETE CASCADE,
  "requesterUserId" TEXT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('commercial_contact', 'support', 'problem')),
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'in_review', 'resolved', 'cancelled')),
  "name" TEXT NOT NULL,
  "facilityName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "preferredChannel" TEXT NOT NULL CHECK ("preferredChannel" IN ('email', 'phone', 'whatsapp')),
  "preferredTime" TEXT NOT NULL DEFAULT '',
  "contactConsent" SMALLINT NOT NULL CHECK ("contactConsent" IN (0, 1)),
  "includeEnvironmentSummary" SMALLINT NOT NULL DEFAULT 0 CHECK ("includeEnvironmentSummary" IN (0, 1)),
  "environmentSummary" TEXT,
  "problemCategory" TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  "resolvedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS "idx_commercialRequests_trial"
  ON "commercialRequests" ("trialId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_commercialRequests_status"
  ON "commercialRequests" ("status", "kind");
`,
  },
];

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "schemaMigrations" (
      "version" INTEGER PRIMARY KEY,
      "name" TEXT NOT NULL,
      "appliedAt" BIGINT NOT NULL
    )
  `);
}

export async function runPostgresMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [1_480_977_583]);
    await ensureMigrationTable(client);
    const applied = await client.query<{ version: number }>(
      'SELECT "version" FROM "schemaMigrations"',
    );
    const versions = new Set(applied.rows.map((row) => row.version));

    for (const migration of migrations) {
      if (versions.has(migration.version)) continue;
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO "schemaMigrations" ("version", "name", "appliedAt") VALUES ($1, $2, $3)',
        [migration.version, migration.name, Date.now()],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function postgresMigrationVersions(): number[] {
  return migrations.map((migration) => migration.version);
}

export function postgresMigrationSql(): string[] {
  return migrations.map((migration) => migration.sql);
}
