# i18n on mobile and reusing the web's en/cs strings

Research for [issue #17](https://github.com/Daniel88dev/flexi-day-workspace/issues/17), part of the
mobile app map (#12). Verified on 2026-09-15 against the `flexi-day` and `flexi-day-be` working
copies, the npm registry, the `sdk-57` branch of `expo/expo`, and the Expo, Hermes, i18next and
Babel docs. Versions named below are the ones current on that date.

## Short answer

The web uses no i18n library. `flexi-day/lib/i18n/` is about 130 lines of its own code: a React
context, a hook, a two-line detection rule, and two TypeScript dictionaries (`dictionaries/en.ts`,
`dictionaries/cs.ts`) that are plain nested objects with template-literal functions for anything
interpolated. English's inferred type is the `Dictionary` contract Czech must satisfy, so `tsc`
enforces key parity. The saved choice lives in `localStorage` under `flexiday-locale`; the fallback
is `navigator.language` starting with `cs`, else English. The backend stores no locale anywhere.

No i18n library reads that format, and none should. Every candidate (i18next, i18n-js, lingui)
wants JSON with its own interpolation syntax and plural convention, which means rewriting 123
function entries and 18 Czech plural calls into something weaker, and on Hermes i18next also needs
an `Intl.PluralRules` polyfill. The right move is to port the 130-line runtime to the phone as is,
swap `localStorage` for `expo-sqlite/kv-store` and `navigator.language` for
`expo-localization`'s `getLocales()`, and have `flexi-day-rn` own its own small `en.ts` and `cs.ts`
in the same shape with the same key paths. The web file is 960 keys across 29 web screens; the
first app needs about 60. Sharing machinery (subtree, package, sync script) costs more than the
copying it saves until there is a third consumer or the phone covers the web's screens.

A server-side preference does not exist yet. Adding a nullable `locale` column to `user_settings`
is a small backend ticket, and the phone's resolution order becomes: server preference, then
local choice, then device language, then English.

## What was verified, with dates

| Package                     | Version on 2026-09-15                                    | Source                                       |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| `expo`                      | 57.0.23 (`latest`, `sdk-57`); `next` is 58.0.0-preview.1 | `npm view expo dist-tags`                    |
| `expo-localization`         | 57.0.2 (`~57.0.2` in SDK 57)                             | `npm view`; `bundledNativeModules.json`      |
| `expo-router`               | 57.0.21 (`~57.0.21` in SDK 57)                           | `npm view`; `bundledNativeModules.json`      |
| `expo-sqlite`               | `~57.0.3` in SDK 57, ships `expo-sqlite/kv-store`        | `bundledNativeModules.json`; SDK docs        |
| `babel-preset-expo`         | 57.0.12, carries `@babel/plugin-transform-typescript`    | `packages/babel-preset-expo/package.json:92` |
| `i18next` / `react-i18next` | 26.4.2 / 17.0.14                                         | `npm view`                                   |
| `i18n-js`                   | 4.5.3                                                    | `npm view`                                   |
| `intl-pluralrules`          | 2.0.1                                                    | `npm view`                                   |
| `typescript` (web)          | `^6.0.2` in `flexi-day/package.json`; 7.0.2 on npm       | `package.json:69`; `npm view`                |

Web frontend inputs read from `flexi-day/`:

- `lib/i18n/config.ts:1-12` the `Locale` union, `LOCALES`, `DEFAULT_LOCALE = "en"`, the
  `STORAGE_KEY = "flexiday-locale"` and the `isLocale` guard.
- `lib/i18n/detect.ts:9-18` `resolveInitialLocale(stored, navigatorLang)`, pure and unit-tested in
  `__tests__/detect.test.ts`. `:20-29` `detectLocale()` feeds it `localStorage` and
  `navigator.language`.
- `lib/i18n/i18n-provider.tsx:35-48` the provider renders English first to match the static export,
  then corrects after mount and flips `localeReady`. `:52-60` `setLocale` writes `localStorage` and
  `document.documentElement.lang`.
- `lib/i18n/use-translation.ts:10-12` `useTranslation()` is `useContext(I18nContext)`, returning
  `{ locale, setLocale, t, localeReady }`. 93 files import it.
- `lib/i18n/dictionaries/en.ts` 1534 lines, 62 KB, `export type Dictionary = typeof en` at
  `:1534`. `dictionaries/cs.ts` 1543 lines, 68 KB, `export const cs: Dictionary` at `:15`.
- `lib/i18n/dictionaries/cs.ts:8-13` a hand-rolled `plural(n, one, few, many)` for Czech, with the
  comment "without pulling in Intl.PluralRules". Called 18 times.
- `lib/i18n/dictionaries/en.ts:1` and `cs.ts:1` import `CalendarRecordType` from `@/lib/api/types`;
  `en.ts:49-59` keys the leave-type labels by that enum. `lib/api/types.ts:6-16` is the enum,
  and the file has no imports of its own.
- `lib/i18n/record-type-label.ts` a lookup that tolerates enum values a newer backend may add.

Backend inputs read from `flexi-day-be/`:

- `src/db/schema/user-settings-schema.ts:22-46` the `user_settings` table: `emailNotifications`,
  `dashboardScope`, `dashboardGroupId`, `attendanceLocationNoticeDismissed`. No locale.
- `src/services/userSettings/types.ts:33-43` `validatePutUserSettings`, every field optional, at
  least one required. `src/routes/usersRouter.ts:138-140` mounts `GET` and `PUT /me/settings`.
- `src/controllers/users/handleGetMySettings.ts:8-20` returns defaults when no row exists.
- A grep for `locale` and `language` across `src/` finds only `localeCompare` sorts and two
  hard-coded `toLocaleDateString("en-GB", ...)` calls in the mail notifiers. The ten templates in
  `flexi-day-emails/emails/` are English only.

## The web library and file format

There is none. `flexi-day/package.json` lists no i18n dependency; `lib/i18n/` is the whole thing.

The format is a TypeScript module, not data. `en.ts` exports one object literal with 29 top-level
namespaces (`common`, `locale`, `theme`, `status`, `calendarRecordTypes`, `calendar`, `nav`,
`clock`, `teamAttendance`, `corrections`, `report`, `userMenu`, `notifications`, `newRequest`,
`attachments`, `vacationDetail`, `editRequest`, `requests`, `groups`, `groupDetail`, `settings`,
`dashboard`, `widgets`, `auth`, `footer`, `organization`, `billing`, `marketingNav`, `landing`,
`calSync`). Roughly 960 leaf strings per locale, counted by quoted leaves. Keys are namespaced by
web screen, so the biggest blocks are `calSync` (107), `auth` (96), `organization` (91), `report`
(82) and `groupDetail` (80).

Three things make this a module rather than a JSON file:

- 123 entries are functions. `en.ts:95` is ``moreCount: (n: number) => `+${n} more` ``; some take
  three arguments (`:176`). Interpolation is TypeScript, checked at the call site.
- Czech plurals are code. `cs.ts:8-13` picks one/few/many by hand and is used 18 times.
- `calendarRecordTypes` is keyed by a runtime enum imported from `lib/api/types` and pinned with
  `satisfies Record<CalendarRecordType, ...>` (`en.ts:49-59`).

The `Dictionary = typeof en` trick is the parity check. A key missing from `cs.ts` fails
`npm run typecheck`, which CI runs. There is no extraction, no key-usage lint, no runtime lookup by
string path. Components read `t.settings.title` as a property.

How the web picks the locale (`detect.ts:9-18`): an explicit stored choice wins if it is `en` or
`cs`; otherwise a `navigator.language` that starts with `cs` (case-insensitive) gives Czech;
otherwise English. No URL segment, no cookie, no user-settings round trip. Because the site is a
static export, the first client render is always English and the provider corrects after mount
(`i18n-provider.tsx:35-48`). The `localeReady` flag exists only for that hydration dance.

The file churns. `en.ts` landed on 2026-07-26 (flexi-day #16) and 37 commits have touched it since.
In the 30 days to 2026-09-15, 27 of the 62 commits on `main` changed it (GitHub API,
`repos/Daniel88dev/flexi-day/commits?path=lib/i18n/dictionaries/en.ts`). Nearly half of all
frontend work edits the dictionary, which is what you would expect when every feature adds copy.
Any mirrored copy of the web file goes stale within days.

## Is there a React Native build, or a native library that reads this format?

No library reads a typed TypeScript object with function values; that is not a format libraries
target. The question inverts: the web's "library" is a React context and a hook, and React context
works identically on React Native. The runtime ports without change. What needs a native
replacement is the two browser globals it touches, `localStorage` and `navigator.language`.

For the record, the candidates the ticket names, and why each is a step down here:

**i18next 26.4.2 + react-i18next 17.0.14.** react-i18next describes itself as a framework for
"React / React Native" (https://react.i18next.com/). It wants JSON resources with `{{name}}`
interpolation and `_one`/`_few`/`_many`/`_other` plural suffixes (JSON v4, since i18next v21). Its
plurals page says: "In environments without Intl.PluralRules support you need to polyfill it
(notably React Native: the Hermes engine still does not implement `Intl.PluralRules`)", and "Since
i18next v24 there is no fallback: without Intl only English-style `_one`/`_other` forms resolve"
(https://www.i18next.com/translation-function/plurals). Hermes's own Intl document lists
`Collator`, `NumberFormat`, `DateTimeFormat`, `getCanonicalLocales` and the `toLocale*` methods,
and does not list `PluralRules` (https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md).
Czech has a `few` form, so the phone would carry `intl-pluralrules` 2.0.1 as a polyfill. The
conversion would also turn 123 typed functions into untyped `{{}}` strings and lose the parity
check unless a typed-resources declaration is maintained alongside. Two dependencies plus a
polyfill to get something weaker than 130 lines of existing code.

**i18n-js 4.5.3.** This is what Expo's localization guide sets up: `new I18n({ en: {...} })` and
`i18n.locale = getLocales().at(0)?.languageCode ?? 'en'`
(https://docs.expo.dev/guides/localization/). Interpolation is `%{name}`; plurals use `zero`,
`one`, `other` keys and "by default works with English, and similar pluralized languages"; other
languages register a handler through `i18n.pluralization.register()`
(https://github.com/fnando/i18n/blob/main/README.md, "Pluralization"). Czech needs that handler,
which is the web's `plural()` function again, just registered instead of called. No types on keys.

**lingui.** Expo's SDK page lists it as compatible. It needs a compile step and its own catalog
format. I did not verify it further because it is the furthest from the web's pattern.

**expo-localization 57.0.2** is the piece that does matter, and it is not an i18n library. It
answers "what language is the phone in", nothing more. Details in the detection section.

**Does the web file's syntax compile under Expo?** Yes. `babel-preset-expo` 57.0.12 depends on
`@babel/plugin-transform-typescript` `^7.25.2` (`packages/babel-preset-expo/package.json:92` on
`sdk-57`) and applies it (`src/index.ts:28,200`). Babel has parsed `satisfies` since 7.20.0
(https://babeljs.io/blog/2022/10/27/7.20.0), and a regular `enum` compiles to the standard enum
output (https://babeljs.io/docs/babel-plugin-transform-typescript). Metro's Expo config lists
`.ts`/`.tsx` as source extensions (`packages/@expo/metro-config/src/ExpoMetroConfig.ts:233-234`).
So `en.ts` and `cs.ts` would bundle unchanged if their `@/lib/api/types` import resolved.

**Does the web's date formatting port?** The dictionaries carry `common.dateLocale` (`en-GB`,
`cs-CZ`) and 17 call sites feed it to `Intl.DateTimeFormat` or `toLocaleDateString`. Hermes
supports both on iOS, with `numberingSystem` and `formatMatcher` unsupported
(https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md, "Limited iOS property support").
Neither option appears in the web's helpers, so the same code works.

## Locale detection on iOS and the user's saved preference

**Device language.** `expo-localization`'s `getLocales()` returns `[Locale, ...Locale[]]` with
`languageTag` (`en-US`), `languageCode` (`en`), `regionCode`, `textDirection` and currency and
number-format fields, "in the order the user defines in their device settings"; `useLocales()` is
the hook form (https://docs.expo.dev/versions/latest/sdk/localization/, SDK 57). On iOS it maps
`Locale.preferredLanguages` (`packages/expo-localization/ios/LocalizationModule.swift:149` on
`sdk-57`). Two iOS behaviours matter for the app: "On iOS, the results will remain the same while
the app is running" (SDK page), and "On iOS, when a user changes the device's language, the app
will reset" (guide). So reading once at startup is enough; there is no live change to react to on
iPhone.

The web's rule transfers verbatim: `resolveInitialLocale(stored, getLocales()[0]?.languageTag)`.
The function already lowercases and checks `startsWith("cs")`, so `cs-CZ` from the phone behaves
exactly like `cs-CZ` from the browser, and `sk-SK` falls to English as it does today.

**Per-app language in iOS Settings.** The guide says "Both Android and iOS allow users to choose a
preferred language for individual apps via the system settings" and that "your app must declare
its supported locales to the system" through the config plugin:

```json
["expo-localization", { "supportedLocales": { "ios": ["en", "cs"], "android": ["en", "cs"] } }]
```

The plugin writes that list to `CFBundleLocalizations` in the Info.plist
(`packages/expo-localization/plugin/src/withExpoLocalization.ts:70`), which Apple documents as
"The localizations handled manually by your app"
(https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundlelocalizations).
With it declared, Settings shows a Language row for Flexi Day, and the user's pick surfaces as the
first entry of `Locale.preferredLanguages`, which is what `getLocales()[0]` reads. Apple's pages I
fetched describe the property and the plist key but do not spell out the per-app mechanism in one
sentence, so the prototype ticket should confirm on the device that switching the app's language in
Settings flips `getLocales()[0].languageCode`. The top-level `locales` key in `app.json` is a
different thing: per-language Info.plist strings such as `CFBundleDisplayName` and permission
prompts. "Flexi Day" is the same in both languages, so it stays out until a permission string
needs Czech.

**Expo Router's `LocaleProvider`.** The guide mentions wrapping the navigator in it. Its source is
fourteen lines: it takes one prop, `direction: LocaleDirection`, and provides it to React
Navigation's `LocaleDirContext` (`packages/expo-router/src/LocaleProvider.tsx:8-14` on `sdk-57`).
It exists for RTL. English and Czech are both LTR, so the app does not need it.

**Local persistence.** The web's `localStorage` becomes `expo-sqlite/kv-store`, which "provides
the same API as `@react-native-async-storage/async-storage`" and adds `getItemSync()` and
`setItemSync()` (https://docs.expo.dev/versions/latest/sdk/sqlite/, SDK 57). The map already picks
`expo-sqlite`, so this adds no dependency, and the synchronous read means the phone can resolve
the locale before the first render. The web's "render English, then correct" step and its
`localeReady` flag exist only because a static export must hydrate against English HTML. The phone
has no hydration, so both go away.

**The saved user preference.** There is none today, on either side. `user_settings` has four
columns and none is a locale (`user-settings-schema.ts:22-46`); the web never sends its choice to
the server. The browser's `localStorage` and the phone's kv-store would be two independent
preferences, which is fine for a first release (that is how the web and a second browser already
behave) but not what "the user's saved preference" in the ticket means.

The clean version is one nullable column:

- Backend: `locale: text("locale")` on `user_settings`, `z.enum(["en", "cs"]).nullable().optional()`
  in `validatePutUserSettings`, `null` in `DEFAULT_USER_SETTINGS`, surfaced by
  `handleGetMySettings`. Null means "follow the device", so nothing changes for existing users. A
  Drizzle migration through the runbook.
- Web: `setLocale` also issues `PUT /api/users/me/settings { locale }` when signed in, and the
  provider reads `mySettings.locale` once the query lands, overriding the local choice.
- Phone: on the welcome and sign-in screens only the local choice and the device language apply,
  because there is no session yet. After sign-in the app fetches `GET /api/users/me/settings` (the
  sync pull covers groups, memberships, vacations, quotas and holidays, not settings), applies
  `locale` if set, and writes it to the kv-store so the next cold start opens in the right language
  before any network call.

Resolution order on the phone, first match wins: server `user_settings.locale` (signed in and
fetched), local `flexiday-locale`, `getLocales()[0]` starting with `cs`, `en`. The column would
also let the backend pick a template language for the ten English-only emails later, which is the
second consumer that justifies it.

This is a separate ticket touching `flexi-day-be`, `flexi-day` and `flexi-day-rn`. The first three
screens work without it.

## Sharing the files across repos

The constraint is the standing decision: four repos, versioned and deployed independently. The
other constraint is the size of the first app: three screens. The sign-in and two-factor pages plus
the auth layout, card and brand panel read 42 `t.auth.*` keys (of 96 in the namespace; `signUp`,
`forgot`, `reset`, `verify` and `verified` are web-only because the phone links out for those). The
shell components read 4. Add `common` (12), `locale` (5) and whatever the welcome screen says, and
the phone needs about 60 keys out of 960. Two of the sub-blocks it does need, `signIn` and
`twoFactor`, are 25 keys together.

**Copy with a sync script.** A script in `flexi-day-rn` fetches `en.ts` and `cs.ts` at a pinned
commit (`gh api repos/Daniel88dev/flexi-day/contents/lib/i18n/dictionaries/en.ts?ref=<sha>` with
the raw media type works today; the repo is public so a raw URL works too), rewrites the
`@/lib/api/types` import to a local enum, and commits the result. Cheap to write. The trouble is
what it copies: 960 keys organised by web screens the phone will not have for months (`landing`,
`calSync`, `billing`, `report`), 27 upstream changes a month to re-pull, and a bundle carrying
130 KB of source that tree-shaking cannot trim because it is one object literal. The phone's
screens are also not the web's screens: sign-in on the phone has no OAuth buttons and no sign-up
form, so even the `auth` block is half dead weight. The script does not remove the maintenance,
it schedules it.

**git subtree.** `git subtree add --prefix=<dir> <repository> <ref>` imports a repository at a ref;
`--squash` folds upstream history into one commit (`git subtree -h`; contrib docs at
https://github.com/git/git/blob/master/contrib/subtree/git-subtree.adoc). It imports the whole
remote tree. Pulling two files out of `lib/i18n/dictionaries/` means first running `git subtree
split` on the web side to produce a branch containing only that directory, then keeping that split
branch alive in `flexi-day` for every change. That is a second workflow in the web repo to feed
two files into the phone repo, and it drags the `@/lib/api/types` import along regardless. Wrong
tool at this size.

**A published npm package.** `@flexi-day/i18n` is unclaimed on npm (404 on 2026-09-15). The web
repo would move `lib/i18n/dictionaries/` and the enum into a package directory, build it with `tsc`
to JS plus `.d.ts`, and publish on a tag; the phone would `npm install` a version. This is the
answer that matches "version independently": the phone pins a version and upgrades on its own
schedule, and the type contract travels in the `.d.ts`. It is also a release process (build,
version bump, publish token in CI, `package.json` `exports`) for a solo developer shipping copy
changes 27 times a month, and it makes every web string change a two-step affair: publish, then
bump on the web too, or keep the web importing the source and only consumers the build. Worth it
when there are two consumers that need the same 900 keys. Not worth it for one consumer that
needs 60.

**The mobile app owns its own smaller file.** `flexi-day-rn/lib/i18n/dictionaries/en.ts` and
`cs.ts`, same shape as the web (one object, `Dictionary = typeof en`, `cs: Dictionary`, functions
for interpolation, the `plural()` helper copied into `cs.ts`), same key paths for strings both apps
show (`common.cancel`, `auth.signIn.title`, `auth.twoFactor.code`, `locale.switchToCzech`), and
new keys only where the phone's copy differs. Strings get copied by hand from the web file when a
screen is built, which is the moment someone is reading them anyway. Parity with the web is not a
goal; the phone's welcome screen has no web equivalent. What the shared key paths buy is a later
merge: when the day comes to publish a package, the phone's file is a subset with the same
addresses, and a short script can report which shared keys drifted.

This is the option I would pick, and I would resist adding the drift script until something has
actually drifted. The cost of the first three screens is one afternoon of copying about 60 strings
twice. The cost of any sharing mechanism is a workflow that outlives the reason for it.

## Recommendation

1. No i18n library on the phone. Port `flexi-day/lib/i18n/` to `flexi-day-rn/lib/i18n/` with the
   same file names: `config.ts` unchanged, `detect.ts` with `resolveInitialLocale` unchanged and
   `detectLocale()` reading `Storage.getItemSync(STORAGE_KEY)` from `expo-sqlite/kv-store` and
   `getLocales()[0]?.languageTag` from `expo-localization`, `i18n-provider.tsx` without the mount
   correction and without `localeReady` (initial state is `detectLocale()`), `use-translation.ts`
   unchanged. Keep the storage key `flexiday-locale`.
2. `flexi-day-rn` owns `lib/i18n/dictionaries/en.ts` and `cs.ts`. Same shape as the web,
   `Dictionary = typeof en`, `cs: Dictionary`, the Czech `plural()` helper, web key paths for
   shared strings. Start with `common`, `locale`, `auth.signIn`, `auth.twoFactor`, `auth.brand`, a
   `welcome` block, and `nav` for the shell. `calendarRecordTypes` and the enum come in with the
   first dashboard widget, keyed by the phone's own copy of `CalendarRecordType`.
3. `app.json`: the `expo-localization` plugin with `supportedLocales: { ios: ["en", "cs"],
android: ["en", "cs"] }`. No `locales` key, no `LocaleProvider`.
4. No sharing mechanism now. Revisit when a second consumer needs the web's full dictionary or the
   phone covers the web's main screens; the destination then is `@flexi-day/i18n` published from
   `flexi-day`, and the shared key paths make the phone's file a drop-in subset.
5. A separate ticket for the server-side preference: nullable `locale` on `user_settings`, the web
   writes it on toggle and reads it after sign-in, the phone reads it after sign-in and caches it in
   the kv-store. Not needed for the three-screen milestone.

## Facts later tickets depend on

- Library: none. The phone's i18n is a React context and hook copied from `flexi-day/lib/i18n/`
  (130 lines: `config.ts`, `detect.ts`, `i18n-provider.tsx`, `use-translation.ts`, `index.ts`).
- Device locale: `expo-localization` `~57.0.2` (SDK 57), `getLocales()[0]?.languageTag`, read once
  at startup. iOS restarts the app on a language change, so no listener.
- Local persistence: `expo-sqlite/kv-store` (`~57.0.3`, already chosen for the local store),
  `Storage.getItemSync("flexiday-locale")` / `setItemSync`. Synchronous, so the first render is in
  the right language.
- Detection rule: `resolveInitialLocale(stored, languageTag)` from
  `flexi-day/lib/i18n/detect.ts:9-18`, unchanged: valid stored choice, else tag starting with
  `cs`, else `en`.
- File location and format: `flexi-day-rn/lib/i18n/dictionaries/en.ts` and `cs.ts`, TypeScript
  object literals, `export type Dictionary = typeof en` in `en.ts`, `export const cs: Dictionary`
  in `cs.ts`, functions for interpolation, `plural(n, one, few, many)` in `cs.ts`. Key paths match
  the web's where the string is shared. Components read `const { t } = useTranslation()` and
  `t.auth.signIn.title`.
- Toggle UI: the web's `LocaleToggle` (`components/ui/LocaleToggle.tsx`) reads `locale`,
  `setLocale` and `t.locale.*` from the hook; the phone's equivalent needs the same three.
- iOS per-app language: `["expo-localization", { "supportedLocales": { "ios": ["en", "cs"],
"android": ["en", "cs"] } }]` in `app.json` plugins, writing `CFBundleLocalizations`. Confirm on
  the device during the prototype that the Settings pick changes `getLocales()[0]`.
- Saved user preference: does not exist. When added it is `user_settings.locale`, `"en" | "cs" |
null`, through `PUT /api/users/me/settings` and `GET /api/users/me/settings`
  (`flexi-day-be/src/routes/usersRouter.ts:138-140`). The phone applies it after sign-in and
  caches it in the kv-store; welcome and sign-in screens use local choice and device language only.
  Order: server, local, device, `en`.
- Hermes has no `Intl.PluralRules`. Keep plurals as code, as the web does. `Intl.DateTimeFormat`
  and `toLocaleDateString` with `t.common.dateLocale` work on iOS.
- Sharing: none for now. Target when needed is an npm package `@flexi-day/i18n` (name free) built
  from `flexi-day`, not subtree and not a sync script.

## Sources

- `flexi-day/lib/i18n/config.ts`, `detect.ts`, `i18n-provider.tsx`, `use-translation.ts`,
  `index.ts`, `record-type-label.ts`, `dictionaries/en.ts`, `dictionaries/cs.ts`,
  `__tests__/detect.test.ts`; `components/ui/LocaleToggle.tsx`; `lib/api/types.ts:6-27`;
  `lib/api/settings.ts`; `package.json`.
- `flexi-day-be/src/db/schema/user-settings-schema.ts`, `src/services/userSettings/types.ts`,
  `src/controllers/users/handleGetMySettings.ts`, `src/routes/usersRouter.ts`.
- `flexi-day-emails/emails/` (ten templates, no locale).
- GitHub API, `repos/Daniel88dev/flexi-day/commits?path=lib/i18n/dictionaries/en.ts` and
  `?since=2026-08-16`, read 2026-09-15.
- https://docs.expo.dev/versions/latest/sdk/localization/ (SDK 57)
- https://docs.expo.dev/guides/localization/
- https://docs.expo.dev/versions/latest/sdk/sqlite/ (SDK 57, key-value store)
- https://docs.expo.dev/guides/using-hermes/
- `expo/expo` at `sdk-57`: `packages/expo/bundledNativeModules.json`,
  `packages/expo-localization/ios/LocalizationModule.swift`,
  `packages/expo-localization/plugin/src/withExpoLocalization.ts`,
  `packages/expo-router/src/LocaleProvider.tsx`, `packages/expo-router/src/exports.ts:49`,
  `packages/babel-preset-expo/package.json`, `packages/babel-preset-expo/src/index.ts`,
  `packages/@expo/metro-config/src/ExpoMetroConfig.ts`
- https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md
- https://react.i18next.com/
- https://www.i18next.com/translation-function/plurals
- https://github.com/fnando/i18n/blob/main/README.md
- https://babeljs.io/blog/2022/10/27/7.20.0
- https://babeljs.io/docs/babel-plugin-transform-typescript
- https://github.com/git/git/blob/master/contrib/subtree/git-subtree.adoc and `git subtree -h`
- https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundlelocalizations
- https://developer.apple.com/documentation/foundation/nslocale/preferredlanguages
- `npm view <pkg> version` and `npm view expo dist-tags`, 2026-09-15
