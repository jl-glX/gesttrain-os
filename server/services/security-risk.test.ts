import { describe, expect, it } from "vitest";
import { assessSecurityRisk } from "./security-risk.js";

describe("security risk observation", () => {
  it("keeps an ordinary browser request at low risk", () => {
    expect(
      assessSecurityRisk({
        userAgent: "Mozilla/5.0 Chrome/140.0",
        secFetchSite: "same-origin",
        contentType: "application/json",
      }),
    ).toEqual({ score: 0, level: "low", reasons: [] });
  });

  it("observes automation markers without making a blocking decision", () => {
    const result = assessSecurityRisk({
      userAgent: "Mozilla/5.0 HeadlessChrome/140.0",
      secFetchSite: "same-origin",
      contentType: "application/json",
    });

    expect(result.level).toBe("medium");
    expect(result.reasons).toContain("automation_marker");
  });

  it("classifies a cross-site request with no user agent as high risk", () => {
    const result = assessSecurityRisk({
      secFetchSite: "cross-site",
      contentType: "text/plain",
    });

    expect(result.level).toBe("high");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "missing_user_agent",
        "cross_site_request",
        "unexpected_content_type",
      ]),
    );
  });
});
