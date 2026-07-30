import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { app } from "../index.js";

describe("API security baseline", () => {
  it("sets defensive headers without exposing Express", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
    expect(response.headers["ratelimit"]).toBeDefined();
    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });

  it("allows the configured development origin and withholds CORS from others", async () => {
    const allowed = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:3000")
      .expect(200);
    const denied = await request(app)
      .get("/api/health")
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

    expect(malformed.body.code).toBe("INVALID_JSON");
    expect(oversized.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(missing.body.code).toBe("NOT_FOUND");
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

  it("enables transport and content protections in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_ORIGIN", "https://gesttrain-os.example");
    vi.resetModules();

    try {
      const { app: productionApp } = await import("../index.js");
      const allowed = await request(productionApp)
        .get("/api/health")
        .set("Origin", "https://gesttrain-os.example")
        .expect(200);
      const denied = await request(productionApp)
        .get("/api/health")
        .set("Origin", "https://untrusted.example")
        .expect(200);

      expect(allowed.headers["access-control-allow-origin"]).toBe(
        "https://gesttrain-os.example",
      );
      expect(allowed.headers["strict-transport-security"]).toBeDefined();
      expect(allowed.headers["content-security-policy"]).toBeDefined();
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
