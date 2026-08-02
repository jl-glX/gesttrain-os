import { db } from "../db/client.js";
import { captchaIsConfigured } from "./captcha.js";
import { getManagerCoordinationStatus } from "./manager-coordinator.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RECENT_EVENT_LIMIT = 50;

type SecurityLevel = "low" | "medium" | "high";

interface SecurityEventMetadata {
  action?: string;
  level?: SecurityLevel;
  reason?: string;
  surface?: string;
}

function parseMetadata(value: string): SecurityEventMetadata {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as SecurityEventMetadata)
      : {};
  } catch {
    return {};
  }
}

export async function getSecurityManagerOverview() {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * DAY_MS;
  const oneDayAgo = now - DAY_MS;
  const rows = await db
    .selectFrom("securityEvents")
    .select(["id", "userId", "type", "createdAt", "metadata"])
    .where("createdAt", ">=", sevenDaysAgo)
    .orderBy("createdAt", "desc")
    .execute();

  const events = rows.map((event) => ({
    id: event.id,
    userId: event.userId,
    type: event.type,
    createdAt: event.createdAt,
    metadata: parseMetadata(event.metadata),
  }));
  const lastDay = events.filter((event) => event.createdAt >= oneDayAgo);
  const riskEvents = events.filter((event) => event.type === "risk_observed");

  return {
    generatedAt: now,
    mode: "observe" as const,
    automaticBlockingEnabled: false,
    controls: {
      captcha: {
        configured: captchaIsConfigured(),
        execution: "manual" as const,
        serverValidation: true,
      },
      trustedMutationOrigin: true,
      authenticationRateLimit: true,
      securityHeaders: true,
      riskEngine: "observe" as const,
    },
    metrics: {
      failedLogins24h: lastDay.filter((event) => event.type === "login_failed")
        .length,
      captchaFailures24h: lastDay.filter(
        (event) => event.type === "captcha_failed",
      ).length,
      captchaSuccesses24h: lastDay.filter(
        (event) => event.type === "captcha_succeeded",
      ).length,
      riskObservations7d: riskEvents.length,
      highRiskObservations7d: riskEvents.filter(
        (event) => event.metadata.level === "high",
      ).length,
    },
    coordination: getManagerCoordinationStatus(),
    recentEvents: events.slice(0, RECENT_EVENT_LIMIT),
  };
}
