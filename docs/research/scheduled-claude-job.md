# Where can a weekly Claude job run?

Written 2026-11-01 for Fenro task T-559, under the map T-553. Every URL below was read on that
date. The question: which runner can host a weekly Claude Code job that works across all five
Flexi Day repos. The job fixes red Dependabot PRs, covers packages that Dependabot's `ignore` lists
skip, re-checks `overrides`, audits and fixes vulnerabilities, and files Fenro tasks for what it
cannot fix.

Short version:

- **Cloud scheduled tasks** (formerly routines) run with the Mac off, bill to the subscription, and
  can attach all five repos and push to each. The catch is configuration: a task with several repos
  loads no `.claude/settings.json`, hooks or `.mcp.json`, and `fenro-prod` cannot become a
  claude.ai connector as it stands, because it takes only a static bearer token. Fenro is the one
  unproven link.
- **Desktop scheduled tasks** reach everything on day one: the workspace `CLAUDE.md`, all skills,
  user-scope `fenro-prod`, and `git push` to all five repos. But a run is skipped while the Mac
  sleeps, and it runs with every credential on this Mac.
- **`anthropics/claude-code-action` on a cron** has a documented path for every requirement and
  runs free on public repos. It needs the most setup: a custom GitHub App for cross-repo pushes,
  Fenro passed in through `--mcp-config`, and a long-lived token as a repo secret, all on public
  runners whose logs anyone can read.
- `/loop` is out. It needs an open session, and the workspace denies `CronCreate` in
  `.claude/settings.json`.

## Facts about this setup that decide the outcome

| Fact                             | Value, 2026-11-01                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fenro-prod` registration        | User scope in `~/.claude.json`, `type: http`, `https://www.fenro-dashboard.com/api/mcp`                                                                                    |
| `fenro-prod` auth                | Static `Authorization: Bearer <token>` header. An unauthenticated POST gets `401` with `WWW-Authenticate: Bearer error="invalid_token" … scope="tasks:read"`               |
| Fenro OAuth discovery            | None. `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` all return `404`                          |
| Repos                            | Five public repos under `Daniel88dev`. The workspace clones the other four into itself as siblings (`README.md`)                                                           |
| Workspace project config         | `.claude/settings.json` (hooks, deny list), `.claude/skills/` (`dev-up`, `ship`, `ui-test`, `unslop`), `.mcp.json` (`flexi-dev`, `playwright`)                             |
| Skills the job would likely want | `fenro-task`, `research`, `code-review` live in `~/.claude/skills` on this Mac, not in any repo                                                                            |
| Existing cloud environment       | `tools/cloud/setup.sh` clones the four product repos, or links them when the session attached them, then installs Node 24 and dependencies (`CLAUDE.md`, "Cloud sessions") |

## Comparison

| Question                         | Cloud scheduled task                                                                                                                                          | Desktop scheduled task (local)                                                                   | `claude-code-action` on a GitHub cron                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where it runs                    | Anthropic-managed Ubuntu VM, 4 vCPU, 16 GB, 30 GB disk                                                                                                        | This Mac, in a chosen folder, optionally a fresh worktree per run                                | GitHub-hosted runner                                                                                                                                   |
| Schedule granularity             | Presets, or custom cron at most hourly. Cron is UTC unless prefixed `CRON_TZ=`. Runs on the hour can start minutes late                                       | Presets or custom cron in local time, at most hourly in the form. Claude can set finer schedules | Cron, at most every 5 minutes, default branch only. Can be delayed, and dropped under heavy load                                                       |
| Five jobs an hour apart          | Yes: five tasks, each with its own cron                                                                                                                       | Yes, but a run is skipped if other scheduled tasks are still running                             | Yes: five cron lines or five workflows                                                                                                                 |
| Repos it can reach               | The repos attached to the task, all cloned per run. The GitHub proxy refuses API calls for repos not attached                                                 | Anything this Mac's `git` and `gh` can reach                                                     | The checked-out repo. The Claude App token is scoped to the current repo only                                                                          |
| Push and open PRs in all five    | Yes, if all five are attached. Pushes go through the proxy as you. `gh pr` is blocked (GraphQL), so PRs go through the built-in GitHub tools or `gh api`      | Yes, with the local credentials                                                                  | Only with a custom GitHub App token (`actions/create-github-app-token`, `repositories:` listing all five) or a PAT, which the action's docs discourage |
| Subagents                        | Yes, same as local                                                                                                                                            | Yes                                                                                              | Yes, it runs Claude Code through the Agent SDK; allowed tools must be granted                                                                          |
| Reach `fenro-prod`               | Not as is. Needs a claude.ai connector, which needs OAuth on Fenro or the request-headers beta. A network secret plus raw HTTP calls is the untested fallback | Yes, user-scope server with its bearer header                                                    | Yes, `--mcp-config` with the token from a repo secret                                                                                                  |
| Workspace `CLAUDE.md` and skills | One repo: all of `.claude/`, hooks, `.mcp.json`. Several repos: only `CLAUDE.md` and skills, loaded once Claude touches files there. User skills never        | Yes, all of it, plus user-scope skills and `~/.claude/CLAUDE.md`                                 | Yes for the checked-out repo: the action loads `user`, `project` and `local` setting sources. User skills on this Mac are absent                       |
| Billing                          | Subscription usage, no charge for the VM. Usage credits can cover overage                                                                                     | Subscription usage                                                                               | API key (Console billing) or `CLAUDE_CODE_OAUTH_TOKEN` (subscription, one-year token). Runners are free on public repos                                |
| Mac asleep                       | Irrelevant                                                                                                                                                    | Run skipped. On wake, one catch-up run for the latest missed time within seven days              | Irrelevant                                                                                                                                             |
| Run fails                        | History row ends in **Error**. A missing GitHub connection skips runs for up to 72 hours, then turns the task off                                             | History shows failed and skipped runs; a stalled permission prompt waits for you                 | Workflow run fails. A step with `if: failure()` can open an issue or a Fenro task                                                                      |
| How a failure gets noticed       | Only by opening the task page or by asking `/schedule`. No failure notification is documented                                                                 | OS notification when a session finishes; nothing failure-specific                                | GitHub notifies the workflow's creator, optionally on failure only                                                                                     |
| Blast radius                     | Isolated VM. GitHub credentials and network secrets stay outside it                                                                                           | Full user account: AWS, Terraform, prod DB tooling, every MCP server                             | Runner holds the Claude token, the Fenro token and a write-capable GitHub token in its environment. Logs are public                                    |

