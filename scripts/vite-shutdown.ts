import type { ViteDevServer } from "vite";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

function shutdownTimeoutMs(): number {
  const configured = Number.parseInt(
    process.env.VITE_SHUTDOWN_TIMEOUT_MS ?? String(DEFAULT_SHUTDOWN_TIMEOUT_MS),
    10,
  );
  if (!Number.isFinite(configured)) return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  return Math.min(Math.max(configured, 1_000), 30_000);
}

async function requestViteResourceShutdown(
  server: ViteDevServer,
): Promise<void> {
  const httpServer = server.httpServer;
  if (
    httpServer &&
    "closeAllConnections" in httpServer &&
    typeof httpServer.closeAllConnections === "function"
  ) {
    httpServer.closeAllConnections();
  }

  await Promise.race([
    Promise.allSettled([
      server.ws.close(),
      server.watcher.close(),
      server.pluginContainer.close(),
      ...Object.values(server.environments).map((environment) =>
        environment.close(),
      ),
    ]),
    new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
  ]);
}

export async function closeViteDevelopmentServer(
  server: ViteDevServer | undefined,
): Promise<void> {
  if (!server) return;

  // Vite's close lifecycle owns the HTTP/HMR connections, file watcher,
  // plugin containers and development environments. Awaiting it prevents
  // Windows from retaining a partially closed development server.
  let closeError: unknown;
  const closeRequest = server.close().catch((error: unknown) => {
    closeError = error;
  });
  const closedInTime = await Promise.race([
    closeRequest.then(() => true),
    new Promise<false>((resolve) =>
      setTimeout(() => resolve(false), shutdownTimeoutMs()),
    ),
  ]);

  if (!closedInTime || closeError) {
    console.warn(
      "Vite did not complete its normal shutdown; requesting cleanup of its owned resources.",
    );
    await requestViteResourceShutdown(server);
    await Promise.race([
      closeRequest,
      new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
    ]);
  }

  if (server.httpServer?.listening) {
    throw new Error(
      "Vite reported a completed shutdown but is still listening",
    );
  }
  if (closeError) throw closeError;
}
