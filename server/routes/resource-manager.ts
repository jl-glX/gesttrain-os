import express from "express";
import {
  getResourceManagerStatus,
  runManagedTask,
  setManagedTaskEnabled,
} from "../services/resource-manager.js";
import { authenticate, requireRole } from "../middleware/authorization.js";
import {
  resourceTaskStateValidation,
  validateId,
} from "../middleware/validation.js";

export const resourceManagerRouter = express.Router();
resourceManagerRouter.use(authenticate, requireRole("admin"));

resourceManagerRouter.get("/", (_req, res) => {
  res.json(getResourceManagerStatus());
});

resourceManagerRouter.patch(
  "/tasks/:taskId",
  resourceTaskStateValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      if (typeof req.body?.enabled !== "boolean") {
        res.status(400).json({
          error: "enabled must be a boolean",
          code: "INVALID_RESOURCE_TASK_STATE",
        });
        return;
      }
      res.json(setManagedTaskEnabled(req.params.taskId, req.body.enabled));
    } catch (error) {
      next(error);
    }
  },
);

resourceManagerRouter.post(
  "/tasks/:taskId/run",
  validateId("taskId"),
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      res.json(await runManagedTask(req.params.taskId));
    } catch (error) {
      next(error);
    }
  },
);
