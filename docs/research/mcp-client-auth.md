# Signing external MCP clients in with better-auth

Resolves Fenro T-673, part of the map T-667 (AI assistant and Flexi Day MCP server). Written
2026-11-07. Claims about specs and clients link to the page they came from, read that day. Claims
about better-auth cite the `v1.7.18` tag of `better-auth/better-auth`, the current release on npm.
Claims about our code cite `flexi-day-be` and `flexi-day` paths.

Sibling findings this builds on: T-668 (`research/server-mcp-vs-webmcp`, the remote server and its
OAuth shape), T-669 (`research/mcp-cost`, the limiter problem with shared egress IPs) and T-671
(`research/assistant-knowledge-base`, docs tools that need no sign-in).

## Recommendation

Make the backend an OAuth 2.1 authorization server with `@better-auth/mcp`, `@better-auth/cimd`
and the `jwt()` plugin, and pick the organization on a screen of our own between sign-in and
consent.

- **Plugins.** `mcp()` from `@better-auth/mcp`, which is `oauthProvider()` configured for MCP.
  `cimd()` from `@better-auth/cimd` with its Node transport, so Claude and ChatGPT need no
  registration. DCR turned on as a fallback for Cursor. `jwt()` with its `/token` route and
  `set-auth-jwt` header off. The old in-core `oidcProvider` and `mcp` plugins are gone in 1.7.
- **One organization per grant.** The user picks the organization on a post-login page.
  better-auth stores the choice as the consent's `referenceId`, carries it on every refresh token,
  and hands it to `customAccessTokenClaims`, which writes it into the access token. Acting in a
  second organization means connecting again and picking the other one.
- **Two scopes.** `flexiday.read` and `flexiday.write`, plus `offline_access` for refresh tokens.
  The consent page lets the user drop write. Scopes cap what a client may try. The user's own
  permissions, checked on every call, decide what it may do.
- **Check the grant on every call.** The JWT is verified locally, but each MCP request also loads
  the consent row, the user, the organization's switch and plan, and the user's standing in that
  organization. That makes revocation, the owner's switch, leaving an organization and account
  deletion take effect on the next call, not when the token expires.
- **Revoke means deleting refresh tokens.** better-auth's own "delete consent" leaves issued tokens
  working. Our disconnect endpoint deletes the consent and the refresh tokens in one transaction.
  Password reset, account deletion and the owner switching external clients off do the same.
- **Frontend pages.** An OAuth sign-in entry that keeps the signed query through two-factor and
  social sign-in, an organization picker, a consent page, and a "Connected AI clients" list in
  Settings. The owner's switch belongs to T-680.
- **Lifetimes.** Keep the defaults: one-hour JWT access tokens, 30-day refresh tokens that rotate
  and slide, and the 30-second reuse window `mcp()` sets.

The rest is the evidence, then the design, then what it changes elsewhere.

## Which better-auth plugin

Three packages are current, all at 1.7.18 on npm, published 2026-11-05:

| Package                       | What it is                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `@better-auth/oauth-provider` | OAuth 2.1 and OpenID provider: authorize, token, consent, revoke, DCR           |
| `@better-auth/mcp`            | `mcp()`, which calls `oauthProvider()` with MCP defaults, plus `requireMcpAuth` |
| `@better-auth/cimd`           | Client ID Metadata Documents as a client-discovery extension of the provider    |

