# What an MCP server costs us

Resolves Fenro T-669, part of the map T-667 (AI assistant and Flexi Day MCP server). Written
2026-11-07. It builds on T-668 ([server MCP or WebMCP](https://github.com/Daniel88dev/flexi-day-workspace/blob/research/server-mcp-vs-webmcp/docs/research/server-mcp-vs-webmcp.md)),
which picked a stateless Streamable HTTP server on the backend with OAuth 2.1 through better-auth.
Prices come from the AWS price list API for `eu-central-1` (publication date 2026-09-11), the AWS
pricing pages, and Anthropic's and OpenAI's docs, all read on 2026-11-07. Our current spend comes
from Cost Explorer for October 2026. Our settings come from `flexi-day-be/terraform/` and
`flexi-day-be/src`.

## Answer

External MCP clients add almost nothing to our bill. The model tokens are never ours. Claude.ai,
Claude Desktop, ChatGPT and Cursor bill their own users, and we have no billing relationship with
any of them. What lands on us is App Runner compute, a few database queries per tool call, some
OAuth rows and log lines. For a 100-person organization using it every working day, that comes to
between $0 and about $3 a month, and the whole service cannot spend more than about $33 a month on
compute because `apprunner_max_size` is 2. The organizations share that ceiling. The tenth
organization costs less than the first, because they all keep the same instance awake.

The real costs are not on the AWS bill:

- **Engineering upkeep.** MCP has had four spec revisions in 16 months, and clients lag behind
  each one. This is the biggest line, at a guess a few hours a month.
- **Support.** Expect "the connector won't connect" (OAuth, redirect URIs, expired refresh tokens)
  and "Claude did something I didn't ask for" tickets.
- **Rate limiting.** Our IP-keyed limiters would lump every Claude user of every customer into one
  bucket. That's an availability risk, not a cost, and it needs a design choice before launch.

So cost does not force a plan gate. T-676 can decide it on value and abuse risk. A 100-person
organization can't be on Free anyway, since Free stops at 3 groups of 10 members
(`flexi-day-be/src/services/billing/entitlements.ts`).

Anthropic's MCP connector on the Messages API has no fee of its own. The pricing page lists none,
unlike web search at $10 per 1,000 searches. Tool definitions and tool results are input tokens,
exactly as with tools we run in-process. If our Assistant used the connector, the tokens would cost
the same. What changes is extra HTTP round trips to our server and no zero data retention.

## What we run today

From `flexi-day-be/terraform/apprunner.tf`, `variables.tf` and `terraform.tfvars`:

| Setting                   | Value                                  |
| ------------------------- | -------------------------------------- |
| Instance size             | 0.25 vCPU (`256`), 0.5 GB (`512`)      |
| `min_size` / `max_size`   | 1 / 2                                  |
| `max_concurrency`         | 100 concurrent requests per instance   |
| Health check              | HTTP `/health` every 10 s              |
| Database                  | `db.t4g.micro`, Single-AZ, gp3 20 GB   |
| Database reservation      | 1 year all upfront, until 2027-10-13   |
| DB pool                   | `pg.Pool` defaults, 10 per instance    |
| Request limit per session | `apiLimiter`, 1,000 per 5 min per user |

App Runner prices in Frankfurt, from the AWS price list API (`AWSAppRunner`, `eu-central-1`):

| Usage type                     | Price                   |
| ------------------------------ | ----------------------- |
| `EUC1-AppRunner-vCPU-hours`    | $0.074496 per vCPU-hour |
| `EUC1-AppRunner-GB-hours`      | $0.008176 per GB-hour   |
| `EUC1-AppRunner-Provisioned-…` | $0.008176 per GB-hour   |
| `EUC1-AppRunner-Automatic…`    | $1 per pipeline a month |

The [App Runner pricing page](https://aws.amazon.com/apprunner/pricing/) lists only US, Ireland and
Tokyo rates, which is why I used the price list. It also sets out the billing model. A provisioned
instance costs memory only while idle. An active instance adds vCPU, billed per second, with "a
one-minute minimum charge for vCPU" each time a provisioned instance starts processing requests.
The [autoscaling guide](https://docs.aws.amazon.com/apprunner/latest/dg/manage-autoscaling.html)
says the same: "You pay for the memory usage of all the provisioned instances. You pay for the CPU
usage of only the active subset."

For our instance that works out as follows.

- Idle baseline: 0.5 GB × $0.008176 × 730 h = **$2.98 a month**, paid already.
- One instance active: 0.25 × $0.074496 = **$0.0186 an hour**, or $0.00031 a minute.
- First instance active around the clock: **$13.60 a month** on top of the baseline.
- Second instance active around the clock: vCPU plus memory, **$16.58 a month**.
- Ceiling for the service: $2.98 + $13.60 + $16.58 = **$33.16 a month**, plus $1 for deployments.

October's real bill shows how idle the instance is. App Runner cost $6.67: $4.84 provisioned
memory, $1 deployments, and $0.83 for 11.19 vCPU-hours. At 0.25 vCPU that's about 45 active
instance-hours in a 744-hour month. So the 10-second health checks don't count as activity, and the
web app's own traffic keeps the instance active for only an hour or two a day. MCP traffic would
mostly be new active time, not traffic riding on time we already pay for.

## Each cost an external client causes

### Model tokens

Never ours. Each vendor bills its own user, and we only answer HTTP requests.

- **Claude apps.** Custom connectors work for "users on Free, Pro, Max, Ultra, Team, and Enterprise
  plans", and "Free users are limited to one custom connector"
  ([Claude help: custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)).
  Anthropic counts "Tool usage" toward the user's own plan limits
  ([usage limit best practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices)).
- **ChatGPT.** Same idea. Business, Enterprise and Edu get full MCP, and Pro gets read and fetch
  only (T-668's reading of
  [connecting custom MCP servers](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)).
- **OpenAI Responses API.** The developer pays for the tokens "used when importing tool definitions
  or making tool calls", and "No additional fees apply per tool call"
  ([remote MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)).
- **Claude API connector and Cursor.** The developer or the Cursor subscriber pays their vendor.

What we control is how many tokens we make users spend. Every tool description goes into every
request, and every tool result becomes input tokens. A list tool that dumps a year of bookings
burns the user's Claude allowance and makes Flexi Day feel expensive inside Claude, even though it
costs us nothing. Claude cuts a tool result at about 150,000 characters anyway (T-668). Keep
results paged and short.

### App Runner compute and concurrency

In our stateless mode a 2025-era client sends `initialize`,
`notifications/initialized` and `tools/list` as separate POSTs, then one POST per tool call. A
conversation that calls four tools is about 7 requests. A 2026-era client skips the handshake.

Rough load for one 100-person organization, over 21 working days a month:

| Scenario | Users connected | Conversations a day each | Tool calls each | Requests a day | Requests a month |
| -------- | --------------- | ------------------------ | --------------- | -------------- | ---------------- |
| Light    | 30              | 3                        | 4               | 630            | 13,230           |
| Heavy    | 100             | 5                        | 6               | 4,500          | 94,500           |

These numbers are my assumptions, not measurements. They're generous for a leave tool, where most
people ask "how many days do I have left" a few times a month.

Compute cost follows active time, not request count. In both scenarios requests arrive more than
once a minute through an 8-hour working day, one every 46 s when light and one every 6 s when
heavy. With the one-minute minimum, the instance stays active the whole working day either way.

- Working hours only: 8 h × 21 days × $0.0186 = **$3.13 a month**.
- If MCP alone kept the instance awake around the clock: **$13.60 a month**.

Neither figure grows with the number of organizations until traffic needs a second instance.
Organizations in the same time zone share the same active hours, so the first EU organization
costs about $3 and the next ones close to nothing.

Concurrency doesn't come close to mattering. The heavy scenario peaks at perhaps 2 requests a
second. At 20 to 50 ms each, that's well under one request in flight against a `max_concurrency` of 100. CPU will run out before concurrency does. Node on 0.25 vCPU might manage a few dozen simple
requests a second, so latency will rise long before App Runner adds an instance, because it scales
on concurrency, not CPU. That's an existing property of our setup, and one heavy organization uses
a small slice of it.

Transport choice is the real lever, and T-668 already got it right. A client "MAY issue an HTTP
GET" to hold an SSE stream open, and the server "MUST either return `Content-Type:
text/event-stream` ... or else return HTTP 405 Method Not Allowed"
([2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)).
If we held those streams open, every connected user would be one request in flight. The instance
would never go idle, which costs the full $13.60 a month. At 100 connected users a second instance
would start, another $16.58, and at 200 the service would be saturated. App Runner's 120-second
request cap would also cut every stream and make clients reconnect. Stateless POST-only with plain
JSON responses, and 405 on GET, avoids all of it. The 2026-07-28 spec drops the GET stream anyway.

### Database

A tool call is one or two permission checks plus the query itself, comparable to one REST call.
`flexi-day-be/src/middleware/limiter.ts` puts a page load at about 10 requests. The heavy scenario,
4,500 MCP requests a day, is then about 450 page loads, or 4.5 extra page loads per person per day.
The `db.t4g.micro` handles that easily, and it's reserved until 2027-10-13 no matter what we put on
it. MCP adds no connections either. The pool is capped at 10 per instance, at most two instances.

Watch out for list tools without limits. One unbounded "all bookings in the organization" query
costs more than a thousand small ones.

### OAuth and auth infrastructure

No new AWS resource. better-auth runs in the existing process (T-668).

- With the `jwt` plugin and a `resource` in the request, access tokens are JWTs. A resource server
  checks them "Locally, with the JWKS", at "No network call (unless `remoteVerify` is set)"
  ([better-auth resource server](https://www.better-auth.com/docs/plugins/oauth-provider/resource-server)).
  So token checks don't hit the database. Opaque tokens cost one introspection per request. Use JWTs.
- A refresh is one database write. With hour-long access tokens that's a few per active user per
  day.
- Storage is a few rows per grant: a client, a consent, a refresh token. For 100 users that's
  kilobytes on a 20 GB volume.
- The JWT signing keys live in a better-auth table. If they get their own Secrets Manager secret
  instead, that's $0.40 a month
  ([Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)).
- Dynamic Client Registration is an open endpoint that writes a row per call. better-auth's `mcp()`
  plugin keeps it off until asked, but Cursor needs it (T-668). Rate-limit it, and prune clients
  nobody ever used.

### Logs, traces and data transfer

- CloudWatch Logs ingestion in Frankfurt is $0.63 per GB (price list, `EUC1-DataProcessing-Bytes`).
  The heavy scenario, at about 1 KB of log per request, is about 95 MB a month, or $0.06.
- Sentry gets request logs and samples 20% of traces (`flexi-day-be/src/instrument.ts`,
  `SENTRY_TRACES_SAMPLE_RATE`). The heavy scenario adds about 19,000 sampled transactions a month
  per organization. That counts against the Sentry plan quota rather than AWS. Check the quota
  before launch, or sample `/mcp` lower.
- Data transfer out was 1.33 GB in October and billed at $0. A heavy organization adds about 0.5 GB
  a month at 5 KB per response.

### Rate limiting and abuse

The bill is safe. `max_size = 2` caps compute at $33 a month whatever happens. The real exposure
is availability.

Anthropic sends every MCP tool call from fixed ranges, `160.79.104.0/21` and `153.61.208.0/20`
([Anthropic IP addresses](https://platform.claude.com/docs/en/api/ip-addresses)). Our app sets
`trust proxy` to 1, so `req.ip` is Anthropic's egress address, and two of our limiters key on it:

- `floodLimiter` allows 5,000 requests per 5 minutes per IP. Every Claude user of every Flexi Day
  customer would share a handful of those buckets. That's 16 requests a second across all
  customers, which a few heavy organizations could reach.
- `apiFailureLimiter` allows 100 failed requests per 5 minutes per IP, counted before session
  validation, and covers everything under `/api`. An MCP client's first call returns 401 by
  design, to start discovery, and every expired token returns 401 again. Mounted under `/api`,
  normal Claude traffic from all customers would trip this within minutes.

So mount `/mcp` outside `/api` and give it its own limiter, keyed on the token's user ID and OAuth
client ID, the same doctrine `apiLimiter` already follows. Keep the unauthenticated 401 path
IP-keyed but loose for the published Anthropic and OpenAI ranges. All limiters use
express-rate-limit's in-memory store, one per instance, so with two instances the real limit is
up to twice the configured one. That's acceptable.

Once a user connects an AI client, it can loop. Claude's own docs warn, for Research, about "the
impact of Claude sending a large number of requests to your connectors". A per-user limit around
`apiLimiter`'s 1,000 per 5 minutes is plenty for real use. A daily cap per organization would bound
a runaway agent without touching people.

### Support and upkeep

No primary source prices this. These are my estimates.

- **Spec churn.** Revisions 2025-03-26, 2025-06-18, 2025-11-25 and 2026-07-28 came out in about
  16 months, and the clients were still on the older ones when the newest one shipped (T-668). Each
  revision means an SDK upgrade and a retest against Claude, ChatGPT and Cursor. Call it half a day
  to two days a revision.
- **Connection support.** OAuth failures, redirect URIs, refresh tokens that died, a ChatGPT
  workspace admin who never enabled developer mode. Most of these end in "the vendor's settings,
  not ours", and we have to explain that every time.
- **Behaviour support.** "Claude cancelled my booking." The audit trail T-668 proposes, which
  records the OAuth client on each `vacation_events` row, is what makes this answerable. It's cheap
  to build and expensive to skip.

## Anthropic's MCP connector, if our Assistant used it

T-675 decides whether our Assistant runs tools in-process or calls our own `/mcp` through the
connector. On cost:

- **No fee beyond tokens.** The [pricing page](https://platform.claude.com/docs/en/about-claude/pricing)
  lists server-tool fees for web search ($10 per 1,000) and code execution, and says nothing about
  MCP. The [connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector) say
  MCP tool calls through the Batches API "are priced the same as those in regular Messages API
  requests", and quote no separate price.
- **Tool results are input tokens.** The pricing page lists what tool use bills: "The `tools`
  parameter in API requests (tool names, descriptions, and schemas)", "`tool_use` content blocks",
  and "`tool_result` content blocks in API requests". On top of that comes the tool-use system
  prompt, 286 tokens on Sonnet 5.5 and Opus 5.5. The connector returns `mcp_tool_result` blocks the
  caller sends back on the next turn, so they're billed the same way. The token bill is identical
  to in-process tools with the same definitions and results.
- **Extra requests on our server.** Unless we pin the tool list, the API asks our server for its
  tools on each request. With the `mcp-client-2026-09-15` header, an `mcp_tool_listing` block
  records the list, and later requests that carry it don't ask again. Every tool call is then an
  HTTPS round trip from Anthropic's cloud to App Runner, with OAuth checks, where an in-process call
  is a function call.
- **Other strings.** It's beta, tools only, it needs a public server and a token we mint per user,
  and it's "not covered by ZDR arrangements". Data exchanged with the server "is retained according
  to Anthropic's standard data retention policy".

The connector costs the same tokens and adds latency, a token-minting flow and a weaker retention
story. In-process stays the cheaper path.

## Server MCP and WebMCP on cost

|                     | Server MCP                                    | WebMCP                                        |
| ------------------- | --------------------------------------------- | --------------------------------------------- |
| Model tokens        | The user's AI vendor                          | The browser agent's vendor                    |
| Compute             | New active time, $0 to $3 per org a month     | Only while the tab is open, mostly on REST    |
| Requests per action | One POST per tool call                        | One or more REST calls per tool call          |
| Database            | Same as REST                                  | Same as REST                                  |
| Auth                | OAuth tables, JWT keys, refresh writes        | None, uses the session cookie                 |
| Abuse exposure      | New public endpoint, shared vendor egress IPs | None new                                      |
| Upkeep              | Spec revisions, three clients to retest       | Spec still a draft, origin trial token renews |
| Who can use it      | Claude, ChatGPT, Cursor today                 | Two Chrome test extensions today              |

WebMCP is cheaper to run. Its calls happen only while someone has the app open, when the page's
own requests already keep the instance active, and it adds no auth. But the difference is a few dollars a
month and some OAuth rows. Neither has a run cost that matters, so cost doesn't change T-668's
choice.

## Findings that touch other tickets

- **T-676 (which plan gets external MCP access).** Cost doesn't force a gate. One organization
  costs at most about $3 a month in compute, the service is capped at $33, and a 100-person
  organization is on Pro or Enterprise already. If Free gets it, the reason to limit it is abuse,
  since Free organizations cost nothing to create. A per-organization daily cap covers that
  without a plan gate.
- **T-675 (where the agent loop runs).** The connector costs the same tokens as in-process tools.
  It has no fee of its own, and it adds a `tools/list` and an HTTPS round trip to our server per
  call unless the list is pinned.
- **New decision ticket, or a requirement on the build ticket.** Rate limiting for `/mcp`. The
  IP-keyed `floodLimiter` and `apiFailureLimiter` would pool every Claude user behind Anthropic's
  egress ranges, and MCP discovery starts with a 401 on purpose. Decide the mount point outside
  `/api`, the key (user ID plus OAuth client ID), the per-user and per-organization limits, and a
  limit on Dynamic Client Registration.
- **Watch item.** The Sentry quota. At 20% trace sampling, MCP traffic could cost more there than
  on AWS.
- **Watch item, outside this map.** App Runner "is no longer open to new customers". Existing
  customers keep full use, but AWS does "not plan to introduce new features", and it recommends
  migrating to ECS Express Mode
  ([availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)).
  Nothing in the MCP plan depends on a new App Runner feature, so this doesn't block the map. It
  may deserve its own infrastructure ticket.
