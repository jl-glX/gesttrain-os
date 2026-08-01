import { describe, expect, it } from "vitest";
import { getRecoveryCapabilities } from "./account-recovery.js";

describe("account recovery capability contract", () => {
  it("exposes a safe extension point without claiming unfinished methods work", () => {
    const methods = getRecoveryCapabilities();
    expect(methods).toHaveLength(4);
    expect(methods.find((method) => method.id === "passkey")?.status).toBe(
      "available",
    );
    expect(
      methods
        .filter((method) => method.id !== "passkey")
        .every((method) => method.status === "planned"),
    ).toBe(true);
    expect(
      methods.every((method) => method.canCancelPendingDeletion === false),
    ).toBe(true);
  });
});
