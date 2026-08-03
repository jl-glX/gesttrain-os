type ProductionConfiguration = {
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

export function validateProductionConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  activeDatabaseProvider?: "sqlite" | "postgresql",
): ProductionConfiguration | null {
  if (environment.NODE_ENV !== "production") return null;

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
  required(environment, "TURNSTILE_SECRET_KEY");
  required(environment, "MFA_ENCRYPTION_KEY");

  if (clientOrigin.origin !== webauthnOrigin.origin) {
    throw new Error(
      "CLIENT_ORIGIN and WEBAUTHN_ORIGIN must match for the initial Azure deployment",
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

  return { clientOrigin, webauthnOrigin, webauthnRpId };
}
