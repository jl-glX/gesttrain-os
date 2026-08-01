# GestTrain/OS

GestTrain/OS is a modular gym-management application for classes, bookings, waitlists, users, trainers and activity analytics. The responsive interface supports Spanish, English, German and Swiss Standard German.

> Project status: active development. GestTrain/OS is not yet ready for commercial production or real payments.

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

## Technology

- React 19, TypeScript 6, Vite 8 and Tailwind CSS 4.
- Node.js 24 LTS, Express 5 and Kysely.
- SQLite for local development.
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
- [Local black/gray/white-box assessment](./docs/SECURITY-ASSESSMENT-EXTREME-2026-08-01.md)
- [Account lifecycle foundation](./docs/ACCOUNT-LIFECYCLE.md)
- [Legal readiness checklist](./docs/LEGAL-READINESS.md)

## Demo data

Development mode seeds demonstration accounts and classes. Demo credentials are shown on the sign-in page and must never be enabled in production. The server now rejects a production startup when `SEED_DEMO_DATA=true` instead of creating accounts with public passwords.

## Known limitations

- SQLite is intended for local development; production storage and migrations are not yet defined.
- Password recovery, email verification and optional two-factor authentication are pending.
- Payments, subscriptions and refunds are not implemented.
- Legal pages are drafts and still require real contact, tax and business information plus professional review.
- Notifications and real-time updates are not implemented.

## Ownership and licence

GestTrain/OS is owned and operated by Javier López Díaz. The repository currently has no open-source licence; reuse rights are not granted by default.
