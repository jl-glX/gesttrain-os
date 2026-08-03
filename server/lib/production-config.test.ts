import { describe, expect, it } from "vitest";
import { validateProductionConfiguration } from "./production-config.js";

const validEnvironment = {
  NODE_ENV: "production",
  CLIENT_ORIGIN: "https://demo.gesttrain.example",
  WEBAUTHN_ORIGIN: "https://demo.gesttrain.example",
  WEBAUTHN_RP_ID: "demo.gesttrain.example",
  DATABASE_PROVIDER: "postgresql",
  DATABASE_URL: "postgresql://example.invalid/gesttrain",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  MFA_ENCRYPTION_KEY: "mfa-encryption-key",
  SEED_DEMO_DATA: "false",
};

describe("production configuration", () => {
  it("does nothing outside production", () => {
    expect(validateProductionConfiguration({ NODE_ENV: "test" })).toBeNull();
  });

  it("accepts a complete HTTPS configuration", () => {
    expect(
      validateProductionConfiguration(validEnvironment, "postgresql"),
    ).toMatchObject({ webauthnRpId: "demo.gesttrain.example" });
  });

  it("fails closed when configuration and active provider disagree", () => {
    expect(() =>
      validateProductionConfiguration(validEnvironment, "sqlite"),
    ).toThrow(/active database provider/i);
  });

  it("rejects missing database configuration and insecure origins", () => {
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        DATABASE_URL: "",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        CLIENT_ORIGIN: "http://demo.gesttrain.example",
      }),
    ).toThrow(/HTTPS/);
  });

  it("rejects public demo credentials in production", () => {
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        SEED_DEMO_DATA: "true",
      }),
    ).toThrow(/SEED_DEMO_DATA/);
  });
});
