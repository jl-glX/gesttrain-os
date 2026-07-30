import express from "express";
import {
  authenticate,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import { getSupportIdentifier } from "../services/support-identifiers.js";

export const accountIdentityRouter = express.Router();
accountIdentityRouter.use(authenticate);

accountIdentityRouter.get(
  "/",
  async (_req: express.Request, res: express.Response, next) => {
    try {
      const { userId } = getAuthenticatedUser(res);
      const supportIdentifier = await getSupportIdentifier(userId);
      res.json({ supportIdentifier });
    } catch (error) {
      next(error);
    }
  },
);
