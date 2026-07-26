---
name: ui-test
description: Drive the Flexi Day frontend as a signed-in user and verify a feature in the real UI — seed local data, sign in without email verification, click through, check console/network, screenshot. Use when asked to test, try, or verify something in the frontend UI.
---

# Test a feature in the running UI

The frontend talks to the **real backend** — it is not on mock data. Everything below therefore
needs Postgres + backend + a signed-in user. All of it is local-only and gated (see
"Safety" at the end).

## 1. Bring the stack up

```bash
npm run stack:status
```

Start whatever it reports as down, using the Browser pane (never `Bash` for dev servers):
`preview_start` with `{name: "flexi-be"}` and `{name: "flexi-fe"}` — both are defined in
`.claude/launch.json`. Postgres: see the `/dev-up` skill. Re-run `stack:status` until all four
lines are green (the fourth is the dev tooling itself).

## 2. Seed data

```bash
npm run dev:scenario
```

Seeds `owner@dev.local` (manager **and** approver), `alice`/`bob`/`carol@dev.local`, current-year
quotas, and 11 bookings spread across pending / approved / rejected — enough for every dashboard
widget and the approvals queue to have content. Safe to re-run: existing rows are left alone and the
password it prints is always valid for every seeded account.

Prefer the `flexi-dev` MCP tools (`stack_status`, `dev_seed_scenario`, `dev_login`, `dev_reset`) when
they are available — same operations, no shell.

## 3. Sign in

**Default — one navigation:**

```
http://localhost:3000/dev-sign-in/?email=owner@dev.local
```

Lands on `/dashboard/` already authenticated. Swap the email to test a member's view: `owner` sees
the approvals queue, `alice`/`bob`/`carol` do not. Without `?email=` the page is a small console with
one button per account plus Seed / Reset.

**Cookie injection** (`npm run dev:login <email>` → `cookieHeader`) is for drivers that set cookies
on the browser context directly. It only works from a clean state — the real cookie is `httpOnly`,
so `document.cookie` cannot overwrite an existing session.

**The real sign-in form** at `/sign-in/` works with the seeded password and is what to use when the
auth flow *itself* is what is being tested.

## 4. Drive and verify

- `read_page` for structure and refs; `computer` / `form_input` to interact; `read_page` again to
  confirm the result. Prefer this over screenshots for asserting text.
- `read_console_messages {onlyErrors: true}` and `read_network_requests {urlPattern: "localhost:8080"}`
  — a green-looking page with a failing request is the common trap.
- `preview_logs` for backend errors.
- `resize_window` for responsive/dark-mode checks.
- Finish with `computer {action: "screenshot"}` as proof for the user.

## 5. Clean up

```bash
npm run dev:reset
```

Deletes only `@dev.local` accounts and everything hanging off them. Accounts you created by hand are
never touched. Reset between scenarios that would otherwise collide — one booking per user per day
is enforced by a unique index.

## Gotchas

- **URLs need the trailing slash** (`trailingSlash: true`): `/dashboard/`, not `/dashboard`.
- **The UI defaults to Czech.** Match on Czech strings, or use the language toggle in the header.
- `/dev-sign-in/` only exists when `NEXT_PUBLIC_DEV_TOOLS=1` is in `flexi-day/.env.local`. Changing
  that file needs a frontend restart.
- The emails preview also binds `:3000` — do not run it alongside the frontend.

## Safety

The `/api/dev/*` endpoints that power all of this exist only when `NODE_ENV != production`,
`DEV_TOOLS_ENABLED=true`, `DATABASE` points at localhost, and a `DEV_TOOLS_TOKEN` of at least 16
characters is set; the backend refuses to boot on the production combination. Every request must come
from a loopback socket peer and carry the token. `/dev-sign-in/` is excluded from production builds
at the `pageExtensions` level, so it is not in `out/` at all. Do not weaken any of these to make a
test pass.
