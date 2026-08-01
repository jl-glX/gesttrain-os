export interface DemoDataEnvironment {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  SEED_DEMO_DATA?: string;
}

export function shouldSeedDemoData(
  environment: DemoDataEnvironment = process.env,
): boolean {
  const isProduction = environment.NODE_ENV === "production";
  const wasExplicitlyRequested = environment.SEED_DEMO_DATA === "true";

  if (isProduction && wasExplicitlyRequested) {
    throw new Error(
      "SEED_DEMO_DATA cannot be enabled in production because demo credentials are public",
    );
  }

  return !isProduction;
}
