import {
  isProductionLike,
  resolveDeploymentProfile,
} from "./deployment-profile.js";

export interface DemoDataEnvironment {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  APP_ENV?: string;
  SEED_DEMO_DATA?: string;
}

export function shouldSeedDemoData(
  environment: DemoDataEnvironment = process.env,
): boolean {
  const isProduction = isProductionLike(
    resolveDeploymentProfile(environment as NodeJS.ProcessEnv),
  );
  const wasExplicitlyRequested = environment.SEED_DEMO_DATA === "true";

  if (isProduction && wasExplicitlyRequested) {
    throw new Error(
      "SEED_DEMO_DATA cannot be enabled in production because demo credentials are public",
    );
  }

  return !isProduction;
}
