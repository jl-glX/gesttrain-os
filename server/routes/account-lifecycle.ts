import express from "express";
import {
  authenticate,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import {
  cancelScheduledAccountDeletion,
  getDataDeletionReview,
  getAccountLifecycle,
  INACTIVITY_DELETION_OPTIONS,
  scheduleAccountDeletion,
  saveDataDeletionReview,
  type InactivityDeletionMonths,
  updateInactivityDeletionPreference,
} from "../services/account-lifecycle.js";
import {
  ACCOUNT_DATA_CATEGORIES,
  type AccountDataCategory,
} from "../services/data-retention.js";
import {
  deletionReviewValidation,
  emptyAccountDeletionRequestValidation,
  inactivityPreferenceValidation,
  scheduleAccountDeletionValidation,
} from "../middleware/validation.js";
import { authenticationLimiter } from "../middleware/security.js";
import { verifyUserPassword } from "../services/auth.js";
import { requireRecentFormVerification } from "../middleware/form-verification.js";

export const accountLifecycleRouter = express.Router();
accountLifecycleRouter.use(authenticate);
accountLifecycleRouter.use(requireRecentFormVerification);

accountLifecycleRouter.get("/", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.json(await getAccountLifecycle(userId));
  } catch (error) {
    next(error);
  }
});

accountLifecycleRouter.put(
  "/inactivity",
  inactivityPreferenceValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      const value = req.body?.inactivityMonths;
      const inactivityMonths =
        value === null || value === "disabled" ? null : Number(value);
      if (
        inactivityMonths !== null &&
        !INACTIVITY_DELETION_OPTIONS.includes(
          inactivityMonths as (typeof INACTIVITY_DELETION_OPTIONS)[number],
        )
      ) {
        res.status(400).json({ error: "Invalid inactivity period" });
        return;
      }
      res.json(
        await updateInactivityDeletionPreference(
          userId,
          inactivityMonths as InactivityDeletionMonths | null,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

accountLifecycleRouter.post(
  "/deletion",
  authenticationLimiter,
  scheduleAccountDeletionValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      if (!(await verifyUserPassword(userId, req.body.password))) {
        res.status(401).json({
          error: "Invalid security confirmation",
          code: "SECURITY_CONFIRMATION_FAILED",
        });
        return;
      }
      res.status(202).json(await scheduleAccountDeletion(userId, "manual"));
    } catch (error) {
      next(error);
    }
  },
);

accountLifecycleRouter.delete(
  "/deletion",
  emptyAccountDeletionRequestValidation,
  async (
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      res.json(await cancelScheduledAccountDeletion(userId));
    } catch (error) {
      next(error);
    }
  },
);

accountLifecycleRouter.get("/deletion-review", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.json(await getDataDeletionReview(userId));
  } catch (error) {
    next(error);
  }
});

accountLifecycleRouter.put(
  "/deletion-review",
  deletionReviewValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      const categories = req.body?.selectedCategories;
      const intent = req.body?.intent;
      if (
        !Array.isArray(categories) ||
        !categories.every(
          (category): category is AccountDataCategory =>
            typeof category === "string" &&
            ACCOUNT_DATA_CATEGORIES.includes(category as AccountDataCategory),
        ) ||
        (intent !== "selected_data" && intent !== "account_closure")
      ) {
        res.status(400).json({ error: "Invalid deletion review" });
        return;
      }
      res.json(await saveDataDeletionReview(userId, categories, intent));
    } catch (error) {
      next(error);
    }
  },
);
