# Expo SDK 57, Metro and EAS under pnpm

Resolves fenro task T-556, a research ticket under the map T-553 (move the five repos from npm 12 to
pnpm). Written 2026-11-01 against `flexi-day-rn` at its current `main`.

| What                   | Version checked                                                                 |
| ---------------------- | ------------------------------------------------------------------------------- |
| pnpm                   | 12.16.1 locally; 11.28.2 tried as EAS's stock version                           |
| Node                   | 24.22.1 locally; `eas.json` pins 24.21.0                                        |
| Expo SDK               | `expo@57.0.31` (npm `sdk-57` tag), `@expo/cli@57.0.32`, `expo-doctor@1.21.5`    |
| React Native           | 0.86.3                                                                          |
| EAS build-tools source | `expo/eas-cli@821e7f8` (`packages/build-tools`, `packages/worker`)              |
| Expo package-manager   | `expo/expo@sdk-57` (`packages/@expo/package-manager/src/utils/nodeManagers.ts`) |

## Method

The real checkout was only read. `package.json`, `package-lock.json`, the config files, `src/`,
`jest/`, `scripts/`, `assets/` and `locales/` were copied to `/tmp/expo-pnpm-t556`. There:
`pnpm import`, `pnpm install`, `expo-doctor`, `expo config --type introspect`, the autolinking
command the Podfile runs, `expo export --platform ios` (a Metro bundle, no native compile),
`expo prebuild --no-install` followed by `pod install`, `tsc`, ESLint, Prettier, the full Jest
suite and `expo install --check/--fix`. No Xcode build, no simulator, no EAS build.

## Short version

- **Use pnpm's default isolated linker.** Everything ran on it: the Metro bundle with NativeWind,
  autolinking, `pod install`, Jest, ESLint and `expo install --fix`. Autolinking finds the same 10
  React Native libraries and the same 37 Expo modules as npm, and `pod install` installs the same
  124 pods. `nodeLinker: hoisted` stays as the fallback Expo documents.
- **Nothing blocks the switch.** Four small changes are needed: a `pnpm-workspace.yaml` that
  reviews four build scripts, `react-test-renderer` as a direct devDependency, `pnpm-lock.yaml`
  in `.prettierignore`, and `package-lock.json` deleted.
- **EAS Build picks pnpm from `pnpm-lock.yaml`** and runs `pnpm install --frozen-lockfile`. Add
  `"pnpm": "12.16.1"` to the production profile in `eas.json`. Otherwise EAS reinstalls the
  image's own pnpm 11 because the profile pins `node`.
- **Neither pnpm 12 gotcha from the sibling research breaks EAS.** pnpm 11.28.2 reads the
  two-document lockfile and hands off to pnpm 12.16.1 itself. The `minimumReleaseAge` check passes
  on a frozen install because every lockfile entry already passed it locally.

## 1. Isolated or hoisted linker

Expo's monorepo guide: "Starting with SDK 54, Expo supports isolated dependencies", and for pnpm
isolated "is the default installation strategy unless it's disabled". It still warns that "some
React Native libraries may cause build or resolution errors" and gives `nodeLinker: hoisted` in
`pnpm-workspace.yaml` as the fallback ([Expo: monorepos][expo-monorepos]). pnpm 12's default is
`isolated`, and `publicHoistPattern` defaults to `[]` ([pnpm: node-modules settings][pnpm-nm]).

What the trial showed on the isolated linker:

