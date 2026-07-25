# HubFit development guide

## Requirements

- Node.js 20.19 or newer.
- npm with lockfile support.

## Installation and local execution

```bash
npm ci
npm run dev
```

The launcher in `scripts/dev.ts` starts Vite and Express together and closes both processes cleanly. If a preferred frontend port is occupied, Vite selects the next available port and prints the final URLs.

## Environment

Copy `.env.example` to `.env` to override defaults.

| Variable                       | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `NODE_ENV`                     | Runtime mode. Production enables stricter cookies, CSP and HSTS. |
| `PORT`                         | Express API port. Defaults to `3001`.                            |
| `CLIENT_ORIGIN`                | Comma-separated origins allowed by CORS.                         |
| `MAX_REQUEST_SIZE`             | Maximum JSON and form body size.                                 |
| `RATE_LIMIT_WINDOW_MINUTES`    | Rate-limit window.                                               |
| `RATE_LIMIT_MAX_REQUESTS`      | General API request limit.                                       |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | Login and signup attempt limit.                                  |
| `SEED_DEMO_DATA`               | Explicitly enables demo data; keep disabled in production.       |

Never commit `.env`, databases, tokens or real customer data.

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

## Before review

```bash
npm run format
npm run check
npm audit
git diff --check
```

`npm run check` verifies formatting, lint, client/server TypeScript, tests and production builds. Do not use `npm audit fix --force` without reviewing compatibility and rerunning the complete checks.

## Database changes

The current MVP initializes SQLite tables from `server/db/client.ts`. Before production use, introduce versioned migrations and a documented backup/restore process. Local database files under `data/` are ignored by Git.

## Adding a page or endpoint

1. Identify the relevant domain and permission level.
2. Add server validation, authorization and service logic first when data changes are involved.
3. Add the route and typed client integration.
4. Add Spanish, English and German strings plus any necessary Swiss German override.
5. Cover critical behavior with tests.
6. Run the complete validation sequence.
