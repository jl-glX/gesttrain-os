import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

describe("account deletion security", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let app: typeof import("../index.js").app;
  let ownerCookie: string;
  let otherCookie: string;
  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    directory = await mkdtemp(
      join(tmpdir(), "gesttrain-os-deletion-security-"),
    );
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    database = await import("../db/client.js");
    const auth = await import("../services/auth.js");
    await database.initializeDatabase();
    const owner = await auth.signup(
      "deletion-owner@example.com",
      "Deletion Owner",
      "StrongPassword123",
    );
    const other = await auth.signup(
      "deletion-other@example.com",
      "Deletion Other",
      "StrongPassword123",
    );
    ownerId = owner.user.id;
    otherId = other.user.id;
    app = (await import("../index.js")).app;

    const ownerLogin = await request(app).post("/api/auth/login").send({
      identifier: "deletion-owner@example.com",
      password: "StrongPassword123",
      accessPortal: "member",
      rememberDevice: false,
    });
    const otherLogin = await request(app).post("/api/auth/login").send({
      identifier: "deletion-other@example.com",
      password: "StrongPassword123",
      accessPortal: "member",
      rememberDevice: false,
    });
    ownerCookie = ownerLogin.headers["set-cookie"][0];
    otherCookie = otherLogin.headers["set-cookie"][0];
  });

  beforeEach(async () => {
    await database.db.deleteFrom("accountDeletionRequests").execute();
    await database.db.deleteFrom("accountDataDeletionDrafts").execute();
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("requires authentication for every deletion operation", async () => {
    await request(app)
      .get("/api/account/lifecycle/deletion-review")
      .expect(401);
    await request(app).post("/api/account/lifecycle/deletion").expect(401);
    await request(app).delete("/api/account/lifecycle/deletion").expect(401);
    await request(app)
      .put("/api/account/lifecycle/deletion-review")
      .send({ selectedCategories: ["bookings"], intent: "selected_data" })
      .expect(401);
  });

  it("rejects attempts to inject another account or unknown categories", async () => {
    const targetedSchedule = await request(app)
      .post("/api/account/lifecycle/deletion")
      .set("Cookie", ownerCookie)
      .send({ userId: otherId })
      .expect(400);
    const targetedCancel = await request(app)
      .delete("/api/account/lifecycle/deletion")
      .set("Cookie", ownerCookie)
      .send({ userId: otherId })
      .expect(400);
    const invalidReview = await request(app)
      .put("/api/account/lifecycle/deletion-review")
      .set("Cookie", ownerCookie)
      .send({
        selectedCategories: ["bookings", "passwords"],
        intent: "selected_data",
        userId: otherId,
      })
      .expect(400);

    expect(targetedSchedule.body.code).toBe("VALIDATION_ERROR");
    expect(targetedCancel.body.code).toBe("VALIDATION_ERROR");
    expect(invalidReview.body.code).toBe("VALIDATION_ERROR");
    expect(
      await database.db
        .selectFrom("accountDeletionRequests")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: 0 });
  });

  it("schedules concurrent requests once and isolates them by account", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post("/api/account/lifecycle/deletion")
          .set("Cookie", ownerCookie)
          .send({}),
      ),
    );

    expect(responses.every((response) => response.status === 202)).toBe(true);
    const requestIds = new Set(
      responses.map((response) => response.body.deletionRequest.id),
    );
    expect(requestIds.size).toBe(1);

    const otherCancellation = await request(app)
      .delete("/api/account/lifecycle/deletion")
      .set("Cookie", otherCookie)
      .send({})
      .expect(200);
    expect(otherCancellation.body.deletionRequest).toBeNull();

    const ownerLifecycle = await request(app)
      .get("/api/account/lifecycle")
      .set("Cookie", ownerCookie)
      .expect(200);
    expect(ownerLifecycle.body.deletionRequest.id).toBe([...requestIds][0]);
  });

  it("keeps data intact after the grace date while execution is disabled", async () => {
    await request(app)
      .post("/api/account/lifecycle/deletion")
      .set("Cookie", ownerCookie)
      .send({})
      .expect(202);
    await database.db
      .updateTable("accountDeletionRequests")
      .set({ graceEndsAt: Date.now() - 1 })
      .where("userId", "=", ownerId)
      .execute();

    const user = await database.db
      .selectFrom("users")
      .select("id")
      .where("id", "=", ownerId)
      .executeTakeFirst();
    const session = await request(app)
      .get("/api/auth/session")
      .set("Cookie", ownerCookie)
      .expect(200);

    expect(user?.id).toBe(ownerId);
    expect(session.body.user.id).toBe(ownerId);
    expect(
      (
        await request(app)
          .get("/api/account/lifecycle")
          .set("Cookie", ownerCookie)
      ).body.dataDisposition.executionEnabled,
    ).toBe(false);
  });

  it("cancels the request idempotently without deleting the account", async () => {
    await request(app)
      .post("/api/account/lifecycle/deletion")
      .set("Cookie", ownerCookie)
      .send({})
      .expect(202);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(app)
        .delete("/api/account/lifecycle/deletion")
        .set("Cookie", ownerCookie)
        .send({})
        .expect(200);
      expect(response.body.deletionRequest).toBeNull();
    }

    expect(
      await database.db
        .selectFrom("users")
        .select("id")
        .where("id", "=", ownerId)
        .executeTakeFirst(),
    ).toMatchObject({ id: ownerId });
  });
});
