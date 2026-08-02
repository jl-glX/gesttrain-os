import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { Database as DatabaseSchema } from "./types.js";
import { generateSupportId } from "../lib/support-id.js";

const dataDirectory =
  process.env.DATA_DIRECTORY ?? path.join(process.cwd(), "data");

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

const databasePath = path.join(dataDirectory, "database.sqlite");
const sqliteDb = new Database(databasePath);
sqliteDb.pragma("foreign_keys = ON");
sqliteDb.pragma("journal_mode = WAL");
sqliteDb.pragma("busy_timeout = 5000");

export const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({ database: sqliteDb }),
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

function reconcileDuplicateBookings(): number {
  return sqliteDb
    .prepare(
      `WITH ranked AS (
         SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY classId, userId
             ORDER BY
               CASE status WHEN 'confirmed' THEN 0 ELSE 1 END,
               createdAt ASC,
               id ASC
           ) AS activeRank
         FROM bookings
         WHERE status IN ('confirmed', 'waitlist')
       )
       UPDATE bookings
       SET status = 'cancelled',
           cancelledAt = COALESCE(cancelledAt, ?)
       WHERE id IN (SELECT id FROM ranked WHERE activeRank > 1)`,
    )
    .run(Date.now()).changes;
}

function removeStaleWaitlistEntries(): number {
  return sqliteDb
    .prepare(
      `DELETE FROM waitlistEntries
       WHERE promotedAt IS NULL
         AND EXISTS (
           SELECT 1 FROM bookings
           WHERE bookings.classId = waitlistEntries.classId
             AND bookings.userId = waitlistEntries.userId
             AND bookings.status = 'confirmed'
         )`,
    )
    .run().changes;
}

export function reconcileBookingIntegrity(): {
  duplicateBookings: number;
  staleWaitlistEntries: number;
} {
  return {
    duplicateBookings: reconcileDuplicateBookings(),
    staleWaitlistEntries: removeStaleWaitlistEntries(),
  };
}

