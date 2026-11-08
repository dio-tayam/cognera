# Authentication, Google sign-in, and roles

## Sign-in methods

Cognera uses Supabase Auth. With `SUPABASE_URL` and `SUPABASE_ANON_KEY` set, people can:

- **Continue with Google** on `/login` and `/signup` (a first Google sign-in creates the account)
- Sign up and log in with email and password
- Reset a forgotten password

All redirect flows (Google OAuth, email confirmation, password recovery) finish at `/auth/callback`, which exchanges the code for a session cookie and sends the person on. Recovery links land on `/reset-password`.

## Enable Google

1. In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** (Web application).
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
2. In Supabase → Authentication → Providers → **Google**, enable it and paste the client ID and secret.
3. In Supabase → Authentication → URL Configuration:
   - Site URL: your `PUBLIC_SITE_URL`
   - Redirect URLs: add `<PUBLIC_SITE_URL>/auth/callback` (for local work, `http://localhost:3000/auth/callback`)

Cognera reads Supabase's public `/auth/v1/settings` to see whether Google is enabled. When it is off, the Google button is shown disabled with that reason, and `/auth/google` sends people back to `/login` with a clear message instead of a raw provider error.

Only same-site relative paths are accepted for `?next=` after sign-in.

## Roles and permissions

Every organization member has one role. The matrix lives in `lib/auth/permissions.ts` and is shown at `/dashboard/settings/roles` and `/security`.

| Role   | Summary                                                                 |
| ------ | ----------------------------------------------------------------------- |
| owner  | Everything, including deleting the organization and granting owner      |
| admin  | Publish, activate workflows, export leads, manage integrations and team |
| editor | Edit leads, write drafts and media, build and test workflows            |
| member | Read access across the workspace, plus the AI workspace                 |

Checks happen twice: API routes and screens call `can(role, permission)` (or `requirePermission`) before acting, and Postgres row-level security enforces the same rules on every tenant table. AI features never grant access: model output can only become an action through `lib/ai/actions.ts`, which re-reads the caller's role on the server.
