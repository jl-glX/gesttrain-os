import express from "express";
import {
  authenticate,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import {
  clearInactiveDelegationHistory,
  createDelegationToken,
  listDelegations,
  redeemDelegationToken,
  revokeDelegationGrant,
  type DelegationDuration,
} from "../services/delegations.js";

const allowedDurations = new Set<DelegationDuration>([
  "24h",
  "7d",
  "30d",
  "indefinite",
]);

export const delegationsRouter = express.Router();
delegationsRouter.use(authenticate);

function sendDelegationError(res: express.Response, error: unknown) {
  const code = error instanceof Error ? error.message : "DELEGATION_UNKNOWN";
  if (code.startsWith("DELEGATION_")) {
    res.status(code === "DELEGATION_NOT_FOUND" ? 404 : 400).json({ code });
    return true;
  }
  return false;
}

delegationsRouter.get("/", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.json({ delegations: await listDelegations(userId) });
  } catch (error) {
    if (!sendDelegationError(res, error)) next(error);
  }
});

delegationsRouter.post("/tokens", async (req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const duration = req.body?.duration as DelegationDuration;
    if (!allowedDurations.has(duration)) {
      res.status(400).json({ code: "DELEGATION_DURATION_INVALID" });
      return;
    }
    res.status(201).json(await createDelegationToken(userId, duration));
  } catch (error) {
    if (!sendDelegationError(res, error)) next(error);
  }
});

delegationsRouter.post("/redeem", async (req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!/^hfd_[A-Za-z0-9_-]{32}$/.test(token)) {
      res.status(400).json({ code: "DELEGATION_TOKEN_INVALID" });
      return;
    }
    res.json(await redeemDelegationToken(token, userId));
  } catch (error) {
    if (!sendDelegationError(res, error)) next(error);
  }
});

delegationsRouter.delete("/history", async (_req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    res.json({
      delegations: await clearInactiveDelegationHistory(userId),
    });
  } catch (error) {
    if (!sendDelegationError(res, error)) next(error);
  }
});

delegationsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { userId } = getAuthenticatedUser(res);
    await revokeDelegationGrant(req.params.id, userId);
    res.status(204).end();
  } catch (error) {
    if (!sendDelegationError(res, error)) next(error);
  }
});
