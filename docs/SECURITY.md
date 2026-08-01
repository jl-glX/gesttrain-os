# Security

The latest repository security review is documented in
[`SECURITY-AUDIT-2026-08-01.md`](./SECURITY-AUDIT-2026-08-01.md).

## Account protection

GestTrain/OS supports TOTP two-step verification with common authenticator apps,
single-use recovery codes, revocable server-side sessions, WebAuthn passkeys and
a recent security activity log. MFA secrets are encrypted with AES-256-GCM and
recovery codes are stored as keyed hashes. Production deployments must provide a unique
`MFA_ENCRYPTION_KEY`; it must not be committed or shared between unrelated
environments.

The implementation uses browser standards and responsive web controls, so the
same flow is available in current browsers on Windows, macOS, Android and iOS.
Physical-device and native-app verification is still required before claiming
platform certification. GestTrain/OS does not store passwords or session tokens in
browser storage. WebAuthn delegates biometric or PIN verification to the device;
GestTrain/OS stores a public credential, never a fingerprint, face template or device PIN.

## Delegation history

Active permissions and accepted delegations remain visible while they can be
used. Inactive delegation history is visible to each participant for up to 30
days and can also be cleared manually from that participant's view.

Clearing history is not permission revocation and never removes an active
delegation. Each participant has independent visibility: a row is physically
removed only after no participant still needs it. This keeps the everyday
account view compact without using display cleanup as a substitute for a
security audit or a future legally required record.

## Authentication portals

GestTrain/OS presents members and centre staff with separate sign-in portals. The
member portal accepts only member accounts. The staff portal accepts trainer
and administrator accounts and can identify a centre account by its corporate
email address or registered centre phone number. This separation is enforced
by the API as well as the interface; choosing a different portal cannot elevate
an account's role or permissions.

## Implemented baseline

- Password hashing with bcrypt and a cost factor of 12.
- Password policy of 12-128 characters with uppercase, lowercase and digits.
- Opaque random session tokens; only their SHA-256 hashes are stored.
- Persistent, expiring and revocable database sessions.
- Browser-session cookies by default, plus optional remembered sessions with an explicit 30-day expiry and server-side revocation.
- WebAuthn passkeys requiring user verification for passwordless sign-in.
- `HttpOnly`, `SameSite=Strict` session cookies and `Secure` cookies in production.
- Server-side authentication and role authorization.
- Helmet protections, production CSP and HSTS.
- Restricted CORS with credentials.
- Server-side origin checks for state-changing API requests.
- Passkey challenges bound to configured trusted origins and RP IDs.
- API and authentication rate limits.
- Small configurable request bodies and centralized error handling.
- Input validation and automated security tests.
- Local databases and environment files excluded from version control.
- SQLite foreign-key enforcement and transactional reservation changes.
- Spreadsheet-formula neutralization in attendee CSV exports.

## Production work still required

- Email verification and account recovery.
- Optional enforcement of 2FA or passkeys for privileged roles.
- Physical verification of passkeys on representative Android, iOS and macOS devices.
- CSRF review if cross-site deployment requirements change.
- Deployment proxy and HTTPS configuration review.
- Versioned database migrations, encrypted backups and retention rules.
- Audit trail for sensitive administrative operations.
- Monitoring, alerting and a documented incident-response process.
- Secret management outside local `.env` files.

## Reporting a vulnerability

The repository owner is Javier López Díaz. A dedicated security contact and private reporting channel must be added before the repository or service is made public.

Do not disclose active vulnerabilities in a public issue when a private reporting channel is available.
