import express from "express";
import {
  authenticate,
  getAuthenticatedUser,
  requireRole,
} from "../middleware/authorization.js";
import {
  createDraftRetentionPolicy,
  listRetentionOverview,
} from "../services/data-retention.js";
import { retentionPolicyValidation } from "../middleware/validation.js";

export const dataRetentionRouter = express.Router();
dataRetentionRouter.use(authenticate, requireRole("admin"));

dataRetentionRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listRetentionOverview());
  } catch (error) {
    next(error);
  }
});

dataRetentionRouter.post(
  "/policies",
  retentionPolicyValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      const rawRetentionDays = req.body?.retentionDays;
      const policy = await createDraftRetentionPolicy(
        {
          name: String(req.body?.name ?? ""),
          jurisdiction: String(req.body?.jurisdiction ?? ""),
          dataCategory: String(req.body?.dataCategory ?? ""),
          retentionDays:
            rawRetentionDays === "" ||
            rawRetentionDays === null ||
            rawRetentionDays === undefined
              ? null
              : Number(rawRetentionDays),
          legalBasisReference: String(req.body?.legalBasisReference ?? ""),
        },
        userId,
      );
      res.status(201).json({ policy });
    } catch (error) {
      next(error);
    }
  },
);
