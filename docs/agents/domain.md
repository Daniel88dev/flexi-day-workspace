# Domain Docs

How the engineering skills should consume this workspace's domain documentation when exploring
the codebase.

**Layout: multi-context.** The workspace holds three independently versioned repos, so domain
docs live per-repo, with a map at the workspace root.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the workspace root, if it exists — it points at one `CONTEXT.md` per
  sub-repo. Read each one relevant to the topic.
- **`<sub-repo>/CONTEXT.md`** — the glossary and boundaries for that repo's context.
- **`docs/adr/`** at the workspace root for system-wide decisions, and **`<sub-repo>/docs/adr/`**
  for decisions scoped to one repo.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions
actually get resolved.

## File structure

```text
/                                      ← workspace root (local git, no remote)
├── CONTEXT-MAP.md                     ← created lazily; points at per-repo contexts
├── docs/adr/                          ← system-wide decisions (cross-repo contracts, deploy topology)
├── flexi-day/
│   ├── CONTEXT.md
│   └── docs/adr/                      ← frontend-scoped decisions (travel with the repo to GitHub)
├── flexi-day-be/
│   ├── CONTEXT.md
│   └── docs/adr/
└── flexi-day-emails/
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
