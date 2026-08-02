import type { NextFunction, Request, Response } from "express";
import {
  captchaIsConfigured,
  type CaptchaAction,
  verifyCaptchaDetailed,
} from "../services/captcha.js";
import { recordSecurityEvent } from "../services/security-events.js";

async function recordCaptchaResult(
  success: boolean,
  action: CaptchaAction,
  reason: string,
): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    await recordSecurityEvent(
      success ? "captcha_succeeded" : "captcha_failed",
      null,
      { action, reason, surface: "authentication" },
    );
  } catch {
    // Security telemetry must not make authentication unavailable.
  }
}

export const requireCaptcha =
  (action: CaptchaAction) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!captchaIsConfigured()) {
      await recordCaptchaResult(false, action, "not_configured");
      res.status(503).json({
        code: "CAPTCHA_NOT_CONFIGURED",
        error: "Human verification is temporarily unavailable",
      });
      return;
    }

    const token =
      typeof req.body?.captchaToken === "string" ? req.body.captchaToken : "";
    const result = await verifyCaptchaDetailed(token, action, req.ip);
    await recordCaptchaResult(result.success, action, result.reason);
    if (!result.success) {
      res.status(403).json({
        code: "CAPTCHA_FAILED",
        error: "Human verification failed or expired",
      });
      return;
    }
    next();
  };