What 1.7 removed: the 1.7 upgrade guide says "The old `oidcProvider` plugin is removed" and "The
MCP plugin moves from `better-auth` to `@better-auth/mcp`"
([upgrade guide, source](https://github.com/better-auth/better-auth/blob/v1.7.18/docs/content/docs/guides/1-7-upgrade-guide.mdx)).
Our installed `better-auth` 1.7.14 confirms it. Its `dist/plugins` has `jwt`, `bearer`,
`generic-oauth` and others, and no `mcp` or `oidc-provider`. `@better-auth/oidc-provider` does not
exist on npm. Anything written about `withMcpAuth`, `oauthApplication` tables or `/mcp/*` OAuth
endpoints describes 1.6.

`mcp()` and `oauthProvider()` are one plugin, not two. `mcp()` returns `oauthProvider({...})`
with the resource bound into `resources` and `clientRegistrationDefaultResources`, a 30-second
`refreshTokenReuseInterval`, and an `onRequest` hook that serves RFC 9728 metadata at
`/.well-known/oauth-protected-resource` and its path-suffixed alias
([`packages/mcp/src/plugin.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/mcp/src/plugin.ts)).
The docs say not to register both. Every `oauthProvider` option passes through `mcp()` flat, so
`postLogin`, `customAccessTokenClaims` and the rest are available.

`jwt()` is required. It signs access tokens and serves `/jwks`. The MCP docs tell you to disable
its `/token` route and its `set-auth-jwt` header, because session JWTs share the signing key
([mcp docs](https://github.com/better-auth/better-auth/blob/v1.7.18/docs/content/docs/plugins/mcp.mdx)).
`requireMcpAuth` also demands an `azp` claim, which session JWTs lack
([`require-mcp-auth.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/mcp/src/require-mcp-auth.ts)).

A sketch of the configuration, with the parts this document argues for:

```ts
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { jwt } from "better-auth/plugins";

betterAuth({
  disabledPaths: ["/expo-authorization-proxy", "/token"],
  plugins: [
    // ...existing plugins, twoFactor first
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      resource: "https://api.flexi-day.com/mcp",
      loginPage: "https://flexi-day.com/oauth/sign-in/",
      consentPage: "https://flexi-day.com/oauth/consent/",
      postLogin: {
        page: "https://flexi-day.com/oauth/organization/",
        shouldRedirect: ({ session, isContinuation }) =>
          !isContinuation || !isEligibleChoice(session),
        consentReferenceId: ({ user, session }) => eligibleOrganizationOrThrow(user, session),
      },
      scopes: ["flexiday.read", "flexiday.write", "offline_access"],
      customAccessTokenClaims: ({ referenceId }) => ({
        "https://flexi-day.com/organization": referenceId,
      }),
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    // customSession stays last
  ],
});
```

`loginPage` and the other pages may be absolute URLs on another origin. The provider builds the
redirect as `${page}?${signedQuery}`
([`authorize.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/authorize.ts)),
so the pages can live in the static SPA at `flexi-day.com` while the provider runs on
`api.flexi-day.com`.

## What the MCP spec asks for, both eras

Both revisions make the MCP server an OAuth 2.1 resource server with RFC 9728 metadata, require
PKCE with S256, require the RFC 8707 `resource` parameter on authorize and token requests, and
forbid accepting tokens minted for another audience
([2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
[2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)). The
differences that matter here:

| Topic                     | 2025-11-25                                    | 2026-07-28                                                     |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| CIMD                      | SHOULD                                        | SHOULD                                                         |
| DCR                       | MAY, "for backwards compatibility"            | MAY, and called deprecated                                     |
| `iss` in the response     | Not mentioned                                 | SHOULD, with `authorization_response_iss_parameter_supported`  |
| `offline_access`          | Not mentioned                                 | Resource metadata SHOULD NOT list it                           |
| Step-up on missing scope  | 403 `insufficient_scope`                      | Same, and the server sends every needed scope in one challenge |
| Loopback redirects (CIMD) | Show the redirect host, warn on loopback-only | Same, moved to the security page                               |

better-auth covers the server side of all of it. It sends `iss` on every authorization response,
advertises CIMD only when `cimd()` is installed and the registration endpoint only when DCR is on,
and `mcp()` keeps identity and refresh scopes such as `openid` and `offline_access` out of the
resource metadata ([`plugin.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/mcp/src/plugin.ts)).

Scope selection is the same in both. A client requests the `scope` named in the 401's
`WWW-Authenticate` header, and failing that every scope in the resource metadata's
`scopes_supported`. The spec means `scopes_supported` to be "the minimal set of scopes necessary
for basic functionality".

## What each client does today

| Client                     | Registration                               | Redirect URIs                                                                        | Scopes requested                                                     | Step-up                                          |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------ |
| Claude (web, Desktop, app) | CIMD if both flags are set, otherwise DCR  | `https://claude.ai/api/mcp/auth_callback`                                            | 401 `scope`, else resource `scopes_supported`, plus `offline_access` | 403 `insufficient_scope` re-authorizes           |
| Claude Code                | Its own CIMD                               | `http://localhost/callback` and `http://127.0.0.1/callback`, any port                | Same as Claude                                                       | Same as Claude                                   |
| ChatGPT                    | CIMD preferred, DCR possible               | `https://chatgpt.com/connector_platform_oauth_redirect` when `iss` is supported      | `scopes_supported`, plus advertised OIDC scopes                      | Tool result with `_meta["mcp/www_authenticate"]` |
| Cursor                     | DCR, or a static `CLIENT_ID` in `mcp.json` | `http://localhost:8787/callback`, `https://www.cursor.com/agents/mcp/oauth/callback` | Authorization server `scopes_supported` unless set                   | Not documented                                   |

Sources: Claude's [authentication for connectors](https://claude.com/docs/connectors/building/authentication)
and [lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication),
OpenAI's [Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth), and
[Cursor's MCP docs](https://cursor.com/docs/mcp).

Details that shape the design:

- Claude picks CIMD only when the authorization server metadata has both
  `client_id_metadata_document_supported: true` and `none` in
  `token_endpoint_auth_methods_supported`. With DCR it "registers a new client on every fresh
  connection", which is why CIMD should be the main path.
- Claude starts sign-in only on an HTTP 401. A 200 carrying `isError` goes to the model as text,
  and "any other 403 is surfaced as a terminal error". So the response code we choose for each
  refusal decides what the user sees.
- Claude refreshes "reactively on a 401" and up to five minutes before expiry, wants
  `invalid_grant` for a dead refresh token, and waits at most 30 seconds for a refresh. The token
  endpoint must take `application/x-www-form-urlencoded`. better-auth does both.
- ChatGPT uses the stable redirect only when the server meets RFC 9207, and rejects a response with
  a missing or wrong `iss`. better-auth sends `iss`, so register the stable URI.
- ChatGPT's step-up is not Claude's. It wants an `isError` tool result carrying
  `_meta["mcp/www_authenticate"]`. Supporting step-up therefore means two code paths, which is one
  reason to skip it in the first release.
- Claude's connector docs mention "Multiple URLs" and "URL patterns" only for directory listings.
  Nothing in them says whether one user can add the same custom connector URL twice. I couldn't
  confirm it, so the design does not rely on it.

## How a token picks one organization

The map settled that a connection acts in one organization the user chooses. better-auth has a
step built for this. The authorize endpoint runs, in order, login, account selection, sign-up
steps, **post-login**, consent, then issues the code
([sign-in flow docs](https://github.com/better-auth/better-auth/blob/v1.7.18/docs/content/docs/plugins/oauth-provider/sign-in-flow.mdx)).
The docs give "picking an organization" as the post-login example.

How it works in the source:

1. `postLogin.shouldRedirect` runs on every authorize. Returning `true` sends the browser to
   `postLogin.page` with the signed query.
2. Our page shows the user's eligible organizations, saves the choice, and calls
   `POST /oauth2/continue` with `postLogin: true`. `shouldRedirect` runs again with
   `isContinuation: true`. The docs warn that this flag "does not prove a selection was made", so
   the function checks the session itself.
3. `postLogin.consentReferenceId` receives `user`, `session` and `scopes` and returns the chosen
   organization ID. Consent is looked up and stored per `(clientId, userId, referenceId)`
   ([`consent.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/consent.ts)).
4. The authorization code, the refresh token row and every rotated refresh token carry that
   `referenceId` ([`schema.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/schema.ts),
   [`token.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/token.ts)).
5. `customAccessTokenClaims` receives `referenceId` on every issue and refresh, and writes it into
   the JWT. The provider's own claims (`sub`, `aud`, `azp`, `scope`, `sid`, `jti`, `exp`) are
   stamped after ours, so we cannot overwrite them.

`consentReferenceId` reads only the session, so the choice has to live on the session row. The
docs example uses the organization plugin's `activeOrganizationId`. We don't run that plugin, so
add our own session field, say `oauthOrganizationId`, declared `input: false` like `deviceId` so no
request body can set it. Our picker writes it through a backend route that checks eligibility
first.

Three rules make the choice safe:

- **Ask on every new authorization.** `shouldRedirect` returns `true` whenever `isContinuation` is
  false. Otherwise a choice left on the session from an earlier connection would be reused, and if
  a consent for that organization existed, authorize would skip every screen and issue a code for
  an organization the user never picked this time.
- **Check eligibility twice more.** `consentReferenceId` throws when the stored organization is no
  longer eligible, which the docs say is our job ("YOU must fail in this function"). The MCP
  handler checks again on every call.
- **Eligible means** the user has standing in the organization, the owner's switch for external
  clients is on, and the plan allows it (T-676 decides which plan). The Assistant's organization
  picker needs the same resolver, so write it once.

Per-organization tokens follow from this without extra work. A user who connects Claude for
organization A and later for B gets two consents and two refresh-token families. Each access
token names one organization. Switching means disconnecting and connecting again, because a
client like Claude holds one token per connector.

### Alternatives I rejected

- **An organization argument on every tool.** The token would carry no organization, and each
  call would name one. It fights the map's decision, invites the model to guess, and leaves the
  owner's switch with nothing to hang a grant on.
- **One MCP URL per organization**, such as `/mcp/o/<id>`. Two connectors could then coexist in
  one client. But `mcp()` binds one `resource`, the resource identifier may not carry a query, and
  every organization would need its own resource row. Worth revisiting only if users ask to work
  in two organizations at once.
- **The scope string carrying the organization**, as `org:<id>`. Clients copy scopes from our
  metadata, so they would request every organization the metadata lists, or none.

## Scopes

| Scope            | Grants                                                                        | Where advertised             |
| ---------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| `flexiday.read`  | Read tools: who is away, balances, my requests, events, attendance, directory | Resource and server metadata |
| `flexiday.write` | Write tools: create, cancel own, approve or reject, clock in or out           | Resource and server metadata |
| `offline_access` | A refresh token                                                               | Server metadata only         |

Leave `openid`, `profile` and `email` out of `scopes`. We are not an identity provider for these
clients, and dropping `openid` keeps ChatGPT from asking for OIDC scopes. better-auth then serves
only RFC 8414 metadata, which every client on the list reads.

Both product scopes go in `scopes_supported`, so clients request both. The consent page shows
writes as a checkbox, ticked by default, and posts the narrower `scope` when the user unticks it.
The consent endpoint accepts any subset of the requested scopes
([`consent.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/consent.ts)).
`tools/list` then leaves write tools out for a read-only token.

That diverges from the spec's advice to list only the minimal set and step up for more. Step-up
works differently in Claude and ChatGPT and isn't documented for Cursor, and the map gives
external clients write tools from the start. A read-only default plus step-up is a fine later
change. It needs a 403 challenge for Claude and a `_meta` challenge for ChatGPT.

A scope is a ceiling, not a permission. Approving needs the write scope and approver standing in
the group, checked through `getGroupsWhereUserCanApprove` like the REST route does.

The owner may want an organization-wide "read only" setting for external clients. That's a
product decision for T-680. It would sit in the eligibility check, which would drop
`flexiday.write` for that organization.

## Revocation

### What better-auth does by itself

- `POST /oauth2/delete-consent` deletes the consent row and nothing else. The docs say so twice:
  "Deleting a consent makes the next authorization ask again" and "Deleting a consent removes only
  that organization's consent and does not revoke issued tokens"
  ([clients docs](https://github.com/better-auth/better-auth/blob/v1.7.18/docs/content/docs/plugins/oauth-provider/clients.mdx)).
- The refresh grant checks the token row, its client, expiry, resources and scopes, and that the
  user row exists. It never looks at the consent or the session
  ([`token.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/token.ts)).
- `oauthRefreshToken.sessionId` and `oauthAccessToken.sessionId` are `onDelete: "set null"`, with
  the comment "session can be deleted but refresh still active". Signing out of the web does not
  end a connection.
- `POST /oauth2/revoke` is RFC 7009 for the client to call with its own token. Users have no
  button that reaches it.
- `requireMcpAuth` checks the JWT against the JWKS "without a database round trip". A token stays
  valid until it expires unless the handler checks more.

### What we add

**A grant check on every call.** After `requireMcpAuth`, the handler loads the consent for
`(sub, azp, organization claim)`. No row means a 401 with `error="invalid_token"`, so the client
runs sign-in again and the user sees consent. The same handler loads the user, the organization
and the user's standing, which it needs for permissions anyway. T-669 counted the cost of a few
indexed reads per call as negligible.

**A disconnect endpoint** of our own, used by the Settings list. In one transaction it deletes the
consent and every `oauthRefreshToken` row for that user, client and `referenceId`. The client's
next refresh gets `invalid_grant` and its next call gets 401.

**Grants end when sessions end for a security reason.** The rule I'd adopt is that whatever
deletes all of a user's sessions to remove an attacker also deletes their OAuth grants.

| Event                                      | Sessions today                                | OAuth grants                                                       |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------ |
| Sign-out                                   | One row deleted                               | Kept, by design                                                    |
| Password reset                             | All deleted (`revokeSessionsOnPasswordReset`) | Delete all                                                         |
| Password change with `revokeOtherSessions` | Others deleted                                | Delete all                                                         |
| Two-factor toggled                         | The current session is replaced               | Kept. Ending them when it turns on is a call to make at build time |
| Account deletion                           | All deleted                                   | Delete all, see below                                              |
| Owner switches external clients off        | Untouched                                     | Delete all with that `referenceId`                                 |
| User leaves the organization               | Untouched                                     | Refused per call. Deleting is tidy, not needed                     |
| Auth secret version rotates                | All deleted                                   | Kept. JWTs are signed by the JWKS key                              |

Account deletion needs this most. Our user row survives as a Deleted account, and the refresh grant
only checks that the row exists, so a deleted user's Claude connection would keep minting tokens.
`accountDeletionServices.ts` deletes `session` rows today and would have to delete the OAuth rows
in the same transaction.

Whether the owner switch should delete grants or only refuse calls is worth a line in T-680. I'd
delete them: "off" should leave nothing live, and the Settings list should not show connections
that can't work.

### Connected clients list

Settings gets a "Connected AI clients" section listing the user's consents: client name and icon,
the host of its `client_id` URL or its redirect, the organization, the scopes, when it was granted,
and when it last refreshed, from the newest refresh token's `createdAt`. Each row has a disconnect
button that calls our endpoint. better-auth's `getOAuthConsents` returns the raw rows. The client
name has to come from `oauthClient`, so a small backend read is simpler.

Whether owners and org admins see their organization's connections is open in the map ("Connected
MCP clients management"). The data supports it: filter consents by `referenceId`.

## Two-factor and social sign-in

Sign-in inside an OAuth flow is the ordinary web sign-in. The provider's after hook continues the
flow when a response sets the session cookie and the request carried the signed query, either as
`oauth_query` in the body or, for social sign-in, in server-side OAuth state saved when the flow
started ([`oauth.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/oauth.ts)).

- **Password with two-factor on.** `/sign-in/email` ends in a two-factor challenge and sets no
  session cookie, so nothing continues. The code step at `/two-factor/verify-*` sets the cookie,
  and the flow resumes if that request also carries `oauth_query`. The `oauthProviderClient`
  plugin sends it from the current page URL. Our sign-in page sends the user to
  `/two-factor/?redirect=...&methods=...` (`flexi-day/app/(auth)/sign-in/page.tsx`) and drops
  everything else, which would lose the signed query. The OAuth entry page must forward it.
- **Social sign-in.** Works, because the query rides in server state through the provider round
  trip. It skips our second factor, as it does on the web. That's the existing invariant "Social
  sign-in does not run the second factor" in `flexi-day-be/docs/invariants.md`, and an MCP grant
  inherits it. No new decision, but the invariant should mention OAuth grants.
- **Hook order matters.** Both `twoFactor` and the provider add after hooks, and better-auth runs
  every matching after hook in registration order, merging headers as it goes
  (`better-auth/dist/api/dispatch.mjs`). Registered after `twoFactor`, the provider sees the
  session cookie already deleted and does nothing. Registered before it, the provider would run
  authorize with the throwaway pre-challenge session. With an existing consent that issues an
  authorization code. In a navigation-mode request the code would leave in a `Location` header that
  survives `twoFactor` replacing the body. I traced this through the source and did not run it. Put
  `mcp()` after `twoFactor`, as `nativeSessionEvictionPlugin` already is, and add an e2e test: a
  password sign-in with two-factor on and a valid `oauth_query` must yield no code until the
  challenge passes.
- **Already signed in.** The authorize request is a top-level navigation to `api.flexi-day.com`,
  so the Lax session cookie goes with it. A user signed in to the web app goes straight to the
  organization picker.
- **Phone sessions.** The flow runs in a browser. Native sessions and their device binding play no
  part.

## Token lifetime

| Token              | Default in 1.7.18                                   | Recommendation                                                   |
| ------------------ | --------------------------------------------------- | ---------------------------------------------------------------- |
| Access (JWT)       | 3600 s                                              | Keep. The per-call grant check makes revocation immediate anyway |
| Refresh            | 2,592,000 s, rotated, expiry reset on each rotation | Keep. An idle connection dies after 30 days, a used one lives on |
| Reuse window       | 0 in `oauthProvider`, 30 s in `mcp()`               | Keep 30 s                                                        |
| Authorization code | 600 s                                               | Keep. The signed query between pages expires with it             |

The reuse window is a real trade. The docs warn that inside it a stolen refresh token replayed
within 30 seconds gets the replacement. Without it, a refresh whose response Claude lost, after
its 30-second timeout, revokes the whole family and the user has to reconnect. I'd keep 30 seconds
and revisit if refresh tokens ever leak.

Shorter access tokens would mean more token requests from Anthropic's shared egress range, which
runs into the limiter problem below.

## Tables, migrations and keys

`mcp()` uses the provider's schema
([`schema.ts`](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/schema.ts)):

| Table                  | Holds                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| `oauthClient`          | CIMD, DCR and any pre-registered clients                                  |
| `oauthResource`        | Protected resources, here one row for `https://api.flexi-day.com/mcp`     |
| `oauthClientResource`  | Which client may ask for which resource                                   |
| `oauthConsent`         | Consent per user, client and `referenceId`                                |
| `oauthRefreshToken`    | Hashed refresh tokens, with `referenceId`, `sessionId` and rotation state |
| `oauthAccessToken`     | Opaque access tokens. Unused while every token is a JWT                   |
| `oauthClientAssertion` | Single-use `private_key_jwt` assertion IDs. No job prunes it              |

`jwt()` adds `jwks`. Our side adds the session field for the chosen organization and the owner's
switch on `organizations`. `auth-schema.ts` is maintained by hand, so generate the better-auth
tables with its CLI, copy them in, and run `pnpm run db:generate`. One migration, applied locally,
handed to the user for production as the backend's CLAUDE.md says.

Three things in that list touch existing invariants:

- **`jwks.privateKey` is encrypted with the auth secret.** `jwt()` encrypts it with
  `ctx.context.secretConfig` unless `disablePrivateKeyEncryption` is set
  (`better-auth/dist/plugins/jwt/utils.mjs`). Our invariant says "A new encrypted column joins the
  sweep's list, or it outlives its key". If the sweep misses it, the second rotation after launch
  leaves the signing key unreadable, and no client gets a token until someone clears the table.
  The stored value is the ciphertext wrapped in `JSON.stringify`, so the sweep entry needs to
  unwrap it.
- **Hashed tokens.** `storeTokens` defaults to `"hashed"`, so refresh tokens and codes sit hashed.
  They are not secrets for the sweep.
- **A session ends by deleting its row.** True for OAuth too, since refresh tokens outlive their
  session row by design. The revocation table above is how grants end.

## Pages the frontend hosts

All of them are client pages in the static export. They call better-auth from the browser with the
session cookie and need no server rendering.

| Page                 | Path, as a suggestion  | Does                                                                                         |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| OAuth sign-in        | `/oauth/sign-in/`      | The normal sign-in form plus social buttons, keeping the signed query through two-factor     |
| Organization picker  | `/oauth/organization/` | Lists eligible organizations, saves the choice, calls `oauth2.continue({ postLogin: true })` |
| Consent              | `/oauth/consent/`      | Names the client and its hosts, the organization and the scopes, then calls `oauth2.consent` |
| Connected AI clients | Settings section       | Lists grants and disconnects them                                                            |
| Owner switch         | Organization settings  | T-680                                                                                        |

What the consent page must show, from the spec and better-auth's docs:

- The host of the `redirect_uri`, always. For a CIMD client, the host of the `client_id` URL, not
  the self-declared `client_name`.
- A warning when the client's only redirect URIs are loopback. Anyone can claim Claude Code's CIMD
  URL and listen on a local port, and the consent page would show "Claude Code"
  ([spec, localhost redirect risks](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)).
- `logo_uri`, `client_uri`, `tos_uri` and `policy_uri` only when they start with `https:`.
- The organization the grant is for, and a plain sentence about where the data goes.

better-auth's docs verify the signed query on the server before rendering consent. A static page
can't hold the secret, so add one backend route, such as `GET /api/oauth-context`, that verifies
the query with `verifyOAuthQueryParams` and returns the client, its hosts, the loopback flag, the
scopes and the chosen organization. The picker can use the same route for its list. The provider
verifies the signature again when the page posts, so a tampered URL fails either way. The route
just keeps the page from rendering what the URL claims.

Two frontend gaps:

- **Framing.** CloudFront serves the SPA with the managed SimpleCORS response headers policy and no
  `frame-ancestors` or `X-Frame-Options` (`flexi-day/terraform/cloudfront.tf`). A consent page
  that can be framed can be clickjacked. Add a response headers policy with
  `frame-ancestors 'none'`, at least for `/oauth/*`. That's a Terraform change.
- **Sign-up inside the flow.** A new user signs up, then confirms the address by a mailed link that
  opens elsewhere, and the 10-minute signed query is likely gone by then. Send people without an
  account to sign up in a new tab and to start the connection again. Don't build `prompt=create`
  in v1.

## Wiring on the backend

- Express must route the well-known paths to `toNodeHandler(auth)`. The issuer is
  `https://api.flexi-day.com/api/auth`, so RFC 8414 metadata lives at
  `/.well-known/oauth-authorization-server/api/auth`, outside `/api/auth`. The provider's docs
  say to add a route for each such path. The resource metadata lives at
  `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`.
- Mount `/mcp` outside `/api`, as T-669 found, with `requireMcpAuth` passing
  `resource: "https://api.flexi-day.com/mcp"`. The default resource would be the auth base URL.
- `requireMcpAuth` answers every unauthenticated request with 401. Lazy auth, letting the docs
  tools from T-671 run before sign-in, needs our own gate in front of the SDK that 401s only
  protected `tools/call` requests, as Claude's lazy-auth page shows. ChatGPT also wants
  `securitySchemes` on each tool. Leave it out of v1. Signing in first is simpler, and the user
  picks the organization before any tool runs.
- The better-auth MCP docs tell you to run the SDK with `legacy: "reject"`, which serves only
  2026-07-28 clients. T-668 found Claude is still on 2025-era authorization and needs the dual-era
  handler. `requireMcpAuth` wraps any fetch handler, so this costs nothing on the auth side. Just
  don't copy the docs' `legacy` setting.

### Choosing response codes

| Situation                                        | Response                                        | What the user sees                  |
| ------------------------------------------------ | ----------------------------------------------- | ----------------------------------- |
| No token, bad signature, expired, wrong audience | 401 with `resource_metadata` (`requireMcpAuth`) | Claude refreshes or asks to sign in |
| Consent gone, user deleted                       | 401 `invalid_token`                             | Sign-in again                       |
| Owner turned external clients off, plan lapsed   | 200, tool result with `isError` and the reason  | The model tells them why            |
| User lost standing in the organization           | 200, tool result with `isError`                 | Same                                |
| Write tool with a read-only token                | Tool not listed. If called, `isError`           | Same                                |
| Permission denied for this record                | 200, tool result with `isError`                 | Same                                |

A 401 for the switch would send the user through sign-in to the same refusal. A bare 403 shows as
a terminal error in Claude with no explanation. A tool result lets the model say "Acme's owner has
turned off external AI clients".

## Findings that touch other tickets

- **T-682 (rate limits).** better-auth's provider has its own per-IP limits: `/oauth2/token` 20 a
  minute, `/oauth2/authorize` 30, `/oauth2/register` 5
  ([options](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/oauth-provider/src/types/index.ts)),
  keyed by IP like the rest of better-auth's limiter. Every Claude.ai user's code
  exchange and refresh comes from `160.79.104.0/21`, so all our customers would share 20 token
  requests a minute. With one-hour tokens refreshed five minutes early, about 1,000 active users
  hit it. T-682 needs to key or raise these, not only the `/mcp` limiter T-669 named. DCR
  registration is also an open write endpoint to bound and prune.
- **T-675 (where the agent loop runs).** Unchanged by this. If the Assistant calls tools in
  process, it needs no OAuth. If it calls our own `/mcp`, it needs a first-party client with
  `skipConsent` and a token per user and organization.
- **T-680 (owner settings).** Inputs for the switch screen: whether off deletes existing grants (I
  recommend yes), whether the owner can allow read only, and whether owners see a list of who
  connected what.
- **The map's "Connected MCP clients management".** The data is there: consents per user, filterable
  by organization. The user's list and disconnect are cheap. The open question is the owner's view.
- **T-676 (plan gate).** Plan eligibility goes into the same resolver as the switch, checked at
  the picker, in `consentReferenceId` and on every call.
- **Invariants to write when this is built.** OAuth grants end on password reset, password change,
  account deletion and the switch going off. `mcp()` stays after `twoFactor`.
  `jwks.privateKey` is in the re-encryption sweep. The social sign-in exception covers OAuth grants.
- **Possible new decision ticket.** Whether DCR stays on for Cursor. It's open registration on the
  internet. The alternative is one pre-registered public client for Cursor that users paste into
  `mcp.json` as `CLIENT_ID`, which closes DCR entirely at the cost of a setup step. Claude and
  ChatGPT don't need DCR once CIMD works.
