import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("resource manager API", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;
  let adminCookie: string;
  let memberCookie: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gesttrain-os-resources-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();

    database = await import("../db/client.js");
    const auth = await import("../services/auth.js");
    await database.initializeDatabase();
    await database.db
      .insertInto("users")
      .values([
        {
          id: "resources-admin",
          email: "resources-admin@example.com",
          phone: null,
          name: "Resources Admin",
          avatarDataUrl: "",
          password: await auth.hashPassword("ResourcesPassword123"),
          role: "admin",
          sessionIdleTimeoutMinutes: 7 * 24 * 60,
          createdAt: Date.now(),
        },
        {
          id: "resources-member",
          email: "resources-member@example.com",
          phone: null,
          name: "Resources Member",
          avatarDataUrl: "",
          password: await auth.hashPassword("ResourcesPassword123"),
          role: "member",
          sessionIdleTimeoutMinutes: 7 * 24 * 60,
          createdAt: Date.now(),
        },
      ])
      .execute();

    app = (await import("../index.js")).app;
    const adminLogin = await request(app).post("/api/auth/login").send({
      identifier: "resources-admin@example.com",
      password: "ResourcesPassword123",
      accessPortal: "staff",
      rememberDevice: false,
    });
    const memberLogin = await request(app).post("/api/auth/login").send({
      identifier: "resources-member@example.com",
      password: "ResourcesPassword123",
      accessPortal: "member",
      rememberDevice: false,
    });
    adminCookie = adminLogin.headers["set-cookie"][0];
    memberCookie = memberLogin.headers["set-cookie"][0];
  });

  afterAll(async () => {
    const resources = await import("../services/resource-manager.js");
    resources.stopResourceManager();
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("exposes only registered tasks to administrators", async () => {
    const response = await request(app)
      .get("/api/admin/resource-manager")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(response.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "expired-auth-cleanup" }),
        expect.objectContaining({ id: "sqlite-query-planner" }),
      ]),
    );
    expect(response.body.process).toMatchObject({
      uptimeSeconds: expect.any(Number),
      memory: {
        rssBytes: expect.any(Number),
        heapUsedBytes: expect.any(Number),
      },
    });
  });

  it("rejects resource controls for members", async () => {
    await request(app)
      .get("/api/admin/resource-manager")
      .set("Cookie", memberCookie)
      .expect(403);
  });

  it("pauses and resumes a registered task", async () => {
    const paused = await request(app)
      .patch("/api/admin/resource-manager/tasks/expired-auth-cleanup")
      .set("Cookie", adminCookie)
      .send({ enabled: false })
      .expect(200);
    expect(paused.body).toMatchObject({
      id: "expired-auth-cleanup",
      enabled: false,
      state: "paused",
    });

    const resumed = await request(app)
      .patch("/api/admin/resource-manager/tasks/expired-auth-cleanup")
      .set("Cookie", adminCookie)
      .send({ enabled: true })
      .expect(200);
    expect(resumed.body).toMatchObject({
      id: "expired-auth-cleanup",
      enabled: true,
      state: "idle",
    });
  });
});
