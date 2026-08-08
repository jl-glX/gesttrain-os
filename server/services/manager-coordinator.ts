import { randomBytes } from "node:crypto";

export type ManagerId =
  | "account"
  | "security"
  | "resource"
  | "environment"
  | "notification"
  | "support";
export type ManagerSignalSeverity = "info" | "warning" | "critical";

interface ActiveManagerOperation {
  id: string;
  manager: ManagerId;
  operation: string;
  scopes: string[];
  startedAt: number;
}

interface ManagerSignal {
  id: string;
  source: ManagerId;
  severity: ManagerSignalSeverity;
  code: string;
  message: string;
  createdAt: number;
}

const activeOperations = new Map<string, ActiveManagerOperation>();
const signals: ManagerSignal[] = [];
const MAX_SIGNALS = 50;

export class ManagerCoordinationConflictError extends Error {
  readonly status = 409;
  readonly statusCode = 409;

  constructor(public readonly conflictingOperation: ActiveManagerOperation) {
    super("A coordinated manager operation is already using this scope");
    this.name = "ManagerCoordinationConflictError";
  }
}

export function publishManagerSignal(
  source: ManagerId,
  severity: ManagerSignalSeverity,
  code: string,
  message: string,
): void {
  signals.unshift({
    id: `manager-signal-${randomBytes(8).toString("hex")}`,
    source,
    severity,
    code,
    message,
    createdAt: Date.now(),
  });
  if (signals.length > MAX_SIGNALS) signals.length = MAX_SIGNALS;
}

export async function withCoordinatedManagerOperation<T>(
  manager: ManagerId,
  operation: string,
  scopes: string[],
  run: () => Promise<T>,
): Promise<T> {
  const conflict = [...activeOperations.values()].find((active) =>
    active.scopes.some((scope) => scopes.includes(scope)),
  );
  if (conflict) throw new ManagerCoordinationConflictError(conflict);

  const active: ActiveManagerOperation = {
    id: `manager-operation-${randomBytes(8).toString("hex")}`,
    manager,
    operation,
    scopes: [...new Set(scopes)],
    startedAt: Date.now(),
  };
  activeOperations.set(active.id, active);
  try {
    return await run();
  } finally {
    activeOperations.delete(active.id);
  }
}

export function getManagerCoordinationStatus() {
  return {
    mode: "shared-runtime" as const,
    managers: [
      "account",
      "security",
      "resource",
      "environment",
      "notification",
      "support",
    ] as const,
    activeOperations: [...activeOperations.values()].map((operation) => ({
      ...operation,
      scopes: [...operation.scopes],
    })),
    recentSignals: signals.slice(0, 20).map((signal) => ({ ...signal })),
  };
}
