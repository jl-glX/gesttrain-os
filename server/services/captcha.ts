const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_MINIMUM_SCORE = 0.5;
const MAX_CHALLENGE_AGE_MS = 3 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  hostname?: string;
  action?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
}

export type CaptchaAction = "login" | "signup" | "form_access" | "feedback";
export type CaptchaVerificationReason =
  | "verified"
  | "test_environment"
  | "not_configured"
  | "missing_token"
  | "token_too_long"
  | "provider_unavailable"
  | "provider_rejected"
  | "score_too_low"
  | "action_mismatch"
  | "hostname_mismatch"
  | "challenge_expired";

export interface CaptchaVerificationResult {
  success: boolean;
  reason: CaptchaVerificationReason;
  score?: number;
}

function configuredSecret(): string | null {
  return process.env.RECAPTCHA_SECRET_KEY?.trim() || null;
}

export function recaptchaMinimumScore(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const raw = environment.RECAPTCHA_MIN_SCORE?.trim();
  if (!raw) return DEFAULT_MINIMUM_SCORE;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("RECAPTCHA_MIN_SCORE must be a number between 0 and 1");
  }
  return value;
}

function allowedHostnames(): Set<string> {
  return new Set(
    (process.env.CLIENT_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .flatMap((origin) => {
        try {
          return [new URL(origin).hostname];
        } catch {
          return [];
        }
      }),
  );
}

export function captchaIsConfigured(): boolean {
  // Automated tests must not depend on Google or on a developer secret. The
  // production paths below are still exercised explicitly with NODE_ENV set
  // to production in the CAPTCHA test suite.
  if (process.env.NODE_ENV === "test") return true;
  return configuredSecret() !== null;
}

export async function verifyCaptcha(
  token: string,
  action: CaptchaAction,
  remoteIp?: string,
): Promise<boolean> {
  return (await verifyCaptchaDetailed(token, action, remoteIp)).success;
}

export async function verifyCaptchaDetailed(
  token: string,
  action: CaptchaAction,
  remoteIp?: string,
): Promise<CaptchaVerificationResult> {
  if (process.env.NODE_ENV === "test") {
    return { success: true, reason: "test_environment" };
  }
  const secret = configuredSecret();
  if (!secret) return { success: false, reason: "not_configured" };
  if (!token) return { success: false, reason: "missing_token" };
  if (token.length > 2_048) {
    return { success: false, reason: "token_too_long" };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { success: false, reason: "provider_unavailable" };
    }
    const result = (await response.json()) as RecaptchaResponse;
    if (!result.success || (result["error-codes"]?.length ?? 0) > 0) {
      return { success: false, reason: "provider_rejected" };
    }
    if (result.action !== action) {
      return { success: false, reason: "action_mismatch" };
    }
    const hostnames = allowedHostnames();
    if (!result.hostname || !hostnames.has(result.hostname)) {
      return { success: false, reason: "hostname_mismatch" };
    }
    const score = result.score;
    if (!Number.isFinite(score) || score! < recaptchaMinimumScore()) {
      return { success: false, reason: "score_too_low", score };
    }
    const challengeTime = Date.parse(result.challenge_ts ?? "");
    const age = Date.now() - challengeTime;
    if (
      !Number.isFinite(challengeTime) ||
      age > MAX_CHALLENGE_AGE_MS ||
      age < -MAX_CLOCK_SKEW_MS
    ) {
      return { success: false, reason: "challenge_expired", score };
    }
    return { success: true, reason: "verified", score };
  } catch {
    return { success: false, reason: "provider_unavailable" };
  }
}
