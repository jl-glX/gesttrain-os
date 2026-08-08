import { afterEach, describe, expect, it, vi } from "vitest";
import { captchaIsConfigured, verifyCaptcha } from "./captcha.js";

describe("captcha verification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed in production without a secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(captchaIsConfigured()).toBe(false);
  });

  it("rejects the official development secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    expect(captchaIsConfigured()).toBe(false);
  });

  it("rejects a valid provider response for the wrong action", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "production-secret");
    vi.stubEnv("CLIENT_ORIGIN", "https://app.umbravia-forge.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            action: "signup",
            hostname: "app.umbravia-forge.example",
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(verifyCaptcha("valid-token", "login")).resolves.toBe(false);
  });

  it("accepts only a matching action and trusted hostname", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "production-secret");
    vi.stubEnv("CLIENT_ORIGIN", "https://app.umbravia-forge.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            action: "login",
            hostname: "app.umbravia-forge.example",
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(verifyCaptcha("valid-token", "login")).resolves.toBe(true);
  });

  it("preserves provider replay rejection without caching tokens", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "production-secret");
    vi.stubEnv("CLIENT_ORIGIN", "https://app.umbravia-forge.example");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            action: "login",
            hostname: "app.umbravia-forge.example",
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
    vi.stubEnv("TURNSTILE_SECRET_KEY", "production-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(verifyCaptcha("token", "signup")).resolves.toBe(false);
  });
});
