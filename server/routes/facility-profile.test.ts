import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("facility profile API", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;
  let adminCookie: string;
  let memberCookie: string;

  beforeAll(async () => {
    directory = await mkdtemp(
      join(tmpdir(), "umbravia-forge-facility-profile-"),
    );
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
          id: "facility-admin",
          email: "facility-admin@example.com",
          phone: null,
          name: "Facility Admin",
          avatarDataUrl: "",
          password: await auth.hashPassword("FacilityAdmin123"),
          role: "admin",
          sessionIdleTimeoutMinutes: 7 * 24 * 60,
          createdAt: Date.now(),
        },
        {
          id: "facility-member",
          email: "facility-member@example.com",
          phone: null,
          name: "Facility Member",
          avatarDataUrl: "",
          password: await auth.hashPassword("FacilityMember123"),
          role: "member",
          sessionIdleTimeoutMinutes: 7 * 24 * 60,
          createdAt: Date.now(),
        },
      ])
      .execute();

    app = (await import("../index.js")).app;
    adminCookie = (
      await request(app).post("/api/auth/login").send({
        identifier: "facility-admin@example.com",
        password: "FacilityAdmin123",
        accessPortal: "staff",
        rememberDevice: false,
      })
    ).headers["set-cookie"][0];
    memberCookie = (
      await request(app).post("/api/auth/login").send({
        identifier: "facility-member@example.com",
        password: "FacilityMember123",
        accessPortal: "member",
        rememberDevice: false,
      })
    ).headers["set-cookie"][0];
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("lets an administrator configure the facility panel identity", async () => {
    const updated = await request(app)
      .patch("/api/facility-profile")
      .set("Cookie", adminCookie)
      .send({
        name: "Gimnasio Horizonte",
        accentColor: "#0f766e",
        logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: "primary",
      name: "Gimnasio Horizonte",
      accentColor: "#0f766e",
    });

    const visibleToMember = await request(app)
      .get("/api/facility-profile")
      .set("Cookie", memberCookie)
      .expect(200);
    expect(visibleToMember.body.name).toBe("Gimnasio Horizonte");
  });

  it("prevents members and unsafe image formats from changing branding", async () => {
    await request(app)
      .patch("/api/facility-profile")
      .set("Cookie", memberCookie)
      .send({ name: "Unauthorized" })
      .expect(403);

    await request(app)
      .patch("/api/facility-profile")
      .set("Cookie", adminCookie)
      .send({ logoDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" })
      .expect(400);
  });
});
