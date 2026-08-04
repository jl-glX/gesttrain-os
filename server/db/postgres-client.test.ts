import { describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createPostgresDatabaseRuntime } from "./postgres-client.js";

describe("PostgreSQL runtime", () => {
  it("creates a lazy pool without opening a connection at construction time", async () => {
    const connect = vi.spyOn(pg.Pool.prototype, "connect");
    const runtime = createPostgresDatabaseRuntime({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://example.invalid/umbravia_forge",
      DATABASE_SSL: "false",
    });

    expect(connect).not.toHaveBeenCalled();
    await runtime.close();
    connect.mockRestore();
  });
});
