import express from "express";
import type { Server } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import { pathToFileURL } from "node:url";
import { setupStaticServing } from "./static-serve.js";
import { initializeDatabase, closeDatabase } from "./db/client.js";
import { seedDatabase } from "./db/seed.js";
import { authRouter } from "./routes/auth.js";
import { classesRouter } from "./routes/classes.js";
import { bookingsRouter } from "./routes/bookings.js";
import { usersRouter } from "./routes/users.js";
import { adminClassesRouter } from "./routes/admin-classes.js";
import { analyticsRouter } from "./routes/analytics.js";
import { accountSecurityRouter } from "./routes/account-security.js";
import { feedbackRouter } from "./routes/feedback.js";
import { billingRouter } from "./routes/billing.js";
import { facilityProfileRouter } from "./routes/facility-profile.js";
import { accountProfileRouter } from "./routes/account-profile.js";
import { accountIdentityRouter } from "./routes/account-identity.js";
import { accountLifecycleRouter } from "./routes/account-lifecycle.js";
import { dataRetentionRouter } from "./routes/data-retention.js";
import { memberCommerceRouter } from "./routes/member-commerce.js";
import { delegationsRouter } from "./routes/delegations.js";
import { downloadsRouter } from "./routes/downloads.js";
import { resourceManagerRouter } from "./routes/resource-manager.js";
import { apiLimiter, apiSecurityHeaders } from "./middleware/security.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import {
  startResourceManager,
  stopResourceManager,
} from "./services/resource-manager.js";

dotenv.config();

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", false);

const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN
        ? false
        : clientOrigin.split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 600,
  }),
);
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);

app.use("/api", apiSecurityHeaders);
app.use("/api", apiLimiter);

// Facility logos use a larger JSON allowance inside their authenticated router.
// The general API keeps its deliberately small request limit below.
app.use("/api/facility-profile", facilityProfileRouter);
app.use("/api/account/profile", accountProfileRouter);
app.use("/api/account/identity", accountIdentityRouter);
app.use("/api/account/lifecycle", accountLifecycleRouter);
app.use("/api/admin/data-retention", dataRetentionRouter);

// Body parsing middleware
const requestLimit = process.env.MAX_REQUEST_SIZE || "32kb";
app.use(express.json({ limit: requestLimit }));
app.use(express.urlencoded({ extended: true, limit: requestLimit }));

// API routes
app.use("/api/auth", authRouter);
app.use("/api/classes", classesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/users", usersRouter);
app.use("/api/admin/classes", adminClassesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/account/security", accountSecurityRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/billing", billingRouter);
app.use("/api/member-commerce", memberCommerceRouter);
app.use("/api/account/delegations", delegationsRouter);
app.use("/api/downloads", downloadsRouter);
app.use("/api/admin/resource-manager", resourceManagerRouter);

// Health check endpoint
app.get("/api/health", (req: express.Request, res: express.Response) => {
  res.json({ status: "ok" });
});

app.use("/api", notFoundHandler);

if (process.env.NODE_ENV === "production") {
  setupStaticServing(app);
}

app.use(errorHandler);

// Export a function to start the server
export async function startServer(port: string | number): Promise<Server> {
  try {
    // Initialize database
    await initializeDatabase();
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.SEED_DEMO_DATA === "true"
    ) {
      await seedDatabase();
    }
    startResourceManager();

    return await new Promise<Server>((resolve, reject) => {
      const server = app.listen(port, () => {
        console.log(`API Server running on port ${port}`);
        resolve(server);
      });
      server.once("error", reject);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    throw err;
  }
}

export function stopServer(server: Server): void {
  console.log("Shutting down gracefully...");
  stopResourceManager();
  server.close((error) => {
    closeDatabase();
    if (error) console.error("Failed to stop API server:", error);
    process.exit(error ? 1 : 0);
  });
}

// Start the server directly if this is the main module
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log("Starting server...");
  startServer(process.env.PORT || 3001)
    .then((server) => {
      process.once("SIGINT", () => stopServer(server));
      process.once("SIGTERM", () => stopServer(server));
    })
    .catch(() => {
      closeDatabase();
      process.exit(1);
    });
}
