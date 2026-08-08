const ENABLED = "true";
const DISABLED = "false";

/** Email ownership is the normal account-activation path. */
export function emailVerificationIsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured =
    environment.EMAIL_VERIFICATION_ENABLED?.trim().toLowerCase();
  if (!configured) return true;
  if (configured === ENABLED) return true;
  if (configured === DISABLED) return false;
  throw new Error("EMAIL_VERIFICATION_ENABLED must be true or false");
}
