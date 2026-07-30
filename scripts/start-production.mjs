process.env.NODE_ENV = "production";

const { startServer, stopServer } = await import("../dist/server/index.js");
const server = await startServer(process.env.PORT ?? 3001);

process.once("SIGINT", () => stopServer(server));
process.once("SIGTERM", () => stopServer(server));
