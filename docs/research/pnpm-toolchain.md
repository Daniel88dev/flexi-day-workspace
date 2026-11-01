# pnpm toolchain and supply-chain settings

Written 2026-11-01 for Fenro task T-554, under the map T-553 (move the four product repos from
npm 12 to pnpm). Every URL below was read on that date. Claims marked "trial" come from running
pnpm 12.16.1 on this Mac against copies of the four repos under `/tmp`. The checkouts themselves
were not touched.

## Short version

- Use pnpm 12. It is the `latest` line, a self-contained native executable, and the only line
  without an end date. 10 and 11 get security fixes until 2027-04-30.
- In CI, replace `actions/setup-node` + `npm ci` with `pnpm/setup@v3`. It installs pnpm and the
  Node from `.nvmrc`, caches the store and runs the install. Do not use Corepack.
- Settings go in a root `pnpm-workspace.yaml`, also for a single-package repo. `.npmrc` is read
  for auth, registry, TLS and proxy only.
- `pnpm import` keeps the npm 12 lockfile's versions almost exactly, but it ignores npm's
  `overrides` field without a word. Translate overrides into `pnpm-workspace.yaml` first. The
  translation is not mechanical: an npm nested override covers a whole subtree, and a pnpm
  `a>b` override covers only `b` as a direct dependency of `a`.
- Dependency build scripts are off by default, and an unapproved one fails the install. All four
  repos ran their checks with every build denied.
- Pinning pnpm through `packageManager` or `devEngines.packageManager` makes pnpm write a second
  YAML document into `pnpm-lock.yaml`. GitHub's dependency graph cannot read that file yet, so
  Dependabot alerts and security updates stop for the repo, and existing alerts may close.
  `pmOnFail: ignore` keeps the lockfile single-document.
- Under the isolated linker the trial found two phantom imports: `@better-auth/utils` in
  `flexi-day-be` tests and `react-test-renderer` types in `flexi-day-rn`. Prettier fails on
  `pnpm-lock.yaml` until it is ignored. Next build, vitest, eslint flat config, the prettier
  tailwind plugin, jest-expo and a Metro iOS export all worked.

| What                 | State, 2026-11-01                                                             |
| -------------------- | ----------------------------------------------------------------------------- |
| This Mac             | pnpm 12.16.1 (Homebrew), npm 12.2.1, Node 24.22.1, Corepack 0.36.0            |
| pnpm npm dist-tags   | `latest` 12.16.1, `next-12` 12.17.0, `latest-11` 11.28.9, `latest-10` 10.34.9 |
| pnpm 12.0.0          | released 2026-08-26                                                           |
| pnpm 11.0.0          | released 2026-04-28                                                           |
| `pnpm/setup`         | v3.1.2, 2026-10-25                                                            |
| `pnpm/action-setup`  | v6.1.0, 2026-09-05                                                            |
| `actions/setup-node` | v7.1.0, 2026-10-08 (what the repos pin today)                                 |
| Lockfiles today      | `lockfileVersion: 3` in all four repos; no `.npmrc`, no `packageManager`      |

## 1. Current major, support window, pinning, CI

**Current major.** pnpm 12 is "the current release line", and npm's `latest` tag points at it
([installation][install]). The registry agrees: `npm view pnpm dist-tags` returns `latest:
12.16.1`. pnpm 12 "is a native executable and does not require Node.js after it is installed".
The npm package still installs on Node 18 or newer ([installation][install]). pnpm 11 required
Node 22+ ([v11.0.0 notes][v11]); pnpm 12 lifts that because it brings its own runtime.

**Support window.** The repo's [`SECURITY.md`][security] lists 12.x as supported, and 11.x and
10.x as supported "till 2027 April 30". There is no published end date for 12. All three lines
still ship releases: 10.34.9 on 2026-10-25, 11.28.10 and 12.17.0 on 2026-10-30
([releases][releases]).

**Pinning.** Two manifest fields pin pnpm:

- `packageManager: "pnpm@12.16.1"` takes an exact version.
- `devEngines.packageManager` takes a range. pnpm stores the resolved version in the lockfile
  ([package.json docs][pkgjson]).

When the running pnpm does not match the pin, `pmOnFail` decides what happens. The default is
`download`, so pnpm fetches and runs the pinned version. The other values are `error`, `warn`
and `ignore` ([CLI settings][set-cli]). pnpm 11 removed `managePackageManagerVersions`,
`packageManagerStrict` and `packageManagerStrictVersion` in favour of it ([v11.0.0 notes][v11]).
`pnpm self-update` inside a pinned project updates the pin, not the global install
([installation][install]).

