import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import bcryptjs from "bcryptjs";
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
      verificationEmailSent: false,
      demoVerificationCode: expect.stringMatching(/^\d{6}$/),
    });
    const cookie = signup.headers["set-cookie"][0];
    expect(signup.body.user).not.toHaveProperty("password");
    const storedCredential = await database.db
      .selectFrom("users")
      .select(["email", "name", "lastName", "countryCode", "password"])
      .where("email", "=", "new-account@example.com")
      .executeTakeFirstOrThrow();
    expect(storedCredential).toMatchObject({
      email: "new-account@example.com",
      name: "New",
      lastName: "Account",
      countryCode: "ES",
    });
    expect(storedCredential.password).not.toBe("ProgressivePassword123");
    expect(storedCredential.password).toMatch(/^\$2[aby]\$12\$/);
    await expect(
      bcryptjs.compare("ProgressivePassword123", storedCredential.password),
    ).resolves.toBe(true);
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

  it("rotates the verification challenge when a pending account requests another email", async () => {
    const signup = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "resend-verification@example.com",
        name: "Resend",
        lastName: "Verification",
        password: "ProgressivePassword123",
        countryCode: "ES",
        locale: "es",
        acceptedTerms: true,
        acceptedPrivacy: true,
      })
      .expect(201);
    const cookie = signup.headers["set-cookie"][0];
    const before = await database.db
      .selectFrom("emailVerificationChallenges")
      .select("codeHash")
      .where("userId", "=", signup.body.user.id)
      .executeTakeFirstOrThrow();

    const resend = await request(app)
      .post("/api/auth/resend-verification")
      .set("Cookie", cookie)
      .expect(202);
    expect(resend.body).toMatchObject({
      sent: false,
      demoVerificationCode: expect.stringMatching(/^\d{6}$/),
    });

    const after = await database.db
      .selectFrom("emailVerificationChallenges")
      .select("codeHash")
      .where("userId", "=", signup.body.user.id)
      .executeTakeFirstOrThrow();
    expect(after.codeHash).not.toBe(before.codeHash);

    await request(app)
      .post("/api/auth/verify-email")
      .set("Cookie", cookie)
      .send({ code: resend.body.demoVerificationCode })
      .expect(200, { verified: true });
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

  it("removes an incomplete account when the verification message cannot be accepted", async () => {
    const email = "undeliverable-signup@example.com";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_REQUIRE_TLS = "false";
    process.env.EMAIL_FROM = "Umbravia Forge <no-reply@example.com>";
    try {
      await request(app)
        .post("/api/auth/signup")
        .send({
          email,
          name: "Undeliverable",
          lastName: "Signup",
          password: "ProgressivePassword123",
          countryCode: "ES",
          locale: "es",
          acceptedTerms: true,
          acceptedPrivacy: true,
        })
        .expect(503, {
          code: "EMAIL_DELIVERY_UNAVAILABLE",
          error:
            "Verification email could not be sent. Please try again later.",
        });
      const stored = await database.db
        .selectFrom("users")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirst();
      expect(stored).toBeUndefined();
    } finally {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_SECURE;
      delete process.env.SMTP_REQUIRE_TLS;
      delete process.env.EMAIL_FROM;
    }
  });
});
