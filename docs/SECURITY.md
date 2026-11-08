# Security

## Secrets

Browser code must not receive `DATABASE_URL`, `DATABASE_MIGRATION_URL`, or `SUPABASE_SERVICE_ROLE_KEY`. Those names are not prefixed with `NEXT_PUBLIC_`. Supabase sign-in uses the anon key on the server. Phase 0 does not send the service-role key anywhere.

`.env` is gitignored. `.env.example` contains empty optional secrets and the local Postgres passwords `cognera_local_admin` and `cognera_local_app`. Those passwords are for Docker and CI on a private machine. Do not reuse them in a shared or production database.

`npm run check:secrets` fails on private keys, AWS access key ids, Stripe live keys, GitHub and Slack tokens, a service-role JWT assignment, and committed `.env` files other than `.env.example`.

## Authorization

Tenant queries go through `withTenant()`. It switches to `cognera_app` for the transaction and calls `app_set_context()`, which rejects users who are not members. Tables that hold tenant data enable and force row level security.

`cognera_app` is not a superuser and cannot bypass row level security. `npm run db:check-app` checks that the application URL connects as that role.

A direct `set_config('app.tenant_id', ...)` by `cognera_app` can still change the session variable. The database role is trusted server code. Do not expose its password to browsers, and do not build SQL from request strings. Pass the authenticated user id into `withTenant()`.

Sign-in is rejected on the server when Supabase is not configured. The form controls are also disabled, with the reason on the page. There is no client-only success state.

## Two deployments, one strategy each

Local Docker Postgres does not provide Supabase Auth. A `DATABASE_URL` for `cognera_app` can read and write only after `withTenant()` proves membership. Dashboard preview mode stays in place until Supabase Auth is configured, and a local database session is not invented to replace it.

When Supabase Auth is configured, the browser session comes from `@supabase/ssr` cookies (`path=/`, `sameSite=lax`, `secure` in production). Server actions that change state reject a mismatched `Origin` host. The service-role key is read only in `lib/auth/service-role.ts` for account deletion. It is not sent to the browser and is not used for ordinary reads.

Product tables use `app_org_role()`, which prefers `auth.uid()` when Supabase sets it, and otherwise uses `app.user_id` after the membership check. Policies are separate for select, insert, update, and delete. A member cannot change their own role. Invitations cannot grant `owner`, and acceptance requires the token hash plus the signed-in email.

Login, registration, password reset, and invitations call `app_consume_rate_limit` and stop when the database limit is unavailable. Reset and registration responses do not say whether an email is already registered. Logs passed through `publicErrorDetail()` drop database URLs, email addresses, and JWT-shaped strings.

Account deletion removes memberships only after another owner exists. If the service role is absent, the action says the login was not deleted. Email delivery is not marked successful from this app: invitation tokens are shown once because no mail is sent.

Migrations run from `npm run db:migrate`, not from a page request. Seed data is not shipped, and the migration does not create the local `cognera_app` password.

## Health output

Health details omit connection strings. A configured but unreachable database is a failure. A missing URL is blocked. Partial Supabase configuration is a failure because the operator set one of the two required values.

## Headers

Responses set `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and a restrictive `Permissions-Policy`. `X-Powered-By` is disabled. A content security policy is not enabled in this phase because a strict policy needs a nonce strategy that has not been verified against the App Router build. Do not describe the current headers as a complete browser security policy.

Set HTTP Strict Transport Security at the HTTPS reverse proxy, not in the local HTTP server.

## Cookies

Supabase session cookies are written from server actions. If a Server Component cannot write cookies, that specific Next.js error is ignored and any other cookie error is rethrown. Phase 0 does not add a proxy for session refresh.
