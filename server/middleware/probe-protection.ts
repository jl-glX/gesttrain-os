import type { NextFunction, Request, Response } from "express";

const BLOCKED_PATH_PREFIXES = [
  "/.env",
  "/.git",
  "/.hg",
  "/.svn",
  "/wp-admin",
  "/wp-content",
  "/phpmyadmin",
];

const BLOCKED_EXACT_PATHS = new Set([
  "/adminer.php",
  "/config.json",
  "/server-status",
  "/wp-login.php",
  "/xmlrpc.php",
]);

const EXECUTABLE_SCRIPT_EXTENSION = /\.(?:asp|aspx|cgi|jsp|php)(?:\/|$)/i;

function safelyDecodePath(path: string): string {
  let decoded = path;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.replace(/\\/g, "/").toLowerCase();
}

export function isAutomatedProbePath(path: string): boolean {
  const normalized = safelyDecodePath(path.split("?", 1)[0] || "/");
  return (
    BLOCKED_EXACT_PATHS.has(normalized) ||
    BLOCKED_PATH_PREFIXES.some(
      (prefix) =>
        normalized === prefix ||
        normalized.startsWith(`${prefix}/`) ||
        (prefix === "/.env" && normalized.startsWith("/.env.")),
    ) ||
    EXECUTABLE_SCRIPT_EXTENSION.test(normalized)
  );
}

export function rejectAutomatedProbe(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isAutomatedProbePath(req.originalUrl)) {
    next();
    return;
  }

  // Keep the response indistinguishable from any other missing resource. The
  // reverse proxy records the request without revealing why it was rejected.
  res.setHeader("Cache-Control", "no-store");
  res.status(404).json({
    error: "Endpoint not found",
    code: "NOT_FOUND",
  });
}
