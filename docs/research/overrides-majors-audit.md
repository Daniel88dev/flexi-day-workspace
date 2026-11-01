# Overrides and outstanding majors audit

Resolves Fenro task T-558, a research ticket under the map T-553 (move the five repos from npm 12
to pnpm, refresh dependencies, clean up overrides). Written 2026-11-01.

Sources: each repo's git history and PRs, the GitHub advisory database (`gh api /advisories`), npm
registry metadata (`npm view`), and trial resolutions. Every trial ran on copies of
`package.json` and `package-lock.json` under `/tmp`, with `npm install --package-lock-only` then
`npm audit`, or `pnpm install --lockfile-only` (pnpm 12.16.1) then `pnpm audit`. No checkout was
changed. Repo state: `flexi-day` 2b5f9b1, `flexi-day-be` 86493f5, `flexi-day-emails` 6d649e7,
`flexi-day-rn` 42b3f5d, all `main` on 2026-11-01.

## Short version

| Repo | Override                                          | Verdict for pnpm                                       |
| ---- | ------------------------------------------------- | ------------------------------------------------------ |
| fe   | `postcss: ^8.5.23`                                | Drop                                                   |
| fe   | `sharp: ^0.35.0`                                  | Drop                                                   |
| fe   | `@hono/node-server: ^2.0.5`                       | Drop                                                   |
| fe   | `eslint-plugin-jsx-a11y` → `eslint: $eslint`      | Drop (pnpm only warns on the peer)                     |
| be   | `exceljs` → `uuid: ^14.0.0`                       | Translate as is: `exceljs>uuid: ^14.0.0`               |
| be   | `esbuild: ^0.25.4`                                | Loosen to `"@esbuild-kit/core-utils>esbuild": ^0.25.4` |
| be   | `brace-expansion: ^2.0.2`                         | Drop                                                   |
| be   | `readdir-glob@^3.0.0` → `brace-expansion: ^5.0.5` | Drop                                                   |
| rn   | `eslint-plugin-expo` → `eslint: $eslint`          | Drop                                                   |

Only two overrides survive the move, both in `flexi-day-be`. Neither needs `$eslint` or a catalog.
The `brace-expansion@<2.0.2: ^2.0.2` replacement proposed in the pnpm toolchain research is not
needed either: every `brace-expansion` line now has a patched release inside the range its parents
ask for.

Outstanding majors: root 0, `showreel` 0, emails 0, fe 1, be 2, rn 32. 30 of rn's 32 wait on
Expo SDK 58: 28 SDK packages, plus `jest` and `@types/jest`. No Dependabot PR is open in
any repo.

## Background: the audit gate is gone

