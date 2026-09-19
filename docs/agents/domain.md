# Domain Docs

How the engineering skills should consume this workspace's domain documentation when exploring
the codebase.

**Layout: multi-context.** The workspace holds four independently versioned repos, so domain
docs live per-repo, with a map at the workspace root.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the workspace root. It names the four contexts, says which of them have
  a `CONTEXT.md` yet, and how they talk to each other. Read the ones relevant to the topic.
- **`<sub-repo>/CONTEXT.md`** — the glossary and boundaries for that repo's context.
- **`docs/adr/`** at the workspace root for system-wide decisions, and **`<sub-repo>/docs/adr/`**
  for decisions scoped to one repo.

Only `flexi-day-be` and `flexi-day-rn` have a `CONTEXT.md` so far. Where one is missing,
**proceed silently**. Don't flag the absence; don't suggest creating the file upfront. The
`/domain-modeling` skill writes it when that repo resolves a term of its own.

## File structure

```text
/                                      ← workspace root repo (flexi-day-workspace)
├── CONTEXT-MAP.md                     ← the index; points at per-repo contexts
├── docs/adr/                          ← system-wide decisions (cross-repo contracts, deploy topology)
├── flexi-day/
│   ├── CONTEXT.md                     ← written lazily, like every per-repo file here
│   └── docs/adr/                      ← frontend-scoped decisions (travel with the repo to GitHub)
├── flexi-day-be/
│   ├── CONTEXT.md
│   └── docs/adr/
├── flexi-day-emails/
│   ├── CONTEXT.md
│   └── docs/adr/
└── flexi-day-rn/
    ├── CONTEXT.md
    └── docs/adr/
```

ADRs that belong to one repo go in that repo's `docs/adr/` so they version and ship with it.
Only decisions spanning repo boundaries (API contracts, SES template naming, auth topology)
go in the workspace-root `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis,
a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the
glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