**The pin changes the lockfile.** With a pin, pnpm writes a leading "boot document" holding
`packageManagerDependencies` (pnpm and its platform binaries) before the project lockfile. The
file then holds two YAML documents ([lockfile docs][lockfile]). The trial reproduced this with
both pin fields. Removing the pin afterwards did not remove the boot document. `pmOnFail:
ignore` turns it off, because "pnpm then doesn't enforce the pinned version, so it has nothing to
record" ([lockfile docs][lockfile]). The trial confirmed it: `ignore` gave one document, while
`warn` and `error` gave two.

This matters because GitHub's changelog of 2026-10-20 announcing pnpm 11 and 12 support for
Dependabot lists a known limitation. For a two-document lockfile, "the dependency graph doesn't
detect the dependencies in that file yet". Version updates still run, but Dependabot alerts and
security updates are not created, and existing alerts may close ([GitHub changelog][gh-dependabot]).
pnpm's own docs warn that a scanner reading only the first document "reports that the project has
no dependencies, and therefore no vulnerabilities, and a CI gate built on it passes"
([lockfile docs][lockfile]). `pnpm audit` reads both shapes.

So the choice is one of these:

- Pin with `packageManager` plus `pmOnFail: ignore`. CI still reads the version from the
  manifest, and Dependabot keeps working. Local runs do not enforce the pin.
- Pin with `pmOnFail: download` (the default) and accept that Dependabot alerts stop until GitHub
  ships support. `pnpm audit` in CI then becomes the only advisory gate.

