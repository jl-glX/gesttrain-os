import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("data retention foundation", () => {
  let directory: string;
  let database: typeof import("../db/client.js");
  let retention: typeof import("./data-retention.js");

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gesttrain-os-retention-"));
    vi.stubEnv("DATA_DIRECTORY", directory);
    vi.resetModules();
    database = await import("../db/client.js");
    retention = await import("./data-retention.js");
    await database.initializeDatabase();
  });

  afterAll(async () => {
    database.closeDatabase();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("creates non-executable policy drafts", async () => {
    const policy = await retention.createDraftRetentionPolicy({
      name: "Invoices placeholder",
      jurisdiction: "ES",
      dataCategory: "invoices",
      retentionDays: 365,
      legalBasisReference: "Pending legal review",
    });

    expect(policy.status).toBe("draft");
    const overview = await retention.listRetentionOverview();
    expect(overview.executionEnabled).toBe(false);
    expect(overview.policies).toHaveLength(1);

    await expect(
      retention.registerRetentionRecord({
        policyId: policy.id,
        sourceType: "invoice",
        sourceId: "invoice-demo",
      }),
    ).rejects.toThrow("Only reviewed active policies");
  });

  it("keeps future execution helpers isolated behind an active policy", async () => {
    const policy = await retention.createDraftRetentionPolicy({
      name: "Security audit placeholder",
      jurisdiction: "EU",
      dataCategory: "security_events",
    });
    await database.db
      .updateTable("dataRetentionPolicies")
      .set({ status: "active", reviewedAt: Date.now() })
      .where("id", "=", policy.id)
      .execute();

    const record = await retention.registerRetentionRecord({
      policyId: policy.id,
      sourceType: "security_event",
      sourceId: "event-demo",
      retainUntil: Date.now() - 1,
    });

    await retention.setRetentionLegalHold(record.id, true);
    expect(await retention.findRetentionCandidates()).toHaveLength(0);

    await retention.setRetentionLegalHold(record.id, false);
    expect(await retention.findRetentionCandidates()).toHaveLength(1);
  });
});
