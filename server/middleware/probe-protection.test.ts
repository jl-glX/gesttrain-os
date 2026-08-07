import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  isAutomatedProbePath,
  rejectAbusiveRequestShape,
  rejectAutomatedProbe,
  rejectUnsupportedHttpMethod,
} from "./probe-protection.js";

describe("automated probe protection", () => {
  it.each([
    "/.env",
    "/.env.production",
    "/.git/HEAD",
    "/config.json",
    "/wp-login.php",
    "/wp-admin/install.php",
    "/PHPMyAdmin/index.php",
    "/%2eenv.production",
    "/%252eenv.production",
    "//.env",
    "/public/../.git/config",
    "/nested/.git/HEAD",
    "/nested/.env.local",
    "/package.json",
    "/backup/database.sqlite",
    "/assets/shell.PHP",
    "/vendor/phpunit/eval-stdin.php",
    "/%00.env",
    "/.env%3Fdownload=1",
    "/%ZZ",
  ])("identifies a known probe path: %s", (path) => {
    expect(isAutomatedProbePath(path)).toBe(true);
  });

  it.each([
    "/",
    "/login",
    "/api/health",
    "/assets/application.js",
    "/.well-known/acme-challenge/token",
  ])("allows an application path: %s", (path) => {
    expect(isAutomatedProbePath(path)).toBe(false);
  });

  it("returns the generic not-found surface without exposing a reason", async () => {
    const app = express();
    app.use(rejectAutomatedProbe);
    app.get("/{*splat}", (_req, res) => res.status(200).send("application"));

    const response = await request(app).get("/.git/HEAD").expect(404);

    expect(response.body).toEqual({
      error: "Endpoint not found",
      code: "NOT_FOUND",
    });
    expect(JSON.stringify(response.body)).not.toMatch(/probe|blocked|git/i);
  });

  it("rejects HTTP methods that the application does not use", async () => {
    const app = express();
    app.use(rejectUnsupportedHttpMethod);
    app.get("/", (_req, res) => res.status(200).send("application"));

    const response = await request(app).trace("/").expect(405);

    expect(response.body.code).toBe("METHOD_NOT_ALLOWED");
    expect(response.headers.allow).toContain("GET");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects excessively long request targets before routing", async () => {
    const app = express();
    app.use(rejectAbusiveRequestShape);
    app.get("/{*splat}", (_req, res) => res.status(200).send("application"));

    const response = await request(app)
      .get(`/search?value=${"a".repeat(4_100)}`)
      .expect(414);

    expect(response.body.code).toBe("URI_TOO_LONG");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.connection).toBe("close");
  });

  it("rejects a declared body larger than the public proxy allowance", async () => {
    const app = express();
    app.use(rejectAbusiveRequestShape);
    app.post("/upload", (_req, res) => res.status(200).send("application"));

    const response = await request(app)
      .post("/upload")
      .set("Content-Length", "1048577")
      .expect(413);

    expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.connection).toBe("close");
  });

  it("allows ordinary request shapes", async () => {
    const app = express();
    app.use(rejectAbusiveRequestShape);
    app.post("/api/example", (_req, res) => res.status(204).end());

    await request(app)
      .post("/api/example")
      .set("Content-Length", "512")
      .expect(204);
  });
});
