import {
  isProductionLike,
  resolveDeploymentProfile,
  type DeploymentProfile,
} from "./deployment-profile.js";
import { resolveEmailDeliveryConfiguration } from "../services/email-delivery.js";
import { emailVerificationIsEnabled } from "./account-verification-mode.js";
import { recaptchaMinimumScore } from "../services/captcha.js";

type ProductionConfiguration = {
  deploymentProfile: DeploymentProfile;
  clientOrigin: URL;
  webauthnOrigin: URL;
  webauthnRpId: string;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required in production`);
  return value;
}

function secureOrigin(value: string, name: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an origin without path, query or hash`);
  }
  return url;
}

function isLoopbackHost(value: string): boolean {
  return value === "127.0.0.1" || value === "::1";
}

function requireMfaEncryptionKey(environment: NodeJS.ProcessEnv): string {
  const value = required(environment, "MFA_ENCRYPTION_KEY");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64",
    );
  }
  return value;
}

export function validateProductionConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  activeDatabaseProvider?: "sqlite" | "postgresql",
): ProductionConfiguration | null {
  const deploymentProfile = resolveDeploymentProfile(environment);
  if (!isProductionLike(deploymentProfile)) return null;

  const clientOrigin = secureOrigin(
    required(environment, "CLIENT_ORIGIN"),
    "CLIENT_ORIGIN",
  );
  const webauthnOrigin = secureOrigin(
    required(environment, "WEBAUTHN_ORIGIN"),
    "WEBAUTHN_ORIGIN",
  );
  const webauthnRpId = required(environment, "WEBAUTHN_RP_ID");
  const databaseProvider = required(environment, "DATABASE_PROVIDER");
  required(environment, "DATABASE_URL");
  const recaptchaSecret = required(environment, "RECAPTCHA_SECRET_KEY");
  recaptchaMinimumScore(environment);
  requireMfaEncryptionKey(environment);
  const emailVerificationEnabled = emailVerificationIsEnabled(environment);
  const emailDelivery = emailVerificationEnabled
    ? resolveEmailDeliveryConfiguration(environment)
    : null;
  const host = environment.HOST?.trim() || "127.0.0.1";

  if (emailVerificationEnabled && !emailDelivery) {
    throw new Error(
      "SMTP_HOST, SMTP_PORT and EMAIL_FROM are required for email verification in production",
    );
  }

  if (!isLoopbackHost(host)) {
    throw new Error(
      "HOST must be a loopback address in production; expose the application through the reverse proxy",
    );
  }
  if (
    recaptchaSecret.length < 20 ||
    /replace|change|example|test-secret/i.test(recaptchaSecret)
  ) {
    throw new Error(
      "RECAPTCHA_SECRET_KEY must be a real secret, not a test value or placeholder",
    );
  }

  if (clientOrigin.origin !== webauthnOrigin.origin) {
    throw new Error(
      "CLIENT_ORIGIN and WEBAUTHN_ORIGIN must match for the initial deployment",
    );
  }
  if (
    webauthnOrigin.hostname !== webauthnRpId &&
    !webauthnOrigin.hostname.endsWith(`.${webauthnRpId}`)
  ) {
    throw new Error(
      "WEBAUTHN_RP_ID must match the deployed application domain",
    );
  }
  if (environment.SEED_DEMO_DATA === "true") {
    throw new Error("SEED_DEMO_DATA must remain false in production");
  }
  if (databaseProvider !== "postgresql") {
    throw new Error("DATABASE_PROVIDER must be postgresql in production");
  }
  if (
    activeDatabaseProvider !== undefined &&
    activeDatabaseProvider !== databaseProvider
  ) {
    throw new Error(
      `The active database provider is ${activeDatabaseProvider}, but production is configured for ${databaseProvider}`,
    );
  }

  return { deploymentProfile, clientOrigin, webauthnOrigin, webauthnRpId };
}
