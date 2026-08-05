import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCapabilityRoadmap } from "./capability-roadmap.js";

const validDestinations = new Set([
  "/account/security",
  "/admin-dashboard",
  "/classes",
  "/community",
  "/admin/commercial-trial",
  "/admin/environment-manager",
  "/admin/resource-manager",
  "/billing",
]);

describe("capability roadmap", () => {
  it("separates implemented, partial, prepared and missing capabilities", () => {
    const roadmap = getCapabilityRoadmap();
    expect(roadmap.summary.implemented).toBeGreaterThan(0);
    expect(roadmap.summary.partial).toBeGreaterThan(0);
    expect(roadmap.summary.prepared).toBeGreaterThan(0);
    expect(roadmap.summary.missing).toBeGreaterThan(0);
  });

  it("only links capability cards to existing application destinations", () => {
    const roadmap = getCapabilityRoadmap();
    const applicationRoutes = readFileSync(
      join(process.cwd(), "client", "src", "App.tsx"),
      "utf8",
    );
    for (const capability of roadmap.capabilities) {
      if (capability.destination) {
        expect(validDestinations.has(capability.destination)).toBe(true);
        expect(applicationRoutes).toContain(`path="${capability.destination}"`);
      }
    }
  });
});