export async function initializeDatabase() {
  console.log("Initializing database...");

  const tables = sqliteDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as Array<{ name: string }>;

  const tableNames = tables.map((t) => t.name);

  if (!tableNames.includes("users")) {
    console.log("Creating users table...");
    sqliteDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        phone TEXT UNIQUE,
        name TEXT NOT NULL,
        lastName TEXT NOT NULL DEFAULT '',
        countryCode TEXT NOT NULL DEFAULT 'ES',
        locale TEXT NOT NULL DEFAULT 'es',
        accountStatus TEXT NOT NULL DEFAULT 'active' CHECK(accountStatus IN ('pending_verification', 'active', 'security_review')),
        emailVerifiedAt INTEGER,
        termsVersion TEXT NOT NULL DEFAULT 'draft-v1',
        termsAcceptedAt INTEGER,
        privacyVersion TEXT NOT NULL DEFAULT 'draft-v1',
        privacyAcceptedAt INTEGER,
        avatarDataUrl TEXT NOT NULL DEFAULT '',
        password TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'member',
        sessionIdleTimeoutMinutes INTEGER NOT NULL DEFAULT 10080,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX idx_users_email ON users(email);
      CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
      CREATE INDEX idx_users_role ON users(role);
    `);
  } else {
    // Check if password and role columns exist, add them if they don't
    const userColumns = sqliteDb
      .prepare("PRAGMA table_info(users)")
      .all() as Array<{ name: string }>;

    const columnNames = userColumns.map((c) => c.name);

    if (!columnNames.includes("password")) {
      console.log("Adding password column to users table...");
      sqliteDb.exec(
        "ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT ''",
      );
    }

    if (!columnNames.includes("role")) {
      console.log("Adding role column to users table...");
      sqliteDb.exec(
        "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'",
      );

      // Create index if it doesn't exist
      const indexes = sqliteDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users'",
        )
        .all() as Array<{ name: string }>;

      if (!indexes.some((idx) => idx.name === "idx_users_role")) {
        sqliteDb.exec("CREATE INDEX idx_users_role ON users(role)");
      }
    }

    if (!columnNames.includes("phone")) {
      console.log("Adding phone column to users table...");
      sqliteDb.exec("ALTER TABLE users ADD COLUMN phone TEXT");
    }

    if (!columnNames.includes("avatarDataUrl")) {
      console.log("Adding avatar column to users table...");
      sqliteDb.exec(
        "ALTER TABLE users ADD COLUMN avatarDataUrl TEXT NOT NULL DEFAULT ''",
      );
    }

    if (!columnNames.includes("sessionIdleTimeoutMinutes")) {
      console.log("Adding session inactivity preference to users table...");
      sqliteDb.exec(
        "ALTER TABLE users ADD COLUMN sessionIdleTimeoutMinutes INTEGER NOT NULL DEFAULT 10080",
      );
    }

    const accountIdentityColumns: Array<[string, string]> = [
      ["lastName", "TEXT NOT NULL DEFAULT ''"],
      ["countryCode", "TEXT NOT NULL DEFAULT 'ES'"],
      ["locale", "TEXT NOT NULL DEFAULT 'es'"],
      ["accountStatus", "TEXT NOT NULL DEFAULT 'active'"],
      ["emailVerifiedAt", "INTEGER"],
      ["termsVersion", "TEXT NOT NULL DEFAULT 'draft-v1'"],
      ["termsAcceptedAt", "INTEGER"],
      ["privacyVersion", "TEXT NOT NULL DEFAULT 'draft-v1'"],
      ["privacyAcceptedAt", "INTEGER"],
    ];
    for (const [column, definition] of accountIdentityColumns) {
      if (!columnNames.includes(column)) {
        sqliteDb.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
      }
    }

    const indexes = sqliteDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users'",
      )
      .all() as Array<{ name: string }>;
    if (!indexes.some((idx) => idx.name === "idx_users_phone")) {
      sqliteDb.exec(
        "CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL",
      );
    }
  }

  if (!tableNames.includes("accountSupportIdentifiers")) {
    console.log("Creating account support identifiers table...");
    sqliteDb.exec(`
      CREATE TABLE accountSupportIdentifiers (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        publicId TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
        rotationReason TEXT CHECK(rotationReason IS NULL OR rotationReason IN ('account_recovery', 'security_incident', 'administrative_correction')),
        createdAt INTEGER NOT NULL,
        revokedAt INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX idx_supportIdentifiers_active_user
        ON accountSupportIdentifiers(userId)
        WHERE status = 'active';
      CREATE INDEX idx_supportIdentifiers_publicId
        ON accountSupportIdentifiers(publicId);
      CREATE INDEX idx_supportIdentifiers_userId
        ON accountSupportIdentifiers(userId);
    `);
  }

  if (!tableNames.includes("emailVerificationChallenges")) {
    console.log("Creating email verification challenges table...");
    sqliteDb.exec(`
      CREATE TABLE emailVerificationChallenges (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        codeHash TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        consumedAt INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_emailVerificationChallenges_userId
        ON emailVerificationChallenges(userId);
      CREATE INDEX idx_emailVerificationChallenges_expiresAt
        ON emailVerificationChallenges(expiresAt);
    `);
  } else {
    const emailChallengeColumns = sqliteDb
      .prepare("PRAGMA table_info(emailVerificationChallenges)")
      .all() as Array<{ name: string }>;
    if (!emailChallengeColumns.some((column) => column.name === "codeHash")) {
      sqliteDb.exec(
        "ALTER TABLE emailVerificationChallenges ADD COLUMN codeHash TEXT NOT NULL DEFAULT ''",
      );
    }
  }

  const usersWithoutSupportId = sqliteDb
    .prepare(
      `SELECT users.id
       FROM users
       LEFT JOIN accountSupportIdentifiers identifiers
         ON identifiers.userId = users.id AND identifiers.status = 'active'
       WHERE identifiers.id IS NULL`,
    )
    .all() as Array<{ id: string }>;
  const insertSupportId = sqliteDb.prepare(
    `INSERT INTO accountSupportIdentifiers
     (id, userId, publicId, status, rotationReason, createdAt, revokedAt)
     VALUES (?, ?, ?, 'active', NULL, ?, NULL)`,
  );

  for (const user of usersWithoutSupportId) {
    let inserted = false;
    while (!inserted) {
      const publicId = generateSupportId();
      try {
        insertSupportId.run(
          `support-${randomUUID()}`,
          user.id,
          publicId,
          Date.now(),
        );
        inserted = true;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("UNIQUE constraint failed")
        ) {
          throw error;
        }
      }
    }
  }

  if (!tableNames.includes("accountDeletionPreferences")) {
    console.log("Creating account deletion preferences table...");
    sqliteDb.exec(`
      CREATE TABLE accountDeletionPreferences (
        userId TEXT PRIMARY KEY,
        inactivityMonths INTEGER CHECK(inactivityMonths IS NULL OR inactivityMonths IN (6, 12, 18, 24, 36)),
        lastMeaningfulActivityAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  if (!tableNames.includes("accountDeletionRequests")) {
    console.log("Creating account deletion requests table...");
    sqliteDb.exec(`
      CREATE TABLE accountDeletionRequests (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        trigger TEXT NOT NULL CHECK(trigger IN ('manual', 'inactivity')),
        status TEXT NOT NULL CHECK(status IN ('scheduled', 'cancelled', 'processing', 'completed')),
        requestedAt INTEGER NOT NULL,
        graceEndsAt INTEGER NOT NULL,
        cancelledAt INTEGER,
        completedAt INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_deletionRequests_userId ON accountDeletionRequests(userId);
      CREATE INDEX idx_deletionRequests_status_grace
        ON accountDeletionRequests(status, graceEndsAt);
      CREATE UNIQUE INDEX idx_deletionRequests_scheduled_user
        ON accountDeletionRequests(userId)
        WHERE status = 'scheduled';
    `);
  }

  if (!tableNames.includes("accountDataDeletionDrafts")) {
    console.log("Creating account data deletion drafts table...");
    sqliteDb.exec(`
      CREATE TABLE accountDataDeletionDrafts (
        userId TEXT PRIMARY KEY,
        selectedCategories TEXT NOT NULL DEFAULT '[]',
        intent TEXT NOT NULL CHECK(intent IN ('selected_data', 'account_closure')),
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  if (!tableNames.includes("accountDeletionJobs")) {
    console.log("Creating account deletion jobs table...");
    sqliteDb.exec(`
      CREATE TABLE accountDeletionJobs (
        id TEXT PRIMARY KEY,
        requestId TEXT NOT NULL UNIQUE,
        userId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'blocked_retention_review', 'cancelled', 'completed')),
        executionEnabled INTEGER NOT NULL DEFAULT 0 CHECK(executionEnabled IN (0, 1)),
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        completedAt INTEGER,
        FOREIGN KEY(requestId) REFERENCES accountDeletionRequests(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_accountDeletionJobs_user_status
        ON accountDeletionJobs(userId, status);
    `);
  }

  if (!tableNames.includes("accountRepresentatives")) {
    console.log("Creating account representatives table...");
    sqliteDb.exec(`
      CREATE TABLE accountRepresentatives (
        id TEXT PRIMARY KEY,
        ownerUserId TEXT NOT NULL,
        representativeUserId TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT '[]',
        reason TEXT NOT NULL CHECK(reason IN ('hospitalization', 'temporary_incapacity', 'permanent_incapacity', 'death_contingency', 'other')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'approved', 'revoked', 'expired')),
        startsAt INTEGER NOT NULL,
        expiresAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        revokedAt INTEGER,
        FOREIGN KEY(ownerUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(representativeUserId) REFERENCES users(id) ON DELETE CASCADE,
        CHECK(ownerUserId <> representativeUserId)
      );
      CREATE INDEX idx_accountRepresentatives_owner
        ON accountRepresentatives(ownerUserId, status);
      CREATE INDEX idx_accountRepresentatives_representative
        ON accountRepresentatives(representativeUserId, status);
      CREATE UNIQUE INDEX idx_accountRepresentatives_open_pair
        ON accountRepresentatives(ownerUserId, representativeUserId)
        WHERE status IN ('draft', 'pending_review', 'approved');
    `);
  }

  if (!tableNames.includes("dataRetentionPolicies")) {
    console.log("Creating data retention policies table...");
    sqliteDb.exec(`
      CREATE TABLE dataRetentionPolicies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        jurisdiction TEXT NOT NULL,
        dataCategory TEXT NOT NULL,
        retentionDays INTEGER CHECK(retentionDays IS NULL OR retentionDays > 0),
        legalBasisReference TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'retired')),
        version INTEGER NOT NULL DEFAULT 1,
        reviewedAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX idx_retentionPolicies_status
        ON dataRetentionPolicies(status);
      CREATE INDEX idx_retentionPolicies_jurisdiction
        ON dataRetentionPolicies(jurisdiction);
    `);
  }

  if (!tableNames.includes("dataRetentionRecords")) {
    console.log("Creating data retention records table...");
    sqliteDb.exec(`
      CREATE TABLE dataRetentionRecords (
        id TEXT PRIMARY KEY,
        userId TEXT,
        policyId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'retained' CHECK(status IN ('retained', 'legal_hold', 'scheduled_deletion', 'released')),
        retainUntil INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        releasedAt INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(policyId) REFERENCES dataRetentionPolicies(id)
      );
      CREATE UNIQUE INDEX idx_retentionRecords_source
        ON dataRetentionRecords(sourceType, sourceId);
      CREATE INDEX idx_retentionRecords_status_until
        ON dataRetentionRecords(status, retainUntil);
      CREATE INDEX idx_retentionRecords_userId
        ON dataRetentionRecords(userId);
    `);
  }

  if (!tableNames.includes("gymClasses")) {
    console.log("Creating gymClasses table...");
    sqliteDb.exec(`
      CREATE TABLE gymClasses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        trainerId TEXT NOT NULL,
        trainerName TEXT NOT NULL,
        maxCapacity INTEGER NOT NULL,
        scheduledAt INTEGER NOT NULL
      );
      CREATE INDEX idx_gymClasses_scheduledAt ON gymClasses(scheduledAt);
    `);
  }

  if (!tableNames.includes("bookings")) {
    console.log("Creating bookings table...");
    sqliteDb.exec(`
      CREATE TABLE bookings (
        id TEXT PRIMARY KEY,
        classId TEXT NOT NULL,
        userId TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled', 'waitlist')),
        createdAt INTEGER NOT NULL,
        cancelledAt INTEGER,
        FOREIGN KEY(classId) REFERENCES gymClasses(id),
        FOREIGN KEY(userId) REFERENCES users(id)
      );
      CREATE INDEX idx_bookings_classId ON bookings(classId);
      CREATE INDEX idx_bookings_userId ON bookings(userId);
      CREATE INDEX idx_bookings_status ON bookings(status);
      CREATE UNIQUE INDEX idx_bookings_active_user_class
        ON bookings(classId, userId)
        WHERE status IN ('confirmed', 'waitlist');
    `);
  } else {
    const duplicateBookings = reconcileDuplicateBookings();
    if (duplicateBookings > 0) {
      console.warn(
        `Reconciled ${duplicateBookings} duplicate active booking(s).`,
      );
    }
    sqliteDb.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_user_class
        ON bookings(classId, userId)
        WHERE status IN ('confirmed', 'waitlist');
    `);
  }

  if (!tableNames.includes("waitlistEntries")) {
    console.log("Creating waitlistEntries table...");
    sqliteDb.exec(`
      CREATE TABLE waitlistEntries (
        id TEXT PRIMARY KEY,
        classId TEXT NOT NULL,
        userId TEXT NOT NULL,
        position INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        promotedAt INTEGER,
        FOREIGN KEY(classId) REFERENCES gymClasses(id),
        FOREIGN KEY(userId) REFERENCES users(id),
        UNIQUE(classId, userId)
      );
      CREATE INDEX idx_waitlistEntries_classId ON waitlistEntries(classId);
      CREATE INDEX idx_waitlistEntries_userId ON waitlistEntries(userId);
    `);
  }

  const staleWaitlistEntries = removeStaleWaitlistEntries();
  if (staleWaitlistEntries > 0) {
    console.warn(
      `Removed ${staleWaitlistEntries} stale waitlist entr${
        staleWaitlistEntries === 1 ? "y" : "ies"
      } after reconciling active bookings.`,
    );
  }

  if (!tableNames.includes("sessions")) {
    console.log("Creating sessions table...");
    sqliteDb.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        lastSeenAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        revokedAt INTEGER,
        userAgent TEXT NOT NULL DEFAULT '',
        remembered INTEGER NOT NULL DEFAULT 0,
        formVerifiedAt INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_sessions_userId ON sessions(userId);
      CREATE INDEX idx_sessions_expiresAt ON sessions(expiresAt);
    `);
  } else {
    const sessionColumns = sqliteDb
      .prepare("PRAGMA table_info(sessions)")
      .all() as Array<{ name: string }>;
    const sessionColumnNames = sessionColumns.map((column) => column.name);

    if (!sessionColumnNames.includes("lastSeenAt")) {
      sqliteDb.exec(
        "ALTER TABLE sessions ADD COLUMN lastSeenAt INTEGER NOT NULL DEFAULT 0",
      );
      sqliteDb.exec(
        "UPDATE sessions SET lastSeenAt = createdAt WHERE lastSeenAt = 0",
      );
    }

    if (!sessionColumnNames.includes("userAgent")) {
      sqliteDb.exec(
        "ALTER TABLE sessions ADD COLUMN userAgent TEXT NOT NULL DEFAULT ''",
      );
    }

    if (!sessionColumnNames.includes("remembered")) {
      sqliteDb.exec(
        "ALTER TABLE sessions ADD COLUMN remembered INTEGER NOT NULL DEFAULT 0",
      );
    }

    if (!sessionColumnNames.includes("formVerifiedAt")) {
      sqliteDb.exec(
        "ALTER TABLE sessions ADD COLUMN formVerifiedAt INTEGER NOT NULL DEFAULT 0",
      );
    }
  }

  if (!tableNames.includes("mfaCredentials")) {
    sqliteDb.exec(`
      CREATE TABLE mfaCredentials (
        userId TEXT PRIMARY KEY,
        secretEncrypted TEXT NOT NULL,
        recoveryCodeHashes TEXT NOT NULL DEFAULT '[]',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        enabledAt INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  if (!tableNames.includes("authChallenges")) {
    sqliteDb.exec(`
      CREATE TABLE authChallenges (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        consumedAt INTEGER,
        rememberDevice INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_authChallenges_userId ON authChallenges(userId);
      CREATE INDEX idx_authChallenges_expiresAt ON authChallenges(expiresAt);
    `);
  } else {
    const challengeColumns = sqliteDb
      .prepare("PRAGMA table_info(authChallenges)")
      .all() as Array<{ name: string }>;
    if (!challengeColumns.some((column) => column.name === "rememberDevice")) {
      sqliteDb.exec(
        "ALTER TABLE authChallenges ADD COLUMN rememberDevice INTEGER NOT NULL DEFAULT 0",
      );
    }
  }

  if (!tableNames.includes("securityEvents")) {
    sqliteDb.exec(`
      CREATE TABLE securityEvents (
        id TEXT PRIMARY KEY,
        userId TEXT,
        type TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_securityEvents_userId ON securityEvents(userId);
      CREATE INDEX idx_securityEvents_createdAt ON securityEvents(createdAt);
    `);
  }

  if (!tableNames.includes("passkeyCredentials")) {
    sqliteDb.exec(`
      CREATE TABLE passkeyCredentials (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        publicKey TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT NOT NULL DEFAULT '[]',
        deviceType TEXT NOT NULL,
        backedUp INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_passkeyCredentials_userId ON passkeyCredentials(userId);
    `);
  }

  if (!tableNames.includes("webauthnChallenges")) {
    sqliteDb.exec(`
      CREATE TABLE webauthnChallenges (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        challenge TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('registration', 'authentication')),
        rememberDevice INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        consumedAt INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_webauthnChallenges_userId ON webauthnChallenges(userId);
      CREATE INDEX idx_webauthnChallenges_expiresAt ON webauthnChallenges(expiresAt);
    `);
  }

  if (!tableNames.includes("feedback")) {
    sqliteDb.exec(`
      CREATE TABLE feedback (
        id TEXT PRIMARY KEY,
        userId TEXT,
        category TEXT NOT NULL CHECK(category IN ('suggestion', 'problem', 'accessibility', 'other')),
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewed', 'closed')),
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_feedback_userId ON feedback(userId);
      CREATE INDEX idx_feedback_createdAt ON feedback(createdAt);
    `);
  }

  if (!tableNames.includes("billingRecords")) {
    sqliteDb.exec(`
      CREATE TABLE billingRecords (
        id TEXT PRIMARY KEY,
        userId TEXT,
        customerName TEXT NOT NULL,
        customerEmail TEXT NOT NULL DEFAULT '',
        concept TEXT NOT NULL,
        billingCycle TEXT NOT NULL CHECK(billingCycle IN ('monthly', 'quarterly', 'semiannual', 'annual', 'trial_day', 'custom')),
        customCycleLabel TEXT NOT NULL DEFAULT '',
        amountCents INTEGER NOT NULL CHECK(amountCents >= 0),
        currency TEXT NOT NULL DEFAULT 'EUR',
        status TEXT NOT NULL CHECK(status IN ('paid', 'unpaid', 'pending')),
        dueAt INTEGER,
        paidAt INTEGER,
        invoiceNumber TEXT,
        notes TEXT NOT NULL DEFAULT '',
        archivedAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_billingRecords_userId ON billingRecords(userId);
      CREATE INDEX idx_billingRecords_status ON billingRecords(status);
      CREATE INDEX idx_billingRecords_dueAt ON billingRecords(dueAt);
      CREATE INDEX idx_billingRecords_archivedAt ON billingRecords(archivedAt);
    `);
  } else {
    const billingColumns = sqliteDb
      .prepare("PRAGMA table_info(billingRecords)")
      .all() as Array<{ name: string }>;
    const billingColumnNames = billingColumns.map((column) => column.name);

    if (!billingColumnNames.includes("customCycleLabel")) {
      sqliteDb.exec(
        "ALTER TABLE billingRecords ADD COLUMN customCycleLabel TEXT NOT NULL DEFAULT ''",
      );
    }

    if (!billingColumnNames.includes("archivedAt")) {
      sqliteDb.exec("ALTER TABLE billingRecords ADD COLUMN archivedAt INTEGER");
    }

    sqliteDb.exec(
      "CREATE INDEX IF NOT EXISTS idx_billingRecords_archivedAt ON billingRecords(archivedAt)",
    );
  }

  if (!tableNames.includes("facilityProfiles")) {
    console.log("Creating facilityProfiles table...");
    sqliteDb.exec(`
      CREATE TABLE facilityProfiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        logoDataUrl TEXT NOT NULL DEFAULT '',
        accentColor TEXT NOT NULL DEFAULT '#2563eb',
        updatedAt INTEGER NOT NULL
      );
    `);
  }

  if (!tableNames.includes("delegationGrants")) {
    console.log("Creating delegationGrants table...");
    sqliteDb.exec(`
      CREATE TABLE delegationGrants (
        id TEXT PRIMARY KEY,
        ownerUserId TEXT NOT NULL,
        delegateUserId TEXT,
        tokenHash TEXT NOT NULL UNIQUE,
        tokenPreview TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'bookings' CHECK(scope = 'bookings'),
        duration TEXT NOT NULL CHECK(duration IN ('24h', '7d', '30d', 'indefinite')),
        expiresAt INTEGER,
        createdAt INTEGER NOT NULL,
        redeemedAt INTEGER,
        revokedAt INTEGER,
        ownerHiddenAt INTEGER,
        delegateHiddenAt INTEGER,
        FOREIGN KEY(ownerUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(delegateUserId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_delegationGrants_owner ON delegationGrants(ownerUserId);
      CREATE INDEX idx_delegationGrants_delegate ON delegationGrants(delegateUserId);
      CREATE INDEX idx_delegationGrants_expiry ON delegationGrants(expiresAt);
    `);
  } else {
    const delegationColumns = sqliteDb
      .prepare("PRAGMA table_info(delegationGrants)")
      .all() as Array<{ name: string }>;
    const delegationColumnNames = delegationColumns.map(
      (column) => column.name,
    );
    if (!delegationColumnNames.includes("ownerHiddenAt")) {
      sqliteDb.exec(
        "ALTER TABLE delegationGrants ADD COLUMN ownerHiddenAt INTEGER",
      );
    }
    if (!delegationColumnNames.includes("delegateHiddenAt")) {
      sqliteDb.exec(
        "ALTER TABLE delegationGrants ADD COLUMN delegateHiddenAt INTEGER",
      );
    }
  }

  sqliteDb
    .prepare(
      `INSERT OR IGNORE INTO facilityProfiles
       (id, name, logoDataUrl, accentColor, updatedAt)
       VALUES ('primary', 'Centro GestTrain/OS', '', '#2563eb', ?)`,
    )
    .run(Date.now());

  console.log("Database initialized successfully");
}

export function closeDatabase() {
  sqliteDb.close();
}
