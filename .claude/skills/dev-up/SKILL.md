---
name: dev-up
description: Start the Flexi Day local stack — Postgres in Docker, then the backend API and (optionally) the frontend. Use when the user wants to run the full stack locally or bring up the backend with its database.
disable-model-invocation: true
---

# Bring up the Flexi Day local stack

Postgres serves the backend; the apps run via npm. Run scripts from the **workspace root**
`package.json` (they delegate into each repo). Bring things up in this order.

## 1. Postgres — `:5432`, database `flexi-day`

The backend's `DATABASE` URL (`postgresql://localhost:5432/flexi-day`) has no user/password, so it
connects as the OS user via trust auth. Either source works:

- **Native Postgres** already running with a `flexi-day` DB → nothing to start. Verify:
  `psql "postgresql://localhost:5432/flexi-day" -c "select 1"`.
- **Docker** (if no local Postgres): `npm run db:up` — starts/creates a `flexi-day-pg` container
  (`POSTGRES_USER=$USER`, `POSTGRES_DB=flexi-day`, trust auth). `npm run db:down` stops it.
  Note: `db:up` binds `:5432` and will fail if a native Postgres already holds that port — in that
  case use the native one.

Then apply migrations (first run or after schema changes):

```bash
npm run db:migrate
```

## 2. Backend API — `:8080`

```bash
npm run dev:be
```

Requires env (`flexi-day-be/.env`): `DATABASE`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Config throws
on startup if any required var is missing. Health check: `curl -s localhost:8080/api/auth/ok`.

## 3. Frontend — `:3000`

```bash
npm run dev:fe
```

Talks to the backend via `NEXT_PUBLIC_API_URL` (local: `http://localhost:8080`, set in `.env.local`).
Note: the frontend runs on **mock data** in dev, so it also works without the backend/DB running — skip
steps 1–2 if you only need the UI. To screenshot the running frontend, use the `flexi-day:run` skill.

## Notes

- `flexi-day-emails` preview (`npm run dev`) also binds `:3000` — don't run it alongside the frontend
  without overriding the port.
- Run each `npm run dev` in its own long-lived process (background them; they don't exit).