import express from "express";
import {
  getAllClasses,
  getClassWithAvailability,
  createClass,
  updateClass,
  deleteClass,
} from "../services/classes.js";
import {
  createClassValidation,
  updateClassValidation,
  validateId,
} from "../middleware/validation.js";
import { authenticate, requireRole } from "../middleware/authorization.js";
import { requireRecentFormVerification } from "../middleware/form-verification.js";

export const adminClassesRouter = express.Router();
adminClassesRouter.use(authenticate, requireRole("admin"));
adminClassesRouter.use(requireRecentFormVerification);

// Get all classes
adminClassesRouter.get(
  "/",
  async (req: express.Request, res: express.Response) => {
    try {
      const classes = await getAllClasses();
      res.json(classes);
    } catch (error) {
      console.error("Error fetching classes:", error);
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  },
);

// Get single class
adminClassesRouter.get(
  "/:id",
  validateId("id"),
  async (req: express.Request, res: express.Response) => {
    try {
      const gymClass = await getClassWithAvailability(req.params.id);
      if (!gymClass) {
        res.status(404).json({ error: "Class not found" });
        return;
      }
      res.json(gymClass);
    } catch (error) {
      console.error("Error fetching class:", error);
      res.status(500).json({ error: "Failed to fetch class" });
    }
  },
);

// Create class
adminClassesRouter.post(
  "/",
  createClassValidation,
  async (req: express.Request, res: express.Response) => {
    try {
      const {
        name,
        description,
        trainerId,
        trainerName,
        maxCapacity,
        scheduledAt,
      } = req.body;

      if (!name || !trainerId || !maxCapacity || !scheduledAt) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const newClass = await createClass({
        name,
        description: description || "",
        trainerId,
        trainerName,
        maxCapacity,
        scheduledAt,
      });

      res.status(201).json(newClass);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error creating class:", error);
      res.status(400).json({ error: message });
    }
  },
);

// Update class
adminClassesRouter.put(
  "/:id",
  updateClassValidation,
  async (req: express.Request, res: express.Response) => {
    try {
      const {
        name,
        description,
        trainerId,
        trainerName,
        maxCapacity,
        scheduledAt,
      } = req.body;

      const updatedClass = await updateClass(req.params.id, {
        name,
        description,
        trainerId,
        trainerName,
        maxCapacity,
        scheduledAt,
      });

      res.json(updatedClass);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error updating class:", error);
      res.status(400).json({ error: message });
    }
  },
);

// Delete class
adminClassesRouter.delete(
  "/:id",
  validateId("id"),
  async (req: express.Request, res: express.Response) => {
    try {
      await deleteClass(req.params.id);
      res.json({ message: "Class deleted successfully" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error deleting class:", error);
      res.status(400).json({ error: message });
    }
  },
);
