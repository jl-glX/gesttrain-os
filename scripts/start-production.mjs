import { access } from "node:fs/promises";
import path from "node:path";

process.env.NODE_ENV = "production";

try {
  await Promise.all([
    access(path.join(process.cwd(), "dist", "server", "index.js")),
    access(path.join(process.cwd(), "dist", "public", "index.html")),
  ]);

  const { startServer, stopServer } = await import("../dist/server/index.js");
  const server = await startServer(process.env.PORT ?? 3001);

  process.once("SIGINT", () => stopServer(server));
  process.once("SIGTERM", () => stopServer(server));
  process.once("uncaughtException", (error) => {
    console.error("Uncaught production error:", error);
    stopServer(server);
  });
  process.once("unhandledRejection", (reason) => {
    console.error("Unhandled production rejection:", reason);
    stopServer(server);
  });
} catch (error) {
  console.error("Production startup aborted:", error);
  process.exitCode = 1;
}
