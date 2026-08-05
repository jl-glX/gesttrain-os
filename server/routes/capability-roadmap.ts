import express from "express";
import { authenticate, requireRole } from "../middleware/authorization.js";
import { getCapabilityRoadmap } from "../services/capability-roadmap.js";

export const capabilityRoadmapRouter = express.Router();
capabilityRoadmapRouter.use(authenticate, requireRole("admin"));
capabilityRoadmapRouter.get("/", (_req, res) => {
  res.json(getCapabilityRoadmap());
});
