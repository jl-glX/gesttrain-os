export type RecoveryMethodId = "email" | "code" | "passkey" | "support";
export type RecoveryCapabilityStatus = "available" | "planned";

export interface RecoveryCapability {
  id: RecoveryMethodId;
  status: RecoveryCapabilityStatus;
  entryPoint: "/login" | null;
  requiresCompletedVerification: true;
  canCancelPendingDeletion: false;
}

const capabilities: readonly RecoveryCapability[] = [
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
    canCancelPendingDeletion: false,
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
