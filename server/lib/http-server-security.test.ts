import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { configureHttpServerSecurity } from "./http-server-security.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("HTTP server security", () => {
  it("applies bounded timeouts, headers and requests per connection", () => {
    const server = createServer();
    servers.push(server);

    configureHttpServerSecurity(server);

    expect(server.headersTimeout).toBe(10_000);
    expect(server.requestTimeout).toBe(30_000);
    expect(server.keepAliveTimeout).toBe(5_000);
    expect(server.maxHeadersCount).toBe(100);
    expect(server.maxRequestsPerSocket).toBe(100);
  });
});
