import { describe, expect, it } from "vitest";
import {
  getManagerCoordinationStatus,
  ManagerCoordinationConflictError,
  publishManagerSignal,
  withCoordinatedManagerOperation,
} from "./manager-coordinator.js";

describe("manager coordinator", () => {
  it("prevents two managers from using the same scope simultaneously", async () => {
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withCoordinatedManagerOperation(
      "account",
      "account-deletion",
      ["account-records"],
      async () => firstCanFinish,
    );

    await expect(
      withCoordinatedManagerOperation(
        "resource",
        "residual-cleanup",
        ["account-records"],
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(ManagerCoordinationConflictError);

    releaseFirst();
    await first;
    expect(getManagerCoordinationStatus().activeOperations).toHaveLength(0);
  });

  it("shares signals between managers", () => {
    publishManagerSignal(
      "security",
      "warning",
      "TEST_SIGNAL",
      "A coordinated test signal",
    );

    expect(getManagerCoordinationStatus().recentSignals[0]).toMatchObject({
      source: "security",
      severity: "warning",
      code: "TEST_SIGNAL",
    });
  });
});
