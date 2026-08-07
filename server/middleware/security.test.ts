import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { app } from "../index.js";

describe("API security baseline", () => {
  it("sets defensive headers without exposing Express", async () => {
    const response = await request(app).get("/api/health/live").expect(200);

    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
    expect(response.headers["ratelimit"]).toBeDefined();
    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });

  it("allows the configured development origin and withholds CORS from others", async () => {
    const allowed = await request(app)
      .get("/api/health/live")
      .set("Origin", "http://localhost:3000")
      .expect(200);
    const denied = await request(app)
      .get("/api/health/live")
      .set("Origin", "https://untrusted.example")
      .expect(200);

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects invalid and unexpected fields without echoing their values", async () => {
    const sensitiveValue = "not-an-email-sensitive-value";
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: sensitiveValue,
        password: "secret-input-value",
        accessPortal: "member",
        isAdmin: true,
      })
      .expect(400);

    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toContain(sensitiveValue);
    expect(JSON.stringify(response.body)).not.toContain("secret-input-value");
    expect(JSON.stringify(response.body)).not.toContain("true");
  });

  it("rejects cross-site state changes before authentication or validation", async () => {
    const untrustedOrigin = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://attacker.example")
      .send({
        identifier: "someone@example.com",
        password: "Password123",
        accessPortal: "member",
      })
      .expect(403);
    const fetchMetadata = await request(app)
      .post("/api/auth/login")
      .set("Sec-Fetch-Site", "cross-site")
      .send({
        identifier: "someone@example.com",
        password: "Password123",
        accessPortal: "member",
      })
      .expect(403);

    expect(untrustedOrigin.body.code).toBe("UNTRUSTED_ORIGIN");
    expect(fetchMetadata.body.code).toBe("UNTRUSTED_ORIGIN");
  });

  it("returns a stable error code for invalid credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      identifier: "missing-account@example.com",
      password: "StrongPassword123",
      accessPortal: "member",
      captchaToken: "test-token",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("normalizes malformed JSON, oversized bodies, and unknown API routes", async () => {
    const malformed = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":')
      .expect(400);
    const oversized = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: `${"a".repeat(33_000)}@example.com`,
        password: "secret",
        accessPortal: "member",
      })
      .expect(413);
    const missing = await request(app).get("/api/not-real").expect(404);
    const normalizedTraversal = await request(app)
      .get("/api/downloads/%2e%2e/%2e%2e/package.json")
      .expect(404);

    expect(malformed.body.code).toBe("INVALID_JSON");
    expect(oversized.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(missing.body.code).toBe("NOT_FOUND");
    expect(normalizedTraversal.body.code).toBe("NOT_FOUND");
  });

  it("rate-limits repeated authentication attempts", async () => {
    let limitedStatus: number | undefined;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app).post("/api/auth/login").send({
        identifier: "invalid@example.com",
        password: "",
        accessPortal: "member",
      });

      if (response.status === 429) {
        limitedStatus = response.status;
        break;
      }
    }

    expect(limitedStatus).toBe(429);
  });

  it("limits signup independently and rejects scanner paths before the SPA", async () => {
    let signupResponse: request.Response | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      signupResponse = await request(app).post("/api/auth/signup").send({});
    }

    expect(signupResponse?.status).toBe(429);
    expect(signupResponse?.body.code).toBe("SIGNUP_RATE_LIMITED");

    const probe = await request(app).get("/.env.production").expect(404);
    expect(probe.body.code).toBe("NOT_FOUND");
    expect(probe.headers["cache-control"]).toBe("no-store");
  });

  it("enables transport and content protections in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_ORIGIN", "https://umbravia-forge.example");
    vi.stubEnv("DATABASE_PROVIDER", "postgresql");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://example.invalid/umbravia_forge_security_headers",
    );
    vi.stubEnv("DATABASE_SSL", "false");
    vi.resetModules();
    let closeProductionDatabase: (() => Promise<void>) | undefined;

    try {
      const { app: productionApp } = await import("../index.js");
      ({ closeDatabase: closeProductionDatabase } =
        await import("../db/client.js"));
      const allowed = await request(productionApp)
        .get("/api/health/live")
        .set("Origin", "https://umbravia-forge.example")
        .expect(200);
      const denied = await request(productionApp)
        .get("/api/health/live")
        .set("Origin", "https://untrusted.example")
        .expect(200);

      expect(allowed.headers["access-control-allow-origin"]).toBe(
        "https://umbravia-forge.example",
      );
      expect(allowed.headers["strict-transport-security"]).toBeDefined();
      expect(allowed.headers["content-security-policy"]).toBeDefined();
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await closeProductionDatabase?.();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
