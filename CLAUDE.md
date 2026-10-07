# CLAUDE.md

## Workspace layout

This root directory is its own git repository — `Daniel88dev/flexi-day-workspace`, public. It
versions only the cross-cutting files (`CLAUDE.md`, `.claude/`, `.agents/`, `docs/`, `tools/`,
`package.json`) plus `showreel/`, the flexiday motion reel built as code, and holds four
independent repos that make up the Flexi Day vacation/day-off management product, each with its
own remote, `package.json`, CI, `CLAUDE.md` and `.claude/`:

| Directory           | Role                                    | Stack                                                                                     |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `flexi-day/`        | Frontend (static-export SPA)            | Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query, better-auth      |
| `flexi-day-be/`     | Backend API                             | Express 5 (ESM), Drizzle + PostgreSQL, better-auth, AWS SESv2                             |
| `flexi-day-emails/` | Transactional email templates → AWS SES | react-email, AWS SESv2                                                                    |
| `flexi-day-rn/`     | iPhone app (Expo dev client)            | Expo SDK 57, Expo Router, React Native, NativeWind v5, expo-sqlite + Drizzle, better-auth |

Each sub-repo's `CLAUDE.md` carries its own conventions and gotchas, and loads when you work in it.
This file covers only what spans repos.

The four sub-directories are separate clones, gitignored here — this repo never versions their
contents. `todo/` is gitignored too: it holds working notes that stay on the machine.

## Changing this repo

`main` is protected and takes no direct pushes. Every change here — including a one-line doc
fix — goes on a branch and merges through a PR, exactly like the sub-repos:

```bash
git checkout -b docs/<short-slug>
git commit
git push -u origin docs/<short-slug>
gh pr create --repo Daniel88dev/flexi-day-workspace --base main
```

CI runs prettier, eslint, shellcheck, actionlint and a relative-link check on every PR
(`.github/workflows/ci.yml`). Run `npm run check` before pushing to catch all of it locally.

## How the repos connect

- Frontend → backend over HTTP via `NEXT_PUBLIC_API_URL` (local: `http://localhost:8080`).
- iPhone app → the same backend, through better-auth's `expo` plugin and a native session; a local
  store (expo-sqlite) mirrors what the user can see on the web. See `flexi-day-rn/CONTEXT.md`.
- Backend → SES: sends templates named `flexi-day-{template}-{dev,prod}` (region `eu-central-1`)
  produced by `flexi-day-emails`. See `flexi-day-emails/INTEGRATION.md`.
- The repos version and deploy independently; there is no shared lockstep release.

## Local development

Root `package.json` delegates into each repo via `npm --prefix`. `npm run stack:status` reports
what is up, and the `/dev-up` skill is the full startup sequence.

The backend needs a Postgres on `:5432` with a `flexi-day` database. The `DATABASE` URL carries no
user or password, so it connects as the OS user via trust auth — a native Postgres with that
database works as is, otherwise `npm run db:up` starts a `flexi-day-pg` container configured for it.

`npm run dev:emails` binds `:3000` like the frontend, so run one at a time or override the port.
`npm run dev:rn` starts Metro on `:8081` for the iPhone dev client; the native build itself goes
through Xcode from inside `flexi-day-rn/`.

`npm run stack:start` runs the backend and the frontend as detached processes, for a shell that
cannot keep a foreground server alive, and waits until both answer. Logs land in `.stack/`
(`npm run stack:logs`), and `npm run stack:stop` ends them.

## Seeding and signing in locally

Sign-up requires email verification through SES, which does nothing locally, so seeding and sign-in
go through a gated dev surface rather than manual `curl` + `psql`:

