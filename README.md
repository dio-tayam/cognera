# Cognera AI

Automate work. Manage content. Grow smarter.

Cognera AI is the foundation for a secure, multi-tenant automation and content platform. This repository is Phase 0: identity, local setup, a real health check, tenant-aware Postgres access, a database-backed job queue, and a TypeScript workflow engine. It does not yet include the content studio, billing, or customer automation product.

## Requirements

- Node.js 24 LTS, at least 24.18.0 and below 25. CI and Docker pin 24.21.0.
- npm, which ships with Node.js.
- Git.
- Docker, when you want the local Postgres service. The app and unit tests run without it.

Optional integrations stay disabled until their environment variables are set. You do not need a paid API key to install, test, or run the development server.

## Set up

Install the missing tools reported by the setup check. The same commands are listed for each operating system in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

```bash
npm install
npm run setup:check
cp .env.example .env
```

On macOS or Linux, `cp` is enough. On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Start Postgres when you want a database:

```bash
docker compose up -d
npm run db:migrate
npm run db:status
npm run db:check-app
```

`db:migrate` and `db:status` exit 2 when no database URL is configured. That is a blocked check, not a failed migration. They exit 1 when the database is configured and the command fails.

Then start the app:

```bash
npm run dev
```

Open http://localhost:3000. System status is at http://localhost:3000/status and the health endpoint is http://localhost:3000/api/health.

## Scripts

| Command                 | What it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run dev`           | Starts the Next.js development server                             |
| `npm run lint`          | Runs ESLint                                                       |
| `npm run typecheck`     | Runs the TypeScript compiler                                      |
| `npm run test`          | Runs Vitest                                                       |
| `npm run test:e2e`      | Runs Playwright against `npm run start`                           |
| `npm run build`         | Builds the production app                                         |
| `npm run format:check`  | Checks Prettier formatting                                        |
| `npm run check:secrets` | Scans the tree for private keys and live tokens                   |
| `npm run setup:check`   | Reports installed tools and install commands for anything missing |
| `npm run db:migrate`    | Applies SQL migrations                                            |
| `npm run db:status`     | Prints applied and pending migrations                             |
| `npm run db:check-app`  | Confirms `DATABASE_URL` connects as the non-superuser app role    |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Decisions](docs/DECISIONS.md)
- [Migration inventory](docs/MIGRATION_INVENTORY.md)
