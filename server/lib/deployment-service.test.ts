import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("systemd deployment service", () => {
  it("resolves Node portably instead of fixing a server-specific path", async () => {
    const unit = await readFile(
      path.resolve("deploy", "umbravia-forge.service"),
      "utf8",
    );

    expect(unit).toContain("Environment=PATH=/usr/local/bin:/usr/bin:/bin");
    expect(unit).toContain(
      "ExecStart=/usr/bin/env node scripts/start-production.mjs",
    );
    expect(unit).not.toMatch(
      /^ExecStart=\/(?:usr\/local\/bin|usr\/bin)\/node\b/m,
    );
  });

  it("validates Caddy without taking ownership of its production log", async () => {
    const [caddyfile, readiness] = await Promise.all([
      readFile(path.resolve("deploy", "Caddyfile"), "utf8"),
      readFile(path.resolve("deploy", "check-linux-readiness.sh"), "utf8"),
    ]);

    expect(caddyfile).toContain(
      "{$UMBRAVIA_CADDY_LOG:/var/log/caddy/umbravia-forge-access.log}",
    );
    expect(readiness).toContain("CADDY_VALIDATION_LOG=$(mktemp");
    expect(readiness).toContain('UMBRAVIA_CADDY_LOG="$CADDY_VALIDATION_LOG"');
    expect(readiness).toContain('rm -f "$CADDY_VALIDATION_LOG"');
    expect(readiness).toContain(
      "for REQUIRED_ENV in SMTP_HOST SMTP_PORT EMAIL_FROM",
    );
    expect(readiness).toContain(
      "SMTP_USER y SMTP_PASSWORD deben configurarse juntos",
    );
  });
});
