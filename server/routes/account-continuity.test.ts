import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("account continuity API", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;
  let cookie: string;
  let ownerSupportId: string;
  let representativeSupportId: string;
  let representativeInternalId: string;
  let ownerInternalId: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "umbravia-forge-continuity-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    database = await import("../db/client.js");
    const auth = await import("../services/auth.js");
    const identifiers = await import("../services/support-identifiers.js");
    await database.initializeDatabase();
    const owner = await auth.signup(
      "continuity-owner@example.com",
      "Continuity Owner",
      "StrongPassword123",
    );
    const representative = await auth.signup(
      "continuity-representative@example.com",
      "Continuity Representative",
      "StrongPassword123",
    );
    representativeInternalId = representative.user.id;
    ownerInternalId = owner.user.id;
    ownerSupportId = (await identifiers.getSupportIdentifier(owner.user.id))
      .publicId;
    representativeSupportId = (
      await identifiers.getSupportIdentifier(representative.user.id)
    ).publicId;
    await database.db
      .updateTable("users")
      .set({ accountStatus: "active", emailVerifiedAt: Date.now() })
      .where("id", "in", [owner.user.id, representative.user.id])
      .execute();
    app = (await import("../index.js")).app;
    const login = await request(app).post("/api/auth/login").send({
      identifier: "continuity-owner@example.com",
      password: "StrongPassword123",
      accessPortal: "member",
      rememberDevice: false,
    });
    cookie = login.headers["set-cookie"][0];
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("requires an authenticated account session", async () => {
    await request(app).get("/api/account/continuity").expect(401);
  });

  it("creates a non-executable limited draft without exposing internal identity", async () => {
    const response = await request(app)
      .post("/api/account/continuity/representations")
      .set("Cookie", cookie)
      .send({
        supportIdentifier: representativeSupportId,
        scopes: ["cancel_bookings", "contact_support"],
        reason: "hospitalization",
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: "draft_available",
      executionEnabled: false,
      identityTransferAllowed: false,
      representations: [
        {
          supportIdentifier: representativeSupportId,
          scopes: ["cancel_bookings", "contact_support"],
          status: "draft",
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain(
      representativeInternalId,
    );
  });

  it("rejects self-representation as a client error", async () => {
    const response = await request(app)
      .post("/api/account/continuity/representations")
      .set("Cookie", cookie)
      .send({
        supportIdentifier: ownerSupportId,
        scopes: ["contact_support"],
        reason: "other",
        expiresAt: null,
      })
      .expect(400);

    expect(response.body.code).toBe("REQUEST_ERROR");
  });

  it("revokes only an owned draft", async () => {
    const overview = await request(app)
      .get("/api/account/continuity")
      .set("Cookie", cookie)
      .expect(200);
    const representationId = overview.body.representations[0].id as string;

    const response = await request(app)
      .delete(`/api/account/continuity/representations/${representationId}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.representations[0].status).toBe("revoked");
  });

  it("rejects a form submission without session verification and accepts it after a new CAPTCHA", async () => {
    await database.db
      .updateTable("sessions")
      .set({ formVerifiedAt: 0 })
      .where("userId", "=", ownerInternalId)
      .execute();

    await request(app)
      .post("/api/account/continuity/representations")
      .set("Cookie", cookie)
      .send({
        supportIdentifier: representativeSupportId,
        scopes: ["contact_support"],
        reason: "other",
        expiresAt: null,
      })
      .expect(428, {
        error: "Human verification is required before submitting this form",
        code: "FORM_VERIFICATION_REQUIRED",
      });

    const verification = await request(app)
      .post("/api/auth/form-verification")
      .set("Cookie", cookie)
      .send({ captchaToken: "test-token" })
      .expect(200);
    expect(verification.body.verified).toBe(true);

    await request(app)
      .post("/api/account/continuity/representations")
      .set("Cookie", cookie)
      .send({
        supportIdentifier: representativeSupportId,
        scopes: ["contact_support"],
        reason: "other",
        expiresAt: null,
      })
      .expect(201);
  });
});
