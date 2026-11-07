# Server MCP or WebMCP for Flexi Day

Resolves Fenro T-668, part of the map T-667 (AI assistant and Flexi Day MCP server). Written
2026-11-07. Every claim about a spec, browser or client links to the page it came from, read on
that date. Claims about our code cite `flexi-day-be` paths.

## Recommendation

Build a remote MCP server on the backend, at `https://api.flexi-day.com/mcp`, and skip WebMCP for
now.

- Every external client the map names (Claude.ai, Claude Desktop, ChatGPT, Cursor) connects to a
  remote MCP server over Streamable HTTP with OAuth. None of them consumes WebMCP tools.
- WebMCP is a Community Group draft in a Chrome origin trial. Its only working consumers are two
  Chrome test extensions. Gemini in Chrome support is announced but not shipped.
- Define each tool once in the backend, as a name, description, Zod input schema, annotations and
  a handler that runs as the calling user. The MCP endpoint and our own Assistant are two adapters
  over that one list. A WebMCP adapter can come later from the same list for little cost, so
  waiting loses nothing.
- Revisit WebMCP when Chrome ships it to everyone (estimated milestone 157) or when a client we
  care about calls WebMCP tools.

The rest of this file is the evidence.

## The two things being compared

They share a name and a tool shape, and nothing else.

**Server MCP** is a wire protocol. A client sends JSON-RPC over HTTPS to an endpoint we host, with
an OAuth bearer token. The client can be anywhere: Anthropic's cloud, OpenAI's cloud, a desktop
app. The page doesn't need to be open, and our frontend plays no part except hosting the sign-in
and consent screens.

