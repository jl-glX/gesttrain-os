import path from "path";
import express from "express";

/**
 * Sets up static file serving for the Express app
 * @param app Express application instance
 */
export function setupStaticServing(app: express.Application) {
  const publicDirectory = path.join(process.cwd(), "dist", "public");

  // Serve static files from the public directory
  app.use(
    express.static(publicDirectory, {
      dotfiles: "deny",
      fallthrough: true,
    }),
  );

  // For any other routes, serve the index.html file
  app.get("/{*splat}", (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path.join(publicDirectory, "index.html"));
  });
}
