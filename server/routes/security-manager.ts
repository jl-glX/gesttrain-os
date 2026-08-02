import express from "express";
import { authenticate, requireRole } from "../middleware/authorization.js";
import { getSecurityManagerOverview } from "../services/security-manager.js";

export const securityManagerRouter = express.Router();
securityManagerRouter.use(authenticate, requireRole("admin"));

securityManagerRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getSecurityManagerOverview());
  } catch (error) {
    next(error);
  }
});
