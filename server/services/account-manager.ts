import { getSecurityOverview } from "./account-security.js";
import { getAccountLifecycle } from "./account-lifecycle.js";
import { getRecoveryCapabilities } from "./account-recovery.js";
import { getManagerCoordinationStatus } from "./manager-coordinator.js";

export async function getAccountManagerOverview(
  userId: string,
  sessionId: string,
  accountStatus: "pending_verification" | "active" | "security_review",
) {
  const [lifecycle, security] = await Promise.all([
    getAccountLifecycle(userId),
    getSecurityOverview(userId, sessionId),
  ]);

  return {
    accountStatus,
    security: {
      mfaEnabled: security.mfa.enabled,
      passkeyCount: security.passkeys.count,
      activeSessionCount: security.sessions.length,
      recoveryCodesRemaining: security.mfa.recoveryCodesRemaining,
    },
    lifecycle: {
      inactivityMonths: lifecycle.inactivityMonths,
      lastMeaningfulActivityAt: lifecycle.lastMeaningfulActivityAt,
      deletionRequest: lifecycle.deletionRequest,
      deletionExecutionEnabled: false as const,
    },
    recovery: {
      availableMethods: getRecoveryCapabilities()
        .filter((method) => method.status === "available")
        .map((method) => method.id),
      plannedMethods: getRecoveryCapabilities()
        .filter((method) => method.status === "planned")
        .map((method) => method.id),
    },
    continuity: lifecycle.continuityBridge,
    coordination: getManagerCoordinationStatus(),
  };
}
