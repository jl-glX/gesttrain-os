# Umbravia Forge

Umbravia Forge is a modular gym-management application for classes, bookings, waitlists, users, trainers and activity analytics. The responsive interface supports Spanish, English, German and Swiss Standard German.

> Project status: active development. Umbravia Forge is not yet ready for commercial production or real payments.

## Current capabilities

- Account registration and persistent, revocable sessions.
- Member, trainer and administrator permissions enforced by the API.
- Class calendar, capacity, bookings and FIFO waitlist promotion.
- Member, trainer and administrator dashboards.
- User and class administration.
- Attendance export to CSV.
- Spanish, English, German and Swiss Standard German interface with persisted language selection.
- Public legal notice, terms and conditions, and conditions of use drafts.
- Security headers, restricted CORS, request limits, rate limiting and input validation.
- Public support IDs, reversible account-closure scheduling and draft-only
  retention policies for demonstration.
- Product-first commercial foundation with an editable 31-day trial and a
  non-destructive data-classification draft.

## Technology

- React 19, TypeScript 6, Vite 8 and Tailwind CSS 4.
- Node.js 24 LTS, Express 5 and Kysely.
- SQLite for local development and PostgreSQL as the production target.
- Vitest, ESLint and Prettier.

## Start locally

```bash
npm ci
npm run dev
```

One command starts both the frontend and API. By default:

- Frontend: <http://127.0.0.1:3000>
- API: <http://127.0.0.1:3001>

Copy `.env.example` to `.env` only when local overrides are needed.

## Quality checks

```bash
npm run format       # apply Prettier
npm run format:check # verify formatting without changing files
npm run lint
npm run typecheck
npm run test
npm run build
npm run check        # run the complete validation sequence
npm run security:probe # local-only black-box probe; requires a running API
npm run security:password-resilience # synthetic bcrypt laboratory check
```

## Documentation

- [Development guide](./DEVELOPMENT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Security](./docs/SECURITY.md)
- [Integral security audit standard](./docs/SECURITY-AUDIT-STANDARD.md)
- [Latest integral black/gray/white-box assessment](./docs/SECURITY-AUDIT-2026-08-05.md)
- [Initial local black/gray/white-box assessment](./docs/SECURITY-ASSESSMENT-EXTREME-2026-08-01.md)
- [Account lifecycle foundation](./docs/ACCOUNT-LIFECYCLE.md)
- [Legal readiness checklist](./docs/LEGAL-READINESS.md)
- [Commercial foundation audit](./docs/COMMERCIAL-FOUNDATION-AUDIT.md)
- [Self-hosted production readiness](./docs/SELF-HOSTED-PRODUCTION.md)

## Demo data

Development mode seeds demonstration accounts and classes. Demo credentials are shown on the sign-in page and must never be enabled in production. The server now rejects a production startup when `SEED_DEMO_DATA=true` instead of creating accounts with public passwords.

## Known limitations

- PostgreSQL migrations are prepared but still require validation against an
  authorized self-hosted staging database before the shared client is switched
  from SQLite.
- Commercial trials still use a single shared centre and remain disabled by
  default in production until tenant isolation is implemented.
- Password recovery, email verification and optional two-factor authentication are pending.
- Payments, subscriptions and refunds are not implemented.
- Legal pages are drafts and still require real contact, tax and business information plus professional review.
- Notifications and real-time updates are not implemented.

## Ownership and licence

Umbravia Forge is owned and operated by Javier López Díaz. The repository currently has no open-source licence; reuse rights are not granted by default.
