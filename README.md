# Cognera AI

Automate work. Manage content. Grow smarter.

Cognera AI is a multi-tenant automation and content platform. Teams manage leads, write and publish content, build and run automation workflows, and use an AI assistant — all scoped per organization, with AI running locally through [Ollama](https://ollama.com) instead of a paid cloud API.

## What's in the app

- **Leads (CRM)** — capture, search, filter, and export leads; notes and follow-up tasks per lead.
- **Content (CMS)** — draft, review, schedule, and publish pages and posts, with revision history and media uploads.
- **Automations** — a visual, node-based workflow builder (triggers: manual, lead created, webhook, schedule; logic: condition, text transform; actions: follow-up task, send email, AI text generation/transform). Workflows run through a database-backed job queue and a separate worker process, not inline with the request.
- **AI workspace** — draft email, summarize/classify a lead, blog outline, article draft, FAQ draft, transform text, and job description generation. Every result is editable text; nothing is sent, published, or changed automatically. Runs against a local Ollama model — no API key, no per-token cost.
- **Analytics** — real counts and trends for leads, workflow runs, AI usage, and content, with a selectable time range and drill-down links into filtered lists.
- **Integrations** — a live health report for the database, Supabase Auth, Ollama, and email delivery.
- **Settings** — organization profile, team members and roles, and account security (password, account deletion).

Optional integrations stay off until their environment variables are set, and the rest of the app keeps working either way. Nothing in Cognera requires a paid API key.

## Roles

Four roles, each a strict superset of the one before it:

| Role       | Can do                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **member** | View leads, content, workflows, and analytics; use the AI workspace.                                                                                                                       |
| **editor** | Everything a member can, plus create/edit leads, write content drafts, and build workflows.                                                                                                |
| **admin**  | Everything an editor can, plus delete/export leads, publish content, activate workflows, manage integrations and webhooks, invite and manage team members, and edit organization settings. |
| **owner**  | Everything an admin can, plus delete the organization and grant the owner role to someone else.                                                                                            |

Permissions are defined once in `lib/auth/permissions.ts` and enforced both in the UI and at the API layer; database row-level security mirrors the same rules as the final gate. See [docs/AUTH.md](docs/AUTH.md) for sign-in methods and more detail on roles.

## Requirements

- Node.js 24 LTS, at least 24.18.0 and below 25. CI and Docker pin 24.21.0.
- npm, which ships with Node.js.
- Git.
- Docker, when you want the local Postgres service. The app and unit tests run without it.
- [Ollama](https://ollama.com) (optional) for the AI workspace and AI workflow nodes.
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (optional) for testing the workflow "send email" step locally — see below.

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

### Running the app

The simplest way to run everything locally:

```bash
./dev.sh
```

This starts Ollama (if installed), a Cloudflare quick tunnel so the workflow email relay has a public URL to call (updates `EMAIL_WEBHOOK_URL` in `.env` automatically), the workflow worker (so queued automation runs actually execute), and `next dev` — all in one terminal, and all stopped cleanly on Ctrl+C.

To run pieces individually instead:

```bash
npm run dev              # the Next.js app only
npm run workflows:work -- --loop   # the automation worker, separately
npm run ai:check          # detect Ollama and get a model suggestion
```

Open http://localhost:3000. System status is at http://localhost:3000/status and the health endpoint is http://localhost:3000/api/health.

### AI and email, briefly

- **AI workspace / AI workflow nodes**: set `OLLAMA_BASE_URL` (see `.env.example`). Run `npm run ai:check` for a model recommendation sized to your machine. No API key, ever. Details in [docs/AI.md](docs/AI.md).
- **Workflow "send email" step**: needs a public HTTPS `EMAIL_WEBHOOK_URL` — a private or loopback address is rejected for safety. Locally, `./dev.sh` wires this up automatically via a Cloudflare tunnel pointed at the bundled `/api/email-relay` route, which forwards to [Resend](https://resend.com)'s free tier (set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_RELAY_SECRET` — see `.env.example`). In production, point `EMAIL_WEBHOOK_URL` at your own provider endpoint instead.

## Scripts

| Command                         | What it does                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `./dev.sh`                      | Starts Ollama, an email-relay tunnel, the workflow worker, and `next dev` together |
| `npm run dev`                   | Starts the Next.js development server                                              |
| `npm run lint`                  | Runs ESLint                                                                        |
| `npm run typecheck`             | Runs the TypeScript compiler                                                       |
| `npm run test`                  | Runs Vitest                                                                        |
| `npm run test:e2e`              | Runs Playwright against `npm run start`                                            |
| `npm run build`                 | Builds the production app                                                          |
| `npm run format:check`          | Checks Prettier formatting                                                         |
| `npm run check:secrets`         | Scans the tree for private keys and live tokens                                    |
| `npm run setup:check`           | Reports installed tools and install commands for anything missing                  |
| `npm run ai:check`              | Detects Ollama, its server, and installed models; suggests one by hardware         |
| `npm run workflows:work`        | Processes due automation jobs once (add `-- --loop` to poll continuously)          |
| `npm run workflows:kill-switch` | Flips the database-level switch that pauses all workflow execution                 |
| `npm run db:migrate`            | Applies SQL migrations                                                             |
| `npm run db:status`             | Prints applied and pending migrations                                              |
| `npm run db:check-app`          | Confirms `DATABASE_URL` connects as the non-superuser app role                     |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Authentication & roles](docs/AUTH.md)
- [Local AI (Ollama)](docs/AI.md)
- [Development](docs/DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Decisions](docs/DECISIONS.md)
- [Migration inventory](docs/MIGRATION_INVENTORY.md)
