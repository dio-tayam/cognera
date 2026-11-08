# Migration inventory

Inspected on 11 October 2026. The workspace path was a zero-byte file named `cognera`, not a Git repository and not a directory of source code. A filesystem search under the home directory, depth five, excluding Library, Trash, and `node_modules`, found no project tree for Cognera, Vantyqo, Orqestra, or FlowPilot.

No historical commits were rewritten. `create-next-app` created a new Git repository and its own initial commit. Later Phase 0 files are working-tree changes on top of that commit.

| Area                  | What was found                                                 | What changed                                                                                                             |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Application code      | None                                                           | New Next.js application                                                                                                  |
| Routes                | None                                                           | `/`, `/status`, `/sign-in`, `/account`, `/api/health`                                                                    |
| Package metadata      | None                                                           | `package.json` name `cognera` and the Cognera AI description                                                             |
| Documentation         | None                                                           | README and `docs/`                                                                                                       |
| Environment variables | None                                                           | `.env.example`                                                                                                           |
| Tests                 | None                                                           | Vitest and Playwright                                                                                                    |
| Visual assets         | None in the empty file                                         | `app/icon.svg`. The Next.js template SVGs that the scaffold added under `public/` are unused by the UI                   |
| Obsolete names        | Vantyqo, Orqestra, and FlowPilot were not present              | No rename was required. A test fails if those names appear outside this inventory and the two tests that search for them |
| Template copy         | `create-next-app` generated "Create Next App" and Vercel links | Replaced with Cognera AI copy and routes that exist in this app                                                          |

The zero-byte file had to be removed so the project directory could be created. It contained no user data.
