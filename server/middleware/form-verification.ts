import type { NextFunction, Request, Response } from "express";
import { getAuthenticatedUser } from "./authorization.js";
import { getFormVerificationStatus } from "../services/form-verification.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function requireRecentFormVerification(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  try {
    const { sessionId } = getAuthenticatedUser(res);
    const status = await getFormVerificationStatus(sessionId);
    if (!status.verified) {
      res.status(428).json({
        error: "Human verification is required before submitting this form",
        code: "FORM_VERIFICATION_REQUIRED",
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
