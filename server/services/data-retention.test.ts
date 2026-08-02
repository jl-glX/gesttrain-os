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
      dataCategory: "billing_records",
      retentionDays: 365,
      legalBasisReference: "Pending legal review",
    });

    expect(policy.status).toBe("draft");
    const overview = await retention.listRetentionOverview();
    expect(overview.executionEnabled).toBe(false);
    expect(overview.legalValidationProvided).toBe(false);
    expect(overview.catalog).toHaveLength(8);
    expect(overview.policies).toHaveLength(1);

    await expect(
      retention.registerRetentionRecord({
        policyId: policy.id,
        sourceType: "invoice",
        sourceId: "invoice-demo",
      }),
    ).rejects.toThrow("Only reviewed active policies");
  });

  it("versions policies by jurisdiction and category", async () => {
    const first = await retention.createDraftRetentionPolicy({
      name: "Spanish billing v1",
      jurisdiction: "es",
      dataCategory: "billing_records",
      retentionDays: 365,
      legalBasisReference: "Internal review reference",
    });
    const second = await retention.createDraftRetentionPolicy({
      name: "Spanish billing v2",
      jurisdiction: "ES",
      dataCategory: "billing_records",
      retentionDays: 730,
      legalBasisReference: "Updated internal review reference",
    });

    expect(first.version).toBeGreaterThan(1);
    expect(second.version).toBe(first.version + 1);
    expect(second.jurisdiction).toBe("ES");
  });

  it("keeps future execution helpers isolated behind an active policy", async () => {
    const policy = await retention.createDraftRetentionPolicy({
      name: "Security audit placeholder",
      jurisdiction: "EU",
      dataCategory: "security_events",
    });
    await expect(
      retention.reviewRetentionPolicy(
        policy.id,
        { decision: "activate", reviewConfirmed: true },
        "reviewer-demo",
      ),
    ).rejects.toThrow("Duration and review reference");

    const reviewablePolicy = await retention.createDraftRetentionPolicy({
      name: "Reviewable security audit placeholder",
      jurisdiction: "EU",
      dataCategory: "security_events",
      retentionDays: 30,
      legalBasisReference: "Internal review only",
    });
    const reviewed = await retention.reviewRetentionPolicy(
      reviewablePolicy.id,
      { decision: "activate", reviewConfirmed: true },
      null,
    );
    expect(reviewed.executionEnabled).toBe(false);

    const record = await retention.registerRetentionRecord({
      policyId: reviewablePolicy.id,
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
