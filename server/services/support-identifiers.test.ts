import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("public account support identifiers", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let auth: typeof import("./auth.js");
  let identifiers: typeof import("./support-identifiers.js");

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gesttrain-os-support-id-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.resetModules();
    database = await import("../db/client.js");
    auth = await import("./auth.js");
    identifiers = await import("./support-identifiers.js");
    await database.initializeDatabase();
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("creates one stable public identifier for a new account", async () => {
    const account = await auth.signup(
      "support-id@example.com",
      "Support Identifier",
      "StrongPassword123",
    );

    const first = await identifiers.getSupportIdentifier(account.user.id);
    const second = await identifiers.getSupportIdentifier(account.user.id);

    expect(first.publicId).toMatch(
      /^GT-U-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/,
    );
    expect(second).toEqual(first);
    expect(
      await identifiers.findUserIdBySupportIdentifier(first.publicId),
    ).toBe(account.user.id);
  });

  it("rotates only the public alias and retains the revoked history", async () => {
    const account = await auth.signup(
      "rotated-support-id@example.com",
      "Rotated Support Identifier",
      "StrongPassword123",
    );
    const original = await identifiers.getSupportIdentifier(account.user.id);
    const replacement = await identifiers.rotateSupportIdentifier(
      account.user.id,
      "account_recovery",
    );

    expect(replacement.publicId).not.toBe(original.publicId);
    expect(
      await identifiers.findUserIdBySupportIdentifier(original.publicId),
    ).toBeNull();
    expect(
      await identifiers.findUserIdBySupportIdentifier(replacement.publicId),
    ).toBe(account.user.id);

    const history = await database.db
      .selectFrom("accountSupportIdentifiers")
      .select(["publicId", "status", "rotationReason", "revokedAt"])
      .where("userId", "=", account.user.id)
      .orderBy("createdAt")
      .execute();

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      publicId: original.publicId,
      status: "revoked",
      rotationReason: "account_recovery",
    });
    expect(history[0].revokedAt).not.toBeNull();
    expect(history[1]).toMatchObject({
      publicId: replacement.publicId,
      status: "active",
      rotationReason: null,
      revokedAt: null,
    });
  });
});
