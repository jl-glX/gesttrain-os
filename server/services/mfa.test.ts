import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as OTPAuth from "otpauth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("two-step verification", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let auth: typeof import("./auth.js");
  let mfa: typeof import("./mfa.js");
  let userId: string;
  let secret: string;
  let recoveryCodes: string[];

  const currentCode = () =>
    new OTPAuth.TOTP({
      issuer: "Umbravia Forge",
      label: "mfa-member@example.com",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).generate();

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "umbravia-forge-mfa-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    database = await import("../db/client.js");
    auth = await import("./auth.js");
    mfa = await import("./mfa.js");
    await database.initializeDatabase();

    const signup = await auth.signup(
      "mfa-member@example.com",
      "MFA Member",
      "StrongPassword123",
      { userAgent: "Test browser" },
    );
    userId = signup.user.id;
    const setup = await mfa.beginMfaSetup(userId, signup.user.email);
    secret = setup.secret;
    recoveryCodes = await mfa.enableMfa(
      userId,
      signup.user.email,
      currentCode(),
    );
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("encrypts the TOTP secret and creates one-time recovery codes", async () => {
    const stored = await database.db
      .selectFrom("mfaCredentials")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();

    expect(stored.secretEncrypted).not.toContain(secret);
    expect(stored.secretEncrypted).toMatch(/^v1:/);
    expect(recoveryCodes).toHaveLength(10);

    const firstUse = await mfa.verifyMfaCode(
      userId,
      "mfa-member@example.com",
      recoveryCodes[0],
    );
    const secondUse = await mfa.verifyMfaCode(
      userId,
      "mfa-member@example.com",
      recoveryCodes[0],
    );
    expect(firstUse).toEqual({ valid: true, usedRecoveryCode: true });
    expect(secondUse).toEqual({ valid: false, usedRecoveryCode: false });
  });

  it("requires the second factor before creating a session", async () => {
    const login = await auth.login(
      "mfa-member@example.com",
      "StrongPassword123",
      "member",
      false,
      { userAgent: "Android test browser" },
    );
    expect(login.mfaRequired).toBe(true);
    if (!login.mfaRequired) throw new Error("Expected an MFA challenge");

    const completed = await auth.completeMfaLogin(
      login.challengeToken,
      currentCode(),
      { userAgent: "Android test browser" },
    );
    expect(completed.user.id).toBe(userId);
    expect(await auth.verifyToken(completed.sessionToken)).toMatchObject({
      userId,
    });

    await expect(
      auth.completeMfaLogin(login.challengeToken, currentCode()),
    ).rejects.toThrow("Invalid or expired verification challenge");
  });

  it("locks a verification challenge after five invalid attempts", async () => {
    const login = await auth.login(
      "mfa-member@example.com",
      "StrongPassword123",
      "member",
      false,
    );
    if (!login.mfaRequired) throw new Error("Expected an MFA challenge");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        auth.completeMfaLogin(login.challengeToken, "000000"),
      ).rejects.toThrow("Invalid verification code");
    }
    await expect(
      auth.completeMfaLogin(login.challengeToken, currentCode()),
    ).rejects.toThrow("Invalid or expired verification challenge");
  });
});
