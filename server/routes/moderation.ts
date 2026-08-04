import { randomUUID } from "node:crypto";
import express from "express";
import { db } from "../db/client.js";
import {
  authenticate,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import { moderationStatuses } from "../lib/community-policy.js";
import { requireRecentFormVerification } from "../middleware/form-verification.js";
import { canAccessChannel } from "./community.js";

export const moderationRouter = express.Router();
moderationRouter.use(authenticate);
moderationRouter.use((req, res, next) =>
  req.method === "GET" ? next() : requireRecentFormVerification(req, res, next),
);

function parseEvidence(value: unknown) {
  if (!Array.isArray(value) || value.length > 10) return null;
  if (
    value.some(
      (item) =>
        typeof item !== "string" || item.trim().length < 1 || item.length > 500,
    )
  )
    return null;
  return value.map((item: string) => item.trim());
}

moderationRouter.get("/cases", async (_req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    const query = db
      .selectFrom("moderationCases")
      .selectAll()
      .orderBy("createdAt", "desc");
    res.json(
      await (
        auth.role === "admin"
          ? query
          : query.where((eb) =>
              eb.or([
                eb("reporterUserId", "=", auth.userId),
                eb("subjectUserId", "=", auth.userId),
              ]),
            )
      ).execute(),
    );
  } catch (error) {
    next(error);
  }
});

moderationRouter.post("/cases", async (req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    const category = String(req.body.category ?? "").trim();
    const description = String(req.body.description ?? "").trim();
    if (
      category.length < 2 ||
      category.length > 80 ||
      description.length < 10 ||
      description.length > 4000
    )
      return res.status(400).json({ error: "Report data is invalid" });
    const urgency = (["normal", "high", "critical"] as const).includes(
      req.body.urgency,
    )
      ? req.body.urgency
      : "normal";
    const now = Date.now();
    let subjectUserId = req.body.subjectUserId
      ? String(req.body.subjectUserId)
      : null;
    const messageId = req.body.messageId ? String(req.body.messageId) : null;
    const evidence = parseEvidence(req.body.evidence ?? []);
    if (!evidence)
      return res.status(400).json({ error: "Evidence references are invalid" });
    if (messageId) {
      const message = await db
        .selectFrom("communityMessages")
        .select(["channelId", "authorUserId", "kind"])
        .where("id", "=", messageId)
        .executeTakeFirst();
      const channel = message
        ? await canAccessChannel(auth.userId, auth.role, message.channelId)
        : null;
      if (
        !message ||
        !channel ||
        (auth.role === "member" &&
          message.kind === "private_justification" &&
          message.authorUserId !== auth.userId)
      )
        return res.status(404).json({ error: "Reportable message not found" });
      if (subjectUserId && subjectUserId !== message.authorUserId)
        return res
          .status(400)
          .json({ error: "Reported account does not match message author" });
      subjectUserId = message.authorUserId;
    }
    if (subjectUserId === auth.userId)
      return res.status(400).json({ error: "You cannot report yourself" });
    if (
      subjectUserId &&
      !(await db
        .selectFrom("users")
        .select("id")
        .where("id", "=", subjectUserId)
        .executeTakeFirst())
    )
      return res.status(400).json({ error: "Subject account does not exist" });
    const report = {
      id: randomUUID(),
      reporterUserId: auth.userId,
      subjectUserId,
      messageId,
      facilityId: "primary",
      category,
      description,
      evidence: JSON.stringify(evidence),
      urgency,
      status: "open" as const,
      resolution: "",
      createdAt: now,
      updatedAt: now,
    };
    await db.insertInto("moderationCases").values(report).execute();
    if (report.messageId)
      await db
        .updateTable("communityMessages")
        .set({ status: "reported", updatedAt: now })
        .where("id", "=", report.messageId)
        .execute();
    res.status(201).json(report);
  } catch (error) {
    next(error);
  }
});

moderationRouter.patch("/cases/:id", async (req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    if (auth.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    const status = String(req.body.status ?? "");
    if (
      !(["open", "in_review", "resolved", "rejected"] as string[]).includes(
        status,
      )
    )
      return res.status(400).json({ error: "Case status is invalid" });
    const resolution = String(req.body.resolution ?? "").trim();
    if (["resolved", "rejected"].includes(status) && resolution.length < 5)
      return res
        .status(400)
        .json({ error: "Closed cases require a documented resolution" });
    if (resolution.length > 4000)
      return res.status(400).json({ error: "Resolution is too long" });
    const result = await db
      .updateTable("moderationCases")
      .set({
        status: status as "open" | "in_review" | "resolved" | "rejected",
        resolution,
        updatedAt: Date.now(),
      })
      .where("id", "=", req.params.id)
      .executeTakeFirst();
    if (!Number(result.numUpdatedRows))
      return res.status(404).json({ error: "Case not found" });
    res.json({ id: req.params.id, status });
  } catch (error) {
    next(error);
  }
});