**WebMCP** is a browser JavaScript API. The page registers tools with `document.modelContext`, and
an agent running in or next to that browser tab calls them. The tool's `execute` function runs in
the page, so it acts with whatever the page can do, which for us means the user's session cookie.
The spec says it "does not prescribe a tool exposure format" and that a browser may hand the tools
to its agent over MCP or something else
([WebMCP draft, section 5](https://webmachinelearning.github.io/webmcp/)). WebMCP is a browser API.
It is not an MCP transport.

## Spec status and maturity

### MCP

The current revision is **2026-07-28**
([spec](https://modelcontextprotocol.io/specification/latest)). The previous one was 2025-11-25.
The 2026 revision is a large break
([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)):

- No more protocol sessions. The `initialize` handshake and the `Mcp-Session-Id` header are gone.
  Every request carries its protocol version and client capabilities in `_meta`, and servers
  must implement `server/discover`.
- Streamable HTTP is POST only. The GET stream and SSE resumability (`Last-Event-ID`) are gone.
  A server answers each request with one JSON object or with an SSE stream scoped to that request
  ([Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
- Clients must send `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, and the server
  must reject a request whose headers disagree with its body.
- Server-to-client requests such as elicitation become Multi Round-Trip Requests. The server
  returns `resultType: "input_required"` and the client retries with the answers.
- Roots, Sampling and Logging are deprecated. Dynamic Client Registration is deprecated in favour
  of Client ID Metadata Documents (CIMD).

The spec now has a deprecation policy with a 12-month minimum window, which makes it a steadier
base than it was in 2025.

Clients have not caught up. Claude's connector docs say Claude follows the 2025-03-26, 2025-06-18
and 2025-11-25 authorization specs ([Build an MCP server for
Claude](https://claude.com/docs/connectors/building)), which are all the old, handshake-based era.
The spec defines a "dual-era" server that answers `initialize` for old clients and per-request
`_meta` for new ones on the same endpoint
([versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)). We
need that.

The official TypeScript SDK v2 does it. `createMcpHandler(factory)` from
`@modelcontextprotocol/server` serves both eras from one endpoint. By default (`legacy:
'stateless'`) it also serves 2025-era clients one request at a time with no session store, at the
cost of no server-to-client requests for those clients
([SDK: supporting 2026-07-28](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)).
That fits App Runner, where any instance may get any request. The npm registry has
`@modelcontextprotocol/server` 2.4.0 and `@modelcontextprotocol/express` 2.0.2 today. The v1
package `@modelcontextprotocol/sdk` (1.32.2) targets 2025-11-25 only.

### WebMCP

- The spec is a **Draft Community Group Report** of the W3C Web Machine Learning Community Group,
  dated 2 November 2026, edited by two people from Microsoft and two from Google. It is "not a W3C
  Standard nor is it on the W3C Standards Track"
  ([WebMCP draft](https://webmachinelearning.github.io/webmcp/)).
- The API has moved. The current draft has `document.modelContext` with `registerTool`,
  `getTools` and `executeTool`. Unregistering is an `AbortSignal` passed to `registerTool`. Older
  guides show `navigator.modelContext` and `provideContext`, which the draft no longer has.
- Chrome ran a developer trial behind a flag from milestone 146. The Intent to Experiment (15 May 2026) gives an origin trial from 149 to 156 and an estimated ship in 157. TAG review is pending,
  and Gecko and WebKit give "No signal"
  ([blink-dev Intent to Experiment](https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8)).
- Edge runs its own WebMCP origin trial, expiring 30 March 2027
  ([Edge origin trials](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a)).
- Chrome's own page calls it a proposed standard "under active discussion and subject to change"
  and says it is "primarily designed for local browser workflows with a human in the loop"
  ([Chrome WebMCP docs](https://developer.chrome.com/docs/ai/webmcp), updated 7 October 2026).

## Which clients can use each one today

| Client                  | Remote MCP server                                                        | WebMCP                         |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Claude.ai, Desktop, app | Yes, as a custom connector. Streamable HTTP, OAuth with CIMD or DCR      | No                             |
| Claude Code             | Yes, loopback OAuth redirect                                             | No                             |
| Claude API (Messages)   | Yes, `mcp_servers` + `mcp_toolset`, beta. Tools only, we pass the token  | No                             |
| ChatGPT                 | Yes. Business, Enterprise and Edu get full MCP; Pro gets read/fetch only | No                             |
| OpenAI Responses API    | Yes, a `type: "mcp"` tool, `authorization` passed per request            | No                             |
| Cursor                  | Yes. Streamable HTTP or SSE, OAuth with DCR or a static client           | No                             |
| Gemini in Chrome        | Not checked                                                              | Announced as "soon", unshipped |
| Chrome test extensions  | No                                                                       | Yes, the only consumers        |

Sources for the rows:

- Claude: [Build an MCP server for Claude](https://claude.com/docs/connectors/building) and
  [Authentication for connectors](https://claude.com/docs/connectors/building/authentication). One
  connector setup covers claude.ai, Desktop, mobile, Cowork and Claude Code. Claude connects from
  Anthropic's cloud, from `160.79.104.0/21`, so the server has to be on the public internet. Limits
  are about 150,000 characters per tool result and 240 seconds per call on the hosted apps.
- Claude API: [MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector).
  Beta headers `mcp-client-2026-09-15` and `mcp-client-2025-11-20`. "Only tool calls are currently
  supported", the server must be public, the caller handles OAuth and passes `authorization_token`,
  and the feature is not eligible for zero data retention.
- ChatGPT: [Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth) and the help centre
  article on connecting custom MCP servers, which says full MCP is for Business and
  Enterprise/Edu and Pro can connect servers "with read/fetch permissions". ChatGPT treats any
  tool without `readOnlyHint` as a write and asks for confirmation by default.
- OpenAI API: [Remote MCP in the Responses API](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).
  Approval is on by default (`require_approval`).
- Cursor: [Cursor MCP docs](https://cursor.com/docs/mcp). Redirects are
  `http://localhost:8787/callback` for the desktop app and
  `https://www.cursor.com/agents/mcp/oauth/callback` for web and agents. The page doesn't mention
  CIMD. Cursor asks for approval before an MCP tool runs unless the user allowlists it.
- WebMCP consumers: the [Chrome WebMCP docs](https://developer.chrome.com/docs/ai/webmcp) list an
  example agent extension and an inspector extension, and say both are "separate from Gemini in
  Chrome". The [I/O 2026 recap](https://developer.chrome.com/blog/chrome-at-io26) (19 May 2026)
  says "Gemini in Chrome will soon support WebMCP APIs". I found no first-party statement that
  Claude in Chrome, ChatGPT Atlas or any other agent calls WebMCP tools.

The table settles the question for this map. The map asks for Claude, ChatGPT and Cursor, and only
a remote server reaches them.

## How auth works in each

### Server MCP: OAuth 2.1, with us as the authorization server

The spec makes the MCP server an OAuth resource server
([authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
What we would have to serve:

- RFC 9728 protected resource metadata, and a `401` with `WWW-Authenticate: Bearer
resource_metadata="..."` on an unauthenticated call. Claude ignores that header on a `200` and
  uses only the first entry in `authorization_servers`.
- RFC 8414 authorization server metadata, PKCE with `S256` advertised, and `iss` in the
  authorization response (RFC 9207). The spec says SHOULD today and expects MUST later. ChatGPT's
  newer redirect URI already depends on it.
- Client registration by CIMD, with DCR as a fallback. Claude picks CIMD only when the metadata has
  `client_id_metadata_document_supported: true` and lists `none` in
  `token_endpoint_auth_methods_supported`, and otherwise falls back to DCR. Cursor documents DCR
  and static clients only. So we need both, or Cursor users must paste a client ID.
- Audience-bound tokens. The client sends `resource=https://api.flexi-day.com/mcp`. The server
  must reject tokens minted for any other audience and "MUST NOT accept or transit any other
  tokens". The session cookie never reaches the MCP endpoint.
- Refresh tokens, rotated for public clients, with `invalid_grant` when one is dead. Claude adds
  `offline_access` when the metadata lists it. The token endpoint must accept
  `application/x-www-form-urlencoded`.
- Redirect URIs to allow: `https://claude.ai/api/mcp/auth_callback`, a port-agnostic loopback for
  Claude Code on both `localhost` and `127.0.0.1`, ChatGPT's
  `https://chatgpt.com/connector_platform_oauth_redirect`, and Cursor's two callbacks.

better-auth covers nearly all of this. `@better-auth/oauth-provider` (1.7.18) is an OAuth 2.1
provider with DCR, CIMD through `@better-auth/cimd`, RFC 8707 resources, JWT access tokens through
the `jwt` plugin, rotating refresh tokens with `offline_access`, `iss` in the response, consent
storage and `loginPage`/`consentPage` options
([oauth-provider docs](https://www.better-auth.com/docs/plugins/oauth-provider)). The `mcp()`
plugin wraps it and adds RFC 9728 metadata and `requireMcpAuth` for the route. It keeps DCR off
until asked, because "MCP deprecates Dynamic Client Registration", and takes `metadataProfile:
"mcp-2026-07-28"` for CIMD ([mcp plugin docs](https://www.better-auth.com/docs/plugins/mcp)). Use
one of the two plugins, never both. Our backend runs `better-auth` 1.7.14, and its plugin list in
`flexi-day-be/src/utils/auth.ts` has neither plugin nor `jwt`, so this adds tables, a migration and
signing keys.

Consent stays our own screen. The user signs in to Flexi Day and approves "Claude wants to read
and change your Flexi Day bookings". A static-export SPA can host the login and consent pages,
because both are client pages calling better-auth.

### WebMCP: the page's own session, nothing more

WebMCP has no auth of its own. The tool's `execute` runs in our page and calls our API the way the
page already does, with the session cookie. Access to the API itself is gated by the `tools`
Permissions Policy, default `'self'`, and tools are visible to same-origin callers unless we list
other origins in `exposedTo` ([WebMCP draft](https://webmachinelearning.github.io/webmcp/)).
There's no scope, no audience and no per-client grant. Whatever agent the browser lets in acts
with the full session, and we can't tell which agent called.

## What each needs from us to build and run

### Server MCP

- A `/mcp` route on the Express app, built with `createMcpHandler` from
  `@modelcontextprotocol/server` and mounted through `@modelcontextprotocol/node` or
  `@modelcontextprotocol/express`, in dual-era stateless mode.
- `requireMcpAuth` from the better-auth plugin in front of it, turning the token into a user ID.
  Tool handlers then call the same service functions and guards as the REST controllers
  (`vacationTransitions.ts`, `groupAccess.ts`, `billing/guards.ts`), so the MCP user can do
  exactly what that user can do in the web app.
- Plain JSON responses. App Runner caps a request at 120 seconds, response included
  ([App Runner dev guide](https://docs.aws.amazon.com/apprunner/latest/dg/develop.html)), so we
  should offer no `subscriptions/listen` stream and no long tool calls. Our tools are database
  reads and writes, so this costs nothing.
- `Origin` validation (a MUST in the transport), rate limits per token, and logs carrying the
  OAuth client ID.
- better-auth `mcp()` or `oauthProvider()`, plus `jwt()` and CIMD, a migration for their tables,
  and the login and consent pages in the frontend. `flexi-day-be/docs/invariants.md` applies,
  because this touches auth.
- No new AWS resources. The endpoint lives on the existing App Runner service behind
  `api.flexi-day.com`. Any new environment variable still has to land in Terraform.

### WebMCP

- A client module in `flexi-day` that feature-detects `document.modelContext` and registers tools
  whose `execute` calls our REST API.
- An origin trial token per origin, renewed when it expires, until Chrome ships.
- Nothing on the backend. It reuses the API.

WebMCP is cheaper to build. It's also useless today for every client on the map's list.

## Security trade-offs

**The user's permissions.** Both run as the user. The server MCP route is narrower in three ways.
The token carries scopes, so a read-only grant is possible. Each AI client gets its own grant,
visible and revocable on its own. And the server knows which client made each call, so a
`vacation_events` row can say "approved through Claude". WebMCP gets the whole session and can't
name the caller.

**Prompt injection.** Both specs say plainly that they can't stop it. MCP says annotations are
untrusted and clients should keep a human in the loop
([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). WebMCP calls
agent security "mainly the agent's own responsibility" and lists tool poisoning, injected tool
output and misrepresented intent ([WebMCP draft, section
6](https://webmachinelearning.github.io/webmcp/)). The risk specific to us is cross-user
injection. A teammate writes a booking note or comment, and an approver's agent reads it through a
tool. That text can tell the agent to approve, reject or cancel something. Our side of the fix is
the same either way:

- Server-side permission checks on every call, never trusting what the model claims.
- Mark tools that return text other users wrote. WebMCP has `untrustedContentHint` for this. MCP
  has no equivalent, so say it in the tool description.
- Keep writes few and reversible. Leave out what is hard to undo or not about bookings: account
  deletion, role and permission changes, billing, organization settings.
- Set `readOnlyHint: true` on reads and leave it off writes, so ChatGPT, Cursor and the Responses
  API ask before writing by default.

**Write tools.** MCP annotations are `readOnlyHint`, `destructiveHint`, `idempotentHint` and
`openWorldHint` (2026-07-28 `schema.ts`). WebMCP has `readOnlyHint`, `untrustedContentHint` and
`consequentialHint`, the last meant to let agents "selectively enforce mandatory user
confirmation prompts". All of them are hints. Confirmation happens in the client, and our only
hard control is what the handler allows.

**Where data goes.** A remote MCP server sends an organization's leave data to whichever AI vendor
the user connects. That's the user acting with their own access, as the map decided. An
organization admin may still want to switch it off. WebMCP doesn't avoid this, because the browser
agent sends the same data to its own model.

## Can one tool definition serve both?

Yes, the metadata can. The execution can't, and doesn't need to.

| Field        | MCP tool                                       | WebMCP tool                                 |
| ------------ | ---------------------------------------------- | ------------------------------------------- |
| Name         | `name`, 1 to 128 chars, `[A-Za-z0-9_.-]`       | `name`, capped at 128 chars                 |
| Display name | `title`                                        | `title`                                     |
| Description  | `description`                                  | `description`                               |
| Input        | `inputSchema`, JSON Schema 2020-12             | `inputSchema`, JSON Schema                  |
| Output       | `outputSchema`, `structuredContent`            | `outputSchema`                              |
| Hints        | read-only, destructive, idempotent, open-world | read-only, untrusted content, consequential |
| Runs         | handler on our server, with a bearer token     | `execute` in the page, with the cookie      |

A backend registry entry would hold a name, title, description, a Zod schema (Zod 4's
`z.toJSONSchema` gives the JSON Schema), annotations and a handler taking `{ userId, scopes }`.
From that one list:

- the MCP adapter registers each entry with the MCP server,
- the Assistant adapter turns each entry into a Claude tool and runs the handler in-process, or
  goes through the MCP endpoint (that choice belongs to T-675),
- a future WebMCP adapter would read a generated manifest of the same entries in the SPA and call
  one generic backend route per tool.

Our hints map across. `readOnlyHint` is the same in both. Our writes that matter, such as
submitting, approving or cancelling a booking, would set MCP `destructiveHint` and WebMCP
`consequentialHint`. Tools that return colleagues' text set `untrustedContentHint`.

## Findings that touch other tickets

- **T-675 (where the agent loop runs).** The Claude API MCP connector is beta, tools only, needs a
  public server and a token we mint, and is not eligible for zero data retention. Calling the
  handlers in-process from our own loop avoids all four. If the loop calls our own `/mcp`, it needs
  a first-party OAuth client and a token per user.
- **T-676 (which plan gets external MCP access).** The AI vendor gates the client side too. A
  ChatGPT Pro user can only connect read/fetch tools. Business, Enterprise and Edu get writes, and
  there only admins, or members an admin allows, can add custom servers. On Claude, a user or an
  organization Owner adds a custom connector by URL, with no review by Anthropic.
- **Possible new decision ticket.** Should an organization admin be able to allow or block external
  AI clients for the organization's data, and should the consent screen name the vendor? It
  concerns data leaving the org rather than plans, so T-676 doesn't cover it.
- **Possible new decision ticket.** Which write tools external clients get, compared with our own
  Assistant, given cross-user prompt injection through booking notes and comments. The map says
  "write tools included" but not which ones.
- **Watch item.** Claude's connector auth docs stop at the 2025-11-25 spec. Build dual-era from
  the start and check again before launch.
