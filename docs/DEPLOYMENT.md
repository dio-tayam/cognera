# Deployment

Phase 0 can be built as a standalone Next.js server. It is not a finished production rollout.

## Container

```bash
docker compose --profile app up -d --build
```

The default `docker compose up -d` starts only Postgres. The `ai` profile starts Ollama and does not start the app. The `app` profile builds the Dockerfile and publishes port 3000.

The image runs as the unprivileged `nextjs` user and does not copy `.env`. Pass environment variables at runtime. Set `PUBLIC_SITE_URL` to the external origin. Leave optional variables empty to keep those integrations disabled.

Apply migrations with a one-off command that has `DATABASE_MIGRATION_URL`, not from the browser:

```bash
npm run db:migrate
npm run db:status
npm run db:check-app
```

Inside the image, the migration files are at `/app/db/migrations`. The health check reads that directory from the working directory.

## Process

`npm run build` creates `.next/standalone`. The container starts `node server.js` after the static assets are copied beside it. A non-container host can run `npm run start`, which serves the regular `.next` output. Next.js prints a warning that `next start` is not the standalone process; the page still starts. Set `HOSTNAME=0.0.0.0` on the container when it must listen beyond localhost. Next.js reads `PORT`.

## Reverse proxy

Terminate TLS at the proxy. Add `Strict-Transport-Security` there. Forward requests to the Node process. Do not inject `SUPABASE_SERVICE_ROLE_KEY` or database URLs into client-side environment variables.

## CI

`.github/workflows/ci.yml` installs the Node version in `.nvmrc`, then runs lint, typecheck, unit tests, formatting, the secret scan, the production build, and Playwright. A second job migrates an empty PostgreSQL 18.6 database and checks the application role.

## Not in this phase

There is no production hosting account, backup schedule, or secret manager wired up. Add those before storing customer data.
