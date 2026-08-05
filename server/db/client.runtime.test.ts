import { afterEach, describe, expect, it, vi } from "vitest";

describe("active database client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("constructs the PostgreSQL facade without opening SQLite", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_PROVIDER", "postgresql");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://example.invalid/umbravia_forge_runtime_test",
    );
    vi.stubEnv("DATABASE_SSL", "false");
    vi.resetModules();

    const database = await import("./client.js");
    expect(database.databaseProvider).toBe("postgresql");
    await database.closeDatabase();
  });
});
