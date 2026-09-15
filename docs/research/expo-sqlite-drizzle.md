# expo-sqlite + Drizzle for the mobile local store

Resolves [workspace #16](https://github.com/Daniel88dev/flexi-day-workspace/issues/16), part of
the mobile map [#12](https://github.com/Daniel88dev/flexi-day-workspace/issues/12). Written
2026-09-15.

| What                         | Version verified against                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Expo SDK                     | 57 (`expo@57.0.23`, npm `latest`, published 2026-09-15; SDK 58 is `next` at `58.0.0-preview.1`)                  |
| `expo-sqlite`                | 57.0.3 (`sdk-57` tag, published 2026-09-11); source read on the `sdk-57` branch of `expo/expo`                   |
| `drizzle-orm`                | 0.45.2 (npm `latest`, published 2026-03-27; same line the backend runs, `flexi-day-be/package.json:59`)          |
| `drizzle-kit`                | 0.31.10 (npm `latest`, 2026-09-09; the backend's `^0.31.5` resolves to it, `flexi-day-be/package.json:85`)       |
| `drizzle-orm@rc`             | 1.0.0-rc.4 (2026-06-27), what the Drizzle docs now install by default. Not recommended here, see "Which Drizzle" |
| `expo-drizzle-studio-plugin` | 0.2.1 (2025-10-11, last commit the same day)                                                                     |
| `babel-plugin-inline-import` | 3.0.0 (2022-06-13)                                                                                               |

Source citations name the file on the tag or branch above with line numbers. `SQLiteDatabase.ts`,
`hooks.tsx`, `NativeDatabase.ts`, `SQLiteDevToolsClient.ts` and `SQLiteModule.swift` live under
`packages/expo-sqlite/` in `expo/expo@sdk-57`; `query.ts`, `session.ts`, `migrator.ts` and
`dialect.ts` under `drizzle-orm/src/` in `drizzle-team/drizzle-orm@0.45.2`.

## Short version

The stack works and is boring in the good sense. Three things need a decision rather than a
default: the live-query hook is 56 lines with two open bugs and no coalescing, so we should write
our own; `SQLiteProvider` gets in the way of wiping the store on sign-out, so we should own the
connection ourselves; and the Drizzle docs push `1.0.0-rc` while the backend is on `0.45.2`, so we
pin `0.45.2` and upgrade both repos together later. The schema is written by hand. Nothing in the
New Architecture or Expo Router blocks any of it.

## 1. The expo-sqlite API on SDK 57

Nothing changed in 57. The `expo-sqlite` changelog lists no user-facing changes for 57.0.0 through
57.0.3 ([CHANGELOG.md:13-29](https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/CHANGELOG.md)).
The last breaking change was 56.0.0 raising the iOS floor to 16.4 (CHANGELOG.md:55-59), and the
last feature work was 55.0.0: the built-in SQLite inspector, tagged-template queries and
`SQLITE_ENABLE_MATH_FUNCTIONS` (CHANGELOG.md:137-143). `expo-sqlite` is included in Expo Go, apart
from SQLCipher
([docs](https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/sqlite.mdx),
line 593); we use a dev client anyway.

**Opening.** `openDatabaseSync(name, options?, directory?)` and `openDatabaseAsync(...)` both
return a `SQLiteDatabase`; the sync one carries the docs warning that heavy work blocks the JS
thread (`SQLiteDatabase.ts:576-624`). Both register the connection with the dev-tools inspector in
`__DEV__` (`SQLiteDatabase.ts:597,621`, `SQLiteDevToolsClient.ts:44-50`). Options that matter to
us (`NativeDatabase.ts:42-53`):

- `enableChangeListener` (default `false`): installs `sqlite3_update_hook` on the connection
  (`SQLiteModule.swift:348-349`). Without it `addDatabaseChangeListener` and therefore
  `useLiveQuery` never fire.
- `useNewConnection` (default `false`): bypass the native connection cache.

**Provider.** `SQLiteProvider` (`hooks.tsx:93-122`) opens the database in an effect, runs `onInit`
before rendering children, and closes the connection in the effect cleanup (`hooks.tsx:196-226`).
With `useSuspense` it instead keeps one module-level promise (`hooks.tsx:155-162`) and forbids
`onError` (`hooks.tsx:100-102`). `useSQLiteContext()` throws outside the provider
(`hooks.tsx:145-151`). Two things to know before adopting it:

- Its `React.memo` comparator ignores `children` (`hooks.tsx:114-121`), so a provider whose
  children change without any prop changing does not re-render. Open as
  [expo/expo#44671](https://github.com/expo/expo/issues/44671) (2026-08-11, PR #45099 unreviewed).
- The provider owns the close, and it does so fire-and-forget in the cleanup. Deleting the file
  underneath it is a race (see section 5).

**Transactions.** Three flavours on `SQLiteDatabase`:

- `withTransactionAsync` is `BEGIN` / `COMMIT` / `ROLLBACK` via `execAsync` on the same connection
  (`SQLiteDatabase.ts:140-149`). The docstring warns that any other async query that lands while
  it is open joins the transaction (`SQLiteDatabase.ts:118-136`).
- `withExclusiveTransactionAsync` opens a second native connection for the duration
  (`SQLiteDatabase.ts:175-198`, `Transaction.createAsync` at 786-795) so other writers get
  `database is locked` instead of leaking in. Not on web.
- `withTransactionSync` (`SQLiteDatabase.ts:298`).

Drizzle uses none of these. Its own `db.transaction()` issues `BEGIN` / `COMMIT` / `ROLLBACK`
synchronously on the main connection and nests with savepoints (`session.ts:62-77, 85-95`).
Because every Drizzle call is synchronous (next section), nothing can interleave with a Drizzle
transaction, so the async hazard above is moot for Drizzle code. The flip side is that a 1,000-row
insert blocks the JS thread until it is done; a user hit exactly that
([drizzle-orm#5240](https://github.com/drizzle-team/drizzle-orm/issues/5240), open). Our sync pull
writes at most a few hundred rows per organization, inside one transaction; measure it in the sync
ticket, and keep the pull's write phase off the first paint.

**Deleting.** `deleteDatabaseAsync(name, directory?)` removes exactly one file
(`SQLiteDatabase.ts:673-676`, `SQLiteModule.swift:510-528`). Native throws
`DeleteDatabaseException` if that path is still in the connection cache (`SQLiteModule.swift:511-513`)
and `DatabaseNotFoundException` if the file does not exist (521-523). It does not touch `-wal` or
`-shm` sidecars, which matters only if we take the docs' tip to enable WAL (`sqlite.mdx:416-420`):
close first, and SQLite checkpoints and removes the sidecars on the last close.

## 2. The Drizzle driver

`drizzle-orm/expo-sqlite` exposes `drizzle(expoDb, config?)` which returns an
`ExpoSQLiteDatabase` with `$client` pointing at the `SQLiteDatabase`. The session runs everything
through `prepareSync` / `executeSync` / `getAllSync` (`session.ts:50, 132, 148, 168`) and the
dialect is `SQLiteSyncDialect` (`session.ts:25-28`). So `await db.select()...` resolves an
already-computed result; there is no async path, on purpose (the `patch-package` in #5240 shows
what an async one would take, and it is not small). Peer dependency: `expo-sqlite >=14.0.0`
(`npm view drizzle-orm@0.45.2 peerDependencies`), so 57.0.3 is fine.

Install line to use, not the one in the Drizzle docs:

```bash
npx expo install expo-sqlite            # resolves the SDK 57 build (57.0.3)
npm i drizzle-orm@0.45.2
npm i -D drizzle-kit@0.31.10 babel-plugin-inline-import@3.0.0
```

The Drizzle page ([connect-expo-sqlite](https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite))
says `npm i drizzle-orm@rc expo-sqlite@next`. Today `expo-sqlite@next` is 58.0.2, an SDK 58
preview, and `drizzle-orm@rc` is 1.0.0-rc.4. Neither is what we want on SDK 57 next to a 0.45.2
backend.

## 3. Live queries: `useLiveQuery`

Status: shipped in drizzle-orm 0.31.1 (June 2024,
[release note](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0311)) and unchanged
since. The whole implementation is 56 lines
([query.ts](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/expo-sqlite/query.ts));
the file is byte-for-byte the same on `main` (the 1.0 line), so nothing is coming.

What it does (`query.ts:20-49`): run the query once, subscribe to
`addDatabaseChangeListener`, and re-run the query when an event's `tableName` equals the name of
the query's root table (39-43). It returns `{ data, error, updatedAt }`; `data` starts as `[]` (or
`undefined` for a `findFirst`), there is no loading flag (14-18, 51-55). The `deps` array is the
effect's dependency list (49): the hook keeps the first query object until `deps` change, so a
query built from props needs those props in `deps`
([#2651](https://github.com/drizzle-team/drizzle-orm/issues/2651), closed as by design).

Limits, each traced to the source or an open issue:

1. Root table only. A `select().from(a).leftJoin(b)` re-runs on changes to `a`, never `b`; a
   relational `findMany({ with: ... })` re-runs on the root table only (`query.ts:21, 37-43`).
   [#2660](https://github.com/drizzle-team/drizzle-orm/issues/2660), open since 2024, last activity
   2026-05-27. The workaround people ship is the same hook with an explicit table list.
2. Subqueries and raw `sql` sources throw (`query.ts:23-26`).
3. One event per row, no coalescing. SQLite's update hook fires per row and the native side emits
   one `onDatabaseChange` per call with `tableName` and `rowId` (`SQLiteModule.swift:543-565`).
   A pull that upserts 300 vacations re-runs every mounted live query on that table 300 times,
   synchronously. [#2953](https://github.com/drizzle-team/drizzle-orm/issues/2953) (debounce) and
   [#4636](https://github.com/drizzle-team/drizzle-orm/issues/4636) (pause during bulk writes) are
   both open.
4. `DELETE FROM t` with no `WHERE` does not fire at all. SQLite's truncate optimization skips the
   hook ([update_hook docs](https://www.sqlite.org/c3ref/update_hook.html): "Nor is the update
   hook invoked when rows are deleted using the truncate optimization"), and so do rows removed by
   `ON CONFLICT REPLACE`. Reported as
   [#2620](https://github.com/drizzle-team/drizzle-orm/issues/2620), open; the thread's fix is
   `.where(sql\`1=1\`)`, which brings back limit 3. Drizzle's `onConflictDoUpdate`emits`ON CONFLICT DO UPDATE`, which fires as an update, so upserts are fine.
5. Events are not filtered by database path (`query.ts:39-43` looks at `tableName` only). With one
   database this is irrelevant.
6. Events only come from connections opened with `enableChangeListener: true`. The exclusive
   transaction's second connection copies the options (`SQLiteDatabase.ts:789`), so it fires too.

Recommendation in section 8: write our own hook. It is the same 56 lines plus a table list and a
microtask coalescer, and it removes limits 1, 3 and (for our usage) 4.

## 4. Migrations on device

The kit side. `driver: 'expo'` is one of five drivers
(`drizzle-kit/src/cli/validations/common.ts:64-67, 166`). It changes one thing: `generate` also
writes `migrations.js` next to the SQL files (`prepareGenerateConfig` sets
`bundle: driver === 'expo' || driver === 'durable-sqlite'`, `utils.ts:213`; `writeResult` emits
the file, `migrate.ts:1442-1444`). That file imports `./meta/_journal.json` and every
`./NNNN_tag.sql` and exports `{ journal, migrations: { m0000: ..., m0001: ... } }`
(`migrate.ts:1460-1480`). Importing `.sql` as a string is what `babel-plugin-inline-import` and
`config.resolver.sourceExts.push('sql')` are for
([docs](https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite)). `generate` needs no database
connection, so `drizzle.config.ts` is just:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "expo",
});
```

`drizzle-kit migrate`, `push` and `studio` all need a connection and cannot reach a phone, so
`generate` (and `check`) are the only kit commands in the mobile workflow. The schema file must
load in Node: no `react-native` or `expo-*` imports in `db/schema.ts`.

The runtime side. `drizzle-orm/expo-sqlite/migrator` exports `migrate(db, migrations)` and a
`useMigrations(db, migrations)` hook returning `{ success, error }`
([migrator.ts:41-47, 59-90](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/expo-sqlite/migrator.ts)).
`readMigrationFiles` splits each SQL string on `--> statement-breakpoint` (migrator.ts:23). The
dialect's `migrate` (`sqlite-core/dialect.ts:939-997`) then:

- creates `__drizzle_migrations (id, hash, created_at)` if missing (955-962);
- reads the newest `created_at` (964-968);
- opens one `BEGIN` (969) and, for every journal entry whose `when` is newer than that timestamp,
  runs each statement and inserts a row (972-990), then `COMMIT`.

Two consequences. Migrations are ordered by the journal's `when` timestamp, not by hash, so a
migration edited after it shipped silently does nothing on devices that already ran it; regenerate
instead. And an empty statement is fatal: `readMigrationFiles` keeps whitespace-only chunks, and on
`expo-sqlite` 57.0.1 an empty statement reached `sqlite3_clear_bindings` with a null pointer and
segfaulted every cold start ([drizzle-orm#6207](https://github.com/drizzle-team/drizzle-orm/issues/6207),
open 2026-08-29; native side [expo/expo#49066](https://github.com/expo/expo/issues/49066), fixed
2026-09-11 but not in any 57.x release, since 57.0.3 shipped the same day with "no user-facing
changes"). So on SDK 57: never leave a `drizzle-kit generate --custom` placeholder empty, and do
not hand-edit trailing breakpoints.

Where to run it: at startup, once, before any screen queries. The hook works but pushes a
"migrating" state into whatever renders it; `migrate()` inside the store's open sequence (our own
provider, section 8) is one line and blocks nothing visible. Migrations for a five-table schema are
a handful of `CREATE TABLE` statements and finish in milliseconds; there is no reason to show
them.

## 5. Wiping the store on sign-out

Two mechanisms, both verified against the native code:

**Delete the file.** `closeAsync()` on every connection, then
`deleteDatabaseAsync("flexi-day.db")`. Native refuses while the path is cached
(`SQLiteModule.swift:511-513`), which is a feature: a bug that leaves a connection open throws
loudly instead of leaving a half-deleted database. Next sign-in opens a fresh file and `migrate()`
recreates the schema, `__drizzle_migrations` included. This is also the dev "start over" button.

**Truncate every table.** `DELETE FROM` each table inside one Drizzle transaction, keeping
`__drizzle_migrations`. Faster (no re-migration) but it needs a list of tables that someone will
forget to extend, and bare deletes fire no change events (section 3, limit 4). Since sign-out
navigates away from every screen anyway, the missing events do not matter, but the
forgotten-table risk does.

Recommendation: delete the file. The ordering requirement (close, then delete) is why section 8
says not to use `SQLiteProvider`: its close runs in an effect cleanup we cannot await
(`hooks.tsx:209-226`), and with `useSuspense` the connection is a module-level singleton
(`hooks.tsx:162`) that only closes when a different `databaseName` is requested (`hooks.tsx:265-276`).
Owning the connection in a small store module makes the sequence `await close(); await delete();`
and nothing else.

Data at rest: iOS puts third-party app files in the "Protected Until First User Authentication"
class by default ([Apple Platform Security](https://support.apple.com/guide/security/data-protection-classes-secb010e978a/web):
"the default class for all third-party app data not otherwise assigned to a Data Protection
class"). That is what the map's "iOS file protection, no SQLCipher" decision relies on. If that ever
changes, `useSQLCipher: true` in the config plugin is the switch (`sqlite.mdx:595`).

## 6. Schema sharing with the backend

Short answer: the mobile schema is written by hand. Drizzle has no dialect-neutral table builder;
`pgTable` and `sqliteTable` are separate packages with separate column sets, and the backend files
would drag `drizzle-orm/pg-core`, `auth-schema.ts`, `organization-schema.ts` and `enumToPgEnum`
into a Metro bundle for nothing. Five tables is about a hundred lines.

What the backend actually uses in the five tables, and the sqlite-core column that stands in:

| Backend column (pg-core)                                                                       | sqlite-core equivalent                     | Note                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text("id").primaryKey()` everywhere (`group-schema.ts:9`, `vacation-schema.ts:35`, ...)       | `text("id").primaryKey()`                  | Same. Ids are text, not `uuid`; better-auth ids are 32-char alphanumerics                                                                           |
| `timestamp(..., { withTimezone: true })` (`vacation-schema.ts:58-82`, all `created_at` etc.)   | `text(...)` holding the ISO string         | Or `integer({ mode: "timestamp_ms" })` for `Date` objects. The sync JSON carries ISO strings; storing them as-is keeps row types equal to API types |
| `date("requested_day")` (`vacation-schema.ts:48`), `date("date")` (`bank-holiday-schema.ts:8`) | `text(...)` as `YYYY-MM-DD`                | pg-core already returns this as a string. Lexical order equals date order                                                                           |
| `time("start_time")`, `time("end_time")` (`vacation-schema.ts:49-50`)                          | `text(...)`                                | Presentation only per the backend comment (`vacation-schema.ts:52-56`)                                                                              |
| `pgEnum("vacation_type", ...)` (`vacation-schema.ts:30, 51`)                                   | `text({ enum: [...] })`                    | Type-level only, no runtime check ([docs](https://orm.drizzle.team/docs/column-types/sqlite)); add a `check()` if wanted                            |
| `boolean(...)` (`vacation-schema.ts:57`, `group-users-schema.ts:16-19`)                        | `integer({ mode: "boolean" })`             | SQLite has no boolean                                                                                                                               |
| `integer(...)` (`group-schema.ts:14-16`, `user-year-quotas-schema.ts:25-32`)                   | `integer(...)`                             | Same                                                                                                                                                |
| `integer("working_days").array()` (`group-schema.ts:18`)                                       | `text({ mode: "json" }).$type<number[]>()` | No arrays in SQLite                                                                                                                                 |
| `varchar("related_year", { length: 4 })` (`user-year-quotas-schema.ts:24`)                     | `text(...)`                                |                                                                                                                                                     |
| `.defaultNow()`, `.$onUpdate(...)`, `default(sql\`gen_random_uuid()::text\`)`                  | drop                                       | The server stamps every value; the phone stores what the pull delivers                                                                              |
| `.references(() => user.id, { onDelete: "cascade" })`                                          | drop                                       | Rows arrive in pull order, users are not in the store, and SQLite enforces FKs only with `PRAGMA foreign_keys=ON` anyway                            |
| `uniqueIndex(...).where(sql\`...\`)`, `index(...)`, `check(...)`                               | same builders exist in sqlite-core         | Partial indexes and checks are supported                                                                                                            |

`jsonb`, `uuid` and `numeric` do not appear in these five tables. `jsonb` is used elsewhere in the
backend (`attendance-schema.ts:168-169`, `report-export-schema.ts:17`) and would map to
`text({ mode: "json" })` if those tables ever sync.

The mobile schema also needs columns and tables the backend does not have: an `organization_id`
partition column on every row (only `groups` carries one server-side, `group-schema.ts:10`; the
sync pull has to supply it for vacations, memberships and quotas, and bank holidays are keyed by
country, not organization, which the sync ticket needs to settle), and a `sync_state` table for the
cursor so the cursor advances in the same transaction as the rows it covers.

What can be shared is the contract above the database: the `CalendarRecordType` values and the API
response shapes. The web already does this by hand-copying the enum into
`flexi-day/lib/api/types.ts:8`; the mobile repo does the same, or generates types from the
backend's OpenAPI output. Storing timestamps and dates as the strings the API sends is what makes
"row type equals API type" hold, which is the practical form of schema sharing available.

## 7. Dev experience

**Inspecting.** Two options, and the built-in one wins:

- The `expo-sqlite` inspector, shipped in 55.0.0 (CHANGELOG.md:139), is on by default in
  development with no setup: every `openDatabase*` call registers the connection
  (`SQLiteDevToolsClient.ts:7, 44-50`). `Shift+M` in the Expo CLI terminal, then "Open expo-sqlite"
  (`sqlite.mdx:514-516`). It browses tables, edits rows, runs SQL and exports the file.
- `expo-drizzle-studio-plugin` 0.2.1: `useDrizzleStudio(db)` at the root, `Shift+M`, pick the
  plugin ([README](https://github.com/drizzle-team/drizzle-studio-expo)). It is a no-op in
  production builds (`src/index.ts:3-9`). Peers `expo >=53.0.5`, `expo-sqlite >=15.2.9` are
  satisfied on SDK 57, but the last commit is 2025-10-11, the "blank page" report
  [#7](https://github.com/drizzle-team/drizzle-studio-expo/issues/7) is open with activity into
  2026, and the SDK 54 report [#23](https://github.com/drizzle-team/drizzle-studio-expo/issues/23)
  closed without a fix. Skip it unless someone misses Studio's relation view.

Both need `npx expo start` and work with a dev client
([dev tools plugins](https://docs.expo.dev/debugging/devtools-plugins/)).

**Wiping.** The sign-out path from section 5, behind a dev-only button in the app's settings
screen. There is no delete in the inspector.

**Schema iteration.** Change `db/schema.ts`, `npx drizzle-kit generate`, restart Metro (the
`.sql` imports are inlined at transform time, so a stale Metro cache serves old SQL; #6207's
reporter lost a morning to that). During early development it is fine to delete the `drizzle/`
folder and the on-device file and regenerate a single `0000` migration; once a build is on a phone
we care about, migrations only append.

## 8. New Architecture and Expo Router

**New Architecture.** There is no old one to worry about. React Native 0.82 (2025-10-08) made the
New Architecture the only architecture
([blog](https://reactnative.dev/blog/2025/10/08/react-native-0.82)), and Expo SDK 55 (2026-02-25)
removed `newArchEnabled` and the Legacy Architecture option
([changelog](https://expo.dev/changelog/sdk-55)); SDK 57 (2026-06-30) is on RN 0.86
([changelog](https://expo.dev/changelog/sdk-57)). `expo-sqlite` is an Expo Module built on
`SharedObject` (`NativeDatabase.swift:5`), so it never depended on the bridge, and its changelog
has no architecture entries since 55.

One report to keep in mind: [drizzle-orm#5736](https://github.com/drizzle-team/drizzle-orm/issues/5736)
(2026-05-08, no comments, unconfirmed) says drizzle-orm 0.45.x and 1.0-rc crash at boot on Hermes
with `TypeError: Cannot read property 'prototype' of undefined` in `applyMixins` when Metro's
`unstable_enablePackageExports` picks the ESM entry, in a project that re-exports Drizzle classes
from its own package. The Drizzle Expo guide has worked for everyone else on SDK 53 through 57, so
I rate it low. If it shows up, `config.resolver.unstable_enablePackageExports = false` in
`metro.config.js` is the switch.

**Expo Router.** No confirmed issue. The one report,
[expo/expo#44111](https://github.com/expo/expo/issues/44111) (`SQLiteProvider` around a `Stack`
stopping `Stack.Protected` from reacting to guard changes, reproduced on web only), closed as
stale in June 2026 without a maintainer verdict. It is another reason to not put `SQLiteProvider`
at the root. The shape that fits the map: the store provider lives in the signed-in group's
layout (`app/(app)/_layout.tsx`), so leaving that group on sign-out unmounts every consumer, and the
`Stack.Protected` guard reads session state, not the database.

Other open `expo-sqlite` issues worth knowing exist, none blocking:
[#49776](https://github.com/expo/expo/issues/49776) (iOS `EXC_BAD_ACCESS` in `getAll` from one
production app, 2026-09), [#40977](https://github.com/expo/expo/issues/40977) (some queries slower
since the SQLite 3.50 bump in SDK 53, planner-related), [#38168](https://github.com/expo/expo/issues/38168)
(FTS crash on close; we do not use FTS).

## 9. Which Drizzle

The docs' default is now `drizzle-orm@rc` (1.0.0-rc.4). The `expo` driver still exists on `main`
(`drizzle-kit/src/cli/validations/common.ts:66`, `utils.ts:147`), and `expo-sqlite/migrator.ts` and
`query.ts` are unchanged there. But 1.0 restructures the migrations folder (journal removed, one
folder per migration, `drizzle-kit up` to convert,
[upgrade guide](https://orm.drizzle.team/docs/sqlite/upgrade-v1)), removes RQB v1 for SQLite and
the `SQLiteSyncDialect` class (rc.4 notes), and the backend is on 0.45.2. Pinning the mobile repo
to `0.45.2` / `0.31.10` keeps one Drizzle to know across repos and one upgrade to do when 1.0
goes stable. The only thing lost is the newer migration folder layout, which a phone does not
care about.

## Recommendation

1. `expo-sqlite@57.0.3` via `npx expo install`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`,
   `babel-plugin-inline-import@3.0.0`. Pin, do not caret, until both repos move to 1.0 together.
2. Do not use `SQLiteProvider`. A `db/store.ts` module owns one connection opened with
   `openDatabaseSync("flexi-day.db", { enableChangeListener: true })`, runs `migrate()` right
   after opening, exposes the Drizzle instance through a small React context mounted in
   `app/(app)/_layout.tsx`, and exports `wipe()` = close, then `deleteDatabaseAsync`, then reopen
   on next sign-in. Sign-out and the device-id mismatch path both call `wipe()`.
3. Write `useStoreQuery(query, tables, deps)` in the app instead of importing `useLiveQuery`: the
   same subscription, an explicit table list, and one re-run per JS tick (coalesce events with
   `queueMicrotask` or a zero timer). Drizzle's hook is 56 lines; ours is about 70.
4. Hand-written `db/schema.ts` with the mapping in section 6: text ids, ISO strings for timestamps
   and dates, `integer({ mode: "boolean" })`, `text({ enum })` for the record type,
   `text({ mode: "json" })` for `working_days`, no foreign keys, `organization_id` on every table,
   plus `sync_state`. Copy the `CalendarRecordType` values the way the web does.
5. One migration folder `drizzle/` committed with `migrations.js`; `npm run db:generate` maps to
   `drizzle-kit generate`. Never an empty custom migration on SDK 57.
6. Inspect with the built-in `expo-sqlite` inspector (`Shift+M`). No Studio plugin.

## Facts later tickets depend on

- Packages: `expo-sqlite@57.0.3` (SDK 57), `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`,
  `babel-plugin-inline-import@3.0.0`. Peer floor `expo-sqlite >=14.0.0`.
- Config files: `drizzle.config.ts` with `dialect: "sqlite"`, `driver: "expo"`, schema at
  `./db/schema.ts`, output `./drizzle`, no credentials; `babel.config.js` plugin
  `["inline-import", { "extensions": [".sql"] }]`; `metro.config.js`
  `config.resolver.sourceExts.push("sql")`.
- Migration command: `npx drizzle-kit generate` produces `drizzle/NNNN_*.sql`,
  `drizzle/meta/_journal.json`, `drizzle/migrations.js`. Runtime: `migrate(db, migrations)` from
  `drizzle-orm/expo-sqlite/migrator`, called once after open. Migration log table
  `__drizzle_migrations`.
- Database file: `flexi-day.db` in `defaultDatabaseDirectory`, opened with
  `enableChangeListener: true`, one connection, owned by `db/store.ts`, not `SQLiteProvider`.
- Wipe: `await db.$client.closeAsync(); await deleteDatabaseAsync("flexi-day.db")`. Native throws
  if the connection is still open, and `DatabaseNotFoundException` if the file is already gone.
- Live queries: app-owned `useStoreQuery(query, tables, deps)`, not `useLiveQuery`. Bare
  `DELETE FROM t` fires no events; deletes by id do.
- Inspector: built into `expo-sqlite` since 55.0.0, plugin name `expo-sqlite`, opened with
  `Shift+M` then "Open expo-sqlite". The Drizzle Studio plugin is `expo-drizzle-studio-plugin`
  0.2.1 and is not recommended.
- Schema: hand-written `db/schema.ts` using sqlite-core; timestamps and dates stored as the ISO
  strings the API sends; `organization_id` on every table; `sync_state` table for the cursor.
- Open question for the sync ticket: bank holidays are per country server-side
  (`bank-holiday-schema.ts:8-11`); decide whether the phone partitions them by organization or by
  the countries of the user's groups.
