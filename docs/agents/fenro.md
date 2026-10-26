# Fenro

Tasks for this workspace live in Fenro at https://www.fenro-dashboard.com, through the `fenro-prod`
MCP server.

- Repository: `Daniel88dev/flexi-day-workspace` for workspace tooling. Product work names its
  sub-repo (`Daniel88dev/flexi-day`, `-be`, `-emails`, `-rn`); the table in
  [`issue-tracker.md`](issue-tracker.md) picks one. Pass it to `list_tasks` as `repository`.
- Space: `T` (personal).
- Grilling: on the task. Post each round with `ask_questions`, call `wait_for_answers` while the
  user is around, and finish the session as `paused` when the wait runs out.
- Labels, and the skills each one brings:

| Label                 | Means here                                    | Skills                                                                   |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `bug`                 | something broken                              | `diagnosing-bugs`, `tdd`                                                 |
| `feature`             | new behaviour                                 | `tdd`                                                                    |
| `enhancement`         | a change to existing behaviour                | `tdd`                                                                    |
| `test`                | test coverage work                            | `tdd`                                                                    |
| `refactor`            | structure changes, no behaviour change        | `codebase-design`, `improve-codebase-architecture`                       |
| `spec`                | a spec to write or break into tickets         | `to-spec`, `to-tickets`                                                  |
| `needs-triage`        | triage role, see `triage-labels.md`           | `triage`                                                                 |
| `ready-for-agent`     | triage role, fully specified                  | `implement`                                                              |
| `ready-for-human`     | triage role, only the user can do it          | `wizard`                                                                 |
| `mobile-screens`      | iPhone app screens                            | `ui-test`                                                                |
| `docs`                | docs, glossaries, ADRs, agent instructions    | `writing-for-agents`, `domain-modeling`                                  |
| `ui-design`           | visual design and redesign work               | `design-taste-frontend`, `redesign-existing-projects`, `frontend-design` |
| `wayfinder:map`       | a wayfinder map                               | `wayfinder`                                                              |
| `wayfinder:grilling`  | a wayfinder ticket settled by questions       | `grilling`                                                               |
| `wayfinder:prototype` | a wayfinder ticket settled by a prototype     | `prototype`                                                              |
| `wayfinder:research`  | a wayfinder ticket settled by research        | `research`                                                               |
| `wayfinder:task`      | a wayfinder ticket that is plain work         | none                                                                     |
| `wontfix`             | triage role, closed without action            | none                                                                     |
| `mcp-smoke-test`      | throwaway tasks from testing the Fenro server | none                                                                     |