moderationRouter.post("/cases/:id/actions", async (req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    if (auth.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    const state = String(
      req.body.state ?? "",
    ) as (typeof moderationStatuses)[number];
    const subjectUserId = String(req.body.subjectUserId ?? "");
    const reason = String(req.body.reason ?? "").trim();
    if (
      !moderationStatuses.includes(state) ||
      !subjectUserId ||
      reason.length < 5 ||
      reason.length > 1000
    )
      return res.status(400).json({ error: "Moderation action is invalid" });
    const moderationCase = await db
      .selectFrom("moderationCases")
      .select(["id", "subjectUserId", "status"])
      .where("id", "=", req.params.id)
      .executeTakeFirst();
    const subject = await db
      .selectFrom("users")
      .select("id")
      .where("id", "=", subjectUserId)
      .executeTakeFirst();
    if (!moderationCase || !subject)
      return res
        .status(404)
        .json({ error: "Case or subject account not found" });
    if (moderationCase.subjectUserId !== subjectUserId)
      return res.status(409).json({
        error: "Moderation subject does not match the reported account",
        code: "MODERATION_SUBJECT_MISMATCH",
      });
    if (["resolved", "rejected"].includes(moderationCase.status))
      return res.status(409).json({ error: "Moderation case is closed" });
    let durationMinutes: number | null = null;
    if (req.body.durationMinutes != null) {
      durationMinutes = Number(req.body.durationMinutes);
      if (
        !Number.isSafeInteger(durationMinutes) ||
        durationMinutes < 1 ||
        durationMinutes > 525600
      )
        return res.status(400).json({ error: "Duration is invalid" });
    }
    const item = {
      id: randomUUID(),
      caseId: req.params.id,
      actorUserId: auth.userId,
      subjectUserId,
      state,
      reason,
      durationMinutes,
      createdAt: Date.now(),
    };
    await db.insertInto("moderationActions").values(item).execute();
    await db
      .updateTable("moderationCases")
      .set({ status: "in_review", updatedAt: Date.now() })
      .where("id", "=", req.params.id)
      .execute();
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

moderationRouter.post("/cases/:id/appeals", async (req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    const moderationCase = await db
      .selectFrom("moderationCases")
      .selectAll()
      .where("id", "=", req.params.id)
      .executeTakeFirst();
    if (!moderationCase || moderationCase.subjectUserId !== auth.userId)
      return res
        .status(404)
        .json({ error: "Eligible moderation case not found" });
    const context = String(req.body.context ?? "").trim();
    if (context.length < 10 || context.length > 4000)
      return res.status(400).json({ error: "Appeal context is invalid" });
    const action = await db
      .selectFrom("moderationActions")
      .select("id")
      .where("caseId", "=", moderationCase.id)
      .where("subjectUserId", "=", auth.userId)
      .executeTakeFirst();
    if (!action)
      return res.status(409).json({ error: "No moderation action to appeal" });
    const existingAppeal = await db
      .selectFrom("moderationAppeals")
      .select("id")
      .where("caseId", "=", moderationCase.id)
      .where("appellantUserId", "=", auth.userId)
      .where("status", "=", "open")
      .executeTakeFirst();
    if (existingAppeal)
      return res.status(409).json({ error: "An appeal is already open" });
    const evidence = parseEvidence(req.body.evidence ?? []);
    if (!evidence)
      return res.status(400).json({ error: "Evidence references are invalid" });
    const now = Date.now();
    const appeal = {
      id: randomUUID(),
      caseId: moderationCase.id,
      appellantUserId: auth.userId,
      context,
      evidence: JSON.stringify(evidence),
      status: "open" as const,
      resolution: "",
      createdAt: now,
      updatedAt: now,
    };
    await db.insertInto("moderationAppeals").values(appeal).execute();
    await db
      .updateTable("moderationCases")
      .set({ status: "appeal_open", updatedAt: now })
      .where("id", "=", moderationCase.id)
      .execute();
    res.status(201).json(appeal);
  } catch (error) {
    next(error);
  }
});

moderationRouter.get("/cases/:id/appeals", async (req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    const moderationCase = await db
      .selectFrom("moderationCases")
      .select(["id", "reporterUserId", "subjectUserId"])
      .where("id", "=", req.params.id)
      .executeTakeFirst();
    if (
      !moderationCase ||
      (auth.role !== "admin" &&
        moderationCase.reporterUserId !== auth.userId &&
        moderationCase.subjectUserId !== auth.userId)
    )
      return res.status(404).json({ error: "Moderation case not found" });
    res.json(
      await db
        .selectFrom("moderationAppeals")
        .selectAll()
        .where("caseId", "=", moderationCase.id)
        .orderBy("createdAt", "desc")
        .execute(),
    );
  } catch (error) {
    next(error);
  }
});

moderationRouter.patch("/appeals/:id", async (req, res, next) => {
  try {
    const auth = getAuthenticatedUser(res);
    if (auth.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    const status = String(req.body.status ?? "");
    const resolution = String(req.body.resolution ?? "").trim();
    if (!(status === "accepted" || status === "rejected"))
      return res.status(400).json({ error: "Appeal status is invalid" });
    if (resolution.length < 5 || resolution.length > 4000)
      return res.status(400).json({ error: "Appeal resolution is invalid" });
    const appeal = await db
      .selectFrom("moderationAppeals")
      .selectAll()
      .where("id", "=", req.params.id)
      .executeTakeFirst();
    if (!appeal) return res.status(404).json({ error: "Appeal not found" });
    if (appeal.status !== "open")
      return res.status(409).json({ error: "Appeal is already closed" });
    const updatedAt = Date.now();
    await db.transaction().execute(async (transaction) => {
      await transaction
        .updateTable("moderationAppeals")
        .set({ status, resolution, updatedAt })
        .where("id", "=", appeal.id)
        .execute();
      await transaction
        .updateTable("moderationCases")
        .set({
          status: status === "accepted" ? "in_review" : "resolved",
          resolution,
          updatedAt,
        })
        .where("id", "=", appeal.caseId)
        .execute();
    });
    res.json({ ...appeal, status, resolution, updatedAt });
  } catch (error) {
    next(error);
  }
});
