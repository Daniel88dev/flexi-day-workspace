# CLAUDE.md

## Workspace layout

This root directory is **not a git repository**. It is a workspace holding three independent repos
that make up the Flexi Day vacation/day-off management product, each with its own remote,
`package.json`, CI, `CLAUDE.md` and `.claude/`:

| Directory | Role | Stack |
|-----------|------|-------|
| `flexi-day/` | Frontend (static-export SPA) | Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query, better-auth |
| `flexi-day-be/` | Backend API | Express 5 (ESM), Drizzle + PostgreSQL, better-auth, AWS SESv2 |
| `flexi-day-emails/` | Transactional email templates → AWS SES | react-email, AWS SESv2 |

Each sub-repo's `CLAUDE.md` carries its own conventions and gotchas, and loads when you work in it.
This file covers only what spans repos.

## How the repos connect

- Frontend → backend over HTTP via `NEXT_PUBLIC_API_URL` (local: `http://localhost:8080`).
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

## Seeding and signing in locally

Sign-up requires email verification through SES, which does nothing locally, so seeding and sign-in
go through a gated dev surface rather than manual `curl` + `psql`:

| Command | Effect |
|---|---|
| `npm run dev:scenario` | seeds `owner@dev.local` (manager + approver), three members, quotas and bookings in every state |
| `npm run dev:seed` | one verified user, optionally with a team |
| `npm run dev:login <email>` | issues a signed session cookie for API calls |
| `npm run dev:reset` | deletes every `@dev.local` account and its data, nothing else |

`http://localhost:3000/dev-sign-in/?email=owner@dev.local` then lands on the dashboard already
authenticated. The `flexi-dev` MCP server (`.mcp.json`, `tools/mcp/flexi-dev/`) exposes the same
operations as tools, and the `ui-test` skill is the full loop for exercising a feature in the
browser.

The surface exists only on a dev machine, gated five ways, and stays that way —
`flexi-day-be/docs/invariants.md` has the enforcement.

## Node version

All three repos pin Node 24 in their own `.nvmrc` (CI reads it via `node-version-file`). Use the
matching Node locally: installing with a different npm major rewrites `package-lock.json` into a
form the other rejects, and `npm ci` then fails before any CI step runs.

## Writing style

Apply the `unslop` skill to all prose written for the user, including chat responses, docs, commit
messages and PR descriptions.

## Code review

For review requests ("review this", "check my changes"), use the `mattpocock-skills:code-review`
plugin skill. Use the built-in `/code-review` (including ultra) only when the user names it.

## Comments

Keep code comments to a minimum. Add one only where a developer genuinely needs to know something
non-obvious: a subtle gotcha, a non-local invariant, a deliberate workaround. Let the code say what
it does. **Exception:** API documentation is generated, so JSDoc `@openapi` blocks on backend routes
stay complete and current.

## Agent skills

- **Issue tracker** — issues live in each sub-repo's GitHub Issues. The workspace root has no
  remote, so `gh` needs `-R Daniel88dev/<repo>` or must run inside the sub-repo. See
  `docs/agents/issue-tracker.md`.
- **Domain docs** — a root `CONTEXT-MAP.md` points at per-repo `CONTEXT.md` files; ADRs live in each
  repo's `docs/adr/`, system-wide ones at the workspace root. See `docs/agents/domain.md`.
