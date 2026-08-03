export type DeploymentProfile =
  "development" | "test" | "demo" | "staging" | "production";

export function resolveDeploymentProfile(
  environment: NodeJS.ProcessEnv = process.env,
): DeploymentProfile {
  const configured = environment.APP_ENV?.trim().toLowerCase();
  if (configured) {
    if (
      configured !== "development" &&
      configured !== "test" &&
      configured !== "demo" &&
      configured !== "staging" &&
      configured !== "production"
    ) {
      throw new Error(
        "APP_ENV must be development, test, demo, staging or production",
      );
    }
    const expectsProductionRuntime =
      configured === "staging" || configured === "production";
    if (expectsProductionRuntime && environment.NODE_ENV !== "production") {
      throw new Error(`APP_ENV=${configured} requires NODE_ENV=production`);
    }
    if (!expectsProductionRuntime && environment.NODE_ENV === "production") {
      throw new Error(
        `APP_ENV=${configured} cannot run with NODE_ENV=production`,
      );
    }
    return configured;
  }

  if (environment.NODE_ENV === "production") return "production";
  if (environment.NODE_ENV === "test") return "test";
  return "development";
}

export function isProductionLike(profile: DeploymentProfile): boolean {
  return profile === "staging" || profile === "production";
}
