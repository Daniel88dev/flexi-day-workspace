# Issue tracker: GitHub, per sub-repo

Issues and specs live in each sub-repo's GitHub Issues. The workspace root has **no remote** —
`gh` cannot infer a repo from here, so every `gh` command must either run inside the relevant
sub-repo directory or pass `-R` explicitly:

| Work touching | Repo for the issue |
|---|---|
| `flexi-day/` (frontend) | `Daniel88dev/flexi-day` |
| `flexi-day-be/` (backend API) | `Daniel88dev/flexi-day-be` |
| `flexi-day-emails/` (email templates) | `Daniel88dev/flexi-day-emails` |
| Cross-cutting | The repo the work *mostly* touches; cross-reference the others in the body |

## Conventions

- **Create an issue**: `gh -R Daniel88dev/<repo> issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh -R Daniel88dev/<repo> issue view <number> --comments` to read it yourself.
  To feed it to a filter, `gh -R Daniel88dev/<repo> issue view <number> --json title,body,labels,comments --jq '{title, body, labels: [.labels[].name], comments: [.comments[].body]}'`
  — `--comments` renders text, so `--jq` needs `--json` to have anything to match against.
- **List issues**: `gh -R Daniel88dev/<repo> issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh -R Daniel88dev/<repo> issue comment <number> --body "..."`
- **Apply / remove labels**: `gh -R Daniel88dev/<repo> issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh -R Daniel88dev/<repo> issue close <number> --comment "..."`

When already working inside a sub-repo directory, plain `gh issue ...` works — `gh` infers the
repo from that clone's remote. A bare issue number is ambiguous across the three repos; always
name the repo when referencing an issue in prose (e.g. `flexi-day-be#12`).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if a repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue in the sub-repo the work belongs to (table above).

## When a skill says "fetch the relevant ticket"

Run `gh -R Daniel88dev/<repo> issue view <number> --comments`.