| Check                                              | Result                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo-doctor` (21 checks)                          | 19 pass. The 2 failures are the same under npm today: `newArchEnabled` is not in the SDK 57 app.json schema, and `react-native-svg` 15.16.0 vs expected 15.15.4 |
| Duplicate native modules / React copies            | None. `expo-modules-autolinking verify` says "Everything is fine"; one `react`, one `react-native`, one `expo`                                                  |
| `expo config --type introspect`                    | Same entitlements: associated domains, `aps-environment`, Sign in with Apple, scene manifest                                                                    |
| Autolinking (`react-native-config --platform ios`) | Same 10 libraries as npm, including the transitive `@react-native-masked-view/masked-view`; roots resolve into `node_modules/.pnpm/...`                         |
| Expo modules (`resolve --platform apple`)          | Same 37 modules at the same versions as the npm checkout                                                                                                        |
| Metro (`expo export --platform ios`)               | Bundles 5830 modules. NativeWind's compiled tokens (`primary-soft`, `bg-accent`) are in the bundle                                                              |
| `expo prebuild` + `pod install`                    | Podfile byte-identical to npm's. 124 dependencies, 132 pods installed, same pod names as the npm `Podfile.lock`                                                 |
| Jest                                               | 326 suites, 3452 tests pass. One suite timed out under load 21 and passed alone                                                                                 |
| ESLint                                             | Passes                                                                                                                                                          |
| `tsc --noEmit`                                     | **Fails**: `react-test-renderer` is a phantom dependency, see section 5                                                                                         |
| Prettier                                           | **Fails** on `pnpm-lock.yaml` until it is in `.prettierignore`                                                                                                  |

Since SDK 54, autolinking "resolves the dependencies of your app and any dependency or peer
dependency recursively", which is how it finds modules in pnpm's virtual store
([Expo: autolinking][expo-autolinking]). `experiments.autolinkingModuleResolution` is on by default
only in monorepos. This app is not one and needs no duplicate workaround, because there are no
duplicates.

`babel-preset-expo` is not a direct dependency and has no top-level link under isolated. Metro and
`jest-expo` still find it, as the bundle and the Jest run show. No change needed.

## 2. EAS Build

**Detection.** The worker resolves the package manager with `@expo/package-manager`, which checks
lockfiles in the order bun, yarn, npm, pnpm ([`nodeManagers.ts` RESOLUTION_ORDER][expo-pm-order];
[`packageManager.ts`][eas-pm]). **A leftover `package-lock.json` makes EAS use npm.** Delete it.
`expo-doctor` flags two lockfiles as a failure too. The EAS iOS build docs still say only "`npm
install` ... (or `yarn install` if yarn.lock exists)" ([Expo: iOS build process][expo-ios-build]).
The source is the authority here.

**Install command.** For pnpm it runs `pnpm install --frozen-lockfile`, frozen on SDK 53 and later
([`installDependencies.ts` L35][eas-install]; [`shouldUseFrozenLockfile`][eas-pm]). The lockfile
must match `package.json` and the settings in `pnpm-workspace.yaml`.

**pnpm version.** The SDK 57 image ships pnpm 11.9.0, and `latest` ships 11.28.2
([Expo: build infrastructure][expo-infra]). The worker reinstalls pnpm whenever the profile sets
`node`, which this one does. It installs `builderConfig.pnpm ?? <image version>` with
`npm -g install` ([`runtimeEnvironment.ts` L109-L119, L266-L300][eas-runtime]). So without a
`pnpm` field EAS uses pnpm 11. The `pnpm` profile field is documented as "Version of pnpm used for
build" ([Expo: eas.json][expo-easjson]). pnpm 12.16.1 declares `engines.node >=18`, so it installs
under the pinned Node 24.21.0.

**`eas.json` change.** One field on the production profile:

```json
"production": {
  "node": "24.21.0",
  "pnpm": "12.16.1",
  ...
}
```

Move it with the local pnpm, the way `docs/releasing.md` already says for `node`.

**Build scripts.** pnpm 12 defaults `strictDepBuilds` to `true`: an install "will exit with a
non-zero exit code if any dependencies have unreviewed build scripts"
([pnpm: build settings][pnpm-build]). The first `pnpm install` failed with `ERR_PNPM_IGNORED_BUILDS`
for `@tailwindcss/oxide@4.1.12` and three `esbuild` versions. EAS would fail the same way. Both
scripts are optional: they fetch a platform binary that pnpm already installs through optional
dependencies. Denying them is enough, and the bundle, Prettier's Tailwind plugin and drizzle-kit
all ran with them denied:

```yaml
# pnpm-workspace.yaml
allowBuilds:
  "@tailwindcss/oxide": false
  esbuild: false
