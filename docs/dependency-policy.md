# Dependency update policy

GestTrain/OS keeps direct dependencies pinned to exact versions and uses the
committed lockfile as the reproducible source for installations.

## Supported toolchain

- Node.js 24.15.x
- npm 12.0.x
- TypeScript 6.0.x while `typescript-eslint` requires TypeScript `<6.1`
- Node 24 type definitions while Node 24 is the supported runtime

These compatibility holds are deliberate. They should be removed only after
the complete lint, typecheck, test, build and audit sequence passes with the
next toolchain generation.

## Safe update workflow

1. Start from a clean branch and keep `package.json` plus `package-lock.json`
   together in the same change.
2. Update a coherent dependency group without using peer-dependency bypasses.
3. Run `npm run CI`. This performs a clean locked installation, all project
   checks and a vulnerability audit.
4. Review the resulting diff and application behavior before merging.

`npm run CI --force` is also safe: the runner deliberately removes npm's force
flag from its child processes. It never rewrites dependency declarations or
the lockfile, and it fails if either protected file changes during validation.

Do not use `npm audit fix --force` as an update strategy. Major upgrades are
reviewed independently. Dependabot groups compatible minor and patch updates;
major releases remain isolated for explicit migration and testing.

## Temporary React Router advisory

React Router 7.18.2 is the latest published release, but npm currently reports
`GHSA-qwww-vcr4-c8h2` for its optional React Server Components action mode.
GestTrain/OS uses only declarative client-side `BrowserRouter` routing and does
not enable the affected RSC mode.

The audit runner therefore permits only that advisory, only through the exact
`react-router` and `react-router-dom` 7.18.2 dependency chain. Any other
advisory, package or version still fails CI. Remove this narrow exception as
soon as an upstream patched release is available.
