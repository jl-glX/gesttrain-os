import { describe, expect, it } from "vitest";
import { shouldSeedDemoData } from "./demo-data-policy.js";

describe("demo data policy", () => {
  it("seeds demonstration data outside production", () => {
    expect(shouldSeedDemoData({ NODE_ENV: "development" })).toBe(true);
    expect(shouldSeedDemoData({ NODE_ENV: "test" })).toBe(true);
  });

  it("does not seed demonstration data in production", () => {
    expect(
      shouldSeedDemoData({
        NODE_ENV: "production",
        SEED_DEMO_DATA: "false",
      }),
    ).toBe(false);
  });

  it("refuses to start with known demo credentials in production", () => {
    expect(() =>
      shouldSeedDemoData({
        NODE_ENV: "production",
        SEED_DEMO_DATA: "true",
      }),
    ).toThrow("SEED_DEMO_DATA cannot be enabled in production");
  });
});
