import type { NextFunction, Request, Response } from "express";
import path from "node:path";

const BLOCKED_ROOT_PREFIXES = [
  "/wp-admin",
  "/wp-content",
  "/phpmyadmin",
  "/vendor/phpunit",
  "/cgi-bin",
  "/actuator",
];

const SECRET_SEGMENTS = new Set([".git", ".hg", ".svn", ".aws", ".ssh"]);

const SENSITIVE_FILE_NAMES = new Set([
  ".npmrc",
  ".yarnrc",
  ".htaccess",
  ".htpasswd",
  ".ds_store",
  "adminer.php",
  "appsettings.json",
  "caddyfile",
  "composer.json",
  "config.json",
  "docker-compose.yml",
  "docker-compose.yaml",
  "dockerfile",
  "id_ed25519",
  "id_rsa",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "server-status",
  "web.config",
  "wp-login.php",
  "xmlrpc.php",
  "yarn.lock",
]);

const EXECUTABLE_SCRIPT_EXTENSION = /\.(?:asp|aspx|cgi|jsp|php)(?:\/|$)/i;
const SENSITIVE_FILE_EXTENSION =
  /\.(?:bak|db|key|old|orig|p12|pem|pfx|sql|sqlite|sqlite3)$/i;
const ALLOWED_HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
const MAX_REQUEST_TARGET_LENGTH = 4_096;
const MAX_DECLARED_BODY_BYTES = 1_048_576;

function declaredBodyLimit(req: Request): number {
  if (
    req.method === "POST" &&
    /^\/api\/support\/tickets\/[^/]+\/attachments\/?(?:\?.*)?$/.test(
      req.originalUrl,
    )
  ) {
    const configured = Number.parseInt(
      process.env.SUPPORT_ATTACHMENT_MAX_BYTES ?? "5242880",
      10,
    );
    if (Number.isInteger(configured)) {
      return Math.min(Math.max(configured, 1024), 10 * 1024 * 1024);
    }
    return 5 * 1024 * 1024;
  }
  return MAX_DECLARED_BODY_BYTES;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function normalizeRequestPath(rawPath: string): string | null {
  let decoded = rawPath.split(/[?#]/, 1)[0] || "/";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  decoded = decoded.split(/[?#]/, 1)[0] || "/";
  if (containsControlCharacter(decoded)) return null;

  const slashNormalized = decoded.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return path.posix.normalize(slashNormalized).toLowerCase();
}

export function isAutomatedProbePath(path: string): boolean {
  const normalized = normalizeRequestPath(path);
  if (normalized === null) return true;

  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] ?? "";

  return (
    segments.some(
      (segment) =>
        SECRET_SEGMENTS.has(segment) ||
        segment === ".env" ||
        segment.startsWith(".env."),
    ) ||
    SENSITIVE_FILE_NAMES.has(fileName) ||
    SENSITIVE_FILE_EXTENSION.test(fileName) ||
    BLOCKED_ROOT_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    ) ||
    EXECUTABLE_SCRIPT_EXTENSION.test(normalized)
  );
}

export function rejectUnsupportedHttpMethod(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (ALLOWED_HTTP_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  res.setHeader("Allow", [...ALLOWED_HTTP_METHODS].join(", "));
  res.setHeader("Cache-Control", "no-store");
  res.status(405).json({
    error: "Method not allowed",
    code: "METHOD_NOT_ALLOWED",
  });
}

export function rejectAbusiveRequestShape(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.originalUrl.length > MAX_REQUEST_TARGET_LENGTH) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "close");
    res.status(414).json({
      error: "Request target is too long",
      code: "URI_TOO_LONG",
    });
    return;
  }

  const declaredLength = req.get("Content-Length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes > declaredBodyLimit(req)) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Connection", "close");
      res.status(413).json({
        error: "Request body is too large",
        code: "PAYLOAD_TOO_LARGE",
      });
      return;
    }
  }

  next();
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
