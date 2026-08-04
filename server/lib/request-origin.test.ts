import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllowedClientOrigins, isTrustedOrigin } from "./request-origin.js";

describe("trusted request origins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires an explicit HTTPS client origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_ORIGIN", "");
    expect(() => getAllowedClientOrigins()).toThrow(
      "CLIENT_ORIGIN is required in production",
    );

    vi.stubEnv("CLIENT_ORIGIN", "http://umbravia-forge.example");
    expect(() => getAllowedClientOrigins()).toThrow(
      "CLIENT_ORIGIN must use HTTPS in production",
    );
  });

  it("trusts only configured production origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "CLIENT_ORIGIN",
      "https://umbravia-forge.example,https://admin.umbravia-forge.example",
    );

    expect(isTrustedOrigin("https://umbravia-forge.example")).toBe(true);
    expect(isTrustedOrigin("https://attacker.example")).toBe(false);
  });
});
