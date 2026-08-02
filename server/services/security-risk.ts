import type { Request } from "express";

export type SecurityRiskLevel = "low" | "medium" | "high";

export interface SecurityRiskAssessment {
  score: number;
  level: SecurityRiskLevel;
  reasons: string[];
}

export interface SecurityRequestSignals {
  userAgent?: string;
  secFetchSite?: string;
  forwardedFor?: string;
  contentType?: string;
}

const AUTOMATION_MARKERS = [
  "bot",
  "crawler",
  "spider",
  "headlesschrome",
  "phantomjs",
  "selenium",
  "playwright",
  "puppeteer",
];

export function assessSecurityRisk(
  signals: SecurityRequestSignals,
): SecurityRiskAssessment {
  let score = 0;
  const reasons: string[] = [];
  const userAgent = signals.userAgent?.trim() ?? "";
  const normalizedUserAgent = userAgent.toLowerCase();

  if (!userAgent) {
    score += 40;
    reasons.push("missing_user_agent");
  } else {
    if (userAgent.length > 512) {
      score += 25;
      reasons.push("oversized_user_agent");
    }
    if (
      AUTOMATION_MARKERS.some((marker) => normalizedUserAgent.includes(marker))
    ) {
      score += 30;
      reasons.push("automation_marker");
    }
  }

  if (signals.secFetchSite === "cross-site") {
    score += 60;
    reasons.push("cross_site_request");
  } else if (userAgent.includes("Mozilla/") && !signals.secFetchSite) {
    score += 10;
    reasons.push("missing_fetch_metadata");
  }

  if (signals.forwardedFor) {
    score += 15;
    reasons.push("unexpected_forwarded_for");
  }

  if (
    signals.contentType &&
    !signals.contentType.toLowerCase().startsWith("application/json")
  ) {
    score += 10;
    reasons.push("unexpected_content_type");
  }

  return {
    score,
    level: score >= 50 ? "high" : score >= 25 ? "medium" : "low",
    reasons,
  };
}

export function requestSecuritySignals(req: Request): SecurityRequestSignals {
  return {
    userAgent: req.get("User-Agent"),
    secFetchSite: req.get("Sec-Fetch-Site"),
    forwardedFor: req.get("X-Forwarded-For"),
    contentType: req.get("Content-Type"),
  };
}