| Command                           | Effect                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev:scenario`            | seeds `owner@dev.local` (manager + approver), three members, quotas and bookings in every state, plus `Dev Support`, which the owner administers without being a member |
| `npm run dev:seed`                | one verified user, optionally with a team                                                                                                                               |
| `npm run dev:login <email>`       | issues a signed session cookie for API calls                                                                                                                            |
| `npm run dev:login:rn -- <email>` | signs the user into the iPhone app on the simulator; `--to /path`, `--udid <udid>`                                                                                      |
| `npm run dev:reset`               | deletes every `@dev.local` account and its data, nothing else                                                                                                           |

`http://localhost:3000/dev-sign-in/?email=owner@dev.local` then lands on the dashboard already
authenticated. The `flexi-dev` MCP server (`.mcp.json`, `tools/mcp/flexi-dev/`) exposes the same
operations as tools, and the `ui-test` skill is the full loop for exercising a feature in the
browser or on the simulator.

The surface exists only on a dev machine, gated five ways, and stays that way. The one exception is
the endpoint where the iPhone app redeems its sign-in ticket: it keeps three of the gates and skips
the loopback and token checks, because the simulator reaches the backend over the LAN and the app
must never hold the token. `flexi-day-be/docs/invariants.md` has the enforcement and the reasoning.

## Cloud sessions

A Claude Code cloud environment that attaches only this repo runs the whole stack, Postgres
included, with no Docker. `tools/cloud/setup.sh` is the environment's setup script. It installs
Node 24 through nvm and links it ahead of the image's Node 22, clones the four product repos into
this checkout, runs `npm ci` in every repo but `flexi-day-rn` (`FLEXI_CLOUD_WITH_RN=1` adds it),
starts the image's native Postgres 16 with trust auth on loopback and the `flexi-day` and `testdb`
databases, writes `flexi-day-be/.env`, `flexi-day-be/.env.e2e.test` and `flexi-day/.env.local` with
random secrets and dev tools on, and applies migrations to both databases. Unlike the laptop's,
the `DATABASE` URLs there name the OS user, because node-postgres falls back to `$USER` and a cloud
shell does not set it. Each step skips what is already there, so the SessionStart hook in
`.claude/settings.json` runs it again on every cloud session. That second run is what restarts
Postgres: the cached container is a filesystem snapshot and keeps no process. The script refuses to
run outside a cloud container unless passed `--force`, because it edits `pg_hba.conf` and creates
database roles. The environment's setup script field holds one line, `bash tools/cloud/setup.sh`;
[`README.md`](README.md) walks through the environment settings.

There is no desktop Browser pane in a cloud session, so `preview_start` does not exist: `npm run
stack:start` is the way to bring the servers up, and `npm run stack:logs be` is where backend
errors go. The `playwright` server in `.mcp.json` drives the image's headless Chromium, and the
`ui-test` skill names the tools. The backend e2e suite runs against the native `testdb` with
`npm run test:e2e` inside `flexi-day-be`, no container needed.

The four clones carry no push credentials. Pushing to a product repo from a cloud session needs
that repo attached with push access through the session's add-repo tool.

A session that attaches several repos loads none of this: no `.claude/settings.json`, no hooks, no
`.mcp.json`. `bash tools/cloud/setup.sh` still works there and links the sibling clones into this
checkout, so the stack runs and the dev CLI finds `flexi-day-be/.env`, but browser work has no MCP.

## Node version

All four repos pin Node 24 in their own `.nvmrc` (CI reads it via `node-version-file`). Use the
matching Node locally: installing with a different npm major rewrites `package-lock.json` into a
form the other rejects, and `npm ci` then fails before any CI step runs.

## Infrastructure

AWS is Terraform, applied by hand from a local checkout. There is no CI job and no remote state, so
a plan only runs on this machine. A task that adds an environment variable, an IAM permission, or an
AWS resource is not finished until the Terraform files carry it.

**`terraform apply` and production database migrations both belong to the user.** Prepare the
change, run the plan or apply the migration locally, then hand over the exact command and stop.
`npm run db:migrate:prod` in `flexi-day-be` enforces this itself: it quits unless stdin is a
terminal.

