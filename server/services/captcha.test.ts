import { afterEach, describe, expect, it, vi } from "vitest";
import { captchaIsConfigured, verifyCaptcha } from "./captcha.js";

describe("captcha verification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses a deterministic provider-free bypass only in the test environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "");
    expect(captchaIsConfigured()).toBe(true);
    await expect(verifyCaptcha("test-token", "login")).resolves.toBe(true);
  });

  it("fails closed in production without a secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "");
    expect(captchaIsConfigured()).toBe(false);
  });

  it("accepts configuration only when a secret is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "production-secret");
    expect(captchaIsConfigured()).toBe(true);
  });

  it("rejects a valid provider response for the wrong action", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "production-secret");
    vi.stubEnv("CLIENT_ORIGIN", "https://app.umbravia-forge.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            score: 0.9,
            action: "signup",
            hostname: "app.umbravia-forge.example",
            challenge_ts: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(verifyCaptcha("valid-token", "login")).resolves.toBe(false);
  });

  it("accepts only a matching action and trusted hostname", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "production-secret");
    vi.stubEnv("CLIENT_ORIGIN", "https://app.umbravia-forge.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            score: 0.9,
            action: "login",
            hostname: "app.umbravia-forge.example",
            challenge_ts: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(verifyCaptcha("valid-token", "login")).resolves.toBe(true);
  });

  it("does not cache a token and therefore preserves provider replay rejection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "production-secret");
    vi.stubEnv("CLIENT_ORIGIN", "https://app.umbravia-forge.example");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            score: 0.9,
            action: "login",
            hostname: "app.umbravia-forge.example",
            challenge_ts: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["timeout-or-duplicate"],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyCaptcha("single-use-token", "login")).resolves.toBe(
      true,
    );
    await expect(verifyCaptcha("single-use-token", "login")).resolves.toBe(
      false,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the provider is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "production-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(verifyCaptcha("token", "signup")).resolves.toBe(false);
  });

  it("rejects low-score and expired responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "production-secret");
    vi.stubEnv("CLIENT_ORIGIN", "https://app.umbravia-forge.example");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            score: 0.2,
            action: "login",
            hostname: "app.umbravia-forge.example",
            challenge_ts: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            score: 0.9,
            action: "login",
            hostname: "app.umbravia-forge.example",
            challenge_ts: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyCaptcha("low-score", "login")).resolves.toBe(false);
    await expect(verifyCaptcha("expired", "login")).resolves.toBe(false);
  });
});
