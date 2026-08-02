import express from "express";
import {
  authenticateAccountSession,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import {
  accountRepresentationIdValidation,
  accountRepresentationValidation,
} from "../middleware/validation.js";
import {
  createAccountRepresentationDraft,
  getAccountContinuityBridge,
  revokeAccountRepresentation,
  type AccountRepresentationReason,
  type AccountRepresentationScope,
} from "../services/account-continuity.js";
import { requireRecentFormVerification } from "../middleware/form-verification.js";

export const accountContinuityRouter = express.Router();
accountContinuityRouter.use(authenticateAccountSession);
accountContinuityRouter.use(requireRecentFormVerification);

accountContinuityRouter.get("/", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.json(await getAccountContinuityBridge(userId));
  } catch (error) {
    next(error);
  }
});

accountContinuityRouter.post(
  "/representations",
  accountRepresentationValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      res.status(201).json(
        await createAccountRepresentationDraft(userId, {
          supportIdentifier: String(req.body.supportIdentifier),
          scopes: req.body.scopes as AccountRepresentationScope[],
          reason: req.body.reason as AccountRepresentationReason,
          expiresAt:
            req.body.expiresAt === null || req.body.expiresAt === undefined
              ? null
              : Number(req.body.expiresAt),
        }),
      );
    } catch (error) {
      next(error);
    }
  },
);

accountContinuityRouter.delete(
  "/representations/:representationId",
  accountRepresentationIdValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      res.json(
        await revokeAccountRepresentation(userId, req.params.representationId),
      );
    } catch (error) {
      next(error);
    }
  },
);
