import { describe, expect, it } from "vitest";
import { emailVerificationIsEnabled } from "./account-verification-mode.js";

describe("account verification mode", () => {
  it("keeps email ownership verification enabled by default", () => {
    expect(emailVerificationIsEnabled({})).toBe(true);
    expect(
      emailVerificationIsEnabled({ EMAIL_VERIFICATION_ENABLED: "false" }),
    ).toBe(false);
  });

  it("accepts explicit verification configuration", () => {
    expect(
      emailVerificationIsEnabled({ EMAIL_VERIFICATION_ENABLED: "true" }),
    ).toBe(true);
    expect(() =>
      emailVerificationIsEnabled({ EMAIL_VERIFICATION_ENABLED: "later" }),
    ).toThrow(/true or false/);
  });
});
