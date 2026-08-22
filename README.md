# Flexi Day workspace

The shell that the three Flexi Day repos sit inside. Flexi Day is a vacation and day-off
management product, and its code lives in three repos that version and deploy on their own
schedules. This repo holds none of that code. It holds the things that only make sense across all
three: the agent skills, the local dev CLI, an MCP server, and the cross-repo docs.

If you are looking for the product itself, you want one of these:

| Repo                                                                | Role                                      | Stack                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| [flexi-day](https://github.com/Daniel88dev/flexi-day)               | Frontend, a static-export SPA             | Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query, better-auth |
| [flexi-day-be](https://github.com/Daniel88dev/flexi-day-be)         | Backend API                               | Express 5 (ESM), Drizzle, PostgreSQL, better-auth, AWS SESv2                         |
| [flexi-day-emails](https://github.com/Daniel88dev/flexi-day-emails) | Transactional email templates for AWS SES | react-email, AWS SESv2                                                               |

## How the three repos are stored here

Clone them **into this checkout**, as siblings, using exactly these directory names:

```bash
git clone https://github.com/Daniel88dev/flexi-day-workspace.git
cd flexi-day-workspace

git clone https://github.com/Daniel88dev/flexi-day.git
git clone https://github.com/Daniel88dev/flexi-day-be.git
git clone https://github.com/Daniel88dev/flexi-day-emails.git
```

You end up with this:

```text
flexi-day-workspace/         this repo
├── flexi-day/               separate clone, gitignored here
├── flexi-day-be/            separate clone, gitignored here
├── flexi-day-emails/        separate clone, gitignored here
├── .claude/                 agent skills and settings
├── docs/agents/             how agents should use the trackers and docs
├── tools/                   dev CLI, MCP server, commit hook
└── package.json             scripts that delegate into each clone
```

The names matter. Every script here delegates with `npm --prefix ./flexi-day-be`, and the dev
tooling reads `flexi-day-be/.env` by path, so a clone named anything else breaks both.

The three directories are gitignored. This repo never versions their contents, and running
`git add -A` here cannot swallow them by accident.

**They are not submodules, on purpose.** A submodule pins a commit, and pinning is the opposite of
what this project wants. The three repos release independently, and a frontend that needs a new
endpoint merges after the backend rather than in lockstep with it. Plain clones let each one sit on
whatever branch its work needs.

## Setup

Every repo pins Node 24 in its own `.nvmrc`, and CI reads that file. Use the matching Node locally.
Installing with a different npm major rewrites `package-lock.json` into a form the other npm
rejects, and `npm ci` then fails in CI before a single check runs.

```bash
nvm use          # or: fnm use
npm install      # this repo's own tooling
npm run install:all   # dependencies for all three clones
```

The backend needs PostgreSQL on port 5432 with a `flexi-day` database. Its `DATABASE` URL carries
no user or password, so it connects as the OS user over trust auth. A native Postgres with that
database already works. Otherwise `npm run db:up` starts a `flexi-day-pg` container configured for
it.

One port conflict to know about: `npm run dev:emails` binds port 3000, the same as the frontend.
Run one at a time, or override the port.

## Daily commands

Run these from this directory. They reach into the clones for you.

| Command                                             | What it does                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run stack:status`                              | reports what is currently up: Postgres, backend, frontend, dev tooling  |
| `npm run dev:be` / `dev:fe` / `dev:emails`          | start one dev server                                                    |
| `npm run db:up` / `db:down`                         | start or stop the Postgres container                                    |
| `npm run check`                                     | this repo's own checks: prettier, eslint, links, shellcheck, actionlint |
| `npm run format:fe` / `format:be` / `format:emails` | run prettier inside a clone                                             |

Signing up normally requires email verification through SES, which does nothing on a laptop. So
seeding and signing in go through a dev-only surface instead of hand-written `curl` and `psql`:

| Command                     | Effect                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev:scenario`      | seeds `owner@dev.local` as manager and approver, three members, quotas, and bookings in every state |
| `npm run dev:seed`          | one verified user, optionally with a team                                                           |
| `npm run dev:login <email>` | issues a signed session cookie for API calls                                                        |
| `npm run dev:reset`         | deletes every `@dev.local` account and its data, and nothing else                                   |

Then `http://localhost:3000/dev-sign-in/?email=owner@dev.local` lands on the dashboard already
signed in.

That surface only exists on a dev machine. It is gated five ways, and it stays that way.
`flexi-day-be/docs/invariants.md` has the enforcement.

## What lives in this repo

**`tools/`.** The dev CLI (`dev-cli.mjs`), the `flexi-dev` MCP server that exposes the same
operations as agent tools, and `hooks/format-staged.sh`, which runs prettier over staged files at
commit time. That hook exists because a file written through Bash, by `sed` or a heredoc, skips the
editor's format-on-write and would otherwise reach CI unformatted.

**`.claude/`.** Skills shared across all three repos: `ship` for the pre-merge pipeline, `ui-test`
for driving the real browser, `dev-up` for the startup sequence, `unslop` for prose.

**`docs/agents/`.** Where issues live, the triage label vocabulary, and how domain docs and ADRs are
laid out across four repos.

**`CLAUDE.md`.** Conventions that span repos. Each clone carries its own `CLAUDE.md` for its own.

No credentials live here. The tooling reads `flexi-day-be/.env` at runtime, and that file is
gitignored in the backend repo.

## Contributing

`main` is protected and refuses direct pushes. Every change goes on a branch and merges through a
PR, including one-line doc fixes.

```bash
git checkout -b docs/some-slug
npm run check
git commit
git push -u origin docs/some-slug
gh pr create --repo Daniel88dev/flexi-day-workspace --base main
```

CI runs prettier, eslint, a relative-link check over the Markdown, shellcheck over the commit hook,
actionlint over the workflows, and CodeQL. `npm run check` runs all of it except CodeQL.

Two of those need binaries that npm does not install. On macOS:

```bash
brew install shellcheck actionlint
```

Without them, `npm run check` skips those two steps and says so. CI always runs them.

Issues for the product belong in the repo they affect, not here. A bare `gh issue create` from this
directory files against `flexi-day-workspace`, so pass `-R Daniel88dev/flexi-day-be` or run the
command inside the clone. Use this tracker for the workspace tooling itself.

## License

MIT. See [LICENSE](LICENSE).
