import type { Server } from "node:http";
import { createServer, type ViteDevServer } from "vite";
import { closeDatabase } from "../server/db/client.js";
import { startServer } from "../server/index.js";
import { stopResourceManager } from "../server/services/resource-manager.js";
import { stopAccountLifecycleScheduler } from "../server/services/account-lifecycle-scheduler.js";
import {
  acquireDevelopmentLease,
  releaseDevelopmentLease,
} from "../server/lib/runtime-registry.js";
import { closeViteDevelopmentServer } from "./vite-shutdown.js";

let apiServer: Server | undefined;
let viteServer: ViteDevServer | undefined;
let shuttingDown = false;

function closeApiServer(server: Server | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }

    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      clearTimeout(deadlineTimer);
      if (error) reject(error);
      else resolve();
    };
    const forceTimer = setTimeout(() => {
      console.warn(
        "The API still has open development connections; closing its owned connections.",
      );
      server.closeAllConnections();
    }, 2_000);
    const deadlineTimer = setTimeout(() => {
      server.closeAllConnections();
      finish(
        new Error("The API did not finish shutting down within 5 seconds"),
      );
    }, 5_000);

    server.close((error) => finish(error ?? undefined));
  });
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  let finalExitCode = exitCode;
  console.log("Stopping GestTrain/OS development resources...");

  const results = await Promise.allSettled([
    closeViteDevelopmentServer(viteServer),
    closeApiServer(apiServer),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to stop a development server:", result.reason);
      finalExitCode = 1;
    }
  }

  const cleanupResults = await Promise.allSettled([
    stopAccountLifecycleScheduler(),
    stopResourceManager(),
    releaseDevelopmentLease(),
  ]);
  for (const result of cleanupResults) {
    if (result.status === "rejected") {
      console.error("Failed to complete development cleanup:", result.reason);
      finalExitCode = 1;
    }
  }

  try {
    closeDatabase();
  } catch (error) {
    console.error("Failed to close the development database:", error);
    finalExitCode = 1;
  }

  viteServer = undefined;
  apiServer = undefined;
  process.exit(finalExitCode);
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
process.once("SIGHUP", () => void shutdown(0));
process.once("uncaughtException", (error) => {
  console.error("Uncaught development error:", error);
  void shutdown(1);
});
process.once("unhandledRejection", (reason) => {
  console.error("Unhandled development rejection:", reason);
  void shutdown(1);
});

startDevelopmentServers().catch((error) => {
  console.error("Failed to start development servers:", error);
  void shutdown(1);
});