Every security override here came from the "harden supply chain" PRs of 2026-08-02 (fe #27,
be #51). Their stated goal was a clean `npm audit` baseline so a `--audit-level=high` CI gate
meant something. Six days later both repos dropped that gate (fe #46, be #75), because
"npm audit resolves against a live advisory feed, so the same commit passes one day and fails the
next" (be `afe5d00`). The overrides outlived their original reason. Today they matter only for
what lands in the tree and what Dependabot alerts show.

Today's baselines, with all overrides in place: fe 2 low and 32 moderate, be 3 low and 22
moderate, rn 6 low, 56 moderate and 6 high. None of the fe or be findings come from an overridden
package.

## flexi-day

| Override                                     | Added by                       | Cause                                                                                                                                                  | Upstream today                                                                                                                                                       | Trial without it                                                                                                                     | Verdict |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `postcss: ^8.5.23`                           | `df11538`, PR #27              | `next` pinned `postcss@8.4.31`. GHSA-6g55, GHSA-r28c (high, source-map file read), then GHSA-fxqj (medium, patched in 8.5.23)                          | `next@16.4.3` (the `latest` tag, and what fe uses) pins `postcss@8.5.23`, the first version clear of all seven postcss advisories                                    | npm nests `postcss@8.5.23` under `next`, hoists 8.5.32. Audit unchanged. Under pnpm: 8.5.23 and 8.5.32, no postcss finding           | Drop    |
| `sharp: ^0.35.0`                             | `df11538`, PR #27              | `next` wanted `sharp@^0.34.5`. GHSA-f88m (high, libvips) patched in 0.35.0                                                                             | `next@16.4.3` asks for `sharp@^0.35.5`, which also clears GHSA-rgj7 and GHSA-wq5f (both high)                                                                        | Lockfile unchanged, audit unchanged. Under pnpm: `sharp@0.35.5`                                                                      | Drop    |
| `@hono/node-server: ^2.0.5`                  | `df11538`, PR #27              | `shadcn` → `@modelcontextprotocol/sdk@1` → `@hono/node-server@^1.19.9`. GHSA-wc8c, GHSA-92pp, GHSA-frvp                                                | Dependabot PR #285 (merged 2026-11-01) moved `shadcn` to 4.23.0, which uses `@modelcontextprotocol/server@2`. That has no hono dependency. The package left the tree | Lockfile unchanged: nothing depends on it                                                                                            | Drop    |
| `eslint-plugin-jsx-a11y` → `eslint: $eslint` | `4b9cc8d`, PR #152 (ESLint 10) | The plugin's peer range stops at `eslint ^9`. Its last release, 6.10.2, is from 2024-10. The `//` note in `package.json` says the rules run fine on 10 | Still 6.10.2, still `^3 \|\| … \|\| ^9`. `eslint` is a peer only, not a dependency                                                                                   | npm: `ERESOLVE`, install fails. pnpm: resolves with one `eslint@10.14.0`, and `pnpm peers check` reports the unmet peer as a warning | Drop    |

Two side effects of the current fe overrides go away with them. The `postcss` override holds `vite`
(which asks for `^8.5.30`) on 8.5.25. The `//` comment about jsx-a11y in `package.json` should go
with the override.

If the jsx-a11y peer warning is unwanted, pnpm's `peerDependencyRules.allowedVersions` can silence
it. That was not tried here.

## flexi-day-be

| Override                                          | Added by                           | Cause                                                                                                                                                                                  | Upstream today                                                                                                                                                                                                        | Trial without it                                                                                                                                                                                                                 | Verdict                                                      |
| ------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `exceljs` → `uuid: ^14.0.0`                       | `ff830e2`, PR #51                  | `exceljs` depends on `uuid@^8.3.0`. GHSA-w5hq (medium, missing buffer bounds check in v3/v5/v6) affects `<11.1.1`. The commit notes exceljs only calls v4, so it was never exploitable | `exceljs` is still 4.4.0, unpublished since 2024-12, still `uuid@^8.3.0`                                                                                                                                              | npm nests `uuid@8.3.2` under `exceljs` and audit gains one moderate (`uuid`)                                                                                                                                                     | Translate as is: `exceljs>uuid: ^14.0.0` (verified by T-554) |
| `esbuild: ^0.25.4`                                | `ff830e2`, PR #51                  | `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild@~0.18.20`. GHSA-67mh (medium, dev server CORS) affects `<=0.24.2`                                     | `drizzle-kit@0.31.11` (latest) still carries the deprecated `@esbuild-kit` chain. `drizzle-kit@1.0.0-rc.5` drops it but is not `latest`. The root `devDependencies.esbuild` is also `^0.25.4`, used by `lambda:build` | npm: `ERESOLVE`. `vite@8` has an optional peer `esbuild@^0.27.0 \|\| ^0.28.0` that the root's `^0.25.4` violates. Moving the root devDependency to `^0.28.1` resolves, but brings back `esbuild@0.18.20` and 4 moderate findings | Loosen (see below)                                           |
| `brace-expansion: ^2.0.2`                         | `ff830e2`, PR #51                  | GHSA-v6h2 (low, ReDoS), patched in 1.1.12 and 2.0.2                                                                                                                                    | Every line has a patched release: 1.1.21, 2.1.7, 5.0.12 clear all ten advisories, including the three from 2026-09-29. `minimatch@3` asks `^1.1.7`, `minimatch@5` asks `^2.0.1`, `minimatch@10` asks `^5.0.8`         | Remove both brace-expansion entries: npm resolves 1.1.21, 2.1.7 and 5.0.12, audit unchanged. pnpm resolves the same three, and `pnpm audit` shows no brace-expansion finding                                                     | Drop                                                         |
| `readdir-glob@^3.0.0` → `brace-expansion: ^5.0.5` | `a34ed43`, PR #318 (Person export) | Patch-up for the line above. `archiver@8` → `readdir-glob@3` → `minimatch@10`, which imports a named `expand` that only `brace-expansion@5` exports. The global `^2.0.2` broke it      | Needed only while the global override exists                                                                                                                                                                          | See the row above                                                                                                                                                                                                                | Drop                                                         |

The global `brace-expansion: ^2.0.2` also hands `brace-expansion@2.1.7` to `eslint`'s,
`@eslint/config-array`'s, `glob`'s and `typescript-estree`'s `minimatch@10.2.6` today. Those ask for
`^5.0.8`. The same named-import failure would hit them on any brace pattern. Dropping the override
fixes that as well.

The global `esbuild: ^0.25.4` also forces `tsx@4.23.15` (from `drizzle-kit`), which asks for
`esbuild@~0.28.0`, onto 0.25.12.

**The esbuild override, loosened.** The only package that still needs help is
`@esbuild-kit/core-utils`, and `esbuild` is its direct dependency, so pnpm's `a>b` form reaches it:

```yaml
overrides:
  exceljs>uuid: ^14.0.0
  "@esbuild-kit/core-utils>esbuild": ^0.25.4
```

Trial with exactly that and no other overrides, under pnpm: `esbuild@0.25.12` (core-utils and
`drizzle-kit`) and `esbuild@0.28.2` (`tsx`), no 0.18. Brace-expansion at 1.1.21, 2.1.7 and 5.0.12,
`uuid@14.0.3`. `pnpm audit`: 1 low and 2 moderate (deepmerge, minimatch, glob), none from an
overridden package. pnpm warns that the root's `esbuild@^0.25.4` misses `vite`'s optional peer.
Bumping the root devDependency to `^0.28.1` clears that. It is a 0.x minor jump for the Lambda
build script, so it belongs with the dependency refresh, not with the pnpm move.

The same scoped override works under npm too: `"@esbuild-kit/core-utils": { "esbuild": "^0.25.4" }`
plus `esbuild: ^0.28.1` in `devDependencies` installs clean with an unchanged audit. Drop it
entirely once `drizzle-kit` 1.0 is `latest` and the repo moves to it.

## flexi-day-rn

| Override                                 | Added by                      | Cause                                                                                                                                         | Upstream today                        | Trial without it                                                                                                                                                                     | Verdict |
| ---------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `eslint-plugin-expo` → `eslint: $eslint` | `ba8f649`, PR #23 (ESLint 10) | `eslint-plugin-expo` lists `eslint@^9.24.0` under `dependencies` as well as `>=8.10` under `peerDependencies`, which pinned a second ESLint 9 | Still 1.2.1 with the same two entries | npm: installs a nested `eslint@9.39.5` plus about 30 packages, audit gains 3 moderate. pnpm: the peer wins, the plugin links the root `eslint@10.14.0`, and no ESLint 9 is installed | Drop    |

This matches the expo-pnpm trial (T-556), where `eslint . --max-warnings 0` passed without it.

## flexi-day-emails, root and showreel

No overrides.

## Outstanding majors

Read with `npm outdated` in each checkout, filtered to packages whose `latest` is a new major, plus
0.x packages whose `latest` is a new minor. Dependabot PRs: `gh pr list --author app/dependabot`
returns none open in any of the five repos. The workspace repo has no `dependabot.yml`, so root and
`showreel` get no Dependabot PRs at all.

### Root and `showreel`

None. Root has six minor or patch updates, `showreel` one.

### flexi-day-emails

None. It already runs TypeScript 7 as `@typescript/native` (b105029, PR #4), with `typescript`
aliased to `@typescript/typescript6` for tooling that needs 6.

### flexi-day

| Package      | Current | Latest | Dependabot                                   | Notes                                                                                                                                                                                 |
| ------------ | ------- | ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript` | 6.0.3   | 7.0.2  | PR #35 closed 2026-08-02, no reason recorded | `typescript-eslint@8.72.1` peers `typescript >=4.8.4 <6.1.0`. be and emails work around it with the `@typescript/native` + `@typescript/typescript6` alias pair. fe could do the same |

### flexi-day-be

| Package   | Current | Latest | Dependabot                              | Notes                                                                                                                  |
| --------- | ------- | ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `croner`  | 10.0.1  | 11.0.0 | No PR yet (11.0.0 published 2026-10-26) | Runtime dependency. Needs a changelog read before bumping                                                              |
| `esbuild` | 0.25.12 | 0.28.2 | No PR. The override pins it             | 0.x minor, so breaking by semver. Held by the override and by `drizzle-kit`'s `^0.25.4`. See the esbuild section above |

`drizzle-orm` and `drizzle-kit` 1.0 are at `1.0.0-rc.5`, not `latest`. They are the next large move
and would retire the esbuild override.

### flexi-day-rn

32 packages. Expo SDK 58 has been out since 2026-09-29 (`expo@58.0.0`); the repo is on SDK 57.

| Package                                     | Current | Latest  | Blocked by `ignore`                     | Expo SDK-bound | Notes                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ------- | ------- | --------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo` and 23 `expo-*` packages             | 57.x    | 58.x    | Yes (`expo`, `expo-*`: major and minor) | Yes            | `expo-apple-authentication`, `-application`, `-auth-session`, `-build-properties`, `-clipboard`, `-constants`, `-crypto`, `-dev-client`, `-file-system`, `-font`, `-haptics`, `-image-picker`, `-linking`, `-localization`, `-location`, `-network`, `-notifications`, `-router`, `-secure-store`, `-sqlite`, `-status-bar`, `-system-ui`, `-web-browser` |
| `jest-expo`                                 | 57.0.6  | 58.0.13 | Yes (major and minor)                   | Yes            | 58 accepts `jest ^29 \|\| ^30` and uses `babel-jest ^30`                                                                                                                                                                                                                                                                                                  |
| `react-native`                              | 0.86.3  | 0.88.1  | Yes (fully ignored)                     | Yes            | `jest-expo@58` peers `@react-native/jest-preset ^0.88.1`, so SDK 58 is the 0.88 line                                                                                                                                                                                                                                                                      |
| `react-native-worklets`                     | 0.10.1  | 0.13.1  | Yes (fully ignored)                     | Yes            | Exact SDK pin                                                                                                                                                                                                                                                                                                                                             |
| `react-native-gesture-handler`              | 2.32.0  | 3.4.0   | Yes (major and minor)                   | Yes            | SDK tilde range                                                                                                                                                                                                                                                                                                                                           |
| `jest`                                      | 29.7.0  | 30.5.2  | No                                      | Yes, in effect | PR #30 (with `@types/jest`) closed 2026-09-28: `jest-expo@57` is built on Jest 29. Moves with SDK 58                                                                                                                                                                                                                                                      |
| `@types/jest`                               | 29.5.14 | 30.0.0  | No                                      | Yes, in effect | Same PR #30                                                                                                                                                                                                                                                                                                                                               |
| `typescript`                                | 6.0.3   | 7.0.2   | No                                      | No             | PR #32 closed 2026-09-28, no reason recorded. Same `typescript-eslint <6.1.0` peer as fe                                                                                                                                                                                                                                                                  |
| `@react-native-google-signin/google-signin` | 16.1.5  | 17.0.0  | No                                      | No             | No PR yet (17.0.0 published 2026-10-29). Peers `expo >=52.0.40`, so it does not wait for SDK 58                                                                                                                                                                                                                                                           |

`nativewind` shows up in `npm outdated` with `latest` 4.2.7 against the installed `5.0.0-rc.0`. That
is not an outstanding major: the repo is ahead of `latest` on purpose (ADR 0001), and the `ignore`
list blocks it.

Not majors, but worth knowing for the refresh: rn's audit has 6 high findings today (`zod` via
`@expo/cli`, `decode-uri-component` via `query-string` via `expo-router`, and their parents). All
sit inside the Expo SDK tree.

## Sources

- Commits: fe `df11538` (#27), `4b9cc8d` (#152), `479f8a1` (#141), `f5b5b9e` (#46), `057db88`
  (#285); be `ff830e2` (#51), `a34ed43` (#318), `afe5d00` (#75), `cdf628b` (#35); emails
  `b105029` (#4); rn `ba8f649` (#23). Dependabot PRs fe #35, rn #30, rn #32.
- Advisories: [postcss GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp),
  [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849),
  [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q); sharp
  [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj),
  [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c),
  [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w); @hono/node-server
  [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9),
  [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f); brace-expansion
  [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw),
  [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
  [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7); uuid
  [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq); esbuild
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99),
  [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
- Registry: `npm view` for `next@16.4.3`, `shadcn@4.23.0`, `@modelcontextprotocol/server@2`,
  `eslint-plugin-jsx-a11y@6.10.2`, `exceljs@4.4.0`, `archiver@8.0.0`, `readdir-glob@3.0.0`,
  `drizzle-kit@0.31.11` and `@1.0.0-rc.5`, `eslint-plugin-expo@1.2.1`, `typescript-eslint@8.72.1`,
  `jest-expo@58.0.13`, `expo` release times.
- Sibling research: `docs/research/pnpm-toolchain.md` (T-554) and `docs/research/expo-pnpm.md`
  (T-556), on their `research/*` branches.
