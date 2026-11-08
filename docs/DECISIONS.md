# Decisions

## Empty directory

The workspace path was a zero-byte file, not a repository with application code. A search of the home directory, excluding Library, Trash, and `node_modules`, found no earlier Cognera tree. Phase 0 is therefore a new application created with `create-next-app@16.4.0`, not a rename of an existing product. See `docs/MIGRATION_INVENTORY.md`.

## Runtime and framework

Node.js 24 is the Active LTS line on 11 October 2026. Node.js 26 is still Current until 28 October 2026, so it is not the pin. `.nvmrc` pins 24.21.0. `package.json` accepts `>=24.18.0 <25` because this machine verified the suite on 24.18.0.

Next.js 16.4.0, React 19.3.0, and the generated TypeScript 5.9 line are the scaffold's compatible set. TypeScript 7.0.2 is the npm `latest` tag, and this project stays on the 5.9 line the Next.js compiler plugin is published with.

ESLint stays on the 9.x release installed by `eslint-config-next@16.4.0`. ESLint 10 is newer, and the scaffold has not moved to it.

`@vitejs/plugin-react` is 5.2.0. Version 6 pulls an optional Babel 8 peer that conflicts with the Babel 7 tree already required by the Next.js and shadcn packages.

The package manager is npm because the phase requires `package-lock.json`.

## Data

PostgreSQL 18.6 is the current stable major. PostgreSQL 19 is not generally available yet. The app uses `pg` and SQL migrations so local Postgres and Supabase Postgres share one data-access layer. PGlite runs those same migrations in Vitest when Docker is not available. CI also migrates a PostgreSQL 18.6 service.

Supabase is optional. Local Postgres does not provide Supabase Auth. The service-role key is server-only and is used for account deletion, not for ordinary reads.

Ollama is optional and is not started by a normal `docker compose up`.

## UI

shadcn/ui is initialized with its current `base-nova` preset, Base UI primitives, Tailwind CSS 4, and Lucide. Design tokens are the CSS variables in `app/globals.css`.

Cache Components and partial prefetching stay on because they are the Next.js 16.4 defaults. Dynamic status, auth, and site configuration call `connection()` inside Suspense so they are not frozen into the static shell.

## Local passwords

`cognera_local_admin` and `cognera_local_app` are committed for local Docker and CI. They are not production secrets. Production must use different credentials and must connect the app as a role without superuser or bypass-RLS rights.