- **Backend** (App Runner, RDS, Secrets Manager, Route 53 for `api.flexi-day.com`) —
  `flexi-day-be/docs/terraform.md`.
- **Email and inbound mail** (GitHub Actions OIDC role, SES receipt rules, MX and SPF) —
  `flexi-day-emails/terraform/README.md`.
- **Frontend** (S3 bucket, CloudFront distribution and its redirect function, imported from what
  was first built by hand) is in `flexi-day/docs/terraform.md`. Its build-time `NEXT_PUBLIC_*`
  values stay outside Terraform, as GitHub Actions repository variables read in
  `flexi-day/.github/workflows/ci.yml`. Adding one there means adding it to that workflow and asking
  the user to set the variable with `gh variable set`.

## Branching for feature work

- One feature = one branch per touched repo, named `feat/<feature-slug>` with the same slug in
  every repo the feature touches.
- `/to-tickets` records in every ticket it publishes: the feature branch name and which repo(s) the
  ticket touches.
- `/implement` never invents a branch. It checks out the branch named in the ticket, creating it
  from `main` only if it doesn't exist yet in that repo.
- Each ticket lands as exactly one commit on that branch. Follow-up runs on the same feature reuse
  the branch — never a second one.

## Merging pull requests

Never merge a PR yourself — no `gh pr merge`, no merge button, no auto-merge — unless the user
asks for that merge outright. This holds here and in all four sub-repos. Push the branch, open the
PR, report CI, and stop. Opening a PR is not permission to merge it, and one merge the user asked
for does not carry to the next.

## Formatting

All five repos run prettier as a CI job of its own (`format:check`), separate from eslint — `lint`
passing says nothing about formatting. A session loads only the `.claude/settings.json` of the
directory it started in. In a root session, `tools/hooks/format-file.sh` formats every `Write` and
`Edit` with the prettier binary of the repo that owns the file, so its version and plugins apply,
and runs it from inside that repo, because prettier reads ignore files from its working directory
and the root `.prettierignore` lists every sub-repo. A session started in a sub-repo uses that
repo's own hook. **A file written through Bash** — `sed`, a heredoc, a `python` one-liner —
**skips both**. `tools/hooks/format-staged.sh` catches those at commit time in all five repos and
re-stages them; run `npm run format:fe|be|emails|rn` from the root, or `npm run format` for the
workspace repo's own files, if you want it clean before that. A file whose repo has no
`node_modules` stays unformatted.

All five use the same prettier settings (`printWidth` 100), so a file formats identically wherever
the shared tooling touches it.

## Writing style

Apply the `unslop` skill to all prose written for the user, including chat responses, docs, commit
messages and PR descriptions. New text in `CLAUDE.md` files and skills follows it too, em-dash rule
included; existing em dashes there change only when their passage is edited for another reason.

## Code review

For review requests ("review this", "check my changes"), use the `mattpocock-skills:code-review`
plugin skill. Use the built-in `/code-review` (including ultra) only when the user names it.

## Comments

Keep code comments to a minimum. Add one only where a developer genuinely needs to know something
non-obvious: a subtle gotcha, a non-local invariant, a deliberate workaround. Let the code say what
it does. **Exception:** API documentation is generated, so JSDoc `@openapi` blocks on backend routes
stay complete and current.

## Agent skills

- **Issue tracker** — agent work lives in fenro tasks (`T-12`) through the `fenro-prod` MCP server,
  each task's `repository` naming its repo. GitHub Issues stay for external reports and are
  attached to a task as its source. See `docs/agents/issue-tracker.md`.
- **Triage labels** — the five canonical roles as fenro labels, each paired with a status so only
  `ready-for-agent` tasks reach the ready queue. See `docs/agents/triage-labels.md`.
- **Domain docs** — a root `CONTEXT-MAP.md` points at per-repo `CONTEXT.md` files; ADRs live in each
  repo's `docs/adr/`, system-wide ones at the workspace root. See `docs/agents/domain.md`.
