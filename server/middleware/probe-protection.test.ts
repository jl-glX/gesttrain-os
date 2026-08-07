import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  isAutomatedProbePath,
  rejectAutomatedProbe,
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
  ])("identifies a known probe path: %s", (path) => {
    expect(isAutomatedProbePath(path)).toBe(true);
  });

  it.each(["/", "/login", "/api/health", "/assets/application.js"])(
    "allows an application path: %s",
    (path) => {
      expect(isAutomatedProbePath(path)).toBe(false);
    },
  );

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
});
