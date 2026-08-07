import type { Server } from "node:http";

/**
 * Bounds slow or excessively persistent HTTP clients if the reverse proxy is
 * bypassed from the local host. Caddy remains the public first line of defence.
 */
export function configureHttpServerSecurity(server: Server): void {
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
}
