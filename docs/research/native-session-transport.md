# Native session transport: better-auth `expo` vs `bearer`

Resolves [workspace #14](https://github.com/Daniel88dev/flexi-day-workspace/issues/14), part of
the mobile map [#12](https://github.com/Daniel88dev/flexi-day-workspace/issues/12). Written
2026-09-15 against the versions the backend actually runs.

| What                           | Version                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `better-auth` (backend)        | 1.7.4, `flexi-day-be/package.json:54` (`^1.7.4`), installed 1.7.4       |
| `@better-auth/expo`            | 1.7.4 tag, read from GitHub; peer-pinned to the same `better-auth` line |
| Expo docs page for better-auth | describes SDK 55; the package's devDependencies are SDK 56 packages     |

Source citations point at the installed build under `flexi-day-be/node_modules/better-auth/dist/`
(abbreviated `dist/`) or at the `v1.7.4` tag of `better-auth/better-auth` on GitHub.

## Where the backend stands today

- The session travels as a signed cookie only. `authSession` calls `auth.api.getSession` with the
  raw Node headers (`flexi-day-be/src/middleware/authSession.ts:19-21`); nothing reads an
  `Authorization` header.
- Cookie names are `better-auth.session_token` and, for two-factor, `better-auth.two_factor`. In
  production `BETTER_AUTH_URL` is https, so both get the `__Secure-` prefix
  (`dist/cookies/index.mjs:23,32`).
- `trustedOrigins` comes from `TRUSTED_ORIGINS`, comma-separated, defaulting to
  `http://localhost:3000` (`flexi-day-be/src/config.ts:296`). The same list is the production CORS
  allowlist (`flexi-day-be/src/middleware/cors.ts:6-12`).
- `otpSendLimiter` keys `send-otp` on the challenge cookie, read straight off `req.headers.cookie`
  with a regex that already tolerates `__Secure-` (`flexi-day-be/src/middleware/limiter.ts:115-121`).
- CORS already allowlists an `x-client-device-id` request header and `requestContext` accepts it
  when it is a UUID, for log correlation only (`flexi-day-be/src/middleware/cors.ts:24`,
  `flexi-day-be/src/middleware/requestContext.ts:31-38`). The web app deliberately never sends it
  (`flexi-day/lib/observability/session.ts:1-4`).

## What each plugin changes server-side

### `bearer`

Source: `dist/plugins/bearer/index.mjs` (70 lines, all of it).

- A `before` hook fires on any request with an `Authorization` header. For `Bearer <token>` it
  accepts either the signed form `token.signature` or a bare token (re-signed with the secret unless
  `requireSignature` is set), verifies the HMAC, and then writes the value into the `Cookie` header
  of better-auth's own request context under the session cookie name (lines 27-46). Express's
  `req.headers.cookie` is untouched; only better-auth sees a cookie.
- An `after` hook fires on every response. If the response sets the session cookie with a non-zero
  max-age, it copies the cookie value into a `set-auth-token` response header and adds that name to
  `Access-Control-Expose-Headers` (lines 50-66). It does this for every client, browsers included,
  so once the plugin is on, page JavaScript on the web origin can read the raw session token off the
  sign-in response. `httpOnly` no longer protects the token against XSS. Suppressing that for web
  callers needs a custom after hook.
- Only the session cookie is mirrored. The two-factor challenge cookie is not (line 55 checks
  `authCookies.sessionToken.name` and nothing else).
- The `before` hook reads `c.headers` as well as `c.request.headers` (line 27), so it also works
  when Express calls `auth.api.getSession({ headers })` without a `Request`. `authSession` would
  keep working unchanged.

### `expo` (server half of `@better-auth/expo`)

Source:
[packages/expo/src/index.ts@v1.7.4](https://github.com/better-auth/better-auth/blob/v1.7.4/packages/expo/src/index.ts).

- `onRequest`: when a request has no `origin` header but carries `expo-origin`, it copies
  `expo-origin` into `origin` (lines 36-60). That is the whole mechanism by which a native POST
  passes the origin check.
- `init` appends `exp://` to `trustedOrigins`, but only when `process.env.NODE_ENV ===
"development"` (lines 26-35). The backend runs with `NODE_ENV=dev` (`config.ts:112-119` accepts
  `dev`, not `development`), so this never triggers here. Anything native must be listed in
  `TRUSTED_ORIGINS` by hand.
- An `after` hook on `/callback`, `/magic-link/verify` and `/verify-email` moves the `set-cookie`
  value into the redirect URL's `?cookie=` query (lines 61-106). OAuth only; the map keeps OAuth on
  the web.
- It mounts one endpoint, `GET /expo-authorization-proxy`, which redirects to an external https
  authorization URL
  ([routes.ts@v1.7.4](https://github.com/better-auth/better-auth/blob/v1.7.4/packages/expo/src/routes.ts)).
  It would appear at `/api/auth/expo-authorization-proxy` on the backend and the file carries its
  own `FIXME` about being an open redirect to any https host. The implementation ticket should
  disable it; better-auth's option list has a "Disabled paths" entry right after `hooks`
  (`@better-auth/core/dist/types/init-options.d.mts:1503-1505`), to be confirmed as
  `disabledPaths: ["/expo-authorization-proxy"]`.
- The server entry imports only `@better-auth/core`, `better-auth/api` and `zod`. No React Native
  code reaches the backend bundle.

### Can they coexist?

Yes, mechanically. `bearer` rewrites the request cookie header inside better-auth, `expo` rewrites
the origin header; neither touches the other's field, and user-level `hooks.before`/`after` run
before plugin hooks in plugin-array order (`dist/api/dispatch.mjs:137-167`). Two things to watch if
both were ever enabled:

- Plugin order matters for `bearer` next to `twoFactor`. The credential sign-in creates a session
  and sets its cookie; the `twoFactor` after hook then deletes that session and expires the cookie
  (`dist/plugins/two-factor/index.mjs`, the `deleteSessionCookie(ctx, true)` block). If `bearer` is
  listed before `twoFactor`, its after hook runs first, sees the live cookie, and emits a
  `set-auth-token` for a session that is deleted a moment later. Listed after, it sees max-age 0 and
  stays quiet.
- There is no reason to run both. Pick one transport per client.

## Two-factor across each transport

How the challenge works (`dist/plugins/two-factor/index.mjs`, after-hook on `/sign-in/email`):
the plugin deletes the just-created session, stores a `2fa-<random>` verification row, sets it as
a signed `better-auth.two_factor` cookie with `twoFactorCookieMaxAge` (default 600 s), and answers
`{ twoFactorRedirect: true, twoFactorMethods }`. `send-otp` and `verify-otp` both call
`verifyTwoFactor`, which reads that cookie with `ctx.getSignedCookie` from the request's `Cookie`
header (`dist/plugins/two-factor/verify-two-factor.mjs:14-22`). On success `verify-otp` creates the
real session, sets the session cookie, and expires the challenge cookie (lines 31-40).

### Under `expo`

Survives untouched. The client stores every `Set-Cookie` whose name (after stripping `__Secure-`)
starts with `cookiePrefix`, default `better-auth`
([client.ts@v1.7.4#L215-L247](https://github.com/better-auth/better-auth/blob/v1.7.4/packages/expo/src/client.ts#L215-L247)),
and sends the whole jar back as a `Cookie` header on every request (lines 480-487). So
`better-auth.two_factor` is stored after sign-in, forwarded on `sendOtp`/`verifyOtp`, and dropped
when the server expires it (max-age 0 deletes the entry, lines 89-92).

`otpSendKey` keeps working: the forwarded header is a normal `Cookie` header containing
`better-auth.two_factor=<value>`, which the regex at `limiter.ts:116` matches. Per-challenge keying
holds; no change to the limiter.

### Under `bearer`

Does not survive on its own. `set-auth-token` never carries the challenge cookie, so the app would
have to read `set-cookie` off the sign-in response itself, keep the `better-auth.two_factor` value,
and send it as a `Cookie` header on `send-otp` and `verify-otp`. Two consequences:

- The moment a request carries a `Cookie` header, better-auth's origin check demands an `Origin`
  (or `Referer`) header on POST and 403s with `MISSING_OR_NULL_ORIGIN` without one
  (`dist/api/middlewares/origin-check.mjs:101-111`). A bearer client doing 2FA therefore also needs
  either the `expo` server plugin plus an `expo-origin` header, or to set `Origin` itself.
- `otpSendKey` would work only because of that manual forwarding. Requests without the cookie fall
  back to the IP key (`limiter.ts:119`), which pools everyone behind one NAT, the case the limiter
  doc explicitly rejects.

In short, bearer re-implements the cookie jar for one cookie and still needs the expo origin trick.

## `trustedOrigins` for a native client

- Every native POST from the expo client carries `expo-origin: <scheme>://`, built with
  `Linking.createURL("", { scheme })`
  ([client.ts@v1.7.4#L148-L151,L485](https://github.com/better-auth/better-auth/blob/v1.7.4/packages/expo/src/client.ts#L148-L151)).
  The server plugin copies it into `origin`, and `validateOrigin` matches it against
  `trustedOrigins` (`origin-check.mjs:112-117`).
- Matching for custom schemes is scheme plus optional authority plus optional path prefix
  (`dist/auth/trusted-origins.mjs:88-104`). The entry `flexiday://` matches origin `flexiday://`
  exactly. Wildcards (`exp://**`, `exp://192.168.*.*:*/**`) go through `wildcardMatch` (line 90-95).
- With a dev client or a standalone build the scheme is the app's own, so `flexiday://` is the only
  entry needed. `exp://` patterns are for Expo Go, where `createURL` yields `exp://<host>:<port>`;
  the docs list `exp://`, `exp://**` and `exp://192.168.*.*:*/**` for that case
  ([docs/integrations/expo](https://www.better-auth.com/docs/integrations/expo)). The map rules Expo
  Go out, so leave them off unless someone runs it.
- `TRUSTED_ORIGINS` is also the production CORS allowlist. A `flexiday://` entry there is inert for
  CORS: no browser ever sends that `Origin`.
- `GET` requests (`get-session`) skip the origin check entirely (`origin-check.mjs:44`), so
  `authSession` is unaffected either way.

## Per-client lifetime, extra session columns, device binding

### What the config can express

- `session.expiresIn` and `session.updateAge` are plain numbers, one value for everyone
  (`@better-auth/core/dist/types/init-options.d.mts:910-922`). No per-request function exists.
- `session.additionalFields` is supported through `BetterAuthDBOptions` (line 195). A `deviceId`
  column is `session: { additionalFields: { deviceId: { type: "string", required: false, input:
false } } }` plus a `device_id` column on `session` in
  `flexi-day-be/src/db/schema/auth-schema.ts` and a migration. Additional fields come back on
  `session.session` (`returned` defaults to true), so `authSession` can read
  `session.session.deviceId`.
- `databaseHooks.session.create.before(session, ctx)` may return `{ data }` which is merged over the
  row before insert (`dist/db/with-hooks.mjs:7-28`, type at `init-options.d.mts:1298-1303`). `ctx`
  carries the request headers (`ctx.headers` or `ctx.request.headers`; `createSession` reads them
  the same way, `dist/db/internal-adapter.mjs:247-251`). This is the one place to stamp both
  `deviceId` and a ten-year `expiresAt` when the device-id header is present. It fires twice on a
  2FA sign-in: once for the throwaway pre-challenge session and once from `verify-otp`
  (`verify-two-factor.mjs:31`). Both carry the header, so both get stamped; the first is deleted
  anyway.

### Sliding refresh is not expressible per client

The refresh condition is `expiresAt - expiresIn + updateAge <= now` (`dist/api/routes/session.mjs:
178-180`), and a refresh rewrites `expiresAt = now + expiresIn` (lines 199-202). With a ten-year
`expiresAt` and the global seven-day `expiresIn`, the condition is false for roughly ten years, so
the native session is never refreshed and never shortened. That is a flat ten-year expiry, which is
what the map wants in practice. Raising `expiresIn` globally instead would flip the condition for
web sessions and stretch them to ten years on their first `get-session`. Drop the word "sliding".

### The cookie Max-Age trap under `expo`

`setSessionCookie` always sets the session cookie's `Max-Age` to the global `expiresIn`
(`dist/cookies/index.mjs:167-176`; the explicit `maxAge` overrides `advanced.cookies` attributes).
The expo client converts `Max-Age` into an `expires` timestamp and stops sending a cookie once it
has passed
([client.ts@v1.7.4#L93-L105,L110-L119](https://github.com/better-auth/better-auth/blob/v1.7.4/packages/expo/src/client.ts#L93-L119)).
Since the refresh above never runs, the server never re-issues the cookie, and the app would go
silent after seven days while the row is still valid for ten years.

Fix: a user-level `hooks.after` matching `/sign-in/email` and `/two-factor/verify-otp` that, when
the request carries the device-id header and `ctx.context.newSession` is set, re-issues the session
cookie with `ctx.setSignedCookie(ctx.context.authCookies.sessionToken.name,
newSession.session.token, ctx.context.secret, { ...attributes, maxAge: TEN_YEARS })`. User hooks run
before plugin hooks (`dispatch.mjs:141-147`), so on a 2FA sign-in this fires for the throwaway
session too; the `twoFactor` hook then scrubs and expires that entry (`cookies/index.mjs:201-216,
234-240`), and `newSession` is `null` for the rest of the challenge, which the plugin comments call
out (`two-factor/index.mjs`, comment above `deleteSessionCookie(ctx, true)`). Under `bearer` this
trap does not exist: the token is an inert string in the Keychain with no client-side expiry.

### Where to reject a device-id mismatch

- `hooks.before` is a single `AuthMiddleware` run on every endpoint, through the HTTP router and
  through `auth.api.*` alike (`dispatch.mjs:141-147`; `dist/api/to-auth-endpoints.mjs:28-33`
  documents both entry points). Inside it, `await getSessionFromCtx(ctx)` resolves the session
  (`session.mjs:246-282`); if `session.session.deviceId` is set and differs from the header, call
  `ctx.context.internalAdapter.deleteSession(session.session.token)` and throw
  `APIError.from("UNAUTHORIZED", ...)`. Because `authSession` goes through `auth.api.getSession`,
  this one hook covers `/api/*` and every `/api/auth/*` endpoint. Cost: one extra session read on
  `/api/auth/*` calls (the `getSession` handler re-reads; `ctx.context.session` is only a cache for
  `getSessionFromCtx`).
- The cheaper alternative is a check in `authSession` after `auth.api.getSession` returns, revoking
  with `auth.api.revokeSession({ headers, body: { token } })`. It covers only routes behind
  `authSession`, so `get-session`, `sign-out`, `change-password` and the two-factor management
  endpoints would not be device-checked. Prefer `hooks.before`.
- `freshAge` (default 1 day, `init-options.d.mts:1024-1035`) gates `/list-sessions` and
  `/unlink-account` on `createdAt` (`session.mjs:331-343`, `account.mjs:263`). A ten-year native
  session fails them after a day. Nothing on the mobile roadmap calls either, but the later
  "signed-in devices" page on the web reads `listSessions` from a web session, which has the same
  one-day rule today.
- Header name: reusing `x-client-device-id` costs nothing (CORS and `requestContext` already accept
  it, UUID-shaped) and puts the device id in every log line for free. The web app must keep not
  sending it, and the create hook must stamp only when present. If the ePrivacy note in
  `session.ts:1-4` makes reuse feel wrong, a fresh `x-device-id` needs a CORS allowlist entry.
- SecureStore on iOS survives reinstalling under the same bundle id
  ([expo-secure-store docs](https://docs.expo.dev/versions/latest/sdk/securestore/)), so a device id
  minted once outlives an uninstall unless the wipe path deletes it on purpose.

## What the Expo client needs

From `@better-auth/expo@1.7.4`'s
[package.json](https://github.com/better-auth/better-auth/blob/v1.7.4/packages/expo/package.json)
and the [integration docs](https://www.better-auth.com/docs/integrations/expo):

| Package             | Why                                                            | Peer range       |
| ------------------- | -------------------------------------------------------------- | ---------------- |
| `better-auth`       | `createAuthClient` from `better-auth/react`, `twoFactorClient` | same line, 1.7.x |
| `@better-auth/expo` | `expoClient` from `@better-auth/expo/client`                   | 1.7.4, pin it    |
| `expo-secure-store` | the `storage` the plugin writes cookies and session cache into | `>=12.5.0`       |
| `expo-constants`    | reads `scheme` from `app.json` (client.ts:308-316)             | `>=17.0.0`       |
| `expo-linking`      | builds `expo-origin` and deep-link callback URLs               | `>=7.0.0`        |
| `expo-network`      | online manager installed on native at import (client.ts:25-28) | `>=8.0.7`        |
| `expo-web-browser`  | OAuth only, loaded lazily on a redirect response; not needed   | optional         |

- Client config: `expoClient({ scheme: "flexiday", storagePrefix: "flexi-day", storage:
SecureStore })`. The plugin throws on native if no scheme is found (client.ts:312-316). Keys in
  SecureStore become `flexi-day_cookie` and `flexi-day_session_data` (client.ts:251-253).
  `disableCache: true` skips the session snapshot; keep the cache, it is what makes a cold start
  render without a spinner.
- The backend gets `@better-auth/expo` too, for the server plugin.
- Every request to `/api/*` outside the auth client must attach the jar by hand: `headers: { Cookie:
await authClient.getCookie() }` with `credentials: "omit"`, as the docs show. The sync client and
  every mutation go through this.
- React Native's fetch runs on the native stack, which has its own cookie jar and lists
  `credentials: "omit"` among options that do not work
  ([reactnative.dev/docs/network](https://reactnative.dev/docs/network)). The expo client forces
  `omit` anyway (client.ts:457). Whether iOS's `NSHTTPCookieStorage` also captures the session
  cookie and what happens when both jars hold one is not something the docs settle; the sign-in
  ticket should test sign-out then re-sign-in on the device and watch the `Cookie` header.
- SecureStore warns that some iOS releases rejected values above about 2048 bytes. The cookie jar
  holds one or two short signed values, well under; the session cache holds the `get-session` JSON,
  also small today. Worth a glance if `customSession` ever grows.
- Metro: `package.json` `exports` resolution has been on by default since SDK 53 / React Native
  0.79 ([SDK 53 changelog](https://expo.dev/changelog/sdk-53)); the better-auth docs say no
  `metro.config.js` change is needed unless a custom one turns it off, and to run `npx expo start
--clear` after touching it.
- `EXPO_PUBLIC_API_URL`: Expo CLI inlines `EXPO_PUBLIC_*` from `.env` files at bundle time; the
  variable must be referenced literally as `process.env.EXPO_PUBLIC_API_URL`, it is plain text in
  the compiled app, and a change needs a full reload, not a restart
  ([environment-variables guide](https://docs.expo.dev/guides/environment-variables/)). On a real
  phone it has to be the Mac's LAN address (`http://192.168.x.x:8080`), not `localhost`. The
  backend's `BETTER_AUTH_URL` can stay `http://localhost:8080`; nothing in the request path compares
  it to the `Host` header, it only decides the `__Secure-` prefix.

## Recommendation

Use the `expo` plugin on both sides. It is the only transport where the two-factor challenge, the
`send-otp` limiter and `authSession` all work without touching them, and the origin check is
handled by a header the client already sends. `bearer` would mean hand-rolling the cookie jar for
the challenge cookie, still needing the expo origin trick for it, and leaking the raw session token
into a response header every browser tab can read.

The costs of `expo`, all known and all small:

1. `@better-auth/expo` as a backend dependency, pinned to the `better-auth` version.
2. `flexiday://` in `TRUSTED_ORIGINS` (dev `.env`, App Runner env in Terraform).
3. `disabledPaths` for `/expo-authorization-proxy`, or accept an extra redirect endpoint.
4. One `hooks.after` that re-issues the session cookie with a ten-year `Max-Age` for device-bound
   sign-ins, otherwise the app forgets the cookie after seven days.

And two decisions the map should absorb: the native lifetime is a flat ten years, not sliding; and
the device id should probably reuse the `x-client-device-id` header.

## Facts later tickets depend on

- `better-auth@1.7.4` on the backend; `@better-auth/expo@1.7.4` on both sides, same version.
- Server plugin: `import { expo } from "@better-auth/expo"`, `plugins: [expo()]`. Option
  `disableOriginOverride`. Endpoint it mounts: `GET /api/auth/expo-authorization-proxy`.
- Client plugin: `import { expoClient } from "@better-auth/expo/client"`, options `scheme`,
  `storagePrefix`, `storage`, `cookiePrefix` (default `better-auth`), `disableCache`. Action
  `authClient.getCookie()`. Client peers: `expo-secure-store`, `expo-constants`, `expo-linking`,
  `expo-network`.
- Request headers the client sends: `cookie`, `expo-origin: flexiday://`, `x-skip-oauth-proxy`.
  It sets `credentials: "omit"`.
- `TRUSTED_ORIGINS` gains `flexiday://`. `exp://**` only if Expo Go is ever used. The plugin's own
  `exp://` auto-add needs `NODE_ENV=development`, which this backend never sets.
- Cookie names: `better-auth.session_token`, `better-auth.two_factor`, `better-auth.trust_device`,
  `better-auth.dont_remember`; `__Secure-` prefix in production. `twoFactorCookieMaxAge` default
  600 s; `trustDeviceMaxAge` default 30 days.
- Config keys: `session.expiresIn` (global, 7 d), `session.updateAge` (1 d), `session.freshAge`
  (1 d), `session.additionalFields.deviceId`, `databaseHooks.session.create.before`, `hooks.before`,
  `hooks.after`, `disabledPaths`.
- Hook facts: user hooks run before plugin hooks; `hooks.before`/`after` run for `auth.api.*`
  calls, not only HTTP; `ctx.context.newSession` is `null` while a 2FA challenge is pending;
  `getSessionFromCtx(ctx)` is the in-hook session read; `ctx.context.internalAdapter.deleteSession
(token)` revokes; `ctx.setSignedCookie(name, value, secret, attrs)` re-issues a cookie.
- Refresh math: `expiresAt - expiresIn + updateAge <= now`. A ten-year `expiresAt` never refreshes.
- `setSessionCookie` always uses the global `expiresIn` as `Max-Age`; the expo client drops cookies
  past their `Max-Age`. Hence the after hook.
- Limiter: `otpSendKey` reads `req.headers.cookie` with
  `/(?:^|;\s*)(?:__Secure-)?better-auth\.(?:two_factor|session_token)=([^;]+)/`. Unchanged under
  `expo`.
- Existing header `x-client-device-id`: CORS-allowlisted, accepted by `requestContext` only as a
  UUID, sent by nobody today.
- `freshAge` gates `/list-sessions` and `/unlink-account` on session age.
- `EXPO_PUBLIC_API_URL` must be read as a literal `process.env.EXPO_PUBLIC_API_URL`; LAN IP on a
  device.
- iOS Keychain (SecureStore) persists across reinstall under the same bundle id.
