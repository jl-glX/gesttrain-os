import type { Server } from "node:http";
import { createServer, type ViteDevServer } from "vite";
import { closeDatabase } from "../server/db/client.js";
import { startServer } from "../server/index.js";
import {
  acquireDevelopmentLease,
  releaseDevelopmentLease,
} from "../server/lib/runtime-registry.js";

let apiServer: Server | undefined;
let viteServer: ViteDevServer | undefined;
let shuttingDown = false;

function closeApiServer(server: Server | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }

    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  const results = await Promise.allSettled([
    viteServer?.close(),
    closeApiServer(apiServer),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to stop a development server:", result.reason);
    }
  }

  closeDatabase();
  await releaseDevelopmentLease();
  process.exit(exitCode);
}

async function startDevelopmentServers(): Promise<void> {
  await acquireDevelopmentLease();
  const apiPort = Number.parseInt(process.env.PORT ?? "3001", 10);
  apiServer = await startServer(apiPort);

  viteServer = await createServer({ configFile: "./vite.config.js" });
  await viteServer.listen();

  console.log(
    `Development servers ready: frontend http://127.0.0.1:${viteServer.config.server.port}, API http://127.0.0.1:${apiPort}`,
  );
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

startDevelopmentServers().catch((error) => {
  console.error("Failed to start development servers:", error);
  void shutdown(1);
});