**Corepack.** Node 25.0.0 stopped distributing Corepack (semver-major commit "build: stop
distributing Corepack", [Node 25.0.0 notes][node25]). Node 24, which these repos pin, still ships
it. pnpm's CI page says "Do not use Corepack. It runs pnpm through a Node.js shim on every call"
([CI docs][ci]). There is no reason to adopt it now.

**GitHub Actions.** pnpm documents [`pnpm/setup`][pnpm-setup] as the GitHub Actions path
([CI docs][ci]):

```yaml
- uses: pnpm/setup@fa36a5ef7dcdefc3a7cb25655c122e00cf6e636e # v3.1.2
  with:
    cache: true
```

What it does, from its README:

- Downloads pnpm's standalone binary from the npm registry, verified against npm's signature.
  Version comes from `version`, else from `packageManager` / `devEngines.packageManager`.
- Installs Node from `runtime`, else `devEngines.runtime`, else `.node-version`, `.nvmrc`,
  `.tool-versions`. The repos' `.nvmrc` (`24`) is picked up with no input.
- Runs `pnpm install` by default. `install: false` turns that off. `require-lockfile: true` adds
  `--frozen-lockfile`. CI detection already makes installs frozen ([CI docs][ci]).
- `cache: true` caches the store. It is `false` by default. v3 installs pnpm 11+ only.

`pnpm/action-setup@v6` still works with pnpm 12 alongside `actions/setup-node`. Its README now
points to `pnpm/setup` for a single-step setup ([action-setup README][action-setup]).

**`actions/setup-node` with `cache: pnpm`.** It caches the pnpm store, keyed on the lockfile,
and needs pnpm on `PATH` first. Its docs show `pnpm/action-setup` before `actions/setup-node`
([setup-node advanced usage][setup-node-adv]). Since v6, setup-node caches automatically only
when the manifest names npm; for pnpm, `cache: pnpm` must be explicit
([setup-node README][setup-node]). With `pnpm/setup`, setup-node is not needed at all.

pnpm also caches registry metadata and a lockfile verification log. `pnpm cache path` prints
that directory. Caching it lets CI skip re-checking an unchanged lockfile against the
supply-chain policies, which the docs call "the dominant cost of an install in CI once the store
is warm" ([CI docs][ci]).

## 2. Where settings live, and `overrides`

**Location.** pnpm 11 made `.npmrc` "auth/registry only". Every other setting lives in
`pnpm-workspace.yaml` or the global `config.yaml` ([v11.0.0 notes][v11], [configuring][config]).
`.npmrc` still supplies registry, auth, TLS, proxy and `local-address` settings
([settings][settings]). pnpm does not read the `pnpm` field of `package.json`, and it does not read
`npm_config_*` environment variables; use `pnpm_config_*` ([configuring][config]). A single-package
repo puts a `pnpm-workspace.yaml` at its root with no `packages` key. The trial ran that way in
all four repos.

pnpm 12 rejects unknown keys in `pnpm-workspace.yaml` with
`ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS` when the project pins a pnpm version the running pnpm
satisfies. Otherwise it warns ([v12.0.0 notes][v12]). A misspelled `minimumReleaseAge` therefore
fails loudly once pnpm is pinned.

**npm's `overrides` field is not read.** The trial ran `pnpm import` on `flexi-day-be` with its
npm overrides in `package.json` only. The resulting lockfile had no `overrides` block, and the
overridden packages came back at their natural versions (`uuid@8.3.2`, `esbuild@0.18.20`,
`brace-expansion@1.1.21`). pnpm printed no warning. pnpm's overrides live in
`pnpm-workspace.yaml` ([dependency resolution settings][set-dep]).

**Syntax.** The forms ([dependency resolution settings][set-dep]):

```yaml
overrides:
  foo: ^1.0.0 # every foo
  bar@^2.1.0: 3.0.0 # only bar versions in ^2.1.0
  qar@1>zoo: "2" # zoo only as a direct dependency of qar@1
  "@esbuild/*:optional": "-" # remove; :prod, :optional, :peer narrow by dependency type
  form-data@: 4.0.6 # convergence override: rewrite only edges whose range admits 4.0.6
```

The two npm forms these repos use map like this:

| npm (`package.json`)                                     | pnpm (`pnpm-workspace.yaml`)             | Trial result                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `"eslint-plugin-jsx-a11y": { "eslint": "$eslint" }`      | `eslint-plugin-jsx-a11y>eslint: $eslint` | Works, resolves to the root `eslint` range (`^10`), and warns that `$` references are deprecated in favour of `catalog:` |
| `"exceljs": { "uuid": "^14.0.0" }`                       | `exceljs>uuid: ^14.0.0`                  | Same versions as npm                                                                                                     |
| `"readdir-glob@^3.0.0": { "brace-expansion": "^5.0.5" }` | `readdir-glob@^3.0.0>brace-expansion`    | No effect: `brace-expansion` is a grandchild (via `minimatch`), not a direct dependency                                  |

The last row is the one to watch. npm applies a nested override to the whole subtree below the
parent. pnpm's `a>b` "will only override the `b` dependency of `a`" ([dependency resolution
settings][set-dep]). In the trial, the global `brace-expansion: ^2.0.2` override then reached
`minimatch@10` under `readdir-glob@3`. `archiver` failed at import time ("does not provide an
export named 'expand'"), and three `flexi-day-be` unit test files failed. Replacing both entries
with a range-scoped override fixed it:

```yaml
overrides:
  brace-expansion@<2.0.2: ^2.0.2
```

With that, `minimatch@10` keeps `brace-expansion@5`, and 160 of 161 test files passed (the
161st is the phantom import in section 7). This also undoes something npm does today. The npm
lockfile resolves `eslint`'s `minimatch@10.2.6`, which asks for `brace-expansion ^5.0.8`, to the
overridden top-level `2.1.7`.

For `$eslint`, the deprecation points at catalogs. In a single-package repo that means:

```yaml
catalog:
  eslint: ^10.13.0
overrides:
  eslint-plugin-jsx-a11y>eslint: "catalog:"
```

with `"eslint": "catalog:"` in `package.json` ([catalogs][catalogs]). The override may not be
needed at all. pnpm overrides also rewrite peer ranges (`:peer` narrows to them), and a peer
mismatch only warns. The `flexi-day-rn` trial dropped its `eslint-plugin-expo` override, and
`eslint . --max-warnings 0` passed.

## 3. `pnpm import` fidelity

Since 12.3.2, `pnpm import` "keeps the versions recorded in `package-lock.json`". The ranges in
`package.json`, catalogs and overrides decide which versions are eligible, and the recorded
version is preferred among them ([v12.3.2 notes][v1232]). The docs still call it "not a
one-to-one conversion", because the source lockfile's versions only feed a fresh resolution
([import docs][import]). Workspaces need `pnpm-workspace.yaml` first. A failed import restores
the previous `pnpm-lock.yaml`.

Trial, comparing `name@version` sets between each `package-lock.json` and the imported
`pnpm-lock.yaml` (overrides translated first where a repo has them):

| Repo               | npm entries | pnpm entries | Same | Differences                                                                                                                                        |
| ------------------ | ----------- | ------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flexi-day`        | 869         | 863          | 863  | 5 bundled deps of `@tailwindcss/oxide-wasm32-wasi` (npm lists bundled deps, pnpm does not) and one duplicate `minimatch@10.2.5` folded into 10.2.6 |
| `flexi-day-be`     | 734         | 732          | 731  | transitive alias `@typescript/old` (`npm:typescript`) went 6.0.3 → 6.0.2; `readdir-glob`'s nested override (above)                                 |
| `flexi-day-emails` | 336         | 336          | 335  | the same `@typescript/old` alias, 6.0.3 → 6.0.2                                                                                                    |
| `flexi-day-rn`     | 1073        | 1060         | 1060 | 13 npm-only duplicates (wasm bundled deps, an older `@typescript-eslint/*@8.70.0` set, `tslib@2.8.0`)                                              |

No package moved to a newer version. Each import took under 6 seconds. Import is not the end
state: the first `pnpm install` after it applies `allowBuilds`, and the trust and age policies
check the new lockfile (sections 4 and 5).

## 4. Lifecycle scripts

pnpm 11 replaced `onlyBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`,
`ignoredBuiltDependencies` and `ignoreDepScripts` with one map, `allowBuilds`. It made
`strictDepBuilds` default to `true` ([v11.0.0 notes][v11]). Current rules ([build
settings][set-build]):

- A dependency's `preinstall`, `install` and `postinstall` run only if `allowBuilds` says
  `true`. Unlisted packages are "unreviewed".
- With `strictDepBuilds: true`, an unreviewed build script fails the install with
  `ERR_PNPM_IGNORED_BUILDS`. With `false` it warns.
- Keys accept versions: `nx@21.6.4 || 21.6.5: true`. A git or tarball dependency needs its URL in
  the key; a bare name never approves those. `foo: false` denies from any source.
- Interactive installs add placeholder entries to `pnpm-workspace.yaml`. Since 12.7.0, CI and
  non-TTY installs do not ([v12.7.0 notes][v1270]). `pnpm approve-builds` and `pnpm add
--allow-build` write entries.
- `dangerouslyAllowAllBuilds: true` runs everything except explicit denials.
- 12.11.0 added `permissions`, a per-package map with `build` and `skills` capabilities. A
  `permissions` entry outranks `allowBuilds`. pnpm writes there only if the file already has a
  `permissions` key.

`pnpm approve-builds` is the interactive way to fill the map ([approve-builds][approve]).

Trial results. Every repo installed and passed its checks with all builds denied:

| Repo               | Packages flagged                                 | Outcome with `false`                                   |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------ |
| `flexi-day`        | none                                             | install, lint, typecheck, test and build pass          |
| `flexi-day-be`     | `@sentry/node-cpu-profiler`, `esbuild`           | `@sentry/profiling-node` loads; build and tests run    |
| `flexi-day-emails` | `esbuild` (two versions), `sharp`                | `tsx`, template build and tests pass                   |
| `flexi-day-rn`     | `@tailwindcss/oxide`, `esbuild` (three versions) | `@tailwindcss/oxide` loads; jest and Metro export pass |

Those packages ship prebuilt platform binaries as optional dependencies. Their scripts check for
or fetch a binary, so denying them is safe while the platform package installs. `fsevents`, which
npm marks `hasInstallScript`, was not flagged.

**Agent skills.** pnpm 12.11.0 also links "agent skills" that dependencies ship into
`.claude/skills` and similar directories. It links nothing until a package is approved under
`permissions.<pkg>.skills`, and a pending approval never fails the install. With `CLAUDECODE`
set, pnpm creates `.claude/skills` if missing ([agent skills][skills]). All four repos keep
`.claude/`. Their policy is no vendored third-party skills, so `skills: { dirs: [] }` turns the
feature off ([build settings][set-build]).

## 5. Supply-chain settings and defaults

Defaults on pnpm 12.16, from [dependency resolution settings][set-dep] unless noted:

| Setting                              | Default                                                       | Effect                                                                                      |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `minimumReleaseAge`                  | `1440` (minutes)                                              | Versions younger than this are not resolved, transitive ones included                       |
| `minimumReleaseAgeStrict`            | `true` if `minimumReleaseAge` is set explicitly, else `false` | Strict fails when no old-enough version fits; non-strict falls back to a younger one        |
| `minimumReleaseAgeExclude`           | unset                                                         | Names, `@scope/*` patterns or exact versions exempt from the age check                      |
| `minimumReleaseAgeExcludePrune`      | `false`                                                       | Drops exclusions the lockfile no longer needs                                               |
| `minimumReleaseAgeIgnoreMissingTime` | `true`                                                        | Skips the check when registry metadata has no `time` field                                  |
| `trustPolicy`                        | `off`                                                         | `no-downgrade` fails when a version has weaker trust evidence than an earlier-published one |
| `trustPolicyExclude`                 | `[]`                                                          | Selectors exempt from the trust check                                                       |
| `trustPolicyIgnoreAfter`             | unset                                                         | Skip the trust check for versions older than N minutes                                      |
| `trustPolicyExcludePrune`            | `false`                                                       | Added in 12.4.0; prunes stale exclusions                                                    |
| `trustLockfile`                      | `false`                                                       | `true` skips re-verifying lockfile entries against age and trust policy on install          |
| `blockExoticSubdeps`                 | `true`                                                        | Only direct dependencies may come from git or tarball URLs                                  |
| `strictDepBuilds`                    | `true`                                                        | Section 4                                                                                   |
| `verifyDepsBeforeRun`                | `install` ([build settings][set-build])                       | `pnpm run` / `pnpm exec` install first when `node_modules` is stale                         |

Things that surprised the trial:

- **Lockfile verification on every install.** With `trustLockfile: false` (the default),
  `pnpm install --frozen-lockfile` re-applies `minimumReleaseAge` and `trustPolicy` to every
  lockfile entry. The output reads "Lockfile passes supply-chain policies". The point is to catch
  a lockfile written under a weaker local policy. An explicit
  `--config.minimum-release-age=10080` (7 days) failed `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on
  today's lockfiles: 29 entries in `flexi-day`, 1 in `flexi-day-be`, 18 in `flexi-day-emails`, 3
  in `flexi-day-rn`. Raising the age above the default therefore needs a lockfile regenerated
  under it, or exclusions, before CI goes green.
- **Explicit equals strict.** Writing `minimumReleaseAge: 1440` into the file makes it strict
  ([v12.3.0 notes][v1230]). Leaving it out keeps the same cutoff non-strict.
- **`trustPolicy: no-downgrade` fails today's lockfiles.** `--trust-policy=no-downgrade` passed
  `flexi-day-be`. It failed `flexi-day` on `semver@6.3.1`, `flexi-day-emails` on
  `@react-email/preview-server@5.2.11`, and `flexi-day-rn` on 35 entries, mostly `@expo/*`, each
  reported as "High-risk trust downgrade (possible package takeover)". Turning it on needs
  `trustPolicyExclude` entries or a `trustPolicyIgnoreAfter` window. Since 12.7.0 it resolves the
  newest version that is not a downgrade instead of failing outright ([v12.7.0 notes][v1270]).
- `minimumReleaseAge` also applies to GitHub Actions in `pnpm outdated` / `pnpm update`
  (12.7.0). `pnpm audit --fix` adds the patched version to `minimumReleaseAgeExclude`, so a fix
  is not held back by the age window ([audit docs][audit]).
- `namedRegistries` pins a package to one registry in the lockfile. That is not needed with only
  npmjs.org ([supply-chain docs][supply]).

## 6. `pnpm audit`

- **Source.** pnpm 11 moved off the retired `/-/npm/v1/security/audits` endpoints. `pnpm audit`
  calls the registry's `/-/npm/v1/security/advisories/bulk` ([v11.0.0 notes][v11], [audit
  docs][audit]). That response has no CVE ids, so ignores are by GHSA.
- **It works.** The trial ran it on the imported `flexi-day-be` and `flexi-day` lockfiles. It
  reported 3 advisories (1 low, 2 moderate), each with GHSA links and paths. It exits `1` when an
  advisory at or above `audit.level` (default `low`) remains.
- **`--fix`.** It adds `overrides` to `pnpm-workspace.yaml` (`--fix=override`, the default).
  `--fix=update` bumps lockfile entries instead. `-i` picks advisories. With
  `audit.ignorePrune: true` (12.0.0) it drops ignores whose GHSA is gone. 12.3.2 made
  `--fix update` finish when some packages have no fix in range ([v12.3.2 notes][v1232]).
- **Config.** An `audit:` section with `level`, `ignore` (GHSA list) and `ignorePrune`.
  `auditLevel` and `auditConfig.ignoreGhsas` are deprecated spellings. `auditConfig.ignoreCves`
  is not recognized ([audit docs][audit]).
- **`pnpm audit signatures`** verifies registry ECDSA signatures against the lockfile's
  integrity, and fails on a missing signature where the registry publishes keys ([audit
  docs][audit]).
- **Alternatives.** Dependabot supports pnpm 11 and 12, with the two-document caveat from
  section 1 ([GitHub changelog][gh-dependabot]). pnpm also has `pnpm sbom` (CycloneDX 1.7 or SPDX
  2.3, from 11.0) for external scanners ([v11.0.0 notes][v11]). The pnpm docs list Socket, Snyk,
  Xygeni and Aikido as malware detectors ([supply-chain docs][supply]). Any external scanner must
  be checked against a two-document lockfile before it is trusted.

## 7. Tools under the isolated linker

`nodeLinker` defaults to `isolated`: dependencies are symlinks into `node_modules/.pnpm`
([node_modules settings][set-nm]). `hoistPattern: ['*']` hoists everything into the hidden
`node_modules/.pnpm/node_modules`, so packages can still reach their own undeclared
dependencies. `publicHoistPattern` defaults to `[]`, so project code cannot.
`nodeLinker: hoisted` gives an npm-style flat tree.

The trial installed each repo's copy with the imported lockfile and ran its CI scripts through
`pnpm run`:

| Repo               | Passed                                                                                        | Failed, and why                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `flexi-day`        | `eslint --max-warnings 0`, `tsc --noEmit`, `next build` (static export), vitest 292/292 files | `prettier --check .` on `pnpm-lock.yaml` and `pnpm-workspace.yaml`                                                                    |
| `flexi-day-be`     | eslint, `build` (`node node_modules/@typescript/native/bin/tsc`), vitest 160/161 files        | `typecheck` and one test file: `@better-auth/utils/base32` is imported in 4 test files but not declared; prettier on `pnpm-lock.yaml` |
| `flexi-day-emails` | `typecheck`, `tsx --test`, template render and verify                                         | prettier on `pnpm-lock.yaml`                                                                                                          |
| `flexi-day-rn`     | eslint, jest 326/326 suites, `expo export --platform ios` (Metro, 13 MB Hermes bundle)        | `tsc --noEmit`: `react-test-renderer` is imported in 2 tests but not declared (jest still resolves it at runtime)                     |

What the table means per tool:

- **prettier with plugins.** `prettier-plugin-tailwindcss` loaded in `flexi-day` (the only
  complaints were pnpm's files), because the plugin is a direct devDependency. Add
  `pnpm-lock.yaml` to every `.prettierignore`. Format `pnpm-workspace.yaml`, or ignore it,
  because pnpm rewrites it (`approve-builds`, `audit --fix`). The workspace's commit hook
  `tools/hooks/format-staged.sh` would otherwise reformat the lockfile.
- **eslint flat config.** `eslint.config.mjs` imports its plugins by name, and every one is a
  direct devDependency, so all three lint runs passed.
- **`next build`.** Passed with no settings.
- **vitest.** Passed. A phantom import fails at module load, not at collection, so the error
  reads like a broken test.
- **Scripts that hardcode `node_modules/...` paths** (`flexi-day-be`, `flexi-day-emails`: `node
node_modules/@typescript/native/bin/tsc`) work, because a direct dependency's alias is a
  top-level symlink.
- **Expo.** Expo supports isolated installs from SDK 54, and suggests `nodeLinker: hoisted` in
  `pnpm-workspace.yaml` as the fallback ([Expo monorepos][expo-mono]). Metro bundled the iOS app.
  A native build (`expo run:ios`, CocoaPods autolinking) was not tried. EAS Build reads a `pnpm`
  version per build profile in `eas.json` ([eas.json][eas-json]).

Fixes for the two phantoms: add `@better-auth/utils` and `react-test-renderer` (plus its types
if needed) as devDependencies at the versions the trees already resolve.

## Other things a migration plan needs

- `npm run` and `npx` inside scripts and workflows: `flexi-day-be`'s `dev`, `check` and
  `test:e2e*` call `npm run`, and `flexi-day-rn` CI runs `npx expo install --check`. They become
  `pnpm run` and `pnpm exec` (or `pnx`).
- `flexi-day-be/Dockerfile` runs `npm ci` and `npm ci --omit=dev --ignore-scripts` on
  `node:24-alpine`. pnpm's migration guide says images must copy `pnpm-workspace.yaml` before
  the install ([migration from v10][migration]). The CI docs show copying pnpm from the official
  `ghcr.io/pnpm/pnpm` image into another base ([CI docs][ci]).
- The workspace root `install:all` and the `npm --prefix` scripts in the root `package.json`.
- An install in CI is frozen automatically, and fails if the lockfile came from a newer pnpm
  major ([CI docs][ci]).
- `verifyDepsBeforeRun: install` means `pnpm test` may run an install first when
  `node_modules` is stale ([build settings][set-build]). An agent that wants a fixed tree sets it
  to `error` or `warn`.
- pnpm 12 drops `--frozen-lockfile false`. Write `--no-frozen-lockfile` ([v12.0.0 notes][v12]).

## Sources

- pnpm docs: [installation][install], [configuring][config], [settings index][settings],
  [CLI settings][set-cli], [dependency resolution settings][set-dep], [build settings][set-build],
  [node_modules settings][set-nm], [package.json][pkgjson], [catalogs][catalogs],
  [lockfile][lockfile], [pnpm import][import], [pnpm approve-builds][approve],
  [pnpm audit][audit], [supply-chain security][supply], [agent skills][skills],
  [continuous integration][ci], [migrating from v10][migration]
- pnpm repo: [SECURITY.md][security], [releases][releases], [v11.0.0][v11], [v12.0.0][v12],
  [v12.3.0][v1230], [v12.3.2][v1232], [v12.7.0][v1270], plus the pnpm 11.0 blog post
  (https://pnpm.io/blog/releases/11.0)
- Actions: [pnpm/setup][pnpm-setup], [pnpm/action-setup][action-setup],
  [actions/setup-node][setup-node], [setup-node advanced usage][setup-node-adv]
- Others: [Node.js 25.0.0 release notes][node25], [GitHub changelog on Dependabot and pnpm
  12][gh-dependabot] (published 2026-10-20 despite the date in its URL),
  [Expo monorepos guide][expo-mono], [eas.json reference][eas-json]

[install]: https://pnpm.io/installation
[security]: https://github.com/pnpm/pnpm/blob/main/SECURITY.md
[releases]: https://github.com/pnpm/pnpm/releases
[v11]: https://github.com/pnpm/pnpm/releases/tag/v11.0.0
[v12]: https://github.com/pnpm/pnpm/releases/tag/v12.0.0
[v1230]: https://github.com/pnpm/pnpm/releases/tag/v12.3.0
[v1232]: https://github.com/pnpm/pnpm/releases/tag/v12.3.2
[v1270]: https://github.com/pnpm/pnpm/releases/tag/v12.7.0
[pkgjson]: https://pnpm.io/package_json
[set-cli]: https://pnpm.io/settings/cli
[set-dep]: https://pnpm.io/settings/dependency-resolution
[set-build]: https://pnpm.io/settings/build
[set-nm]: https://pnpm.io/settings/node-modules
[settings]: https://pnpm.io/settings
[config]: https://pnpm.io/configuring
[catalogs]: https://pnpm.io/catalogs
[lockfile]: https://pnpm.io/lockfile
[import]: https://pnpm.io/cli/import
[approve]: https://pnpm.io/cli/approve-builds
[audit]: https://pnpm.io/cli/audit
[supply]: https://pnpm.io/supply-chain-security
[skills]: https://pnpm.io/agent-skills
[ci]: https://pnpm.io/continuous-integration
[migration]: https://pnpm.io/migration
[pnpm-setup]: https://github.com/pnpm/setup
[action-setup]: https://github.com/pnpm/action-setup
[setup-node]: https://github.com/actions/setup-node
[setup-node-adv]: https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md
[node25]: https://nodejs.org/en/blog/release/v25.0.0
[gh-dependabot]: https://github.blog/changelog/2025-01-09-dependabot-now-supports-npm-12-pnpm-11-and-12-and-bun-1-4/
[expo-mono]: https://docs.expo.dev/guides/monorepos/
[eas-json]: https://docs.expo.dev/eas/json/
