---
name: ship
description: Full pre-merge pipeline for the current Flexi Day changes — run every check (typecheck, lint, tests, build), get an independent review from a clean-context agent, fix what it finds, verify the feature in the running browser stack, then branch, commit and open the PR. Use when asked to ship, finalize, harden, or open a PR for work in progress.
---

# Ship the current changes

A gate-by-gate pipeline. Each gate must pass before the next one starts, and **any fix at any gate
sends you back to gate 1** — a fix can break something that already passed. Nothing leaves the
machine before gate 6; there, the push and the PR happen on their own, without stopping to ask.

Track the gates with TaskCreate/TaskUpdate so the user can see where the run is.

## Gate 0 — scope the run

```bash
for d in . flexi-day flexi-day-be flexi-day-emails; do echo "== $d"; git -C "$d" status --porcelain; git -C "$d" branch --show-current; done
```

- Only run gates for the repos that actually have changes. A backend-only change does not need the
  frontend test suite.
- Each sub-repo is its **own git repo with its own remote**; the workspace root is a fourth repo with
  **no remote** (it versions `CLAUDE.md`, `.claude/`, `tools/`, `package.json` only). Changes
  spanning repos become **one PR per repo**.
- Note the current branch per repo. If a repo is already on a feature branch, reuse it at gate 6
  instead of branching again.
- Read the actual diff before anything else — you cannot review or test what you have not read:
  `git -C <repo> --no-pager diff -- . ':!package-lock.json'`, plus read any untracked new files.

## Gate 1 — checks

Run from the **workspace root**; these scripts delegate into the sub-repos. Use Node 24 (`.nvmrc`) —
a different npm major rewrites `package-lock.json` and breaks `npm ci` in CI.

| Repo | Checks (in order) |
|---|---|
| `flexi-day` (FE) | `npm run format:check:fe` · `npm run lint:fe` · `npm run test:fe` · `npm run build:fe` |
| `flexi-day-be` (BE) | `npm run format:check:be` · `npm run lint:be` · `npm run build:be` · `npm run test:be` |
| `flexi-day-emails` | `npm run format:check:emails` · `npm run typecheck:emails` · `npm run build:emails` |

Run the independent ones in parallel (one Bash call each, same block). Notes:

- **`format:check` is a CI gate, and `lint` does not cover it.** `lint` is eslint; prettier is the
  separate `format:check` job, and it fails the build on its own. The `Write|Edit` hooks format as
  you go, but a file written through Bash — `sed`, a heredoc, a `python` one-liner — never triggers
  them. Fix a failure with `npm run format:fe|be|emails`, never by hand.

- **`build:fe` / `build:be` are the typecheck.** The frontend has no `typecheck` script — `next build`
  does it; the backend's `build` *is* `tsc`. For a fast inner loop only:
  `npm --prefix flexi-day exec -- tsc --noEmit`. The build still has to pass before gate 2.
- **Backend e2e**: if Postgres is up, also run `npm --prefix flexi-day-be run test:e2e` (uses
  `.env.e2e.test`, self-skips via `test:e2e:check` when no DB). CI runs it, so a failure here is a
  failure.
- **Dependency advisories are not a gate.** No CI runs `npm audit` — it resolves against a live
  advisory feed, so it fails on commits it passed the day before. Dependabot's alerts and security
  PRs cover this instead. Do not add an audit step back into a PR-blocking job.
- `flexi-day-emails` `build` also *verifies* templates: it fails when a Handlebars `{{token}}` got
  URL-encoded or entity-escaped. That failure is real, never a flake.

Fix every failure, then re-run the full gate. Do not proceed with a known-failing check.

## Gate 2 — independent review

Spawn **one** review agent per repo with changes, via the Agent tool with
`subagent_type: "general-purpose"` and `run_in_background: false` (you need the verdict now). It gets
a clean context on purpose — do not summarize your intent for it beyond the prompt below, and do not
defend the code to it.

Prompt template — fill in `<repo>` and the base branch:

```
Review the uncommitted + unpushed changes in /Users/danielhrynusiw/WebstormProjects/flexi-day-workspace/<repo> as a demanding pre-merge reviewer.

Read the change with:
  git -C <abs repo path> --no-pager diff --stat
  git -C <abs repo path> --no-pager diff -- . ':!package-lock.json'
  git -C <abs repo path> status --porcelain      # read every untracked file in full
Then read the surrounding files — the diff alone hides broken callers and missed cases.
Read <repo>/CLAUDE.md and CLAUDE.local.md first; repo conventions are part of correctness.

REVIEW ONLY — make no edits, run no formatters, create no commits.

Look for: logic errors and wrong edge-case handling; missing/incorrect auth or ownership checks;
unvalidated input; N+1 queries and missing indexes/transactions; unhandled promise rejections and
swallowed errors; race conditions; broken or missing tests for the new behavior; API responses that
drifted from their @openapi JSDoc; secrets, tokens or PII in code or logs; anything that weakens the
/api/dev/* production gating.

Do NOT report: formatting (prettier/eslint own it), stylistic preferences, speculative refactors,
or comments that merely restate code (this repo deliberately keeps comments minimal).

Return a numbered list, worst first. Per finding: severity (blocker | should-fix | nit),
file:line, one sentence on what is wrong, and a concrete failure scenario (input → wrong result).
If you find nothing that meets that bar, say "no findings" — do not pad the list.
```

