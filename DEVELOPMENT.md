# Umbravia Forge development guide

## Requirements

- Node.js 24 LTS (24.15.0 or newer in the 24.x line).
- npm 11 (11.12.0 or newer).

## Installation and local execution

```bash
npm ci
npm run dev
```

The launcher in `scripts/dev.ts` starts Vite and Express together and closes
both processes cleanly. The frontend uses port `3000` and the API uses `3001`.
The resource manager checks Umbravia Forge runtime records when it starts, before
and after every managed task, and again during shutdown. Vite also closes its
own HTTP/HMR connections, file watcher and plugin resources during a graceful
development shutdown. These safeguards never terminate unrelated Windows
processes merely because they use Node.js or a nearby port.
The residual check also runs periodically (every five minutes by default) so it
does not depend only on observable task boundaries. Configure it with
`RESOURCE_RUNTIME_CHECK_INTERVAL_MS`; values are limited to 30 seconds through
60 minutes to prevent either excessive polling or an ineffective interval. If
Vite does not complete its normal close within `VITE_SHUTDOWN_TIMEOUT_MS`, the
launcher asks Vite's owned HMR, watcher, plugin and environment resources to
close defensively. The default `npm run dev` launcher deliberately avoids an
extra watch-process wrapper; frontend hot module replacement remains provided
by Vite, while backend code changes require restarting the launcher.
Ports are strict: the launcher stops with a clear error instead of silently
moving the frontend to another port. Opening the API root returns an
orientation response; the actual interface remains on the frontend URL.

## Environment

Copy `.env.example` to `.env` to override defaults.

| Variable                                     | Purpose                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                                   | Runtime mode. Production enables stricter cookies, CSP and HSTS. |
| `PORT`                                       | Express API port. Defaults to `3001`.                            |
| `CLIENT_ORIGIN`                              | Required HTTPS browser origin(s) in production.                  |
| `WEBAUTHN_ORIGIN`                            | Public trusted origin used for passkey verification.             |
| `WEBAUTHN_RP_ID`                             | Relying-party domain bound to passkey credentials.               |
| `MAX_REQUEST_SIZE`                           | Maximum JSON and form body size.                                 |
| `RATE_LIMIT_WINDOW_MINUTES`                  | Rate-limit window.                                               |
| `RATE_LIMIT_MAX_REQUESTS`                    | General API request limit.                                       |
| `AUTH_RATE_LIMIT_MAX_REQUESTS`               | Sensitive authentication action limit.                           |
| `LOGIN_RATE_LIMIT_MAX_REQUESTS`              | Failed login attempt limit per 15-minute window.                 |
| `SIGNUP_RATE_LIMIT_WINDOW_MINUTES`           | Signup rate-limit window.                                        |
| `SIGNUP_RATE_LIMIT_MAX_REQUESTS`             | Signup attempts allowed in that window.                          |
| `EMAIL_VERIFICATION_RATE_LIMIT_MAX_REQUESTS` | Verification email resend limit per 15 minutes.                  |
| `SEED_DEMO_DATA`                             | Reserved for local demos; production rejects a `true` value.     |
| `VITE_RECAPTCHA_SITE_KEY`                    | Public reCAPTCHA v3 key embedded by the client build.            |
| `RECAPTCHA_SECRET_KEY`                       | Private reCAPTCHA v3 key used only by the API.                   |
| `RECAPTCHA_MIN_SCORE`                        | Minimum accepted v3 score, from 0 to 1; defaults to 0.5.         |
| `EMAIL_VERIFICATION_ENABLED`                 | Reactivates the dormant email challenge when explicitly true.    |
| `SMTP_HOST`                                  | SMTP relay or local mail transfer agent host.                    |
| `SMTP_PORT`                                  | SMTP submission port.                                            |
| `SMTP_SECURE`                                | Enables implicit TLS, normally on port 465.                      |
| `SMTP_REQUIRE_TLS`                           | Requires STARTTLS for a non-implicit TLS connection.             |
| `SMTP_USER` / `SMTP_PASSWORD`                | Optional SMTP credentials; configure both or neither.            |
| `EMAIL_FROM`                                 | Verified sender displayed on account emails.                     |

reCAPTCHA v3 needs a real key pair for each environment. Register localhost on
the development key and the public hostname on the production key. The API
validates action, hostname, challenge age and score; missing or unavailable
verification fails closed. Never commit either private key.

Never commit `.env`, databases, tokens or real customer data.

The provider-neutral SMTP client, challenge generator and routes remain as a
functional draft, but `EMAIL_VERIFICATION_ENABLED=false` neutralizes them. In
that temporary mode new accounts are active after reCAPTCHA without setting
`emailVerifiedAt`; reCAPTCHA does not prove ownership of an email address. When
the flag is later enabled, production again requires a complete SMTP channel.

## Project layout

```text
client/src/
  components/   shared and domain UI
  hooks/        data access and view state
  i18n/         language configuration and ES/EN/DE/DE-CH catalogues
  lib/          API, date and localization helpers
  pages/        route-level screens

server/
  db/           schema, connection and demo seed
  lib/          shared server helpers
  middleware/   authentication, authorization, validation and security
  routes/       HTTP endpoints
  services/     domain and persistence logic

scripts/        development launcher
docs/           maintained technical and release documentation
```

## Working conventions

- Keep authorization in server middleware and services; hiding a button is not a security control.
- Validate external input before it reaches domain services.
- Keep business rules out of React components.
- Add visible interface text to the Spanish, English and German catalogues.
- Add a `de-CH` override only when Swiss spelling or regional wording differs from standard German.
- Do not automatically translate names or content entered by users.
- Add or update tests for authentication, authorization, reservation and waitlist rules.
- Use `.js` extensions for relative server imports because the server compiles as Node ESM.
- Use TypeScript 7 for compilation. TypeScript 6 remains installed only as the
  programmatic API required by ESLint until that API is available in the native
  compiler.

## Before review

```bash
npm run format
npm run CI
git diff --check
```

`npm run CI` performs a clean locked install, verifies formatting, lint,
client/server TypeScript, tests and production builds, and audits dependencies.
The dependency maintenance rules and intentional compatibility holds are
documented in `docs/dependency-policy.md`.

## Database changes

The shared database facade in `server/db/client.ts` selects SQLite or PostgreSQL
through the deployment configuration. SQLite schema initialization remains the
self-contained path for development and isolated demos; PostgreSQL uses
versioned migrations. Local database files under `data/` are ignored by Git.

SQLite enables foreign-key checks, WAL journaling and a bounded busy timeout.
Reservation and cancellation changes run in transactions. These protections
improve isolated single-instance environments. Staging and production require
PostgreSQL and must validate locking, backup restoration and the main business
flows against a real authorized instance before launch.

The environment manager may create isolated SQLite databases and inventory
their migration categories. It does not automatically copy credentials,
identity, billing or community data. See
`docs/DATABASE-ENVIRONMENT-MANAGER.md`.

## Adding a page or endpoint

1. Identify the relevant domain and permission level.
2. Add server validation, authorization and service logic first when data changes are involved.
3. Add the route and typed client integration.
4. Add Spanish, English and German strings plus any necessary Swiss German override.
5. Cover critical behavior with tests.
6. Run the complete validation sequence.
