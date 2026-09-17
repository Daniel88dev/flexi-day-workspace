# App Attest: what binding the native session to it would cost

Resolves [workspace #18](https://github.com/Daniel88dev/flexi-day-workspace/issues/18), part of
the mobile map [#12](https://github.com/Daniel88dev/flexi-day-workspace/issues/12). Written
2026-09-15; every URL below was read on that date. The question is not "build App Attest" but
"what must the device id column and header look like today so App Attest fits later without a
migration", plus an honest estimate of the later work.

Short version: App Attest needs the paid Apple Developer Program, so it cannot even be tried on the
free personal team the map uses. The key id it would produce is a 44-character base64 string, which
the backend's UUID-only header check rejects today. Loosen that check to a bounded opaque string and
keep the column `text`, and the door stays open at zero cost. Building it later is roughly a week
across both repos, and for this product it buys close to nothing while the web sign-in path exists.

| What                       | Version or state, 2026-09-15                                |
| -------------------------- | ----------------------------------------------------------- |
| `better-auth` (backend)    | `^1.7.4` (`flexi-day-be/package.json`)                      |
| `@expo/app-integrity`      | 57.0.2 latest, 58.0.0 `next`, alpha; published 2026-09-11   |
| `node-app-attest`          | 1.0.1, last release 2026-02-20, 47 stars, 7 open issues     |
| `appattest-checker-node`   | 1.0.3, last commit 2024-10-13                               |
| `app-attest-server`        | 1.0.2, 2025-12-01, 1 star, bundles sqlite3                  |
| Apple `DCAppAttestService` | iOS 14+, macOS 27+ (WWDC26 session 201)                     |
| Backend header today       | `x-client-device-id`, UUID regex only, log correlation only |

## Where the backend stands today

- CORS allowlists `x-client-device-id` (`flexi-day-be/src/middleware/cors.ts:24`).
- `requestContext` reads it through `acceptClientId`, which keeps the value only if it matches
  `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` and drops anything else
  (`flexi-day-be/src/middleware/requestContext.ts:20,31-33,38`). The comment says why: the value is
  attacker-controlled and headed for logs, so only the exact shape the frontend mints is accepted. A
  test pins the drop for a 500-character value
  (`flexi-day-be/src/tests/middleware/requestContext.test.ts:115-128`).
- The `session` table has no device column yet (`flexi-day-be/src/db/schema/auth-schema.ts:24-37`).
  [#14](https://github.com/Daniel88dev/flexi-day-workspace/issues/14) settled how it gets one:
  `session.additionalFields.deviceId` plus a `device_id` column, stamped in
  `databaseHooks.session.create.before`, checked in `hooks.before`
  ([native-session-transport.md](https://github.com/Daniel88dev/flexi-day-workspace/blob/research/native-session-transport/docs/research/native-session-transport.md)).
  better-auth's `additionalFields` takes `type: "string"` with no length
  ([Extending core schema](https://www.better-auth.com/docs/concepts/database)).

## How App Attest works

Source: Apple,
[Establishing your app's integrity](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)
and [DCAppAttestService](https://developer.apple.com/documentation/devicecheck/dcappattestservice).

1. Check `DCAppAttestService.shared.isSupported`. Apple: "Not all devices can use the App Attest
   service", and if the check fails "gracefully bypass the service", with the server then unable to
   require assertions.
2. `generateKey()` creates a P-256 key pair in the Secure Enclave and returns a `String` key
   identifier. Apple: "there's no way to use the key without the identifier, and no way to get the
   identifier later". WWDC26 adds the definition: "App Attest returns a hash of the public key to
   your app", to be stored in the Keychain
   ([WWDC26 session 201](https://developer.apple.com/videos/play/wwdc2026/201/), 5:02).
3. `attestKey(keyId, clientDataHash:)` sends the key to Apple with the SHA-256 of a one-time server
   challenge ("at least 16 bytes") and returns an attestation object. This is the only step that
   talks to Apple. On `DCError.serverUnavailable` retry with the same key; on any other error discard
   the key and mint a new one.
4. `generateAssertion(keyId, clientDataHash:)` signs a hash of the request plus a fresh server
   challenge, locally, no Apple round trip. Apple: "There's no restriction on the number of
   assertions that you can make with a key", but "you typically reserve assertions for requests made
   at sensitive moments". WWDC26 adds that assertions "have CPU impact" and that the server must see
   a strictly increasing counter.
5. Keys "remain valid through regular app updates, but don't survive app reinstallation, device
   migration, or restoration of a device from a backup". One key per user per device; Apple says not
   to share a key across users.

Rate limits, from
[Preparing to use the App Attest service](https://developer.apple.com/documentation/devicecheck/preparing-to-use-the-app-attest-service):
attestation "fewer than 100 request per second across all installations", ramp no more than "10
million users per day per app", and "Apple servers might throttle attestation traffic". Irrelevant
at Flexi Day's size, but it means attestation must be server-initiated with backoff, not a retry
loop in the app.

## The key id: format and length

Apple's server steps say to "Create the SHA256 hash of the public key in `credCert` with X9.62
uncompressed point format, and verify that it matches the key identifier from your app", and that
the authenticator data's `credentialId` "is the same as the key identifier"
([Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server)).
Apple never spells out the string encoding. Both maintained Node verifiers compare the app's key id
to the standard base64 of that SHA-256:

- `node-app-attest`: `createHash("sha256").update(publicKey).digest("base64") !== keyId` and
  `credentialId.toString("base64") !== keyId`
  ([verifyAttestation.js](https://github.com/uebelack/node-app-attest/blob/main/src/verifyAttestation.js)
  lines 154-158, 196).
- `appattest-checker-node`: `publicKeyHash.toString('base64') === inputs.keyId` and
  `credId.toString('base64') === inputs.keyId`
  ([attestation.ts](https://github.com/srinivas1729/appattest-checker-node/blob/main/src/attestation.ts)
  lines 169, 217).

So a key id is 32 bytes as standard base64: exactly 44 characters, alphabet `A-Za-z0-9+/`, one
trailing `=`. Not URL-safe, not a UUID, not hex. It is opaque; there is nothing to parse inside it.

## What the server verifies

From
[Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server).

Attestation, once per key. The object is CBOR with `fmt: "apple-appattest"`, an `attStmt` holding
the `x5c` certificate chain and a `receipt`, and WebAuthn-style `authData`. Steps: verify `x5c`
against Apple's App Attest root CA; recompute the nonce as SHA-256 of `authData` plus the SHA-256
of the challenge and match it against the leaf certificate extension OID `1.2.840.113635.100.8.2`;
hash the leaf's public key and match the key id; hash the App ID (`<team id>.<bundle id>`) and match
the 32-byte RP ID; `counter` must be `0`; `aaguid` must be `appattestdevelop` or `appattest`
followed by seven zero bytes; `credentialId` must equal the key id. iOS 27 appended an `extensions`
dictionary with `validationCategory` (App Store, TestFlight, development-signed, and so on) and
`bundleVersion`, which Apple now lists as steps to verify too. Then "Store the verified public key
from `credCert` on your server and associate it with the user for the specific device", and store
the receipt "immediately". "Be prepared to store multiple (key, receipt) pairs for each user."

Assertion, per protected request. CBOR with `signature` and `authenticatorData`. Steps: SHA-256 of
`clientData`; nonce is SHA-256 of `authenticatorData` plus that hash; verify the signature with the
stored public key; match the RP ID hash; `counter` must exceed the stored one; the embedded
challenge must match the one the server issued; on iOS 27, check the same `extensions`. Then "Store
`counter` to use in step 5 when verifying the next assertion". That last sentence is the hidden
cost: every asserted request is a database write.

The receipt is a PKCS#7 container. Posting it to
`https://data-development.appattest.apple.com/v1/attestationData` (sandbox) or
`https://data.appattest.apple.com/v1/attestationData` (production) with an APNs-style JWT returns a
new receipt carrying a per-device count of attested keys over 30 days
([Assessing fraud risk](https://developer.apple.com/documentation/devicecheck/assessing-fraud-risk),
WWDC26 16:27). Optional, and Apple says to treat it as a signal, not a block.

## Where it runs, and where it does not

### Simulator

Apple's `isSupported` page lists Macs and most app extensions as unsupported
([isSupported](https://developer.apple.com/documentation/devicecheck/dcappattestservice/issupported)).
Expo's docs are blunter: "App Attest is not supported on iOS Simulator"
([AppIntegrity](https://docs.expo.dev/versions/latest/sdk/app-integrity/)), and so is
`react-native-app-attest`: "Works on real devices only (Secure Enclave required)"
([README](https://github.com/Gautham495/react-native-app-attest)). The app must branch on
`isSupported` and the server must tolerate a session with no attestation, which Apple itself
prescribes.

### Development builds and the environment entitlement

Entitlement `com.apple.developer.devicecheck.appattest-environment`, values `development` or
`production`
([App Attest Environment](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.devicecheck.appattest-environment)).
Apple: "If you omit the entitlement during development, your app uses the App Attest sandbox
servers by default", and "After distributing your app through TestFlight, the App Store, or the
Apple Developer Enterprise Program, your app ignores the entitlement you set and uses the production
environment." Sandbox keys produce `aaguid = appattestdevelop`, do not count toward the device's
risk metrics, and "Keys you create in the sandbox environment don't work in the production
environment." The server therefore needs an "allow development aaguid" switch that is off in
production; `node-app-attest` exposes it as `allowDevelopmentEnvironment`.

Adding the capability in Xcode writes the entitlement with `development`. Under continuous native
generation there is no checked-in `ios/`, so it goes into `app.json` as `ios.entitlements`
("Dictionary of arbitrary configuration to add to your standalone app's native \*.entitlements",
[app.json reference](https://docs.expo.dev/versions/latest/config/app/)). `@expo/app-integrity`
ships no config plugin (no `app.plugin.js` or `plugin/` in
[packages/expo-app-integrity](https://github.com/expo/expo/tree/main/packages/expo-app-integrity)),
so that one line is the whole native configuration.

### Free Apple ID personal team: no

This is the fact the map's device-testing decision runs into. Apple's
[Supported capabilities (iOS)](https://developer.apple.com/help/account/reference/supported-capabilities-ios/)
table has three columns, ADP (paid Apple Developer Program), ADEP (paid enterprise), and "Apple
Developer", defined as "Apple Account holders who have agreed to the Apple Developer Agreement ...
No cost is associated with this agreement and developers can't distribute apps." The App Attest row
is ticked under ADP and ADEP and empty under Apple Developer, same as Push notifications. Keychain
sharing is ticked in all three. Xcode's capability picker "displays only the capabilities available
to the target platform and your program membership"
([Adding capabilities to your app](https://developer.apple.com/documentation/xcode/adding-capabilities-to-your-app)),
so App Attest will not appear for the personal team, and an Apple engineer on the forums states the
rule that stops a hand-written entitlement: "The provisioning profile and your project entitlements
must match, and a provisioning profile will not include an otherwise non-existent entitlement entry"
([forum thread 804117](https://developer.apple.com/forums/thread/804117), October 2025).

Two consequences. First, App Attest cannot be exercised on the user's iPhone until the $99/year
program is bought, which the map lists as out of scope, so any implementation ticket is blocked on a
purchase, not on code. Second, even if a sandbox key were somehow minted under the personal team,
the RP ID is the SHA-256 of `<team id>.<bundle id>`, and the personal team has its own team id, so
every key would fail RP ID verification the day the app moves to a paid team. Nothing attested
before the program exists is worth keeping.

I did not try the negative case on a device (adding the entitlement by hand under the personal team
and calling `attestKey`). The capability table is Apple's own statement; a 30-minute spike would
only confirm which error code comes back.

## Client modules

| Package                             | Version, date                      | Expo fit                                                                                                                       |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@expo/app-integrity`               | 57.0.2 (2026-09-11), 58.0.0 `next` | First-party Expo module, in the `expo/expo` monorepo, alpha ("will frequently experience breaking changes"). The right choice. |
| `react-native-app-attest`           | 2.0.1 (2025-11-19), 4 stars        | TurboModule for bare RN; README: "Pull requests are welcome, especially for Expo support (via custom config plugins)".         |
| `react-native-ios-appattest`        | 1.0.1 (2024-10-16), 13 stars       | Bare RN, paired with `appattest-checker-node`; no commits since 2024.                                                          |
| `@pagopa/io-react-native-integrity` | 0.3.2 (2026-06-26), 17 stars       | Italian public-sector wallet app's bridge; iOS half wraps `DCAppAttestService`; active, but its API is shaped for that app.    |
| `expo-app-integrity` (jeffDevelops) | 0.3.0 (2023-04-09)                 | Dead; peers pinned to `expo-secure-store ~12` (SDK 48 era). Not the Expo package despite the name.                             |

`@expo/app-integrity`'s iOS surface is three calls and a constant, read from
[IntegrityModule.swift](https://github.com/expo/expo/blob/main/packages/expo-app-integrity/ios/IntegrityModule.swift):
`isSupported`, `generateKeyAsync(): Promise<string>` (returns Apple's key id verbatim),
`attestKeyAsync(keyId, challenge)` and `generateAssertionAsync(keyId, challenge)`, both of which
SHA-256 the UTF-8 challenge string themselves and return the CBOR object as standard base64.
`DCError` codes map to `ERR_APP_INTEGRITY_*` exceptions. The docs page carries `sdk-57` in its
source link and lists the package as included in Expo Go, which is moot: Expo Go's bundle id would
never match `com.flexiday.app`'s RP ID.

The map pins Expo SDK 57 for NativeWind and expo-sqlite
([#15](https://github.com/Daniel88dev/flexi-day-workspace/issues/15),
[#16](https://github.com/Daniel88dev/flexi-day-workspace/issues/16)); `@expo/app-integrity@57.0.2`
is the matching line and its changelog since 56.0.0 is "no user-facing changes"
([CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-app-integrity/CHANGELOG.md)).

## Node verifiers

| Package                  | State, 2026-09-15                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-app-attest`        | 1.0.1, MIT, `verifyAttestation` / `verifyAssertion`, deps `asn1js`, `cbor`, `pkijs`. Commits through 2026-02; dependabot bumps open. Issue from 2026-08-02 asks for the iOS 27 `extensions` check, unanswered. |
| `appattest-checker-node` | 1.0.3, Apache-2.0, TypeScript, `@peculiar/x509`; last commit 2024-10-13 (`npm audit fix`). Ships Apple's root CA with a `setAppAttestRootCertificate` override.                                                |
| `app-attest-server`      | 1.0.2, one star, `sqlite3` as a runtime dependency because it owns its own storage. Not a fit for a Drizzle backend.                                                                                           |

Neither of the first two verifies the iOS 27 `extensions` (validation category, bundle version).
Apple lists those as verification steps now, so a 2026 implementation either patches the library or
parses `authData` past byte 37 itself. That is a real gap, not a nit: it is the check that would
catch a TestFlight or development-signed binary talking to production.

API shape of `node-app-attest`, from its
[README](https://github.com/uebelack/node-app-attest#readme):
`verifyAttestation({ attestation, challenge, keyId, bundleIdentifier, teamIdentifier, allowDevelopmentEnvironment })`
returns `{ keyId, publicKey, receipt, environment }`;
`verifyAssertion({ assertion, payload, publicKey, bundleIdentifier, teamIdentifier, signCount })`
returns `{ signCount }`. Synchronous, no I/O.

## Backend cost if it is ever built

What the session row would carry, alongside the existing random device id:

| Column               | Type                    | Why                                                                   |
| -------------------- | ----------------------- | --------------------------------------------------------------------- |
| `attest_key_id`      | `text`, 44 chars        | The App Attest key id; lookup key for the assertion check             |
| `attest_public_key`  | `text` (PEM)            | Verifies every assertion; Apple: store it, and check it is not reused |
| `attest_receipt`     | `text` (base64 PKCS#7)  | Fraud metric later; Apple says store it at attestation time           |
| `attest_counter`     | `integer`               | Last assertion counter; must strictly increase; written per assertion |
| `attest_environment` | `text`, `dev` or `prod` | Sandbox and production keys never mix; keep them apart                |

Separate columns, not an overload of `device_id`: the key id is per user per device per install
and rotates on reinstall or restore, whereas the SecureStore device id outlives a reinstall (#14).
Apple's WWDC26 advice is "Don't reject new keys outright" and "do not invalidate keys from previous
attestations for a user immediately", which is the opposite of the map's "mismatch revokes". The two
identifiers have different lifetimes and different failure semantics; conflating them would make
every reinstall look like a stolen session.

Endpoints and hooks:

1. `POST /api/auth/attest/challenge`: mint 32 random bytes, store with a short TTL (the
   `verification` table already exists for this shape), return base64. One per attestation and one
   per assertion.
2. `POST /api/auth/attest/verify`: body `{ keyId, challenge, attestation }`; `verifyAttestation`;
   reject if the public key is already bound to another user; write the five columns onto the
   caller's session. Rate-limit it like `send-otp`.
3. Assertion check: cheapest placement is the same `hooks.before` that #14 chose for the device-id
   mismatch, reading an `x-app-assertion` header (base64 CBOR) plus the challenge, running
   `verifyAssertion` and writing `attest_counter`. Per-request assertions on a sync-pull app mean a
   session-row write on every pull; asserting only sign-in and the sync pull keeps that to a handful
   per day per device.
4. Config: `APPLE_TEAM_ID`, bundle id, an `ATTEST_ALLOW_DEV` flag, in `config.ts` and Terraform
   (App Runner env), per the workspace rule that env additions are not done until Terraform has
   them.
5. iOS 27 `extensions` parsing on top of the library, or a fork.

Estimate, with the backend's existing test conventions (unit plus e2e, OpenAPI blocks on routes):
two to four days. Client side, with `@expo/app-integrity`: key mint and Keychain storage on first
launch, the challenge and attest round trip after sign-in, an `onRequest` hook on the better-auth
client (`fetchOptions` accepts any better-fetch option,
[client docs](https://www.better-auth.com/docs/concepts/client)) that fetches a challenge and
attaches an assertion for the chosen routes, and `isSupported` branches everywhere: one to two days.
Plus the Apple Developer Program at $99/year, the App Attest capability on the `com.flexiday.app`
App ID, and a device to test on, since none of it runs in the simulator. Call it a week of work
gated on a purchase.

## What the column and header should look like today

The only thing that would force a migration later is a constraint. `device_id text` with no length
and no format check accepts a UUID today and a 44-character base64 key id, or anything else, later.
Postgres `text` has no cost over `varchar(n)`. Do not add a `CHECK` on UUID shape.

The header is the real blocker, and it is code, not schema. `acceptClientId` drops anything that is
not a UUID, so a client sending a base64 key id in `x-client-device-id` would be logged as if it
sent nothing. Loosen it to a bounded opaque check, something like `/^[A-Za-z0-9+/=_.:-]{8,128}$/`,
which still refuses the 500-character and SQL-shaped values the tests pin, still keeps logs clean,
and covers UUID, base64, base64url and a prefixed form. That is a one-line change plus a test, and
it belongs in the ticket that adds the device-id column so the header contract is set once.

Do not put structure in the value ("attest:" prefixes and the like). The session row knows which
kind of binding it holds because the attest columns are null or not; the header stays an opaque
device id. If App Attest lands, the app keeps sending the random device id in `x-client-device-id`
and sends the assertion in its own header, so `x-client-device-id` never changes meaning.

## Recommendation

Store today: `device_id text` on `session`, nullable, no format constraint, stamped only when the
header is present; and widen `acceptClientId` to a bounded opaque pattern in the same ticket. That
is the entire forward-compatibility cost, and it is close to zero.

App Attest itself is not worth a follow-up ticket for this product now, for three reasons that
compound:

1. It cannot run on the personal team, so it is blocked on the Apple Developer Program, which the
   map keeps out of scope until a store release is in sight.
2. It proves the binary, not the person. Flexi Day's backend serves the same password + 2FA sign-in
   to a browser SPA. An attacker who wants to script vacation bookings uses the web path, which App
   Attest never touches. Until there is a native-only endpoint worth protecting (push token
   registration is the first candidate on the map's "not yet specified" list), attesting the native
   path gates nothing.
3. Its natural per-request form is a database write per request and a challenge round trip before
   each protected call, on an app whose design goal is one delta pull on foreground.

Revisit when the program is bought and a native-only surface exists. At that point the work is a
week, and the shape recorded here means no migration.

## Facts later tickets depend on

- App Attest is unavailable to the free "Apple Developer" tier; it needs ADP or ADEP (Apple's
  Supported capabilities table). Not testable on the map's Xcode personal-team setup.
- Not supported on the iOS Simulator, on Macs, or in most app extensions; gate on `isSupported` and
  let the server accept unattested sessions.
- Key id: SHA-256 of the X9.62 uncompressed public key, standard base64, 44 characters, alphabet
  `A-Za-z0-9+/` plus one `=`. Opaque. Rotates on reinstall, restore or migration.
- RP ID = SHA-256 of `<team id>.<bundle id>`. A team change invalidates every key.
- Entitlement `com.apple.developer.devicecheck.appattest-environment`, `development` or
  `production`; omitted means sandbox during development; ignored (production) after TestFlight or
  App Store distribution. Set via `ios.entitlements` in `app.json` under CNG.
- Sandbox `aaguid` is `appattestdevelop`; production is `appattest` + seven zero bytes. The
  verifier needs an environment switch; sandbox and production keys and receipts never cross.
- Attestation is CBOR: `fmt`, `attStmt { x5c, receipt }`, `authData`. Assertion is CBOR:
  `signature`, `authenticatorData`. iOS 27 adds `extensions` (`validationCategory`,
  `bundleVersion`) that Apple lists as verification steps and no Node library checks yet.
- Server stores per key: public key, receipt, last counter, environment. Counter must strictly
  increase, so each verified assertion is a write.
- Client module: `@expo/app-integrity@57.0.2` (alpha), `isSupported`, `generateKeyAsync`,
  `attestKeyAsync(keyId, challenge)`, `generateAssertionAsync(keyId, challenge)`; challenges are
  strings the module hashes; results are base64. No config plugin.
- Server library: `node-app-attest@1.0.1` (`verifyAttestation`, `verifyAssertion`,
  `allowDevelopmentEnvironment`), maintained through 2026-02; `appattest-checker-node` frozen since
  2024-10.
- Apple rate guidance: under 100 attestations per second app-wide; attestation must be
  server-initiated with backoff.
- Backend today: `x-client-device-id` is CORS-allowlisted and UUID-only in
  `requestContext.ts:31-33`; `session` has no device column; the column and the loosened header
  check belong in the same ticket.
