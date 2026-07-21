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
- Frontend on `:3000` — `npm run dev:fe`. Runs on in-memory **mock data** in dev (every reload resets
  state), so no DB is needed just to work on the UI.
- Emails preview — `npm run dev:emails` (react-email, also binds `:3000` — conflicts with the frontend;
  run one at a time or override the port).

See the `/dev-up` skill for the full startup sequence.

## Per-repo command differences

Commands differ between repos — check the sub-repo's `package.json`/`CLAUDE.md`. Key non-obvious ones:
- `flexi-day` — test `npm run test` (vitest); format `npm run format` (prettier).
- `flexi-day-be` — unit `npm test`; e2e `npm run test:e2e` (gated on a live DB check, uses
  `.env.e2e.test`); DB migrations via `npm run db:generate` / `npm run db:migrate`. No format script.
- `flexi-day-emails` — no tests/lint; `npm run typecheck`, then `npm run build` renders + verifies
  templates; `npm run sync:dev` / `sync:prod` push to SES.

## Cross-cutting gotchas

- **Divergent Node versions across CIs**: `flexi-day` uses Node 20, `flexi-day-be` and
  `flexi-day-emails` use Node 22. Match the target repo's version.
- **Backend ESM imports**: in `flexi-day-be`, all relative imports must use `.js` extensions even
  for `.ts` source (e.g. `import { auth } from "../utils/auth.js"`).
- **Email placeholders are literal**: in `flexi-day-emails`, Handlebars `{{variable}}` tokens must
  survive rendering unescaped — never pass them through `encodeURIComponent`, `new URL()`, or
  markdown. `npm run build` fails the verify step if a token is URL-encoded or entity-escaped.
- **Frontend auto-formats on edit**: `flexi-day/.claude/settings.json` runs `prettier --write` after
  every Write/Edit, so files there change formatting immediately after you edit them.