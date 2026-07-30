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

export const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({ database: sqliteDb }),
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

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
        FOREIGN KEY(ownerUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(delegateUserId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_delegationGrants_owner ON delegationGrants(ownerUserId);
      CREATE INDEX idx_delegationGrants_delegate ON delegationGrants(delegateUserId);
      CREATE INDEX idx_delegationGrants_expiry ON delegationGrants(expiresAt);
    `);
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
