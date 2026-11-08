# Development

## Tools

Run `npm run setup:check` after cloning. It prints `pass`, `failed`, or `blocked` for each tool and the install command for anything missing.

Required:

- Node.js `>=24.18.0 <25`. The pin in `.nvmrc` and `.node-version` is 24.21.0.
- npm
- Git

Optional:

- Docker and Docker Compose, for local Postgres and the optional Ollama profile
- Ollama, or the Compose `ai` profile, for local model inference

### macOS

```bash
brew install node@24 git
brew install --cask docker
open -a Docker
```

If `node@24` is keg-only, add the path Homebrew prints. npm is installed with Node.js. Git is also available from `xcode-select --install`.

### Windows

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Docker.DockerDesktop
```

Open Docker Desktop before `docker compose up`. Use PowerShell to copy the environment file:

```powershell
Copy-Item .env.example .env
```

### Linux

```bash
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 24.21.0
fnm use 24.21.0
sudo apt-get update && sudo apt-get install -y git
```

Install Docker Engine from https://docs.docker.com/engine/install/ and start it with `sudo systemctl start docker`.

## App

```bash
npm install
cp .env.example .env
npm run dev
```

The development server does not need `DATABASE_URL`. Status then shows the database and Supabase checks as blocked. To use Postgres:

```bash
docker compose up -d
npm run db:migrate
npm run db:status
npm run db:check-app
```

Copy the database URLs from `.env.example` into `.env` first. The passwords there are local development credentials. Compose publishes Postgres on host port 5433 so it does not take over another Postgres already listening on 5432. Inside the Compose network the database is still on port 5432.

Ollama stays disabled unless you set `OLLAMA_BASE_URL`. To start the bundled server:

```bash
docker compose --profile ai up -d
```

Then set `OLLAMA_BASE_URL=http://127.0.0.1:11434`. The health check calls `/api/tags`. It does not invent a model response. See [AI.md](AI.md) for installation on macOS, Windows, and Linux, model sizing, and the AI security model.

Supabase sign-in stays disabled until both `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set. Docker Postgres does not authenticate those users. Use one mode per deployment: local SQL authorization through `cognera_app`, or Supabase Auth plus the same row level security. `SUPABASE_SERVICE_ROLE_KEY` is optional and is used only on the server to delete an auth user after memberships are removed. Do not put it in client code.

Hosted Supabase still needs its own database connection string before `npm run db:migrate` can create tables there. Do not reuse the local `cognera_app` password on that project. The migration file `0004_organizations.sql` does not create a login role.

## Quality commands

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run check:secrets
npm run build
npm run test:e2e
```

Playwright starts `npm run start`, so build first. `npm run format` rewrites files with Prettier.

## Database commands

| Exit code | Meaning                                                      |
| --------- | ------------------------------------------------------------ |
| 0         | The command finished successfully                            |
| 1         | The database was configured and the command failed           |
| 2         | The command is blocked because the connection URL is missing |

Do not point these commands at a database you cannot afford to change. Migrations add schema. They do not delete application data, but they do change it. `0001_foundation.sql` creates the local `cognera_app` role the first time it runs; do not apply that file to a hosted Supabase project that should not have that password. A database that already applied `0001` can take `0004_organizations.sql` without creating another role.