## Gate 3 — fix and loop back

- Fix every **blocker** and **should-fix**. Nits are judgment: fix the cheap ones, skip the rest.
- A finding you believe is wrong: verify it against the code, then say so in your report with the
  evidence. Do not silently ignore it.
- Add or update a test for each real bug the reviewer found — a fix without a test invites the same
  bug back.
- **Any edit here → return to gate 1** and re-run the whole gate, then gate 2 with a *fresh* agent.
- Cap at **3 review rounds**. If a blocker survives round 3, stop the pipeline and hand the situation
  to the user rather than shipping it or looping forever.

## Gate 4 — verify in the running stack

Invoke the **`ui-test` skill** and follow it — it is the authoritative loop. In short:

1. `npm run stack:status`; start what is down with `preview_start` (`{name: "flexi-be"}`,
   `{name: "flexi-fe"}` from `.claude/launch.json`) — **never** run dev servers through Bash.
   Postgres: see `/dev-up`. `npm run db:migrate` if this change touched the schema.
2. `npm run dev:scenario` to seed, then open
   `http://localhost:3000/dev-sign-in/?email=owner@dev.local` for an authenticated dashboard.
3. Drive the **changed feature** end to end, plus one pass over the dashboard and requests pages for
   regressions. Assert with `read_page`, not screenshots.
4. Check `read_console_messages {onlyErrors: true}`,
   `read_network_requests {urlPattern: "localhost:8080"}` and `preview_logs` — a page that looks fine
   over a 500 is the usual trap.
5. Finish with `computer {action: "screenshot"}` as proof for the user.

Gotchas: URLs need the **trailing slash** (`/dashboard/`); the UI **defaults to Czech**; the emails
preview also binds `:3000`, so never run it alongside the frontend.

Skip this gate **only** when the change cannot be exercised in a browser (emails templates, docs,
tooling, backend-internal refactors covered by e2e) — and say explicitly in the final report that it
was skipped and why. "Hard to reach in the UI" is not a reason to skip; seed the state you need.

## Gate 5 — fix what the browser found

Same rules as gate 3: fix, add a regression test, **return to gate 1**. Runtime bugs found here are
the ones the suites missed, so they always deserve a test.

## Gate 6 — branch, commit, PR

Only after gates 1–5 are green.

1. **Branch per repo** — never commit on `main`:
   ```bash
   git -C <repo> checkout -b <feat|fix|chore>/<short-slug>
   ```
   Use the same slug across repos when a change spans them.
2. **Stage deliberately.** Add the files the change actually touches; never blanket `git add -A`.
   Confirm with `git -C <repo> status --porcelain` that no `.env*`, `dist/`, `out/`, coverage output,
   or stray scratch file is staged.

   The `PreToolUse` hook (`tools/hooks/format-staged.sh`) runs prettier over the staged files and
   re-stages them as the commit goes through, so the index cannot carry an unformatted file past
   this point. It reports on stderr when it rewrites something — if it does, the working tree
   changed under you, so re-read the file before you describe it in the commit message.
3. **Commit** in the repos' conventional-commit style (`fix: stop the report hiding a leave
   overdraft`) — subject in the imperative, body explaining *why* when it is not obvious. End every
   message with:
   ```
   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   ```
4. The repo owner has pre-authorized this step for this pipeline: push the feature branch and open
   the PR as the normal end of the run, then report the branch, commit subjects and PR URL. The
   authorization covers exactly that — pushing a feature branch and opening a PR against `main`. It
   does not cover merging, force-pushing, pushing to `main`, or touching anyone else's PR.
5. **Push and open the PR** per repo:
   ```bash
   git -C <repo> push -u origin <branch>
   ```
   ```bash
   gh pr create --repo Daniel88dev/<repo> --base main --title "<title>" --body "<body>"
   ```
   Body: what changed and why, the review findings that were fixed, what was verified in the browser,
   and how a reviewer reproduces it. End with:
   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```
   Cross-link the PRs in each other's body when a change spans repos, and call out the deploy order
   (they release independently — a frontend that needs a new endpoint merges *after* the backend).
6. **The workspace root repo has no remote.** Commit its changes on the branch and say so in the
   report — there is no PR to open.
7. Offer, don't auto-run: `gh pr checks <url> --watch` to follow CI.

## Final report

One compact summary: checks run and their result · review findings by severity and what happened to
each · what was exercised in the browser (with the screenshot) · PR links · anything deliberately
skipped or left open. State failures plainly — a gate that was skipped is reported as skipped, never
as passed.
