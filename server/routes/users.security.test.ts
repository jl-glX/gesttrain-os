import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("administrator account safety", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;
  let adminCookie: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gesttrain-os-admin-safety-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    database = await import("../db/client.js");
    const auth = await import("../services/auth.js");
    await database.initializeDatabase();
    await database.db
      .insertInto("users")
      .values({
        id: "protected-admin",
        email: "protected-admin@example.com",
        phone: null,
        name: "Protected Admin",
        avatarDataUrl: "",
        password: await auth.hashPassword("ProtectedAdmin123"),
        role: "admin",
        sessionIdleTimeoutMinutes: 10_080,
        createdAt: Date.now(),
      })
      .execute();
    app = (await import("../index.js")).app;
    adminCookie = (
      await request(app).post("/api/auth/login").send({
        identifier: "protected-admin@example.com",
        password: "ProtectedAdmin123",
        accessPortal: "staff",
        rememberDevice: false,
      })
    ).headers["set-cookie"][0];
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("prevents an administrator from deleting or demoting the active account", async () => {
    const deleted = await request(app)
      .delete("/api/users/protected-admin")
      .set("Cookie", adminCookie)
      .expect(400);
    const demoted = await request(app)
      .patch("/api/users/protected-admin/role")
      .set("Cookie", adminCookie)
      .send({ role: "member" })
      .expect(400);
    const bulkDeleted = await request(app)
      .post("/api/users/bulk/delete")
      .set("Cookie", adminCookie)
      .send({ userIds: ["protected-admin"] })
      .expect(400);

    expect(deleted.body.code).toBe("ADMIN_SELF_DELETE");
    expect(demoted.body.code).toBe("ADMIN_SELF_ROLE_CHANGE");
    expect(bulkDeleted.body.code).toBe("ADMIN_SELF_DELETE");
  });
});
