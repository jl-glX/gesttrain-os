import { connect } from "node:net";

const baseUrl = new URL(
  process.env.SECURITY_TARGET_URL ?? "http://127.0.0.1:3001",
);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

if (baseUrl.protocol !== "http:" || !loopbackHosts.has(baseUrl.hostname)) {
  throw new Error(
    "The security probe is intentionally restricted to a local HTTP target.",
  );
}

const results = [];

function record(name, passed, evidence) {
  results.push({ name, passed, evidence });
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    ...init,
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON responses are evidence too.
  }
  return { response, body };
}

function rawTcpRequest(payload) {
  const port = Number(baseUrl.port || 80);
  const hostname = baseUrl.hostname.replace(/^\[|\]$/g, "");

  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port });
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Raw HTTP probe timed out"));
    }, 3_000);

    socket.setEncoding("utf8");
    socket.on("connect", () => socket.end(payload));
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.on("close", () => {
      clearTimeout(timeout);
      resolve(response.split("\r\n", 1)[0] ?? "connection closed");
    });
  });
}

const health = await request("/api/health");
record(
  "health and defensive headers",
  health.response.status === 200 &&
    health.response.headers.get("x-powered-by") === null &&
    health.response.headers.get("cache-control") === "no-store" &&
    health.response.headers.get("x-content-type-options") === "nosniff",
  {
    status: health.response.status,
    cacheControl: health.response.headers.get("cache-control"),
    contentTypeOptions: health.response.headers.get("x-content-type-options"),
  },
);

for (const path of [
  "/api/auth/session",
  "/api/users",
  "/api/admin/data-retention",
]) {
  const result = await request(path);
  record(`anonymous access blocked: ${path}`, result.response.status === 401, {
    status: result.response.status,
    body: result.body,
  });
}

const hostileOrigin = await request("/api/auth/login", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://attacker.invalid",
    "sec-fetch-site": "cross-site",
  },
  body: JSON.stringify({
    identifier: "nobody@example.com",
    password: "WrongPassword123",
    accessPortal: "member",
  }),
});
record(
  "cross-site mutation rejected",
  hostileOrigin.response.status === 403 &&
    hostileOrigin.body?.code === "UNTRUSTED_ORIGIN",
  { status: hostileOrigin.response.status, body: hostileOrigin.body },
);

const injection = await request("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    identifier: "' OR 1=1 --",
    password: "WrongPassword123",
    accessPortal: "member",
  }),
});
record(
  "SQL-like login input rejected",
  injection.response.status === 400 &&
    injection.body?.code === "VALIDATION_ERROR",
  { status: injection.response.status, body: injection.body },
);

const objectInjection = await request("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    identifier: { $ne: null },
    password: "WrongPassword123",
    accessPortal: "member",
  }),
});
record(
  "object injection rejected",
  objectInjection.response.status === 400 &&
    objectInjection.body?.code === "VALIDATION_ERROR",
  { status: objectInjection.response.status, body: objectInjection.body },
);

const massAssignment = await request("/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: `mass-assignment-${Date.now()}@example.com`,
    name: "Mass Assignment Probe",
    password: "StrongPassword123",
    role: "admin",
  }),
});
record(
  "signup mass assignment rejected",
  massAssignment.response.status === 400 &&
    massAssignment.body?.code === "VALIDATION_ERROR",
  { status: massAssignment.response.status, body: massAssignment.body },
);

const malformedJson = await request("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: '{"identifier":',
});
record(
  "malformed JSON normalized",
  malformedJson.response.status === 400 &&
    malformedJson.body?.code === "INVALID_JSON",
  { status: malformedJson.response.status, body: malformedJson.body },
);

const oversized = await request("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    identifier: `${"a".repeat(40_000)}@example.com`,
    password: "WrongPassword123",
    accessPortal: "member",
  }),
});
record(
  "oversized request rejected",
  oversized.response.status === 413 &&
    oversized.body?.code === "PAYLOAD_TOO_LARGE",
  { status: oversized.response.status, body: oversized.body },
);

const traversal = await request("/api/downloads/%2e%2e/%2e%2e/package.json");
record(
  "encoded traversal does not disclose files",
  traversal.response.status === 404 && traversal.body?.code === "NOT_FOUND",
  { status: traversal.response.status, body: traversal.body },
);

const hostilePreflight = await request("/api/auth/login", {
  method: "OPTIONS",
  headers: {
    origin: "https://attacker.invalid",
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type",
  },
});
record(
  "hostile CORS preflight receives no origin grant",
  hostilePreflight.response.headers.get("access-control-allow-origin") === null,
  {
    status: hostilePreflight.response.status,
    allowOrigin: hostilePreflight.response.headers.get(
      "access-control-allow-origin",
    ),
  },
);

const healthPressure = await Promise.all(
  Array.from({ length: 64 }, () => request("/api/health")),
);
record(
  "controlled burst remains stable",
  healthPressure.every(({ response }) => response.status === 200),
  {
    requests: healthPressure.length,
    statuses: [
      ...new Set(healthPressure.map(({ response }) => response.status)),
    ],
  },
);

const absentIdentifier = `credential-pressure-${Date.now()}@example.invalid`;
const authenticationPressure = [];
for (let attempt = 0; attempt < 14; attempt += 1) {
  authenticationPressure.push(
    await request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `203.0.113.${attempt + 1}`,
      },
      body: JSON.stringify({
        identifier: absentIdentifier,
        password: "WrongPassword123",
        accessPortal: "member",
      }),
    }),
  );
}
record(
  "rotating forwarded IP cannot bypass authentication limit",
  authenticationPressure.some(
    ({ response, body }) =>
      response.status === 429 && body?.code === "AUTH_RATE_LIMITED",
  ),
  {
    attempts: authenticationPressure.length,
    statuses: authenticationPressure.map(({ response }) => response.status),
  },
);

const hostHeader = baseUrl.host;
const traceStatus = await rawTcpRequest(
  `TRACE /api/health HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`,
);
record("TRACE is unavailable", / 405 /.test(traceStatus), traceStatus);

const ambiguousFramingStatus = await rawTcpRequest(
  `POST /api/auth/login HTTP/1.1\r\nHost: ${hostHeader}\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n0\r\n\r\n`,
);
record(
  "ambiguous HTTP framing rejected by the runtime",
  / 400 /.test(ambiguousFramingStatus),
  ambiguousFramingStatus,
);

const oversizedHeaderStatus = await rawTcpRequest(
  `GET /api/health HTTP/1.1\r\nHost: ${hostHeader}\r\nX-Oversized: ${"a".repeat(20_000)}\r\nConnection: close\r\n\r\n`,
);
record(
  "oversized HTTP header rejected by the runtime",
  / 431 /.test(oversizedHeaderStatus),
  oversizedHeaderStatus,
);

const malformedChunkStatus = await rawTcpRequest(
  `POST /api/auth/login HTTP/1.1\r\nHost: ${hostHeader}\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\nConnection: close\r\n\r\nZZ\r\ninvalid\r\n0\r\n\r\n`,
);
record(
  "malformed chunked body rejected by the runtime",
  / 400 /.test(malformedChunkStatus),
  malformedChunkStatus,
);

console.log(JSON.stringify({ target: baseUrl.origin, results }, null, 2));

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  console.error(`${failed.length} local security probe(s) failed.`);
  process.exitCode = 1;
}
