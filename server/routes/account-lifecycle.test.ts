import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("account lifecycle API", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;
  let cookie: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "umbravia-forge-lifecycle-api-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    database = await import("../db/client.js");
    const auth = await import("../services/auth.js");
    await database.initializeDatabase();
    const account = await auth.signup(
      "lifecycle-api@example.com",
      "Lifecycle API Member",
      "StrongPassword123",
    );
    await database.db
      .updateTable("users")
      .set({ accountStatus: "active", emailVerifiedAt: Date.now() })
      .where("id", "=", account.user.id)
      .execute();
    app = (await import("../index.js")).app;
    const login = await request(app).post("/api/auth/login").send({
      identifier: "lifecycle-api@example.com",
      password: "StrongPassword123",
      accessPortal: "member",
      rememberDevice: false,
    });
    cookie = login.headers["set-cookie"][0];
    await request(app)
      .post("/api/auth/form-verification")
      .set("Cookie", cookie)
      .send({ captchaToken: "test-token" })
      .expect(200);
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("parses and stores inactivity preferences", async () => {
    const response = await request(app)
      .put("/api/account/lifecycle/inactivity")
      .set("Cookie", cookie)
      .send({ inactivityMonths: 12 })
      .expect(200);

    expect(response.body.inactivityMonths).toBe(12);
  });

  it("parses and stores a selective data deletion draft", async () => {
    const response = await request(app)
      .put("/api/account/lifecycle/deletion-review")
      .set("Cookie", cookie)
      .send({
        selectedCategories: ["bookings", "preferences"],
        intent: "selected_data",
      })
      .expect(200);

    expect(response.body.deletionDraft).toMatchObject({
      selectedCategories: ["bookings", "preferences"],
      intent: "selected_data",
    });
    expect(response.body.deletionRequest).toBeNull();
  });
});
