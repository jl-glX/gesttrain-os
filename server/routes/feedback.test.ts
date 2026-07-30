import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("feedback API", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gesttrain-os-feedback-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    database = await import("../db/client.js");
    await database.initializeDatabase();
    app = (await import("../index.js")).app;
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("accepts minimal anonymous feedback without storing contact data", async () => {
    await request(app)
      .post("/api/feedback")
      .send({ category: "suggestion", message: "A useful product suggestion." })
      .expect(201, { submitted: true });

    const stored = await database.db
      .selectFrom("feedback")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({
      userId: null,
      category: "suggestion",
      status: "new",
    });
  });

  it("rejects short messages and unknown fields", async () => {
    await request(app)
      .post("/api/feedback")
      .send({
        category: "problem",
        message: "short",
        email: "extra@example.com",
      })
      .expect(400);
  });
});
