import {
  cancelScheduledAccountDeletion,
  hasScheduledAccountDeletion,
} from "./account-lifecycle.js";
import { recordSecurityEvent } from "./security-events.js";

export type RecoveryMethodId =
  "password" | "email" | "code" | "passkey" | "support";
export type RecoveryCapabilityStatus = "available" | "planned";
export const RECOVERY_COMPLETION_EVENTS = [
  "login_success",
  "password_reset_completed",
  "mfa_verified",
  "passkey_verified",
  "support_recovery_approved",
] as const;
export type RecoveryCompletionEvent =
  (typeof RECOVERY_COMPLETION_EVENTS)[number];

export interface RecoveryCapability {
  id: RecoveryMethodId;
  status: RecoveryCapabilityStatus;
  entryPoint: "/login" | null;
  requiresCompletedVerification: true;
  canCancelPendingDeletion: boolean;
}

const capabilities: readonly RecoveryCapability[] = [
  {
    id: "password",
    status: "planned",
    entryPoint: null,
    requiresCompletedVerification: true,
    canCancelPendingDeletion: false,
  },
  {
    id: "email",
    status: "planned",
    entryPoint: null,
    requiresCompletedVerification: true,
    canCancelPendingDeletion: false,
  },
  {
    id: "code",
    status: "planned",
    entryPoint: null,
    requiresCompletedVerification: true,
    canCancelPendingDeletion: false,
  },
  {
    id: "passkey",
    status: "available",
    entryPoint: "/login",
    requiresCompletedVerification: true,
    canCancelPendingDeletion: true,
  },
  {
    id: "support",
    status: "planned",
    entryPoint: null,
    requiresCompletedVerification: true,
    canCancelPendingDeletion: false,
  },
];

export function getRecoveryCapabilities(): readonly RecoveryCapability[] {
  return capabilities;
}

export async function completeAccountRecovery(
  userId: string,
  event: RecoveryCompletionEvent,
) {
  if (!(await hasScheduledAccountDeletion(userId))) {
    return { cancelledPendingDeletion: false, lifecycle: null };
  }
  const lifecycle = await cancelScheduledAccountDeletion(userId, {
    recoveryEvent: event,
  });
  await recordSecurityEvent("account_recovery_completed", userId, { event });
  return { cancelledPendingDeletion: true, lifecycle };
}
