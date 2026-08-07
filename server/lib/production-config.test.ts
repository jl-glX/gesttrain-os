import { describe, expect, it } from "vitest";
import { validateProductionConfiguration } from "./production-config.js";

const validEnvironment = {
  NODE_ENV: "production",
  CLIENT_ORIGIN: "https://demo.umbravia-forge.example",
  WEBAUTHN_ORIGIN: "https://demo.umbravia-forge.example",
  WEBAUTHN_RP_ID: "demo.umbravia-forge.example",
  DATABASE_PROVIDER: "postgresql",
  DATABASE_URL: "postgresql://example.invalid/umbravia_forge",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "true",
  SMTP_USER: "smtp-user",
  SMTP_PASSWORD: "smtp-password",
  EMAIL_FROM: "Umbravia Forge <no-reply@example.invalid>",
  HOST: "127.0.0.1",
  SEED_DEMO_DATA: "false",
};

describe("production configuration", () => {
  it("does nothing outside production", () => {
    expect(validateProductionConfiguration({ NODE_ENV: "test" })).toBeNull();
  });

  it("accepts a complete HTTPS configuration", () => {
    expect(
      validateProductionConfiguration(validEnvironment, "postgresql"),
    ).toMatchObject({ webauthnRpId: "demo.umbravia-forge.example" });
  });

  it("applies the same safeguards to staging", () => {
    expect(
      validateProductionConfiguration(
        { ...validEnvironment, APP_ENV: "staging" },
        "postgresql",
      ),
    ).toMatchObject({
      deploymentProfile: "staging",
      webauthnRpId: "demo.umbravia-forge.example",
    });
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
        CLIENT_ORIGIN: "http://demo.umbravia-forge.example",
      }),
    ).toThrow(/HTTPS/);
  });

  it("rejects production without a complete email delivery channel", () => {
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        SMTP_HOST: "",
        SMTP_PORT: "",
        SMTP_SECURE: "",
        SMTP_REQUIRE_TLS: "",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        EMAIL_FROM: "",
      }),
    ).toThrow(/email verification/i);
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        SMTP_PASSWORD: "",
      }),
    ).toThrow(/configured together/i);
  });

  it("rejects public demo credentials in production", () => {
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        SEED_DEMO_DATA: "true",
      }),
    ).toThrow(/SEED_DEMO_DATA/);
  });

  it("rejects a public Node binding, placeholders and invalid MFA keys", () => {
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        HOST: "0.0.0.0",
      }),
    ).toThrow(/loopback/i);
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        TURNSTILE_SECRET_KEY: "replace-me",
      }),
    ).toThrow(/placeholder/i);
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      }),
    ).toThrow(/test key/i);
    expect(() =>
      validateProductionConfiguration({
        ...validEnvironment,
        MFA_ENCRYPTION_KEY: "not-a-valid-key",
      }),
    ).toThrow(/32 random bytes/i);
  });
});
