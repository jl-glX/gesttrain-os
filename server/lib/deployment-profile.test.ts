import { describe, expect, it } from "vitest";
import {
  isProductionLike,
  resolveDeploymentProfile,
} from "./deployment-profile.js";

describe("deployment profiles", () => {
  it("keeps existing NODE_ENV behavior when APP_ENV is absent", () => {
    expect(resolveDeploymentProfile({ NODE_ENV: "development" })).toBe(
      "development",
    );
    expect(resolveDeploymentProfile({ NODE_ENV: "test" })).toBe("test");
    expect(resolveDeploymentProfile({ NODE_ENV: "production" })).toBe(
      "production",
    );
  });

  it("separates demo, staging and production explicitly", () => {
    expect(resolveDeploymentProfile({ APP_ENV: "demo" })).toBe("demo");
    expect(
      resolveDeploymentProfile({
        NODE_ENV: "production",
        APP_ENV: "staging",
      }),
    ).toBe("staging");
    expect(isProductionLike("demo")).toBe(false);
    expect(isProductionLike("staging")).toBe(true);
    expect(isProductionLike("production")).toBe(true);
  });

  it("rejects unknown profiles", () => {
    expect(() => resolveDeploymentProfile({ APP_ENV: "preview" })).toThrow(
      /APP_ENV/,
    );
  });

  it("rejects mismatched runtime and deployment profiles", () => {
    expect(() =>
      resolveDeploymentProfile({
        NODE_ENV: "development",
        APP_ENV: "staging",
      }),
    ).toThrow(/NODE_ENV=production/);
    expect(() =>
      resolveDeploymentProfile({
        NODE_ENV: "production",
        APP_ENV: "demo",
      }),
    ).toThrow(/cannot run/);
  });
});