## Cloud scheduled tasks

Source: [Automate work with scheduled tasks](https://code.claude.com/docs/en/routines.md),
[Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web.md),
[Cloud environments](https://code.claude.com/docs/en/cloud-environments.md),
[Settings in cloud sessions](https://code.claude.com/docs/en/settings.md#settings-in-cloud-sessions).

The feature is a research preview. Tasks are created at `claude.ai/code/routines`, in the Desktop
app, or with `/schedule` in the CLI. A task holds a prompt, one or more repos, an environment, a
model, connectors, and triggers (schedule, API, GitHub event). Each run is a full cloud session
that starts in auto mode. It stops and waits only on an ask rule or after repeated classifier
blocks. Commits and PRs carry your GitHub user.

**Schedule.** Custom cron intervals shorter than an hour are rejected. A plain five-field cron
uses UTC; with a `CRON_TZ=` prefix it uses that zone. The docs advise a few minutes past the hour,
since runs set exactly on the hour can start several minutes late. Limits: 100 scheduled runs per
hour per account, which five weekly runs never approach.

**Repos and pushing.** Each attached repo is cloned on every run, from its default branch. Claude
pushes to `claude/`-prefixed branches unless the prompt names another branch, so pushing a fix
onto a `dependabot/...` branch is allowed. The GitHub proxy rejects branch deletions and tags, and
leaves branch protection to GitHub. It serves API requests only for attached repos, and it rejects
all GraphQL. `gh pr create` and `gh pr view` therefore fail; `gh api repos/{owner}/{repo}/pulls`
and the session's built-in GitHub tools work.

**Configuration that loads.** This is the main trade-off.

- A task with **one repo** loads that repo's `CLAUDE.md`, `.claude/skills/`, `.claude/agents/`,
  `.claude/settings.json` hooks and permission rules, and `.mcp.json`.
- A task with **several repos** starts above the clones. It reads only `enabledPlugins` and
  `extraKnownMarketplaces` from each `.claude/settings.json`, and plugins never install in the
  cloud anyway. No hooks run, and no repo's `.mcp.json` loads. Nested `CLAUDE.md` files and nested
  `.claude/skills/` load once Claude reads or edits a file in that directory
  ([memory](https://code.claude.com/docs/en/memory.md),
  [skills](https://code.claude.com/docs/en/skills.md#load-skills-in-monorepos-and-subdirectories)).
  The workspace `SessionStart` hook does not run, so the environment's setup script must do all
  the work. `tools/cloud/setup.sh` already links attached sibling clones.
- User-level files (`~/.claude/CLAUDE.md`, `~/.claude/skills/`, user-scope MCP servers) never
  reach a cloud session. A skill the job needs must be committed, or enabled on claude.ai.

So "push to all five" and "load the workspace's hooks and `.mcp.json`" exclude each other in one
task. Five single-repo tasks would load each product repo's own config, but none of them would
see the workspace skills.

**Fenro.** Tasks use claude.ai connectors. MCP servers added with `claude mcp add`, as
`fenro-prod` was, are not carried over. The docs give two routes:

1. A claude.ai custom connector
   ([Add a connector that isn't in the directory](https://claude.com/docs/connectors/custom)).
   Fenro has no OAuth, so this needs the **No sign-in** option with an `Authorization` request
   header. Request-header auth "is in beta and available to a limited set of organizations". Check
   whether the dialog on this account shows **Request headers**. If it does, this is the clean
   route, and connector traffic bypasses the environment's network allowlist. If not, adding
   OAuth to `fenro-dashboard` would unlock it.
2. A `.mcp.json` server, only in a task with one repo.

A third route is untested. Add a **network secret** to the environment for host
`www.fenro-dashboard.com`, type Bearer. The agent proxy attaches it to matching requests after they
leave the VM, and such hosts bypass the allowlist. The docs say the secret applies to requests from
commands Claude runs. They also say telemetry that Claude Code sends itself skips the proxy, so it
is unclear whether Claude Code's own HTTP MCP client would get the header. `curl` JSON-RPC calls to
`/api/mcp` from Bash should work. That is clumsy but needs no change to Fenro.

**Billing and failures.** Runs draw subscription usage like interactive sessions. With usage
credits on, they continue on metered overage; without them, runs are rejected until the window
resets. A run marked **Succeeded** only means the session ended normally. Blocked network calls
and unfinished work show in the transcript, not on the row. The docs describe no failure email or
push notification, so the job has to report its own outcome, for example by always writing a
Fenro note or a GitHub issue.

## Desktop scheduled tasks

Source: [Schedule recurring tasks in Claude Code Desktop](https://code.claude.com/docs/en/desktop-scheduled-tasks.md),
[Desktop permission modes](https://code.claude.com/docs/en/desktop.md#choose-a-permission-mode).

A local task runs a fresh Desktop session in a chosen folder. With **Worktree** checked, each run
gets its own git worktree. The prompt lives in `~/.claude/scheduled-tasks/<task-name>/SKILL.md`.
Pointed at the workspace root, a run has everything an interactive session here has: the workspace
`CLAUDE.md`, `.claude/settings.json` hooks, project and user skills, `.mcp.json`, user-scope
`fenro-prod`, the four sibling clones, and local `git`/`gh` credentials for all five repos.

**Schedule.** Hourly, Daily, Weekdays, Weekly, Manual, or Custom cron in local time. The form
rejects intervals under an hour; Claude can set finer ones. Each task starts a few minutes late,
by a fixed per-task offset. History records skipped runs, with the reason: computer asleep,
previous run still going, or other scheduled tasks already running. Five weekly tasks an hour
apart work, as long as each finishes within its hour.

**Mac asleep.** Tasks run only while the app is open and the Mac is awake. A slept-through run is
skipped. On wake, Desktop starts one catch-up run for the most recent missed time within the last
seven days. **Keep computer awake** stops idle sleep but not lid-close sleep. A Monday-morning job
could run Monday night instead.

**Permissions.** Each task has its own mode: Manual, Accept edits, Plan, Auto, or Bypass. In
Manual, a run stalls on the first unapproved tool until someone answers. The docs suggest a first
**Run now** with "always allow" on each prompt.

**Billing and failures.** Subscription usage through the Desktop login. The app sends an OS
notification when a session finishes and you are not viewing it. Nothing is failure-specific.

**Risk.** The run has this Mac's full reach. That covers AWS credentials for Terraform, the
production migration scripts, every MCP server, and mail and calendar connectors. A job that
installs fresh dependency versions on purpose runs their install scripts with all of that in reach.
Of the three options, this one is the worst fit for the supply-chain half of T-553.

## `anthropics/claude-code-action` on a cron

Source: [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions.md),
the action's [setup](https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md),
[configuration](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md),
[security](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md) and
[FAQ](https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md) pages,
[`base-action/src/parse-sdk-options.ts`](https://github.com/anthropics/claude-code-action/blob/main/base-action/src/parse-sdk-options.ts),
GitHub's [events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[workflow notifications](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs)
and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

With a `prompt` input the action runs in automation mode on any event, `schedule` included.
Scheduled runs skip the write-access check but still reject a bot actor unless it is listed in
`allowed_bots`.

**Schedule.** GitHub cron allows intervals down to 5 minutes, runs only from the default branch,
and may delay or drop scheduled runs under load. In a public repo, GitHub disables scheduled
workflows after 60 days without repository activity. A quiet workspace repo could lose its
schedule. The product repos see Dependabot traffic every week.

**Repos and pushing.** "Claude's GitHub app token is sandboxed to the current repository only"
(FAQ). One job over five repos needs either:

- one workflow per repo, each with its own secrets, or
- one workflow in the workspace that mints a token from a custom GitHub App with
  `actions/create-github-app-token`. Its `owner` and `repositories` inputs scope the token to the
  five repos, which it passes as `github_token`. App tokens trigger CI on the PRs they push;
  `GITHUB_TOKEN` does not.

The action's security page warns against PATs: a static token can be extracted over time by
prompt injection.

**Configuration that loads.** The action passes `settingSources: ["user", "project", "local"]` to
the Agent SDK unless `--setting-sources` overrides it. The checked-out repo's `CLAUDE.md`,
`.claude/skills/` and `.claude/settings.json` hooks therefore load. Skills that exist only in
`~/.claude` on this Mac do not. Tools must be granted with `--allowedTools` or `permissions.allow`.
A plain-text prompt starts with no shell access.

**Fenro.** `claude_args: --mcp-config` takes a JSON file. A prior step can write it with the URL
and an `Authorization` header read from a `FENRO_TOKEN` repo secret. The subscription token
"can only make model requests, so it can't … fetch claude.ai connectors", but locally configured
MCP servers work ([authentication](https://code.claude.com/docs/en/authentication.md#generate-a-long-lived-token)).

**Billing.** Either `anthropic_api_key` (Console billing per token) or `claude_code_oauth_token`
from `claude setup-token`. That token is valid for one year and bills the subscription. The docs
recommend an API key for a secret shared across repos, since the OAuth token is tied to one
person's subscription. Standard runners are free in public repos.

**Failures.** GitHub notifies the user who created the workflow, or who last changed its cron, and
can be set to failure only. An `if: failure()` step can file a Fenro task through the same token.

**Risk.** The repos are public, so run logs are public. `show_full_output` must stay off, and it
turns on by itself in debug mode. While Claude runs `npm`/`pnpm install` on new versions, the
runner's environment holds the Claude token, the Fenro token and a token that can push to five
repos.

## What rules each option in or out for this job

- **Must run unattended every week.** Desktop fails when the Mac is closed. It is fine for
  "run now" but not as the primary runner.
- **Must push and open PRs in all five repos.** All three can. Cloud needs all five attached to one
  task, or one task per repo. Actions needs a custom GitHub App. Desktop needs nothing.
- **Must create Fenro tasks.** Desktop and Actions work today. Cloud works only after one of: the
  connector request-headers beta, OAuth on Fenro, or a verified network-secret route.
- **Must run supply-chain work safely.** Cloud has the smallest blast radius: an isolated VM, with
  credentials attached outside it. Actions puts secrets in the runner's environment. Desktop
  exposes the whole Mac.
- **Should load the workspace skills and `CLAUDE.md`.** Desktop loads all. Actions loads the
  checked-out repo's. A multi-repo cloud task loads them only on demand and without hooks. Any
  user-level skill the job needs must be committed for cloud or Actions.
- **Failures must get noticed.** Actions notifies by itself. Cloud and Desktop need the job to
  report every outcome itself.

## Open items for T-563

1. Check whether `claude.ai/customize/connectors` → **Add custom connector** shows **Request
   headers** on this account. That decides whether cloud can reach Fenro cleanly.
2. If not, test the network-secret route in one throwaway cloud session. Does a `.mcp.json` HTTP
   server get the header, or only `curl`?
3. Confirm in one multi-repo cloud session that `git push` to a non-`claude/` branch, such as a
   Dependabot branch, passes the proxy for each attached repo.
4. Decide API key against subscription token if Actions is chosen.

## Sources

- https://code.claude.com/docs/en/routines.md
- https://code.claude.com/docs/en/scheduled-tasks.md
- https://code.claude.com/docs/en/desktop-scheduled-tasks.md
- https://code.claude.com/docs/en/desktop.md
- https://code.claude.com/docs/en/claude-code-on-the-web.md
- https://code.claude.com/docs/en/cloud-environments.md
- https://code.claude.com/docs/en/settings.md
- https://code.claude.com/docs/en/memory.md
- https://code.claude.com/docs/en/skills.md
- https://code.claude.com/docs/en/mcp.md
- https://code.claude.com/docs/en/authentication.md
- https://code.claude.com/docs/en/github-actions.md
- https://claude.com/docs/connectors/custom
- https://github.com/anthropics/claude-code-action (docs/ and `base-action/src/parse-sdk-options.ts` on `main`)
- https://github.com/actions/create-github-app-token
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
