# Testing

## Unit and integration tests

```bash
npm run test
```

Vitest runs in Node for database tests and in jsdom for component tests. Database tests apply `db/migrations` to PGlite, which is a PostgreSQL engine. They do not mock query results.

Covered behavior:

- Migrations apply once and reject a changed checksum.
- Jobs can be claimed, completed, retried, and marked dead.
- A tenant cannot read another tenant's job, and a non-member cannot open a tenant context.
- A workflow persists a successful step, records a failed step, and resumes without repeating the successful step.
- Health reports missing integrations as blocked and unreachable configured services as failed.
- The home page links to real routes.
- The sign-in form is disabled, with an explanation, when auth is unavailable. Client-side validation runs before the server action.

Vitest loads environment files from `tests/env`, which is empty, so a developer `.env` does not change the suite.

## End-to-end tests

```bash
npm run build
npm run test:e2e
```

Playwright starts the production server. `tests/e2e/foundation.spec.ts` checks the home page, the live status page, refresh, and the disabled sign-in and account states. `tests/e2e/interface.spec.ts` checks public and application routes, internal links, the mobile menu, theme selection, forms, lead search, sorting pages, dialogs, and unsaved-change warnings. Those checks expect Supabase and Postgres to be unconfigured. If you export `DATABASE_URL` in the shell that launches Playwright, the status assertion will not match. A configured Supabase project redirects `/dashboard` to `/login` instead of opening preview fixtures.

## Database checks that need Postgres

PGlite does not replace the CI check against PostgreSQL 18.6. The `database` GitHub Actions job runs:

```bash
npm run db:migrate
npm run db:status
npm run db:check-app
```

Locally, those commands are blocked with exit code 2 until Docker or another Postgres server is configured. A blocked result is not a test failure. An exit code 1 is a failure.

## What is not claimed

This phase does not include a load test, a browser pass on a hosted environment, or a successful Supabase login. Those stay untested until the services exist.
