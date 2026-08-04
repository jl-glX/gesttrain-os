import { randomBytes } from "node:crypto";
import express from "express";
import { sql } from "kysely";
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

async function findBillingMember(userId: string) {
  return db
    .selectFrom("users")
    .select(["id", "name", "email", "role"])
    .where("id", "=", userId)
    .executeTakeFirst();
}

billingRouter.get("/members", async (req, res, next) => {
  try {
    const query = String(req.query.query ?? "")
      .trim()
      .toLowerCase();
    if (query.length < 2) {
      res.json([]);
      return;
    }
    if (query.length > 120) {
      res.status(400).json({ error: "Search query is too long" });
      return;
    }
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const members = await db
      .selectFrom("users")
      .leftJoin("accountSupportIdentifiers", (join) =>
        join
          .onRef("accountSupportIdentifiers.userId", "=", "users.id")
          .on("accountSupportIdentifiers.status", "=", "active"),
      )
      .leftJoin("socialProfiles", "socialProfiles.userId", "users.id")
      .select([
        "users.id",
        "users.name",
        "users.email",
        "users.phone",
        "accountSupportIdentifiers.publicId",
      ])
      .where("users.role", "=", "member")
      .where((eb) =>
        eb.or([
          sql<boolean>`LOWER(${eb.ref("users.name")}) LIKE ${pattern} ESCAPE '\\'`,
          sql<boolean>`LOWER(${eb.ref("users.email")}) LIKE ${pattern} ESCAPE '\\'`,
          sql<boolean>`LOWER(COALESCE(${eb.ref("users.phone")}, '')) LIKE ${pattern} ESCAPE '\\'`,
          sql<boolean>`LOWER(COALESCE(${eb.ref("accountSupportIdentifiers.publicId")}, '')) LIKE ${pattern} ESCAPE '\\'`,
          sql<boolean>`LOWER(COALESCE(${eb.ref("socialProfiles.username")}, '')) LIKE ${pattern} ESCAPE '\\'`,
          sql<boolean>`LOWER(${eb.ref("users.id")}) LIKE ${pattern} ESCAPE '\\'`,
        ]),
      )
      .orderBy("users.name")
      .limit(20)
      .execute();
    res.json(members);
  } catch (error) {
    next(error);
  }
});

billingRouter.get("/summary", async (_req, res, next) => {
  try {
    const records = await db
      .selectFrom("billingRecords")
      .selectAll()
      .where("archivedAt", "is", null)
      .execute();
    const currencies: Record<
      string,
      {
        total: number;
        paid: number;
        pending: number;
        unpaid: number;
        documents: number;
      }
    > = {};
    for (const record of records) {
      const bucket = currencies[record.currency] ?? {
        total: 0,
        paid: 0,
        pending: 0,
        unpaid: 0,
        documents: 0,
      };
      bucket.total += record.amountCents;
      bucket[record.status] += record.amountCents;
      bucket.documents += 1;
      currencies[record.currency] = bucket;
    }
    res.json({
      currencies,
      documentCount: records.length,
      concepts: new Set(records.map((record) => record.concept)).size,
    });
  } catch (error) {
    next(error);
  }
});

billingRouter.get("/", async (req, res, next) => {
  try {
    let query = db.selectFrom("billingRecords").selectAll();
    const status = String(req.query.status ?? "");
    if (status && !(["paid", "unpaid", "pending"] as string[]).includes(status))
      return res
        .status(400)
        .json({ error: "Billing status filter is invalid" });
    if (status)
      query = query.where(
        "status",
        "=",
        status as "paid" | "unpaid" | "pending",
      );
    if (req.query.userId)
      query = query.where("userId", "=", String(req.query.userId));
    const currency = String(req.query.currency ?? "").toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency))
      return res.status(400).json({ error: "Currency filter is invalid" });
    if (currency) query = query.where("currency", "=", currency);
    const from = req.query.from == null ? null : Number(req.query.from);
    const to = req.query.to == null ? null : Number(req.query.to);
    if (
      (from != null && (!Number.isSafeInteger(from) || from < 0)) ||
      (to != null && (!Number.isSafeInteger(to) || to < 0)) ||
      (from != null && to != null && from > to)
    )
      return res.status(400).json({ error: "Billing date range is invalid" });
    if (from != null) query = query.where("createdAt", ">=", from);
    if (to != null) query = query.where("createdAt", "<=", to);
    const concept = String(req.query.concept ?? "")
      .trim()
      .replace(/[%_]/g, "");
    if (req.query.concept != null && !concept)
      return res.status(400).json({ error: "Concept filter is invalid" });
    if (concept) query = query.where("concept", "like", `%${concept}%`);
    res.json(await query.orderBy("updatedAt", "desc").execute());
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
      const member = req.body.userId
        ? await findBillingMember(req.body.userId)
        : null;
      if (req.body.userId && !member) {
        res.status(400).json({ error: "Selected member does not exist" });
        return;
      }
      if (member && member.role !== "member") {
        res.status(400).json({ error: "Selected account is not a member" });
        return;
      }
      const values = {
        ...req.body,
        id,
        userId: member?.id ?? null,
        customerName: member?.name ?? req.body.customerName,
        customerEmail: member?.email ?? req.body.customerEmail ?? "",
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
      const current = await db
        .selectFrom("billingRecords")
        .selectAll()
        .where("id", "=", req.params.id)
        .executeTakeFirst();
      if (!current) {
        res.status(404).json({ error: "Billing record not found" });
        return;
      }
      const values = { ...req.body };
      if (current.userId) {
        const hasOwnField = (field: string) =>
          Object.prototype.hasOwnProperty.call(req.body, field);
        if (
          hasOwnField("customerName") ||
          hasOwnField("customerEmail") ||
          (hasOwnField("userId") && req.body.userId !== current.userId)
        ) {
          res.status(400).json({
            error: "Linked member identity snapshots cannot be changed",
          });
          return;
        }
        delete values.userId;
      } else if (req.body.userId) {
        const member = await findBillingMember(req.body.userId);
        if (!member || member.role !== "member") {
          res.status(400).json({ error: "Selected member does not exist" });
          return;
        }
        values.userId = member.id;
        values.customerName = member.name;
        values.customerEmail = member.email;
      }
      const normalizedValues = {
        ...values,
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
        .set(normalizedValues)
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
