import { randomBytes } from "node:crypto";
import express from "express";
import { db } from "../db/client.js";
import { authenticate, requireRole } from "../middleware/authorization.js";
import {
  createBillingRecordValidation,
  updateBillingRecordValidation,
  validateId,
} from "../middleware/validation.js";
import { requireRecentFormVerification } from "../middleware/form-verification.js";

export const billingRouter = express.Router();
billingRouter.use(authenticate, requireRole("admin"));
billingRouter.use(requireRecentFormVerification);

billingRouter.get("/", async (_req, res, next) => {
  try {
    res.json(
      await db
        .selectFrom("billingRecords")
        .selectAll()
        .orderBy("updatedAt", "desc")
        .execute(),
    );
  } catch (error) {
    next(error);
  }
});

billingRouter.post(
  "/",
  createBillingRecordValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const now = Date.now();
      const id = `billing-${randomBytes(10).toString("hex")}`;
      const values = {
        ...req.body,
        id,
        userId: req.body.userId ?? null,
        customerEmail: req.body.customerEmail ?? "",
        currency: req.body.currency.toUpperCase(),
        customCycleLabel:
          req.body.billingCycle === "custom"
            ? (req.body.customCycleLabel ?? "")
            : "",
        dueAt: req.body.dueAt ?? null,
        paidAt: req.body.status === "paid" ? (req.body.paidAt ?? now) : null,
        invoiceNumber: req.body.invoiceNumber || null,
        notes: req.body.notes ?? "",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insertInto("billingRecords").values(values).execute();
      res
        .status(201)
        .json(
          await db
            .selectFrom("billingRecords")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirstOrThrow(),
        );
    } catch (error) {
      next(error);
    }
  },
);

billingRouter.patch(
  "/:id",
  updateBillingRecordValidation,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const values = {
        ...req.body,
        ...(req.body.billingCycle && req.body.billingCycle !== "custom"
          ? { customCycleLabel: "" }
          : {}),
        ...(req.body.currency
          ? { currency: String(req.body.currency).toUpperCase() }
          : {}),
        ...(req.body.status === "paid" && req.body.paidAt == null
          ? { paidAt: Date.now() }
          : {}),
        ...(req.body.status && req.body.status !== "paid"
          ? { paidAt: null }
          : {}),
        updatedAt: Date.now(),
      };
      const result = await db
        .updateTable("billingRecords")
        .set(values)
        .where("id", "=", req.params.id)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        res.status(404).json({ error: "Billing record not found" });
        return;
      }
      res.json(
        await db
          .selectFrom("billingRecords")
          .selectAll()
          .where("id", "=", req.params.id)
          .executeTakeFirstOrThrow(),
      );
    } catch (error) {
      next(error);
    }
  },
);

billingRouter.delete(
  "/:id",
  validateId("id"),
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      await db
        .deleteFrom("billingRecords")
        .where("id", "=", req.params.id)
        .execute();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
