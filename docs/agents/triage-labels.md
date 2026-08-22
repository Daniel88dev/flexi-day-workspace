# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual
label strings used across the three sub-repos' GitHub Issues.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label
string from this table.

All three repos carry GitHub's default label set, so `wontfix` already exists in each. The other
four do not — create one before first use with
`gh -R Daniel88dev/<repo> label create <name> --description "..."`, and keep the vocabulary
identical across the three repos so a query means the same thing everywhere.

Edit the right-hand column to match whatever vocabulary you actually use.
