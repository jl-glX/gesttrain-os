import { describe, expect, it } from "vitest";
import { postgresPoolSettings, resolveDatabaseProvider } from "./runtime.js";

describe("database runtime selection", () => {
  it("keeps SQLite for local development and tests", () => {
    expect(resolveDatabaseProvider({ NODE_ENV: "development" })).toBe("sqlite");
    expect(resolveDatabaseProvider({ NODE_ENV: "test" })).toBe("sqlite");
  });

  it("requires PostgreSQL in production", () => {
    expect(() => resolveDatabaseProvider({ NODE_ENV: "production" })).toThrow(
      /requires DATABASE_URL/i,
    );
    expect(
      resolveDatabaseProvider({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://example.invalid/gesttrain",
      }),
    ).toBe("postgresql");
  });

  it("does not allow an explicit SQLite production deployment", () => {
    expect(() =>
      resolveDatabaseProvider({
        NODE_ENV: "production",
        DATABASE_PROVIDER: "sqlite",
      }),
    ).toThrow(/not supported in production/i);
  });

  it("uses bounded connection-pool settings and verified TLS by default", () => {
    expect(
      postgresPoolSettings({
        DATABASE_URL: "postgresql://example.invalid/gesttrain",
        DATABASE_POOL_MAX: "500",
      }),
    ).toMatchObject({
      max: 50,
      ssl: { rejectUnauthorized: true },
      application_name: "gesttrain-os",
    });
  });
});
