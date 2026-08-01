import type { NextFunction, Request, Response } from "express";
import {
  captchaIsConfigured,
  type CaptchaAction,
  verifyCaptcha,
} from "../services/captcha.js";

export const requireCaptcha =
  (action: CaptchaAction) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!captchaIsConfigured()) {
      res.status(503).json({
        code: "CAPTCHA_NOT_CONFIGURED",
        error: "Human verification is temporarily unavailable",
      });
      return;
    }

    const token =
      typeof req.body?.captchaToken === "string" ? req.body.captchaToken : "";
    if (!(await verifyCaptcha(token, action))) {
      res.status(403).json({
        code: "CAPTCHA_FAILED",
        error: "Human verification failed or expired",
      });
      return;
    }
    next();
  };
