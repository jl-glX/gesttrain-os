import { describe, expect, it } from "vitest";
import { emailVerificationIsEnabled } from "./account-verification-mode.js";

describe("account verification mode", () => {
  it("keeps the email draft neutralized by default", () => {
    expect(emailVerificationIsEnabled({})).toBe(false);
    expect(
      emailVerificationIsEnabled({ EMAIL_VERIFICATION_ENABLED: "false" }),
    ).toBe(false);
  });

  it("only enables email verification explicitly", () => {
    expect(
      emailVerificationIsEnabled({ EMAIL_VERIFICATION_ENABLED: "true" }),
    ).toBe(true);
    expect(() =>
      emailVerificationIsEnabled({ EMAIL_VERIFICATION_ENABLED: "later" }),
    ).toThrow(/true or false/);
  });
});
