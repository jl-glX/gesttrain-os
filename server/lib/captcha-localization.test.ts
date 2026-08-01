import { describe, expect, it } from "vitest";
import { turnstileLanguage } from "../../client/src/lib/captchaLocalization.js";

describe("CAPTCHA localization", () => {
  it.each([
    ["es", "es"],
    ["en-US", "en"],
    ["de", "de"],
    ["de-CH", "de"],
    ["de_CH", "de"],
    ["fr", "auto"],
    [undefined, "auto"],
  ])("maps %s to Turnstile language %s", (application, turnstile) => {
    expect(turnstileLanguage(application)).toBe(turnstile);
  });
});
