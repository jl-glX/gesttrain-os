import express from "express";
import {
  authenticateAccountSession,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import { getAccountManagerOverview } from "../services/account-manager.js";

export const accountManagerRouter = express.Router();
accountManagerRouter.use(authenticateAccountSession);

accountManagerRouter.get("/", async (_req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    res.json(
      await getAccountManagerOverview(
        auth.userId,
        auth.sessionId,
        auth.accountStatus,
      ),
    );
  } catch (error) {
    next(error);
  }
});
