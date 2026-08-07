import dotenv from "dotenv";

dotenv.config({ path: ".env.production", quiet: true });

const TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);

const siteKey = process.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

if (
  !siteKey ||
  TEST_SITE_KEYS.has(siteKey) ||
  /replace|change|example/i.test(siteKey)
) {
  console.error(
    "Deployment packaging requires a real VITE_TURNSTILE_SITE_KEY in the environment or .env.production.",
  );
  process.exitCode = 1;
} else {
  console.log("Deployment build configuration validated.");
}
