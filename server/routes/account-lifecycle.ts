import express from "express";
import {
  authenticate,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import {
  cancelScheduledAccountDeletion,
  getAccountLifecycle,
  INACTIVITY_DELETION_OPTIONS,
  scheduleAccountDeletion,
  type InactivityDeletionMonths,
  updateInactivityDeletionPreference,
} from "../services/account-lifecycle.js";

export const accountLifecycleRouter = express.Router();
accountLifecycleRouter.use(authenticate);

accountLifecycleRouter.get("/", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.json(await getAccountLifecycle(userId));
  } catch (error) {
    next(error);
  }
});

accountLifecycleRouter.put("/inactivity", async (req, res, next) => {
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
});

accountLifecycleRouter.post("/deletion", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.status(202).json(await scheduleAccountDeletion(userId, "manual"));
  } catch (error) {
    next(error);
  }
});

accountLifecycleRouter.delete("/deletion", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.json(await cancelScheduledAccountDeletion(userId));
  } catch (error) {
    next(error);
  }
});