```

`better-sqlite3@13` ships prebuilds inside the package and has no install script, so Jest's SQLite
needs no approval. The file has no `packages` key, so `resolve-workspace-root` does not treat the
app as a workspace and EAS installs in the project directory
([`resolve-workspace-root`][rwr]). It has to be committed: EAS uploads the tree minus `.gitignore`.

**expo-doctor on EAS.** EAS runs `npx -y expo-doctor` whatever the package manager is, and a
failure only marks the phase with a warning ([`setup.ts` L186-L196][eas-setup]). The two failures
above do not stop a build.

### The two pnpm 12 gotchas from the sibling research

**`packageManager` and the two-document lockfile.** Confirmed locally: with
`"packageManager": "pnpm@12.16.1"`, pnpm 12 writes a lockfile that starts with a `---` document
holding `packageManagerDependencies`. EAS does not trip on it. pnpm 11.28.2, the stock version, ran
`install --frozen-lockfile` on that lockfile, then switched to pnpm 12.16.1 by itself and finished
("Done in 82ms using pnpm v12.16.1"). If the map sets `pmOnFail: ignore` to keep GitHub's dependency
graph working, pnpm stops managing its own version and the `eas.json` `pnpm` field is what keeps EAS
on 12. Set that field either way.

**`minimumReleaseAge`.** pnpm 12 applies it (default 1440 minutes, non-strict) and verifies the
loaded lockfile against it on every install, frozen included ([pnpm: dependency
resolution][pnpm-dep]). The trial printed "Lockfile passes supply-chain policies (1060 entries in
4.4s)" on a frozen install, so EAS will run this check too. It passes: a lockfile is only written
after every entry passed the same check locally, and entries only get older before the build.
`minimumReleaseAgeIgnoreMissingTime` defaults to `true`, so a registry without `time` metadata,
such as an npm cache proxy, skips the check rather than failing. EAS points `NPM_CONFIG_REGISTRY` at
its npm cache when one is set, and falls back to the public registry when that install fails
([`installDependencies.ts`][eas-install]). One edge stays: a lockfile entry that a packument with
`time` data does not list "remains a hard failure". That can only happen with a stale cache, and
the fallback covers it.

## 3. The native side

The Podfile reads `node_modules` through Node's own resolution: `require.resolve('expo/package.json')`,
`require.resolve('react-native/package.json')` and `require('expo/bin/autolinking')`. `expo` and
`react-native` are direct dependencies, so each has a top-level symlink, and `require.resolve`
returns the real path in `.pnpm`. The Xcode build phases resolve the same way: `expo/scripts/resolveAppEntry`,
`@expo/cli` resolved from `expo`'s own directory, and `react-native/scripts/react-native-xcode.sh`.
`REACT_NATIVE_PATH` is `${PODS_ROOT}/../../node_modules/react-native`, a direct dependency's
symlink. The font paths in `app.json` and the pbxproj point at `node_modules/@expo-google-fonts/...`,
also direct dependencies; all 12 files exist under pnpm.

Prebuild under pnpm wrote a Podfile identical to npm's, and `pod install` succeeded with the same
pod set. One difference: `Podfile.lock` `:path:` entries now point into
`node_modules/.pnpm/<name>@<version>_<peer hash>/...`. That directory name changes whenever a peer
changes. `react-native`'s includes `@babel/core`'s version, for example. A dependency bump can move
a native module's real path without changing its version. The generated `Pods` project then points
at a directory that no longer exists, so the dev client fails to build until `pod install` runs
again. `ios/` is generated and gitignored, so this costs a rerun of `pnpm prebuild` (or
`pod install`) after a dependency change, nothing more. The Release build on EAS always prebuilds
fresh.

## 4. `expo install --fix` under pnpm

`pnpm expo install --fix` works and replaces `npx expo install --fix`. Expo CLI picked pnpm from the
lockfile and ran `pnpm add react-native-svg@15.15.4` ("Installing 1 SDK 57.0.0 compatible native
module using pnpm"). `pnpm expo install --check` reports the same mismatch npm does. The
`expo-sdk` Dependabot routine in `docs/ci-and-dependabot.md` keeps its shape with `pnpm` in place
of `npx`. `.github/dependabot.yml` keeps `package-ecosystem: npm`, which covers pnpm.

One interaction: with the non-strict `minimumReleaseAge`, `expo install --fix` run within a day of an
Expo patch can resolve one version below the one Expo expects. `expo install --check` then still
complains. Run it again the next day, or list the `expo` packages in `minimumReleaseAgeExclude` if
that gets annoying. The map's supply-chain ticket decides which.

## 5. Repo-specific risks

- **NativeWind v5 RC, `react-native-css`, lightningcss (ADR 0001).** No change. All five pins stay
  exact and resolved to the pinned versions. Metro compiled `src/global.css` through
  `withNativewind` and the tokens are in the bundle. `@tailwindcss/oxide`'s postinstall is denied
  and the native binary still loads from its optional platform package.
- **`jest-expo`.** No change. Its transform ignore patterns handle `.pnpm` paths; the suite passes.
- **`react-test-renderer`: the one phantom dependency.** `src/components/report/__tests__/days-left-bar.test.tsx`
  and `stacked-columns.test.tsx` import it, but it is not in `package.json`; npm hoists it from
  `jest-expo`. Jest still resolves it under pnpm, but `tsc` fails with TS2307. Add
  `react-test-renderer` at `19.2.3` (it must match `react`) as a devDependency. An import scan of
  `src/`, `jest/`, `scripts/` and the root config files found no other undeclared package.
- **expo-sqlite with Drizzle.** No change. `better-sqlite3@13` loads its bundled prebuild in Jest,
  and `npm run store:ddl` (drizzle-kit) ran and regenerated the DDL under pnpm.
- **`eslint-plugin-expo` and the `$eslint` override.** Drop the npm `overrides` block and its `"//"`
  comment. pnpm does not read npm's top-level `overrides`; the imported and the freshly resolved
  lockfiles have no `overrides:` section. It is not needed: `eslint-plugin-expo@1.2.1` lists
  `eslint` both as a dependency (`^9.24.0`) and as a peer (`>=8.10`), pnpm resolves it as the peer,
  and a fresh resolution gives one ESLint, 10.x. ESLint passes.
- **Peer warning.** `pnpm peers check` reports `react-reconciler@0.34.0` wanting `react ^19.3.0`,
  pulled by `@testing-library/react-native` through `test-renderer`. The same tree exists under npm.
  Test-only; leave it.

## 6. Simulator dev flow

- `npm run dev:rn` (`npm --prefix ./flexi-day-rn start`) keeps working: `npm run` only spawns the
  script and writes no lockfile. Switching it to `pnpm --dir ./flexi-day-rn start` belongs to the
  workspace repo's own migration.
- `npm run dev:login:rn` drives `xcrun simctl` through `tools/lib/simulator.mjs` and never touches
  the app's packages. No change.
- `scripts/ios-device.js` calls `npx expo prebuild`. `npx` finds the local `expo` in a pnpm tree,
  so it works; `pnpm exec` would be tidier. Its usage strings say `npm run`.
- The root format hooks call `<repo>/node_modules/.bin/prettier`, which pnpm creates for a direct
  dependency. No change.
- `tools/cloud/setup.sh` runs `npm ci` for `flexi-day-rn` when `FLEXI_CLOUD_WITH_RN=1`; it moves
  with the workspace migration.
- After a dependency change, run `pnpm prebuild` before `pnpm ios`, as section 3 explains.
- If the workspace root ever gets a `pnpm-workspace.yaml` with a `packages` list, it must not match
  `flexi-day-rn`, or Expo and EAS tooling will treat the root as the app's workspace.

## What the pilot changes in `flexi-day-rn`

1. Add `pnpm-workspace.yaml` with the `allowBuilds` block above (and whatever T-553's supply-chain
   ticket settles: `minimumReleaseAge`, `pmOnFail`).
2. `pnpm import`, then delete `package-lock.json`.
3. Remove the npm `overrides` block and its `"//"` comment from `package.json`.
4. `pnpm add -D react-test-renderer@19.2.3`.
5. `.prettierignore`: replace `package-lock.json` with `pnpm-lock.yaml`.
6. `eas.json`: add `"pnpm": "12.16.1"` to the production profile. Update the Node paragraph in
   `docs/releasing.md` to cover both pins.
7. CI: `pnpm/action-setup`, `cache: pnpm`, `pnpm install --frozen-lockfile`, `pnpm run ...`,
   `pnpm expo install --check`.
8. Docs: `npm run` and `npx expo` become `pnpm` in `CLAUDE.md`, `README.md`,
   `docs/ci-and-dependabot.md`, `docs/device-testing.md` and `scripts/ios-device.js`'s usage text.

## Not verified

- A full Xcode build of the dev client and an EAS build. `pod install` succeeding is the strongest
  local signal short of compiling. The first pnpm EAS build should be watched. If a native library
  fails to compile on isolated, `nodeLinker: hoisted` is the documented retreat.
- Whether EAS's npm cache proxy returns `time` metadata. Either way the frozen install passes, per
  section 2.

## Sources

- [Expo: Work with monorepos][expo-monorepos]
- [Expo: Autolinking][expo-autolinking]
- [Expo: eas.json reference][expo-easjson]
- [Expo: EAS Build infrastructure][expo-infra]
- [Expo: iOS build process][expo-ios-build]
- [pnpm: node-modules settings][pnpm-nm]
- [pnpm: build settings][pnpm-build]
- [pnpm: dependency resolution settings][pnpm-dep]
- [`expo/eas-cli` `packageManager.ts`][eas-pm], [`installDependencies.ts`][eas-install],
  [`setup.ts`][eas-setup], [`runtimeEnvironment.ts`][eas-runtime]
- [`expo/expo@sdk-57` `nodeManagers.ts`][expo-pm-order]
- [`resolve-workspace-root`][rwr]
- [Metro: configuration (`watchFolders` and symlinks)][metro-config]

[expo-monorepos]: https://docs.expo.dev/guides/monorepos/
[expo-autolinking]: https://docs.expo.dev/modules/autolinking/
[expo-easjson]: https://docs.expo.dev/eas/json/
[expo-infra]: https://docs.expo.dev/build-reference/infrastructure/
[expo-ios-build]: https://docs.expo.dev/build-reference/ios-builds/
[pnpm-nm]: https://pnpm.io/settings/node-modules
[pnpm-build]: https://pnpm.io/settings/build
[pnpm-dep]: https://pnpm.io/settings/dependency-resolution
[eas-pm]: https://github.com/expo/eas-cli/blob/821e7f85f54bf89f5b798952ae456a4ee7873063/packages/build-tools/src/utils/packageManager.ts
[eas-install]: https://github.com/expo/eas-cli/blob/821e7f85f54bf89f5b798952ae456a4ee7873063/packages/build-tools/src/common/installDependencies.ts#L35
[eas-setup]: https://github.com/expo/eas-cli/blob/821e7f85f54bf89f5b798952ae456a4ee7873063/packages/build-tools/src/common/setup.ts#L186-L196
[eas-runtime]: https://github.com/expo/eas-cli/blob/821e7f85f54bf89f5b798952ae456a4ee7873063/packages/worker/src/runtimeEnvironment.ts#L109-L119
[expo-pm-order]: https://github.com/expo/expo/blob/b06b4fd800146485e06ffac3dc6a44964d03c776/packages/%40expo/package-manager/src/utils/nodeManagers.ts#L28
[rwr]: https://github.com/byCedric/resolve-workspace-root/blob/main/src/utils/workspaces.ts
[metro-config]: https://metrobundler.dev/docs/configuration/
