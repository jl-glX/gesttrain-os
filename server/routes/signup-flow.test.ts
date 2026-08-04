import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("progressive account signup", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "umbravia-forge-signup-flow-"));
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

  it("persists acknowledgements and activates the account after code verification", async () => {
    const signup = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "new-account@example.com",
        name: "New",
        lastName: "Account",
        password: "ProgressivePassword123",
        countryCode: "ES",
        locale: "es",
        acceptedTerms: true,
        acceptedPrivacy: true,
      })
      .expect(201);
    expect(signup.body).toMatchObject({
      verificationRequired: true,
      demoVerificationCode: expect.stringMatching(/^\d{6}$/),
    });
    const cookie = signup.headers["set-cookie"][0];
    expect(signup.body.user).not.toHaveProperty("password");
    const storedChallenge = await database.db
      .selectFrom("emailVerificationChallenges")
      .select("codeHash")
      .executeTakeFirstOrThrow();
    expect(storedChallenge.codeHash).not.toContain(
      signup.body.demoVerificationCode,
    );
    expect(storedChallenge.codeHash).toMatch(/^[a-f\d]+:[a-f\d]+$/);

    await request(app).get("/api/classes").set("Cookie", cookie).expect(403);

    await request(app)
      .post("/api/auth/verify-email")
      .set("Cookie", cookie)
      .send({ code: signup.body.demoVerificationCode })
      .expect(200, { verified: true });

    const user = await database.db
      .selectFrom("users")
      .select(["accountStatus", "emailVerifiedAt"])
      .where("email", "=", "new-account@example.com")
      .executeTakeFirstOrThrow();
    expect(user.accountStatus).toBe("active");
    expect(user.emailVerifiedAt).toEqual(expect.any(Number));
    await request(app).get("/api/classes").set("Cookie", cookie).expect(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: "new-account@example.com",
        password: "ProgressivePassword123",
        accessPortal: "member",
        rememberDevice: false,
      })
      .expect(200);
    expect(login.body.user).toMatchObject({ accountStatus: "active" });
    expect(login.body.user).not.toHaveProperty("password");
  });

  it("rejects signup without both explicit acknowledgements", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({
        email: "missing-consent@example.com",
        name: "Missing",
        lastName: "Consent",
        password: "ProgressivePassword123",
        countryCode: "ES",
        locale: "es",
        acceptedTerms: true,
        acceptedPrivacy: false,
      })
      .expect(400);
  });
});
