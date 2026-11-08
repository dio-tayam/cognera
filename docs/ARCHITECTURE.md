# Architecture

Cognera AI is a Next.js App Router application. Server code talks to PostgreSQL through one data-access layer. Supabase Auth and Ollama are optional and stay disabled until they are configured.

```text
Browser
  |
  v
Next.js routes and server actions
  |
  +--> getHealthReport() ---- optional HTTP checks (Supabase, Ollama)
  |
  +--> withTenant() -------- PostgreSQL as cognera_app
         |
         +--> jobs
         +--> workflow_runs / workflow_step_runs
```

## Identity

`config/brand.ts` holds the product name, short name, and tagline. `getSiteConfig()` adds the public site URL and support email from `PUBLIC_SITE_URL` and `SUPPORT_EMAIL`. Those values are read on the server after `connection()` so a deployed process can receive them at runtime.

## Data access

`lib/db` is the only application data-access layer. Repositories use parameterized SQL through a small `SqlClient` interface. Production uses `pg`. Tests use PGlite with the same SQL files. There is no second ORM.

Migrations live in `db/migrations` and are applied by `lib/db/migrations.ts`. The runner records a SHA-256 checksum for each file and refuses to continue if an applied file changes. `schema_migrations` is created by the runner before the first file.

## Tenancy

`0001_foundation.sql` creates `tenants`, `tenant_members`, and the `cognera_app` role. Row level security is enabled and forced. Request code calls `withTenant()`, which sets the local role to `cognera_app` and calls `app_set_context()`. That function checks membership before setting the tenant and user session variables. Job and workflow inserts take the tenant id from the session, not from a caller-supplied column.

The migration role is a superuser in local Docker, so it bypasses row level security while applying schema. The application URL must use `cognera_app`.

## Jobs and workflows

The job queue is table `jobs`. `claimJob()` locks the next due row with `FOR UPDATE SKIP LOCKED`. Failed attempts return to `failed` until `max_attempts`, then move to `dead`.

In-memory workflow definitions stay registered in TypeScript. Their runs and step results are stored in `workflow_runs` and `workflow_step_runs`. A failed step is persisted, and `resumeWorkflow()` runs only the steps that have not succeeded.

Organization workflows are a separate graph stored as versioned JSON in `workflow_versions.definition`. Zod validates the document. The graph is a directed acyclic set of the built-in node types. Saving inserts a new draft version. Activating publishes that version and retires the previous published one. Published definition text cannot be edited in place.

`workflow.execute` jobs are claimed by `app_claim_workflow_job`, which uses `FOR UPDATE SKIP LOCKED` and returns nothing while `workflow_runtime.enabled` is false. Accepted jobs stay queued when that switch is off. `npm run workflows:work` recovers jobs left running after a worker stops, dispatches due schedules, and claims up to 25 jobs. A request handler may also process one test execution. The worker does not rely on a browser timer.

Retries use bounded exponential backoff, at most five attempts. Permanent step errors go to the dead-letter status immediately. Follow-up tasks are idempotent on the execution and node. Email and text generation call external services and are at-least-once: a retry can send or generate again if the provider already accepted the first attempt. Both stay disabled until `EMAIL_WEBHOOK_URL` or `OLLAMA_BASE_URL` is set, and a missing setting is a permanent step failure.

`POST /api/public/workflows/[workflowId]` accepts a signed webhook body. The secret is shown once when an owner or admin rotates it. Signatures include a timestamp, and a stored nonce rejects a replay. Outbound HTTP from the email step goes through the SSRF checks in `lib/workflows/ssrf.ts`. Customer nodes cannot supply a URL.

## HTTP surface

The public site includes `/`, `/features`, `/pricing`, `/about`, `/contact`, `/privacy`, `/terms`, `/login`, `/signup`, `/forgot-password`, and `/status`. `/sign-in` redirects to `/login`. `/account` shows the Supabase user when auth is configured.

`/api/health` returns the same report as `/status`. Signed-in leads use `/api/leads`, `/api/leads/[id]`, `/api/leads/[id]/notes`, `/api/leads/[id]/activity`, and `/api/leads/export`. `POST /api/public/contact` accepts a public message only when `CONTACT_ORGANIZATION_ID` is set, and it does not return private lead records.

Published pages are served at `/site/[slug]` and published posts at `/blog` and `/blog/[slug]`. Those routes, `/sitemap.xml`, and public image responses read only the organization in `PUBLIC_CONTENT_ORGANIZATION_ID`, and only rows that are published or whose scheduled time has passed. Drafts, reviews, archives, and future scheduled items are not returned. Content is JSON version 1 in the existing `body` column and is rendered as text, not HTML. Signed-in editing uses `/api/cms/pages`, `/api/cms/posts`, their revision routes, `/api/cms/categories`, `/api/cms/tags`, and `/api/media`. Media bytes stay outside `public/`. A file URL is served only to a member of the owning organization, or anonymously when that file is referenced by public content. `robots.txt` disallows `/dashboard`, `/api`, and the account routes.

Leads, content, and organization workflows use the signed-in organization. Preview mode keeps labeled fixtures. The runs, analytics, and billing screens stay fixtures. A signed-in workflow page loads the graph, validation, activation, test runs, and execution history from the API.

Without Supabase Auth, `/dashboard` opens in preview mode. With Supabase configured and no session, those routes redirect to `/login`.

Health responses use `pass`, `fail`, and `blocked`. The overall status is `ok` when nothing failed, including when checks are blocked. HTTP 503 is reserved for a failed check or an unexpected error.

## UI

Shared controls live in `components/ui` and use the CSS variables in `app/globals.css`. Those variables are the design tokens. Pages compose them instead of introducing a second color system.
