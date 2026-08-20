# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace layout

This root directory is **not a git repository**. It is a workspace holding three independent
repos that make up the Flexi Day vacation/day-off management product, each with its own remote,
`package.json`, CI, and `.claude/`:

| Directory | Role | Stack |
|-----------|------|-------|
| `flexi-day/` | Frontend (static-export SPA) | Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query, better-auth |
| `flexi-day-be/` | Backend API | Express 5 (ESM), Drizzle + PostgreSQL, better-auth, AWS SESv2 |
| `flexi-day-emails/` | Transactional email templates → AWS SES | react-email, AWS SESv2 |

Each sub-repo has its own `CLAUDE.md` / `CLAUDE.local.md` with detailed, repo-specific guidance —
**read the relevant sub-repo file when working inside it.** This file only covers cross-cutting facts.

## How the repos connect

- Frontend → backend over HTTP via `NEXT_PUBLIC_API_URL` (local: `http://localhost:8080`).
- Backend → SES: sends using templates named `flexi-day-email-confirmation-{dev,prod}` (region
  `eu-central-1`) produced by `flexi-day-emails`. See `flexi-day-emails/INTEGRATION.md`.
- The repos version and deploy independently; there is no shared lockstep release.

## Local development

Convenience scripts live in this root `package.json` (delegate into each repo via `npm --prefix`):
`npm run dev:be`, `npm run dev:fe`, `npm run dev:emails`, `npm run db:migrate`, `npm run install:all`,
`npm run db:up` / `db:down` (Docker Postgres helper).

The backend needs a Postgres on `:5432` with a `flexi-day` database (the `DATABASE` URL has no
user/password, so it connects as the OS user via trust auth). Either works:
- **Native Postgres** already running locally with a `flexi-day` DB — nothing to start.
- **Docker**: `npm run db:up` (starts/creates a `flexi-day-pg` container with trust auth). `db:down` stops it.

Then: `npm run db:migrate` once, and:
- Backend on `:8080` — `npm run dev:be` (requires reachable `DATABASE`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`).
- Frontend on `:3000` — `npm run dev:fe`. It talks to the **real backend**; only the marketing landing
  page renders standalone (`lib/demo/` feeds that page alone). Every `app/(app)/` page needs the API
  and a signed-in user.
- Emails preview — `npm run dev:emails` (react-email, also binds `:3000` — conflicts with the frontend;
  run one at a time or override the port).

`npm run stack:status` reports what is currently up. See the `/dev-up` skill for the full startup
sequence.

## Local dev tooling (never reachable in production)

Sign-up requires email verification through SES, which does nothing locally, so seeding and sign-in
go through a gated dev surface instead of manual `curl` + `psql`:

| Command | Effect |
|---|---|
| `npm run dev:scenario` | seeds `owner@dev.local` (manager + approver), three members, quotas and bookings in every state |
| `npm run dev:seed` | one verified user, optionally with a team |
| `npm run dev:login <email>` | issues a signed session cookie for API calls |
| `npm run dev:reset` | deletes every `@dev.local` account and its data — nothing else |

Then `http://localhost:3000/dev-sign-in/?email=owner@dev.local` lands on the dashboard already
authenticated. The `flexi-dev` MCP server (`.mcp.json`, `tools/mcp/flexi-dev/`) exposes the same
operations as tools. The `ui-test` skill is the full loop for exercising a feature in the browser.

The surface is `flexi-day-be`'s `/api/dev/*`, and it only exists when **all** of these hold:
`NODE_ENV != production`, `DEV_TOOLS_ENABLED=true`, `DATABASE` on localhost, and a `DEV_TOOLS_TOKEN`
of ≥16 chars — the backend **refuses to boot** if the flag is set with `NODE_ENV=production` or a
remote database. Every request must also come from a loopback socket peer (checked on
`socket.remoteAddress`, not the spoofable `X-Forwarded-For`) and carry the token as `x-dev-token`.
The frontend's `/dev-sign-in/` route is excluded from production builds by `pageExtensions` in
`next.config.ts`, so it never reaches `out/`. Don't relax any of this.

## Per-repo command differences

Commands differ between repos — check the sub-repo's `package.json`/`CLAUDE.md`. Key non-obvious ones:
- `flexi-day` — test `npm run test` (vitest); format `npm run format` (prettier).
- `flexi-day-be` — unit `npm test`; e2e `npm run test:e2e` (gated on a live DB check, uses
  `.env.e2e.test`); DB migrations via `npm run db:generate` / `npm run db:migrate`. No format script.
- `flexi-day-emails` — no tests/lint; `npm run typecheck`, then `npm run build` renders + verifies
  templates; `npm run sync:dev` / `sync:prod` push to SES.

## Writing style

Apply the `unslop` skill (`.claude/skills/unslop/SKILL.md`) to all prose written for the user —
chat responses, docs, commit messages, PR descriptions. It removes AI-tell patterns (puffery,
em-dash overuse, filler, chatbot phrases) and keeps the writing plain and direct.

## Code review

For review requests ("review this", "check my changes"), use the `mattpocock-skills:code-review`
plugin skill by default. Use the built-in `/code-review` (including ultra) only when the user
names it explicitly.

## Comments

Keep code comments to a minimum. Add one only when a developer genuinely needs to be aware of
something non-obvious (a subtle gotcha, a non-local invariant, a deliberate workaround) — do not
narrate what the code already says. **Exception:** API documentation is always generated — keep the
JSDoc `@openapi` docs on routes complete and up to date (see `flexi-day-be` router patterns).

## Cross-cutting gotchas

- **Node 24 everywhere, pinned in `.nvmrc`**: all three repos read the version from their own
  `.nvmrc` (CI via `node-version-file`), so use the matching Node locally — installing with a
  different npm major rewrites `package-lock.json` into a form the other rejects, and `npm ci`
  then fails before any CI step runs.
- **Backend ESM imports**: in `flexi-day-be`, all relative imports must use `.js` extensions even
  for `.ts` source (e.g. `import { auth } from "../utils/auth.js"`).
- **Email placeholders are literal**: in `flexi-day-emails`, Handlebars `{{variable}}` tokens must
  survive rendering unescaped — never pass them through `encodeURIComponent`, `new URL()`, or
  markdown. `npm run build` fails the verify step if a token is URL-encoded or entity-escaped.
- **Frontend auto-formats on edit**: `flexi-day/.claude/settings.json` runs `prettier --write` after
  every Write/Edit, so files there change formatting immediately after you edit them.