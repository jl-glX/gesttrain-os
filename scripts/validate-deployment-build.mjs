import dotenv from "dotenv";

dotenv.config({ path: ".env.production", quiet: true });

const siteKey = process.env.VITE_RECAPTCHA_SITE_KEY?.trim() ?? "";

if (!siteKey || /replace|change|example/i.test(siteKey)) {
  console.error(
    "Deployment packaging requires a real VITE_RECAPTCHA_SITE_KEY in the environment or .env.production.",
  );
  process.exitCode = 1;
} else {
  console.log("Deployment build configuration validated.");
}
