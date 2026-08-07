const ENABLED = "true";
const DISABLED = "false";

/**
 * Email verification is intentionally opt-in while no reliable delivery
 * provider is configured. Keeping the switch server-side preserves the
 * existing challenge and SMTP implementation without exposing a half-working
 * account gate.
 */
export function emailVerificationIsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured =
    environment.EMAIL_VERIFICATION_ENABLED?.trim().toLowerCase();
  if (!configured) return false;
  if (configured === ENABLED) return true;
  if (configured === DISABLED) return false;
  throw new Error("EMAIL_VERIFICATION_ENABLED must be true or false");
}
