# Context map

Four contexts, one per repo. Each keeps its glossary in its own `CONTEXT.md`, so the terms travel
to GitHub with the code they describe. This file is the index and nothing else. No term is defined
here.

## Contexts

- [flexi-day-be](./flexi-day-be/CONTEXT.md) — the vacation, attendance and organization domain as
  the backend models it. It owns the shared vocabulary; the other three borrow from it.
- [flexi-day-rn](./flexi-day-rn/CONTEXT.md) — the iPhone app. Coins only what the phone needs
  (local store, pending change) and uses the backend's words for everything else.
- `flexi-day` — the web frontend. No glossary yet. The first frontend term that needs pinning down
  goes in `flexi-day/CONTEXT.md`.
- `flexi-day-emails` — the transactional email templates. No glossary yet, and it may never need
  one; the contract it has with the backend is in `flexi-day-emails/INTEGRATION.md`.

## Relationships

- **flexi-day → flexi-day-be** — HTTP against `NEXT_PUBLIC_API_URL`, session in a cookie.
- **flexi-day-rn → flexi-day-be** — the same API through better-auth's `expo` plugin. A native
  session is bound to one device id ([ADR 0001](./docs/adr/0001-native-sessions-are-device-bound.md)),
  and the local store fills itself from sync pulls.
- **flexi-day-be → flexi-day-emails** — the backend sends SES templates named
  `flexi-day-{template}-{dev,prod}`; the emails repo publishes them under those names.

## Decisions

Decisions scoped to one repo live in that repo's `docs/adr/` and ship with it. Only decisions that
cross a repo boundary (an API contract, SES template naming, auth topology) go in
[`docs/adr/`](./docs/adr/) here.
