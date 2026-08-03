import "dotenv/config";
import {
  postgresPoolSettings,
  resolveDatabaseProvider,
} from "../server/db/runtime.js";
import { postgresMigrationVersions } from "../server/db/postgres-migrations.js";

const provider = resolveDatabaseProvider(process.env);
if (provider !== "postgresql") {
  throw new Error(
    "Set DATABASE_PROVIDER=postgresql and DATABASE_URL to validate the production configuration.",
  );
}

const settings = postgresPoolSettings(process.env);
const parsed = new URL(settings.connectionString ?? "");
if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
  throw new Error(
    "DATABASE_URL must use the postgresql:// or postgres:// scheme.",
  );
}

console.log(
  JSON.stringify({
    status: "configuration_valid",
    provider,
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ""),
    tls: settings.ssl !== false,
    poolMax: settings.max,
    migrationVersions: postgresMigrationVersions(),
  }),
);
