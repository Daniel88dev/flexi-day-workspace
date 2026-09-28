---
name: ui-test
description: Drive the Flexi Day frontend or the iPhone app as a signed-in user and verify a feature in the real UI — seed local data, sign in without email verification or typing, click or tap through by testID, check console/network or the accessibility tree. Use when asked to test, try, or verify something in the frontend UI or in the iPhone app on the simulator.
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
auth flow _itself_ is what is being tested.

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

## iPhone app on the simulator

Same backend and seed data, different driver. Drive the simulator from Bash with `xcrun simctl`
and AXe, never with the desktop app's iOS Simulator tool: it works by screenshot and asks for
permission once per device. Read the screen as an accessibility tree and tap by `testID`; take a
screenshot only when the tree is ambiguous. `docs/research/simulator-agent-tooling.md` has the
reasoning and the other tools that were weighed.

### Setup, once per machine

```bash
brew install cameroncooke/axe/axe
```

Maestro 2.10 lives in `~/.maestro/bin`, which is not on `PATH`, and needs Homebrew's `openjdk@21`.
A subagent shell may not read `~/.zshrc`, so spell both out when calling it:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export MAESTRO_CLI_NO_ANALYTICS=true
~/.maestro/bin/maestro --device "$UDID" test flow.yaml
```

Use Maestro only when a ticket needs a flow it will run again. Such flows go in
`flexi-day-rn/.maestro/<feature>.yaml`, with `tapOn: {id: …}` and `assertVisible: {id: …}`. The
interactive loop below needs AXe alone.

### The loop

The backend and Metro must be up (`npm run stack:status`; Metro is `npm run dev:rn`), and the
simulator needs the dev client installed. `$UDID` is your simulator; use one per subagent.

1. **Seed.** `npm run dev:reset && npm run dev:scenario`. Reset first: the scenario reuses
   existing `@dev.local` users, so without it a seeded user keeps team scopes from older runs.
2. **Boot and open the app.** `xcrun simctl boot $UDID`, then
   `xcrun simctl launch $UDID com.flexiday.app`. If the dev launcher lists servers, read the tree
   and tap the Metro one. The app has to be running and connected before step 3.
3. **Sign in.** `npm run dev:login:rn -- owner@dev.local --to /requests --udid $UDID`, or the
   `dev_login_rn` MCP tool with the same inputs. It mints a single-use ticket that lives 60 seconds
   and opens `flexiday://dev-sign-in?ticket=…&to=…` on the simulator. The app drops any earlier
   session, so the same command switches users. `--to` defaults to `/dashboard`. `--udid` is
   optional with one simulator booted and required with more.
4. **Wait for the screen.** Poll until the target screen's root `testID` appears:

   ```bash
   until axe describe-ui --udid $UDID | jq -e '[.. | objects | select(.AXUniqueId == "requests-list")] | length > 0' >/dev/null; do sleep 1; done
   ```

   Bound the loop in real use. If `dev-sign-in-error` shows up instead, the ticket was spent or
   expired: run step 3 again.

5. **Read.** Cut the tree down to what matters before reading it:

   ```bash
   axe describe-ui --udid $UDID | jq -c '.. | objects | select(.AXUniqueId != null or .AXLabel != null) | {id: .AXUniqueId, label: .AXLabel, type}'
   ```

6. **Act.** `axe tap --id tab-dashboard --tap-style physical --udid $UDID`. To type, tap the field
   by id first, then `axe type 'text' --udid $UDID`.
7. **Assert.** Read the tree again and check for the expected id or label.
8. **Hand back.** `xcrun simctl shutdown $UDID`. Leave the simulator in place; don't delete it.

| Route (`--to`)       | Root `testID`                                                |
| -------------------- | ------------------------------------------------------------ |
| `/dashboard`         | `dashboard`                                                  |
| `/requests`          | `requests-list` (approvals live here too)                    |
| `/my-attendance`     | `my-attendance`                                              |
| `/settings`          | `settings`                                                   |
| `/clock`             | `clock-sheet`                                                |
| `/groups`, `/report` | none yet; `stack-back` carries the screen title as its label |

A path the app doesn't have lands on Expo Router's `expo-router-unmatched` screen. There is no
`/approvals`; the approvals queue lives on `/requests`.

Navigation: `tab-dashboard`, `tab-requests`, `tab-myAttendance` or `tab-report` (which one the
bar shows depends on the user), `tab-more`, and `clock-disc`. The More sheet has
`more-<key>` rows, `more-sign-out` and `more-close`.

### Traps

- **Pass `--tap-style physical` on every tap.** With AXe 1.8 on iOS 27 the default style often
  reports "completed successfully" and does nothing to this app's `Pressable`s, tab bar included.
  Physical taps worked every time.
- **The Expo dev menu hides behind a green tree.** A dev client's first launch can open the dev
  menu over the app. The app's ids stay in the tree underneath it, so the root `testID` looks
  present while every tap lands on the menu. If `xmark` (label "Close") is in the tree, tap it.
- **The first `axe` call after a boot** can fail with "Timed out creating the simulator remote
  automation session". Run it again.
- **Nested ids.** Maestro and other XCUITest readers drop a `testID` nested inside a `Pressable`.
  AXe does list some (`stat-pending-value` inside `stat-pending`), so check the tree before
  assuming one is there or missing, and prefer the outer element's id and label.
- **Typing.** AXe types US-keyboard ASCII only. Tap the field first so no keystroke lands
  elsewhere: a stray `r` or `d` reloads the dev client or opens its menu. The Czech input source
  mangles digits and `@`; keep the simulator on a US layout.
- **Cold start.** Opening the link while the app is not running cold-starts it, and the dev
  launcher's server pick has to happen inside the ticket's 60 seconds. `dev:login:rn` warns when
  the app wasn't running; launch it, connect it to Metro, then sign in again.
- **"Open in “Flexi Day”?"** iOS sometimes asks before handing the link to the app. Read the tree
  and tap the Open button (`--label Open --element-type Button`) inside the ticket's 60 seconds.
- **First sign-in on a fresh install** can show the notifications intro. Tap
  `notifications-intro-not-now` to reach the target screen.
- **npm needs `--`** before the command's own flags: `npm run dev:login:rn -- <email> --to …`.
  npm 12 rejects `--to` and `--udid` as unknown npm flags without it.

## Safety

The `/api/dev/*` endpoints that power all of this exist only when `NODE_ENV != production`,
`DEV_TOOLS_ENABLED=true`, `DATABASE` points at localhost, and a `DEV_TOOLS_TOKEN` of at least 16
characters is set; the backend refuses to boot on the production combination. Every request must come
from a loopback socket peer and carry the token. `/dev-sign-in/` is excluded from production builds
at the `pageExtensions` level, so it is not in `out/` at all.

The iPhone sign-in adds one endpoint outside that guard. The app redeems its ticket at
`/api/auth/dev/redeem-sign-in-ticket`, which exists only when dev tools are on and takes a
single-use, 60-second ticket in place of the loopback and token checks; the app's `dev-sign-in`
route does nothing outside a dev build. `flexi-day-be/docs/invariants.md` says why. Do not weaken
any of these to make a test pass.
