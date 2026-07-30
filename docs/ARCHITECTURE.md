# Architecture

## Overview

GestTrain/OS is a TypeScript application with a React client, an Express API and a SQLite database accessed through Kysely.

```text
Browser
  -> React pages and components
  -> typed hooks and API client
  -> Express routes
  -> validation and authorization middleware
  -> domain services
  -> Kysely
  -> SQLite
```

Development uses a single launcher for Vite and Express. Production builds the client into `dist/public` and compiles the server as Node ESM.

## Main domains

- Authentication and persistent sessions.
- Users and role-based permissions.
- Gym classes and trainer assignments.
- Bookings, capacity and waitlist promotion.
- Activity and administrative analytics.
- GestTrain/OS financial records adapted internally from App-ProTrack's budget and transaction domain.
- Internationalized user interface.
- Public legal information.

## Roles

- `member`: browses classes, manages personal bookings and sees personal analytics.
- `trainer`: sees assigned classes, attendees, waitlists and trainer analytics.
- `admin`: manages users, classes, billing records and system-wide analytics; it does not reserve member places.

Roles describe authorization. Authentication proves the current identity; server-side middleware decides which actions that identity may perform.

## Localization

`i18next` manages interface text and language selection. Browser `Intl` handles locale-sensitive dates, time zones, numbers and currencies. Spanish, English and standard German catalogues live in `client/src/i18n/locales`; `de-CH` supplies Swiss Standard German spelling and regional overrides while inheriting the common German catalogue.

The billing currency allowlist includes Swiss francs (`CHF`). Amounts are formatted by `Intl.NumberFormat` with the active interface locale, so German and Swiss German use their corresponding regional conventions without custom separators.

Known demo classes are localized at display time. User-created names and descriptions remain exactly as entered.

## Evolution boundaries

- Replace ad-hoc table initialization with migrations before production.
- Move from local SQLite to a production-grade database when concurrency and deployment require it.
- Keep the GestTrain/OS billing ledger separate from future Stripe payment processing. The current module records operational status; it does not move money.
- Invoice details, archived records and custom billing cycles belong to GestTrain/OS's financial domain. The visible interface does not expose App-ProTrack as a product name.
- Facility profile settings store the centre name, logo and accent colour separately from GestTrain/OS's product identity. Logo updates are admin-only and accept PNG, JPEG or WebP images up to 512 KB.
- The current installation has one `primary` facility profile. Before operating as a true multi-tenant SaaS, users, classes, bookings and billing records must all be scoped by facility and tested for cross-tenant isolation.
- The interface keeps three visual identities separate: the fixed GestTrain/OS product logo, the active facility logo and the signed-in user's profile photo. Profile photos can only be updated by their account owner and use the same safe image restrictions as facility logos.
- Continue adapting suitable App-ProTrack concepts instead of duplicating a second finance domain.
- Keep GestTrain/OS functional when optional integrations are unavailable.
