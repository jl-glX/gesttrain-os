import express from "express";
import type { RequestHandler } from "express";
import { db } from "../db/client.js";
import { authenticate, requireRole } from "../middleware/authorization.js";
import { facilityProfileValidation } from "../middleware/validation.js";
import { requireRecentFormVerification } from "../middleware/form-verification.js";

const PRIMARY_FACILITY_ID = "primary";

export const facilityProfileRouter = express.Router();
facilityProfileRouter.use(authenticate);
facilityProfileRouter.use(express.json({ limit: "768kb" }));
facilityProfileRouter.use(requireRecentFormVerification);

facilityProfileRouter.get("/", async (_req, res, next) => {
  try {
    res.json(
      await db
        .selectFrom("facilityProfiles")
        .selectAll()
        .where("id", "=", PRIMARY_FACILITY_ID)
        .executeTakeFirstOrThrow(),
    );
  } catch (error) {
    next(error);
  }
});

const updateFacilityProfile: RequestHandler = async (req, res, next) => {
  try {
    await db
      .updateTable("facilityProfiles")
      .set({ ...req.body, updatedAt: Date.now() })
      .where("id", "=", PRIMARY_FACILITY_ID)
      .executeTakeFirstOrThrow();

    res.json(
      await db
        .selectFrom("facilityProfiles")
        .selectAll()
        .where("id", "=", PRIMARY_FACILITY_ID)
        .executeTakeFirstOrThrow(),
    );
  } catch (error) {
    next(error);
  }
};

facilityProfileRouter.patch(
  "/",
  requireRole("admin"),
  facilityProfileValidation,
  updateFacilityProfile,
);
