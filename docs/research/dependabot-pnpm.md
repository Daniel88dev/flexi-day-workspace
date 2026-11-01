# Dependabot and GitHub security tooling with pnpm

Resolves fenro task [T-555](https://www.fenro-dashboard.com/tasks/T-555), part of the map T-553
(move the five repos from npm 12 to pnpm, add a weekly dependency job, harden the supply chain).
Written 2026-11-01. Every URL below was read that day. The local checks ran on pnpm 12.16.1.

Short version: Dependabot runs pnpm 12 today, and every option the current `dependabot.yml` files
use keeps working under `package-ecosystem: npm`. One gap decides how the migration pins pnpm.
When a repo pins pnpm through `packageManager` or `devEngines`, pnpm 12 writes `pnpm-lock.yaml` as
two YAML documents. GitHub's dependency graph cannot read that yet, so the repo shows zero
dependencies. Dependabot alerts, security updates and `dependency-review-action` then all go
quiet, and existing alerts close. Setting `pmOnFail: ignore` in `pnpm-workspace.yaml` keeps the
lockfile to one document. A second constraint: pnpm 12 re-checks the lockfile against
`minimumReleaseAge` on every install, including `--frozen-lockfile` in CI. A security update for a
package younger than the window fails CI until the package ages or is excluded.

| What                                  | State, 2026-11-01                                                     |
| ------------------------------------- | --------------------------------------------------------------------- |
| pnpm on this Mac                      | 12.16.1, writes `lockfileVersion: '9.0'`                              |
| pnpm in Dependabot's updater image    | 12.10.1 when the repo pins nothing                                    |
| Dependabot pnpm majors                | 7 to 12, version and security updates                                 |
| Two-document lockfile in the graph    | not detected; dependabot-core #15904 open, escalated 2026-10-30       |
| Dependabot default cooldown           | 3 days for version updates, none for security updates                 |
| pnpm `minimumReleaseAge` default      | 1440 minutes (1 day), re-applied to the lockfile on install           |
| `actions/dependency-review-action`    | v5.0.0, 2026-05-08, commit `a1d282b36b6f3519aa1f3fc636f609c47dddb294` |
| Repos using dependency review today   | none                                                                  |
| Repos pinning a package manager today | none (no `packageManager` or `devEngines` in any `package.json`)      |

## 1. Lockfile and version support

GitHub announced support for npm 12, pnpm 11 and pnpm 12 on 2026-10-20
([changelog](https://github.blog/changelog/2025-01-09-dependabot-now-supports-npm-12-pnpm-11-and-12-and-bun-1-4/);
the page is dated 2026-10-20 although its URL says 2025-01-09).
The supported-ecosystems table lists pnpm v7 to v12 with version updates, security updates,
private repositories and private registries all supported
([docs](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories)).
dependabot-core's `PNPMPackageManager::SUPPORTED_VERSIONS` lists 7 to 12
([source](https://github.com/dependabot/dependabot-core/blob/main/npm_and_yarn/lib/dependabot/npm_and_yarn/pnpm_package_manager.rb)).

Lockfile versions:

- pnpm 12 writes `lockfileVersion: '9.0'`, the same as pnpm 9 to 11. Checked locally.
- dependabot-core maps lockfile 9.x to its default pnpm and runs pnpm 7 or 8 for 5.4 and 6.x
  lockfiles. Its comment: "pnpm 12 only reads lockfileVersion 9.x"
  ([helpers.rb](https://github.com/dependabot/dependabot-core/blob/main/npm_and_yarn/lib/dependabot/npm_and_yarn/helpers.rb)).
- Which pnpm runs: with a `packageManager` pin, Corepack runs the pinned version. Without one,
  the updater image's pnpm runs, set by `ARG PNPM_VERSION=12.10.1`
  ([Dockerfile](https://github.com/dependabot/dependabot-core/blob/main/npm_and_yarn/Dockerfile)).

### The two-document lockfile

pnpm 12 puts an "env" document ahead of the project graph when the project pins pnpm or uses
config dependencies. The env document holds `packageManagerDependencies` (pnpm and every
`@pnpm/exe.*` binary) and `configDependencies`. Both documents carry `lockfileVersion: '9.0'`
([pnpm#13805](https://github.com/pnpm/pnpm/issues/13805)). pnpm closed that issue on 2026-08-23 and
will not change the format; the maintainer asks readers to take the last document.

Checked locally on 12.16.1 with one dependency and `pnpm install --lockfile-only`:

| Pin                                      | `pnpm-workspace.yaml` | Documents |
| ---------------------------------------- | --------------------- | --------- |
| none                                     | none                  | 1         |
| `"packageManager": "pnpm@12.16.1"`       | none                  | 2         |
| `"packageManager": "pnpm@12.16.1"`       | `pmOnFail: ignore`    | 1         |
| `devEngines.packageManager` pnpm 12.16.1 | none                  | 2         |

What reads what:

- dependabot-core's own grapher reads the last document since PR #15968, merged 2026-09-02.
  Its resolution helper, which compares lockfiles before and after an update, also takes the
  last document
  ([pnpm_resolutions.rb](https://github.com/dependabot/dependabot-core/blob/main/npm_and_yarn/lib/dependabot/npm_and_yarn/pnpm_resolutions.rb)).
  So version updates still work.
- GitHub's static dependency-graph parser does not. The docs say so outright: "When pnpm writes
  `pnpm-lock.yaml` as two YAML documents, the dependency graph does not detect the dependencies in
  that file"
  ([dependency graph ecosystems](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/dependency-graph-supported-package-ecosystems)).
  The October changelog adds that alerts and security updates are not created and existing alerts
  may close.
- [dependabot-core#15904](https://github.com/dependabot/dependabot-core/issues/15904) is still
  open. Reporters saw repos drop from 652 packages to 14 and 92 alerts auto-close. The assignee
  wrote on 2026-10-30 that the fix is escalated, with an update due the following week. No date.

Workaround: `pmOnFail: ignore`. Only `ignore` stops the env document; `download`, `warn` and
`error` all keep it. The cost is that pnpm stops enforcing the `packageManager` version itself,
silently. Corepack, `pnpm/action-setup` and Dependabot still read the field, so the pin stays
useful everywhere except inside pnpm's own version check. Config dependencies always produce two
documents, so avoid them until GitHub ships the fix.

### Existing `dependabot.yml` options

pnpm stays under `package-ecosystem: npm`; there is no separate `pnpm` value. The four configs use
`schedule`, `open-pull-requests-limit`, `groups` (with `patterns` and `update-types`) and `ignore`
(with `dependency-name` and `update-types`). None of these is package-manager specific, and the
options reference documents them for the npm ecosystem without pnpm caveats
([options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)).
They behave the same.

Points worth knowing while porting them:

- `open-pull-requests-limit` covers version updates only. Security updates have their own fixed
  limit of 10.
- `groups` default to version updates. `applies-to: security-updates` makes a separate group for
  security PRs.
- The `vitest-major` comments in `flexi-day` and `flexi-day-be` explain the group with npm's
  `ERESOLVE`. pnpm does not fail on a peer mismatch unless `strictPeerDependencies` is set, so the
  reason changes. The group is still right: split majors leave the pair on different versions.
- `flexi-day-rn`'s Expo `ignore` list is unaffected. Dependabot still cannot run
  `npx expo install --fix`.

## 2. Dependabot `cooldown` and pnpm `minimumReleaseAge`

Syntax, under an `updates` entry
([options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference),
[example](https://docs.github.com/en/enterprise-cloud@latest/code-security/tutorials/secure-your-dependencies/optimizing-pr-creation-version-updates)):

```yaml
cooldown:
  default-days: 5
  semver-major-days: 30
  semver-minor-days: 7
  semver-patch-days: 3
  include: ["*"] # up to 150 names, `*` wildcards
  exclude: ["some-pkg"] # wins over include
```

- `default-days` takes 1 to 90. The semver keys work for npm.
- Since 2026-07-14 every version update gets a 3-day cooldown with no config
  ([changelog](https://github.blog/changelog/2026-07-14-dependabot-version-updates-introduce-default-package-cooldown/)).
  None of the four configs sets `cooldown`, so all four already wait 3 days.
- Cooldown never applies to security updates.

How the two overlap. dependabot-core pushes the cooldown down into pnpm
([pnpm_lockfile_updater.rb](https://github.com/dependabot/dependabot-core/blob/main/npm_and_yarn/lib/dependabot/npm_and_yarn/file_updater/pnpm_lockfile_updater.rb),
[helpers.rb](https://github.com/dependabot/dependabot-core/blob/main/npm_and_yarn/lib/dependabot/npm_and_yarn/helpers.rb)):

- It reads `minimumReleaseAge` and `minimumReleaseAgeExclude` from `pnpm-workspace.yaml`.
- Version update, cooldown longer than the repo's window: it passes
  `--config.minimum-release-age=<cooldown in minutes>`. That gates transitive dependencies too.
- Version update, repo window equal or longer: it passes no age override, and the repo's own gate
  applies.
- Security update: it passes `minimum-release-age=0`, which bypasses the repo's gate.
- On pnpm 11.3 and later it adds `--config.trust-lockfile=true` so entries already in the lockfile
  are not re-checked during its run.
- It runs `pnpm update <pkg>@<version> --lockfile-only --no-save -r`. Since pnpm 12.3 an explicit
  `minimumReleaseAge` turns strict mode on, and strict mode refuses `--no-save`. That broke every
  update ([dependabot-core#16375](https://github.com/dependabot/dependabot-core/issues/16375)) until
  PR #16376, merged 2026-10-01, passed `minimum-release-age-strict=false` for that command.
  pnpm 12 reads only kebab-case `--config` keys.

So they overlap but do not conflict. Dependabot's cooldown decides when a PR opens. pnpm's gate
decides what a human `pnpm install` or `pnpm add` may resolve. Keep both, with the pnpm window no
longer than the cooldown, so Dependabot's own gate is the one that applies in its runs.

### The CI catch

pnpm defaults: `minimumReleaseAge` 1440, `minimumReleaseAgeStrict` true only when the age is set
explicitly, `trustLockfile` false
([pnpm settings](https://pnpm.io/settings/dependency-resolution)). With `trustLockfile` false,
every `pnpm install` re-applies the age to every lockfile entry.

Checked locally: a lockfile holding `typescript@7.1.0-dev.20261101.1` (published that morning)
fails `CI=true pnpm install --frozen-lockfile` with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. It
fails with no `pnpm-workspace.yaml` at all (the 1-day default), with an explicit 7-day window, and
with `minimumReleaseAgeStrict: false`. It passes with the packages in `minimumReleaseAgeExclude`
(the `@typescript/*` platform packages needed their own entry) or with
`--config.trust-lockfile=true`.

Consequence: Dependabot opens a security PR at once, with the age gate off. If the fixed version
is younger than the repo's window, that PR's CI install fails until the version ages past it. With
the 1-day default the wait is at most a day. The same applies to a version update only when the
repo's window is longer than the cooldown. Choices for T-561: accept the wait and re-run CI, add a
`name@version` entry to `minimumReleaseAgeExclude` on the PR branch, or trust the lockfile in CI.
The last one throws the check away for every PR, not only Dependabot's.

## 3. Does Dependabot respect `pnpm-workspace.yaml`?

Dependabot runs the real pnpm in the repo checkout, so pnpm reads `pnpm-workspace.yaml` itself.

| Setting                           | Respected?                                                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides`, `catalog`            | Yes. pnpm applies them during resolution. Catalog support went GA 2025-02-04 ([changelog](https://github.blog/changelog/2025-02-04-dependabot-now-supports-pnpm-workspace-catalogs-ga/)).                                              |
| `minimumReleaseAge`, `...Exclude` | Yes, and Dependabot parses them itself (section 2). Security updates override the age with 0.                                                                                                                                          |
| `allowBuilds`, `strictDepBuilds`  | Not relevant. Dependabot only runs `--lockfile-only`, which runs no lifecycle scripts. Checked locally: `strictDepBuilds: true` with `esbuild` passed, and `pnpm-workspace.yaml` was left untouched. Builds stay CI's and humans' job. |
| `frozenLockfile: true`            | Breaks Dependabot: every update fails with `ERR_PNPM_OUTDATED_LOCKFILE` ([dependabot-core#16744](https://github.com/dependabot/dependabot-core/issues/16744), open, no PR). Pass `--frozen-lockfile` in CI instead.                    |
| `pmOnFail`, `packageManager`      | Corepack runs the pinned version; see section 1 for the lockfile shape.                                                                                                                                                                |

## 4. `actions/dependency-review-action`

[Repo](https://github.com/actions/dependency-review-action),
[docs](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review).

- Free on all public repos. Private repos need Code Security or Advanced Security.
- It does not parse lockfiles. It calls the dependency review API, which diffs the dependency
  graph between the base and head commits. pnpm support is exactly the graph's support, so a
  two-document lockfile yields an empty diff and a green check that means nothing.
- It fails the job when a PR adds a vulnerable package at or above `fail-on-severity`, a denied
  license, or a denied package. A failed check blocks the merge only if a branch rule requires it.
- Options and defaults: `fail-on-severity` (`low`), `fail-on-scopes` (`runtime`; also
  `development`, `unknown`), `allow-licenses` / `deny-licenses` (SPDX; `deny-licenses`
  deprecated), `allow-ghsas`, `allow-dependencies-licenses`, `deny-packages` and `deny-groups`
  (purl), `comment-summary-in-pr` (`never`, `always`, `on-failure`; needs `pull-requests: write`),
  `warn-only` (`false`), `show-openssf-scorecard` (`true`), `warn-on-openssf-scorecard-level`
  (`3`), `license-check` and `vulnerability-check` (`true`), `retry-on-snapshot-warnings`
  (`false`), `show-patched-versions` (`false`), `config-file`, `base-ref` / `head-ref`.
- v5 runs on node24 and needs runner v2.327.1 or later. Pin by SHA like the other actions.
- The default `fail-on-scopes: runtime` ignores dev dependencies. Most of these repos' attack
  surface (build tools, test runners) is dev, so add `development`.

## 5. Dependency graph and advisories

- pnpm is a supported graph ecosystem: `pnpm-lock.yaml` recommended, `package.json` as fallback,
  transitive dependencies parsed statically. There is no automatic dependency submission for pnpm
  ([dependency graph ecosystems](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/dependency-graph-supported-package-ecosystems)).
- Alerts, security updates and dependency review all read that graph. The two-document gap
  (section 1) is the only pnpm-specific limit found.
- A dependency submission action could feed the graph while the gap lasts. Per the pnpm
  maintainer in pnpm#13805, osv-scanner and Syft read two-document lockfiles as clean and Trivy
  reads them correctly. None was tested here; `pmOnFail: ignore` is simpler.

## 6. Other GitHub checks for pnpm on a PR

- Malware alerts: opt-in, under Settings, Code security, Dependabot, "Malware alerts". npm since
  2026-03-17
  ([changelog](https://github.blog/changelog/2026-03-17-dependabot-now-detects-malware-in-npm-dependencies/)),
  OpenSSF malicious-packages data since 2026-07-28
  ([changelog](https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/)).
  Alerts only, no PRs. It matches the npm registry, so it covers pnpm projects, presumably through
  the same graph and so the same two-document gap. The changelog does not say.
- OpenSSF Scorecard data shows in the dependency review summary by default.
- Rulesets can make the dependency review workflow a required check across repos.
- CodeQL, which all repos already run, analyses source and not dependencies.
- The rest of the supply-chain checks live in pnpm itself, not in GitHub. With `trustPolicy` set
  to `no-downgrade`, install fails when a package's trust level drops. `blockExoticSubdeps`
  (default `true`) stops transitive git or tarball dependencies. Those belong to T-561.

## What this means for the map

- Do not pin pnpm without `pmOnFail: ignore` until dependabot-core#15904 closes. Leaving pnpm
  unpinned also gives one document, but then Dependabot runs its own pnpm (12.10.1 today) and CI
  runs whatever `pnpm/action-setup` is told.
- Never set `frozenLockfile: true` in `pnpm-workspace.yaml`.
- Keep `package-ecosystem: npm` and every existing `groups` and `ignore` entry. Reword the
  `vitest-major` comments.
- Set `minimumReleaseAge` no longer than the cooldown, and decide in T-561 how a security PR
  passes the CI age check.
- After the pilot repo switches, open its dependency graph page and confirm the package count
  matches the lockfile. A drop to a dozen packages is the two-document bug.
- Add `dependency-review-action` with `fail-on-scopes: runtime, development` once the graph is
  confirmed to read the lockfile.
