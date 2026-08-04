import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("account profile API", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;
  let memberCookie: string;

  beforeAll(async () => {
    directory = await mkdtemp(
      join(tmpdir(), "umbravia-forge-account-profile-"),
    );
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    database = await import("../db/client.js");
    const auth = await import("../services/auth.js");
    await database.initializeDatabase();
    await database.db
      .insertInto("users")
      .values({
        id: "profile-member",
        email: "profile-member@example.com",
        phone: null,
        name: "Profile Member",
        avatarDataUrl: "",
        password: await auth.hashPassword("ProfileMember123"),
        role: "member",
        sessionIdleTimeoutMinutes: 7 * 24 * 60,
        createdAt: Date.now(),
      })
      .execute();
    app = (await import("../index.js")).app;
    memberCookie = (
      await request(app).post("/api/auth/login").send({
        identifier: "profile-member@example.com",
        password: "ProfileMember123",
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

  it("lets a member update their own safe profile photo", async () => {
    const avatarDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const response = await request(app)
      .patch("/api/account/profile")
      .set("Cookie", memberCookie)
      .send({ avatarDataUrl })
      .expect(200);
    expect(response.body.user).toMatchObject({
      id: "profile-member",
      avatarDataUrl,
    });

    const session = await request(app)
      .get("/api/auth/session")
      .set("Cookie", memberCookie)
      .expect(200);
    expect(session.body.user.avatarDataUrl).toBe(avatarDataUrl);
  });

  it("rejects unauthenticated and unsafe avatar updates", async () => {
    await request(app)
      .patch("/api/account/profile")
      .send({ avatarDataUrl: "" })
      .expect(401);
    await request(app)
      .patch("/api/account/profile")
      .set("Cookie", memberCookie)
      .send({ avatarDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" })
      .expect(400);
  });
});
