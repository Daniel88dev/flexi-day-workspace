# Tracing the Assistant and the MCP endpoint without logging private details

Resolves Fenro [T-693](https://www.fenro-dashboard.com/tasks/T-693), a research ticket under the map
[T-667](https://www.fenro-dashboard.com/tasks/T-667) "AI assistant and Flexi Day MCP server". It
feeds the grilling ticket "Observability for the Assistant and the MCP endpoint" (T-696). Written
2026-11-07. Every URL in [Sources](#sources) was read that day, and the Sentry numbers come from
queries against the `freelancer-ldp` organization on the same day.

Inputs: the MCP limits in T-682, the Managed Agents loop with its backend relay and idle webhook in
T-686, and the Haiku screen that fails closed in T-678.

Short version. Keep Sentry and don't add Axiom: Flexi Day sends nothing to Axiom today, whatever
the ticket assumed. The backend's Sentry config already turns off prompt, output and MCP payload
capture, because `dataCollection.genAI` is off and `dataCollection.mcp` inherits it. The one
setting that needs care is sampling. Replace the flat 0.2 with a `tracesSampler` that drops
`/health` (about 90% of today's backend spans), samples `/mcp` at 5% while ignoring the caller's
sampling headers, and samples the Assistant routes at a higher rate. Alerts must not sit on
sampled spans. They go on unsampled logs, application metrics and errors. Claude Managed Agents'
OpenTelemetry export adds the inside of each turn, meaning the model requests, their tokens and
their errors. It can't see our relay, the screen or tool execution, so it supplements our spans
and does not replace them. Turn it on in Metadata only mode, never Full content.

| What                               | State on 2026-11-07                                                  |
| ---------------------------------- | -------------------------------------------------------------------- |
| `@sentry/node`, `@sentry/nextjs`   | `^11.10.0` in both repos                                             |
| Sentry organization                | `freelancer-ldp`, EU region (`de.sentry.io`), shared with 4 projects |
| Backend trace sample rate          | `SENTRY_TRACES_SAMPLE_RATE`, default 0.2, flat                       |
| Backend requests, last 30 days     | about 9,650 (unsampled request log lines)                            |
| Backend spans stored, last 30 days | about 290,000 (1.45M extrapolated × 0.2), about 90% from `/health`   |
| Backend log entries, last 30 days  | 20,208                                                               |
| Sentry included volume, every plan | 5M spans, 5 GB logs, 5 GB application metrics a month                |
| Axiom                              | not used by any Flexi Day repo                                       |
| Managed Agents OTel export         | beta; Console or Admin API destination; Metadata only is the default |

## What runs today

### Backend

`flexi-day-be/src/instrument.ts` starts Sentry before the app graph, only for CI-built production
images (`SENTRY_ENABLE` overrides). It already sets the privacy baseline this work needs:

- `dataCollection.genAI: { inputs: false, outputs: false }`.
- `httpBodies: []`, so no request body reaches Sentry. That covers the JSON-RPC body of `/mcp` and
  the chat message in a POST to the Assistant.
- `userInfo: false`, `cookies: false`, `databaseQueryData: false`, and IP-bearing headers denied.
- `tracesSampleRate` from `SENTRY_TRACES_SAMPLE_RATE`, default 0.2, with profiling bound to sampled
  traces at `profileSessionSampleRate` 0.1.
- No `traceLifecycle`, so v11's default, stream mode, is in effect. In stream mode
  `beforeSendTransaction` and `ignoreTransactions` do nothing, `beforeSendSpan` can change spans but
  not drop them, and `ignoreSpans` drops them (Sentry v10 to v11 migration guide).

`authSession.ts` sets only `Sentry.setUser({ id })` and a `session.id` attribute. Name and email
stay out by design.

`middleware/logger.ts` is winston with three transports: console (App Runner ships stdout to
CloudWatch), rotating files, and Sentry Logs through `createSentryWinstonTransport`. It has no Axiom
transport. `requestContext.ts` writes one line when a request arrives and one when it finishes,
with a redacted path and query, the request id, client headers and, after `authSession`, the user
id. `/health` is silenced unless it fails. `utils/redact.ts` covers secrets in queries and paths for
these lines. Sentry's own span URLs don't go through it.

### Frontend

`flexi-day/instrumentation-client.ts` runs `@sentry/nextjs` in production with
`browserTracingIntegration`, a 20% trace rate, trace propagation to `NEXT_PUBLIC_API_URL`, and
`consoleLoggingIntegration` with no level filter. That last one matters for the chat panel: any
`console.*` call in the browser becomes a Sentry log. Its `dataCollection` block is empty, which is
safe in the browser only because the browser SDK doesn't collect fetch bodies.

### What the backend actually sends to Sentry

Measured with Sentry's Explore views over the last 30 days. Explore extrapolates `count()` by the
sample rate (Sentry trace explorer docs), so I divide span counts by 5 to get what was stored.

| Span op       | Extrapolated count | Note                                                       |
| ------------- | ------------------ | ---------------------------------------------------------- |
| `middleware`  | 1,335,250          | 1,315,875 of them in the unnamed `GET` transaction         |
| `db`          | 95,650             |                                                            |
| `http.server` | 9,180              | about one per real request, matching the request log lines |
| other         | 12,110             | `handler`, `router`, `http.client`, `rpc`                  |

The unnamed `GET` transaction is the App Runner health probe. Over 7 days, 60,400 of its
`helmetMiddleware` spans had `url.path` `/health`: one probe every 10 seconds. Each probe yields
five middleware spans and no stored root span, so the root is probably dropped by an inbound filter
while its children are kept and counted. That is about 260,000 of the 290,000 spans the backend
stores each month. The rest works out to roughly 15 spans per sampled API request.

Logs are unsampled, and they tell the real request volume: 9,654 request lines and 9,601 response
lines in 30 days, about 320 requests a day.

The organization's plan and pay-as-you-go budget aren't visible through the tools I had. The
`fenro-dashboard` project shares the same 5M span quota and stores a similar extrapolated volume at
an unknown rate. Sentry drops data once reserved volume and PAYG budget are spent, so one noisy
project can blind every project in the organization for the rest of the month (Sentry pricing
docs).

## What Sentry's AI and MCP integrations capture

All of this is from the Sentry Node docs, checked against SDK 11.10.

**Anthropic integration.** `anthropicAIIntegration` is on by default whenever tracing is on. It
instruments `messages.create()`, `messages.stream()`, `completions.create()` and
`beta.messages.create()` for `@anthropic-ai/sdk` `>=0.19.2 <1.0.0`. It records model, token usage
and latency always, and prompts and outputs when `recordInputs` and `recordOutputs` are true. Those
default to `dataCollection.genAI.inputs` and `.outputs`, which are on unless set otherwise. Ours are
off.

What that means for us is that it instruments the Haiku screen, which is a Messages API call. It
sees nothing of the Assistant's main loop, because Managed Agents is driven through
`beta.sessions.*` calls and the model runs inside Anthropic. The documented list doesn't include
the sessions API. The SDK major version must also stay inside the supported range, so check it when
the Anthropic SDK is added.

**MCP server monitoring.** From 11.1.0 the SDK instruments every `McpServer` from
`@modelcontextprotocol/server` 2.x or `@modelcontextprotocol/sdk` 1.9+ on its own. Each
`tools/call` becomes an `mcp.server` span named `tools/call <tool>`. Metadata always goes: method,
tool name, session and protocol version, content counts, error status. By default v11 also records
inputs (tool arguments as `mcp.request.argument.*`, prompt arguments, logging payloads) and outputs
(`mcp.tool.result.content`). `dataCollection.mcp` controls that from 11.9.0. A field left unset
falls back to the matching `dataCollection.genAI` field, so our config already turns MCP content
off. `wrapMcpServerWithSentry(server, { recordInputs, recordOutputs })` overrides both per server.

**Agent tracing in general.** Sentry's Agents views read `gen_ai.*` spans: `gen_ai.invoke_agent`,
`gen_ai.chat`, `gen_ai.execute_tool`, and a `decide` operation for grading spans.
`Sentry.setConversationId(id)` groups spans into Conversations and `setUser` fills its user column.
For manual spans, content is whatever we set. `gen_ai.tool.call.arguments`,
`gen_ai.tool.call.result`, `gen_ai.input.messages` and `gen_ai.output.messages` are optional, so we
leave them off. Sentry computes model cost from the model name and token counts. In Conversations
without content, a chat shows as a list of tool names, tokens and timings. That's enough for
debugging and is what we want.

**What always goes regardless.** The request URL's scheme, host and path. Query values unless
denied. Headers, with values filtered when their names match terms like `auth`, `token` or
`password`. So the `Authorization: Bearer` header on `/mcp` arrives as `[Filtered]`, while its
name and other headers arrive as sent.

**Turning it off.** The global switches are `dataCollection.genAI` and `dataCollection.mcp`. The
per-integration switches are `anthropicAIIntegration({ recordInputs, recordOutputs })` and
`wrapMcpServerWithSentry(..., { recordInputs, recordOutputs })`. Our manual spans need code review:
no content attributes, ever.

## Claude Managed Agents: OpenTelemetry export and the event stream

All of this is from Anthropic's platform docs. OTel export, the session viewer and webhooks are
beta, and the span reference warns that names and attributes can change.

### OTel export

Two sources exist. **API tracing** is set up as a destination in the Console or through the Admin
API (`/v1/organizations/telemetry_destinations`, beta header
`telemetry-destinations-2026-08-11`). It needs the Console admin role, an OTLP/HTTP endpoint on
port 443, and covers all, selected, or all-but-selected workspaces. Sentry is a listed provider. The
Console takes the project DSN and derives the endpoint and key. **SDK tracing** happens in our
process and uses whatever tracer provider the application registers.

For a Managed Agents session the API emits an `anthropic.sessions.<method>` span per Sessions API
request, an `anthropic.session.turn` span (`invoke_agent`) per turn, and under each turn an
`anthropic.model_request` span (`chat`) per model request. Model request spans carry token usage
and `error.type` such as `rate_limit_error`. Turn spans carry `anthropic.session.turn.stop_reason`,
for example `requires_action`, and the `error.type` of a `session.error` that ended the turn. Every
span carries `anthropic.session.id` and `gen_ai.conversation.id`, the session thread id.

The API does not emit a tool span for custom tools. Our tools run in our backend, so their spans
are ours to create.

Content modes are per destination. **Metadata only** is the default: identifiers, timing, status,
token counts, agent and tool names. **Full content** adds the system prompt, input and output
messages, and `gen_ai.tool.call.arguments` and `anthropic.tool_result.content` on tool spans. For
us that would mean user messages, the per-user `system.message` with name, role and organization,
and every tool result (colleagues' absences, balances, directory fields). It would ship to Sentry
under Sentry's retention. Metadata only is the only acceptable mode.

Sampling follows the caller. The API reads the W3C `traceparent` header. If the sampled flag is
off, it emits no span for that request or anything under it. Without the header, spans land in
their own traces. Delivery is at least once and best effort, retried a few times. A destination
that fails for 24 hours, or answers with a redirect, is disabled and its spans are dropped. Limits
are 10 destinations per organization and 20 headers each.

Two gotchas for a Node backend that already runs Sentry:

- The Anthropic TypeScript SDK sends `traceparent` itself and emits its own client spans through the
  registered tracer provider. Sentry v11 registers one. If Sentry's fetch instrumentation also adds
  `traceparent` (`propagateTraceparent: true`, off by default), a request can carry two headers.
  Anthropic's docs warn that a duplicate header from undici instrumentation invalidates the trace
  context. Exactly one source may write it.
- The SDK's `anthropic.messages.create` spans and Sentry's `anthropicAIIntegration` spans describe
  the same screen call. Anthropic's troubleshooting table says to turn one off.

### Event stream, session usage and webhooks

The relay reads the stream anyway, and that stream is a complete, unsampled record of every turn:

- `span.model_request_start` and `span.model_request_end`. The end event carries `model_usage` with
  token counts.
- `session.error`, with a typed `error` and a `retry_status`. `session.status_rescheduled` means a
  transient error and an automatic retry. `session.status_terminated` means an unrecoverable error
  or archiving.
- `session.status_idle` with `stop_reason.type`, for example `requires_action` or `end_turn`.
- `session.usage`, a cumulative snapshot of tokens and `list_cost` in whole cents, emitted right
  before each idle and when a thread pauses at the session budget.
- `agent.thread_context_compacted`, which the chat length ceiling from T-686 is supposed to prevent.
  It doubles as a check that the ceiling works.

Webhooks carry only the event type and resource id, so we fetch the session ourselves. They are
retried up to three times over 5 to 120 seconds and then dropped, with "no signal that it was
lost". An endpoint that fails continuously, redirects, or resolves to a private address is
auto-disabled, and events in the meantime are never replayed. `session.budget_reached` fires once
per budget value. Anthropic says webhooks are not a durable log.

The Console session viewer shows the full transcript, tool inputs and results, to anyone with the
Developer or Admin role in the workspace. That is a privacy surface in its own right, separate from
any trace setting.

### Does it replace our own spans?

No. It shows what happens inside Anthropic: turn duration, each model request's latency, tokens and
errors. It cannot see the relay and its reconnects, the Haiku screen as part of a turn, tool
execution and its database work, the idle webhook handler, or the ledger. Those are ours. It also
duplicates what the event stream already gives us at 100%: tokens per model request and the errors
that ended a turn. So the events feed metrics and alerts, and the OTel destination is a debugging
aid that nests Anthropic's view of a turn under our sampled trace.

## What `/mcp` costs at a few sampling rates

Estimates, built on the measurements above. Per sampled `/mcp` request I assume 20 stored spans:
today's 15 per API request, plus the `mcp.server` span, the per-call grant, plan and owner-switch
re-checks from T-673, the daily counter upsert from T-682, and one `execute_tool` span. The spike
should measure the real figure.

The map's "heavy organization" is about 19,000 sampled transactions at 20%, so about 95,000
requests a month. The worst cases are an organization that sits at its daily AI connection limit
every day of the month (T-682: Pro 5,000, Enterprise 20,000 `tools/call` a day).

| Organization                  | Requests / month | 100% | 20%  | 5%   | 1%   |
| ----------------------------- | ---------------- | ---- | ---- | ---- | ---- |
| Heavy, from the map           | 95,000           | 1.9M | 380k | 95k  | 19k  |
| Pro at its daily limit        | 150,000          | 3.0M | 600k | 150k | 30k  |
| Enterprise at its daily limit | 600,000          | 12M  | 2.4M | 600k | 120k |

Stored spans a month. Today the backend stores about 290,000, and the organization's quota is 5M
across five projects.

Money is not the constraint. Sentry's PAYG span price is $0.0000020 on Team and $0.0000040 on
Business, so 2.4M extra spans cost about $5 to $10. The risk is the shared quota. Without PAYG,
data past the quota is dropped and the whole organization goes blind until the month resets.
At 20%, one Enterprise organization at its limit uses half the quota on its own. At 5% it uses an
eighth, which still gives a few thousand sampled tool calls a day per busy organization.
Extrapolated latency and error rates stay usable at that volume, and Sentry warns when a rate is
too low to extrapolate.

Errors are not sampled. Every 5xx and every `captureException` reaches Sentry whatever the trace
rate, so debugging a failing tool doesn't depend on the sample.

Logs aren't sampled either. Two request lines per call give 1.2M lines a month for an Enterprise
organization at its limit. At an estimated 0.5 to 1 KB a line that's 0.6 to 1.2 GB against the
5 GB included, and $0.50 per GB beyond it.

Profiling runs for the length of each sampled trace at `profileSessionSampleRate` 0.1, and
continuous profile hours are PAYG only at $0.0315 an hour. Sampling `/mcp` lower keeps that flat
too.

The Assistant is smaller. T-672 estimated about 138 chats a week for an organization. With about 3
turns a chat, and a POST, an occasional reconnect GET and a webhook per turn, that's roughly 5,000
requests a month. At about 40 spans each (relay, screen, tool spans, database), that's 200k spans a
month for one organization at 100%, and 40k at 20%. The Managed Agents destination adds about 5 to
10 Anthropic spans per sampled turn. All of this is an estimate.

## A `tracesSampler` that treats the routes differently

The sampler gets the span `name`, its initial `attributes`, `parentSampled`, `parentSampleRate` and
`inheritOrSampleWith`. For `http.server` spans the name is not yet parametrised (`POST /mcp`, not a
route template). That's fine here, because every path we branch on is static.

```ts
const rate = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
};

const DEFAULT_RATE = rate("SENTRY_TRACES_SAMPLE_RATE", 0.2);
const MCP_RATE = rate("SENTRY_TRACES_MCP_RATE", 0.05);
const ASSISTANT_RATE = rate("SENTRY_TRACES_ASSISTANT_RATE", 1);

const pathOf = (name: string, attributes?: Record<string, unknown>) => {
  const fromAttributes = attributes?.["url.path"] ?? attributes?.["http.target"];
  if (typeof fromAttributes === "string") return fromAttributes.split("?")[0];
  return name.split(" ")[1] ?? name;
};

tracesSampler: ({ name, attributes, inheritOrSampleWith }) => {
  const path = pathOf(name, attributes);
  if (path === "/health") return 0;
  // A caller's sentry-trace, baggage or traceparent header must not set our rate here.
  if (path === "/mcp" || path.startsWith("/mcp/")) return MCP_RATE;
  if (path.startsWith("/api/assistant") || path.startsWith("/webhooks/anthropic")) {
    return ASSISTANT_RATE;
  }
  return inheritOrSampleWith(DEFAULT_RATE);
},
```

Route prefixes are placeholders until the build tickets name the routes. Which attribute holds the
path in v11's sampling context is not documented, so the spike logs `attributes` once and fixes
`pathOf`.

Two choices in it are deliberate:

- `/mcp` ignores the parent decision. External clients reach `/mcp` from the internet, and Sentry
  continues a trace from inbound `sentry-trace`, `baggage` and possibly `traceparent` headers.
  With `inheritOrSampleWith`, any caller could send a sampled flag and force 100% tracing of their
  own traffic. The same holds for the `/oauth2/*` and `/.well-known/*` endpoints from T-673, which
  can take the default rate without inheriting.
- The Assistant routes also ignore the parent. The browser samples at 20%, and following it would
  sample Assistant turns at 20% too. Deciding on the backend gives backend-only traces for turns the
  browser didn't sample, which Sentry docs call a broken trace. For the Assistant, a whole backend
  turn is worth more than the browser half. Launch at 1.0, then lower `SENTRY_TRACES_ASSISTANT_RATE`
  once more than a handful of organizations use it.

`ignoreSpans` is an alternative for `/health` but less good. The sampler returning 0 means no spans
get created at all, and no profiler starts either.

## What must never reach a trace, a log or a metric

The rule covers spans, span attributes, Sentry Logs, application metrics, error messages and
breadcrumbs, the winston console and file transports (CloudWatch), and the frontend console,
because `consoleLoggingIntegration` forwards it.

Never:

- Chat text: user messages, assistant text, refusals' context, rejected turns, card previews.
- The system prompt and the per-user `system.message`, which carries name, role, organization,
  language and date.
- Tool arguments and tool results, on both channels. That includes dates, notes, request reasons,
  colleague names and absences, balances, directory and Sensitive section fields, and attendance
  data. Error messages built from them count too. A Zod error that echoes an argument is content.
- The screen's input. Its verdict (`inScope`, `attack`) is fine.
- Names and email addresses of users or colleagues. `user.id` stays the only identity, as today.
- Credentials: OAuth access and refresh tokens, authorization codes, PKCE verifiers, DCR client
  secrets, the Anthropic API key, the webhook signing secret.
- Anthropic `Full content` spans, in any environment that holds real users.

Allowed, and enough to debug with:

- Ids: `user.id`, organization id, our chat id as the conversation id, the Anthropic session id,
  OAuth client id, request id, tool-use event id.
- Names and enums: tool name, MCP method, channel (`assistant` or `mcp`), model, effort, screen
  verdict, stop reason, `error.type`, limit kind and plan.
- Numbers: token counts, list cost and our settled cost, latency, counts, HTTP status, the turn
  number and the count of tool calls in a turn.

Ids are pseudonymous personal data under GDPR, so they still belong in the processing record T-695
writes. They are what the existing setup already sends.

## Alerts the build needs

Every alert below sits on an unsampled signal: an error event, a Sentry log, or an application
metric. A span-based monitor at a 5% sample would miss rare events and fire late on spikes.
Sentry's Metric Monitors take thresholds on errors, spans, logs, releases and application metrics.
Application metrics (`Sentry.metrics.*`) need SDK 10.25 or later, which we have, and 5 GB a month
is included.

| Alert                         | Signal                                                                                                                                      | Where                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Anthropic spend, hard stop    | Workspace monthly spend limit, separate for dev, prod and eval (T-686, T-689)                                                               | Claude Console, set by hand        |
| Anthropic spend, warning      | Workspace email notification at a set amount, below the limit                                                                               | Claude Console, set by hand        |
| Anthropic spend, daily        | Metric `assistant.cost_usd`, one data point per settlement, from our ledger; monitor the daily sum                                          | Sentry metric monitor              |
| Ledger drift                  | The monthly reconcile (T-674) logs an error when our total and Anthropic's usage report differ beyond a tolerance                           | Sentry issue alert on the error    |
| Screen failures               | Counter `assistant.screen_failed` with `reason` (`timeout`, `api_error`, `refusal_parse`), plus a warn log; monitor count per 15 minutes    | Sentry metric monitor              |
| Turn errors                   | Counter `assistant.session_error` with the `session.error` type and `retry_status`, from the relay or the advance step                      | Sentry metric monitor              |
| Webhook failures              | Signature failures and stale payloads log a warn and count `assistant.webhook_rejected`; handler exceptions are Sentry errors as any 5xx is | Sentry metric monitor, issue alert |
| Webhook missed                | When the relay finds a tool call older than a few minutes that nobody answered, it logs `assistant.webhook_missed` and advances the session | Sentry log monitor, any occurrence |
| Daily AI connection limit hit | The counter upsert that first crosses the cap logs `mcp.daily_limit_reached` with organization, plan and limit kind, once per day           | Sentry log monitor, any occurrence |
| Weekly limit reached          | Same pattern for the Assistant's Weekly limit (T-684)                                                                                       | Sentry log monitor                 |

Notes on the ones that need care:

- Anthropic's Console usage can lag by about 2 hours, so a workspace limit isn't exact. It's a
  backstop behind our ledger, which refuses before it overshoots (T-684).
- The screen fails closed, so a Haiku outage is an Assistant outage. Alert on a low absolute count
  in 15 minutes, because at launch volume a rate is noise.
- Lost webhooks leave no trace at Anthropic, and an auto-disabled endpoint shows only in the
  Console. The "webhook missed" log detects it from our side without polling. The next time a user
  opens or reconnects to a chat, the relay lists events, notices a stale unanswered tool call, logs
  it and advances. One occurrence is worth a look, several mean the endpoint is down.
- The daily AI connection limit also shows in the T-680 usage view. The alert is for us, so we see
  which plans hit their caps and whether the numbers are right. It's not for customers.
- `session.budget_reached` should be rare if the ledger raises the budget correctly. Log it at warn
  and add it to a monitor if it shows up in production.

## Axiom

No Flexi Day repo sends anything to Axiom. A search of all five repos found no Axiom package,
transport, token or config. The ticket's premise, "Axiom through `logger.ts`", doesn't hold:
`logger.ts` writes to console, files and Sentry Logs. The Axiom organization that this machine's
Axiom MCP server reaches holds another organization's services, not Flexi Day's.

For the record, Axiom's pricing page lists a free Personal plan with 500 GB of ingest, 30-day
retention and 10 GB-hours of query compute a month, and Axiom Cloud at $25 a month plus usage. Its
docs describe edge deployments chosen per organization, with account data always in the US. Adding
it would mean a second place for logs, a second processor in the privacy texts, and no gain until
Sentry Logs runs past 5 GB a month. My recommendation is to leave it out.

## Recommendation

Stay on Sentry, with five changes:

1. **Sampling.** A `tracesSampler` with `/health` at 0, `/mcp` at 5% that ignores parent
   decisions, Assistant routes and the Anthropic webhook at 100% to start, and everything else at
   the current 0.2 with inheritance. Each rate is an environment variable.
2. **Privacy switches stated outright.** Set `dataCollection.mcp: { inputs: false, outputs: false }`
   even though it inherits today, so a later change to `genAI` can't turn MCP content on. Keep
   `genAI` off. Our manual spans carry no content attributes.
3. **Our spans.** The shared tool layer wraps every run in one `gen_ai.execute_tool` span with tool
   name, channel and outcome, and no arguments or results. Under `/mcp` it nests in Sentry's
   automatic `mcp.server` span. The advance-session step and the relay get plain spans
   (`assistant.advance`, `assistant.relay`). The screen gets Sentry's automatic `gen_ai.chat`
   span. Assistant requests call `Sentry.setConversationId(chatId)`.
4. **Signals from the event stream.** The relay and the advance step turn `span.model_request_end`,
   `session.error`, `session.status_rescheduled` and `session.usage` into application metrics and
   logs. Those feed the alerts above at 100%, independent of trace sampling.
5. **Managed Agents OTel to Sentry, Metadata only, prod only.** Add a Console destination for the
   prod workspace with the `flexi-day-be` DSN. Propagate `traceparent` from exactly one source so
   Anthropic's spans nest under our sampled traces and are skipped for unsampled ones. If the spike
   finds that propagation can't be made reliable, skip the destination. The event stream already
   gives everything the alerts need.

Two things outside Sentry matter as much as the sampler. The Claude Console session viewer shows
full transcripts to every Developer and Admin of the prod workspace, so the prod workspace should
have no members besides the owner. And the frontend chat panel must never `console.log` content,
because the browser SDK forwards every console level.

## Requirements for the build tickets

- **Spike first.** Log the `tracesSampler` sampling context once for `GET /health`, `POST /mcp` and
  an Assistant POST, and fix `pathOf` to the attribute v11 actually provides.
- **Spike.** Confirm in a request capture that calls to `api.anthropic.com` carry exactly one
  `traceparent`, with the sampled flag matching Sentry's decision. Either keep the Anthropic SDK's
  propagation and leave Sentry's `propagateTraceparent` off, or set
  `new Anthropic({ openTelemetry: { propagation: false } })` and turn Sentry's on. Then decide
  between the SDK's `anthropic.messages.create` spans and Sentry's `anthropicAIIntegration` spans
  for the screen, and turn the other off.
- **Spike.** Measure stored spans per sampled `/mcp` call and per Assistant turn, and re-run the
  cost table with the real figures.
- **Spike.** Check Sentry Stats > Usage to see whether the `/health` child spans count against the
  quota. The sampler removes them either way.
- `instrument.ts`: the `tracesSampler` above replaces `tracesSampleRate`. Add explicit
  `dataCollection.mcp: { inputs: false, outputs: false }`. Add `code` and `state` to the
  `urlQueryParams` deny list, so OAuth redirects that pass through the backend match what
  `redact.ts` already hides in our own log lines.
- New environment variables `SENTRY_TRACES_MCP_RATE` and `SENTRY_TRACES_ASSISTANT_RATE` go into
  `config.ts` validation and the App Runner Terraform, as `flexi-day-be/CLAUDE.md` requires for any
  variable.
- A unit test pins the sampler: `/health` returns 0, `/mcp` ignores a sampled parent, an Assistant
  route returns its own rate, other routes inherit.
- The tool layer's span wrapper has a test that a tool call with a known argument and result
  produces a span whose attributes contain neither, on both channels.
- `requestContext` logs at most one line for a successful `/mcp` call (the response line), to halve
  log volume on the busiest route. Failures keep both lines.
- No `logger.*` call in the Assistant, MCP or tool code passes message text, tool arguments, tool
  results or the `system.message`. The code review checklist for those tickets says so, and the
  invariants doc gets an entry next to the existing Sentry privacy notes.
- Error messages raised inside tools and the screen must not interpolate user-written text or tool
  arguments, because `captureException` sends the message.
- The relay and advance step emit the metrics `assistant.cost_usd`, `assistant.screen_failed`,
  `assistant.session_error` and `assistant.webhook_rejected`, and the logs
  `assistant.webhook_missed`, `mcp.daily_limit_reached` and `assistant.weekly_limit_reached`, with
  only the attributes allowed above.
- The Sentry monitors in the alert table are created by hand (or through the Sentry MCP server)
  after the first deploy. The ticket lists them so they aren't forgotten. The Console spend limits,
  spend notification, OTel destination and webhook endpoint are manual steps for the user, listed
  in the infrastructure ticket (T-694).
- The prod Anthropic workspace has no Console members besides the owner, because the session viewer
  shows full transcripts.
- The OTel destination, if added, is Metadata only and covers the prod workspace alone. Full
  content is never used where real users' sessions run.
- The frontend chat panel and its stream handler never pass message text, card content or tool
  output to `console.*` or to a Sentry call.
- The data protection texts (T-695) name Sentry as a processor of pseudonymous ids for the
  Assistant and MCP, with no content, and name Anthropic's OTel export to Sentry if the destination
  goes in.

## Sources

Sentry, read 2026-11-07:

- [Anthropic integration, Node](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/anthropic/)
- [Agent tracing, Node](https://docs.sentry.io/platforms/javascript/guides/node/agent-tracing/)
- [Agent tracing, manual instrumentation](https://docs.sentry.io/platforms/javascript/guides/node/agent-tracing/manual-instrumentation/)
- [MCP monitoring, Node](https://docs.sentry.io/platforms/javascript/guides/node/mcp-monitoring/)
- [Data collected, Node](https://docs.sentry.io/platforms/javascript/guides/node/data-management/data-collected/)
- [Sampling, Node](https://docs.sentry.io/platforms/javascript/guides/node/sampling/)
- [Filtering, Node](https://docs.sentry.io/platforms/javascript/guides/node/configuration/filtering/)
- [Migration v10 to v11](https://docs.sentry.io/platforms/javascript/guides/node/migration/v10-to-v11/)
- [Options: `propagateTraceparent`, `traceLifecycle`](https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/)
- [Application metrics, Node](https://docs.sentry.io/platforms/javascript/guides/node/metrics/)
- [Monitors](https://docs.sentry.io/product/monitors-and-alerts/monitors/)
- [Trace explorer: extrapolation](https://docs.sentry.io/product/trace-explorer/)
- [Pricing & Billing](https://docs.sentry.io/pricing/) and [sentry.io/pricing](https://sentry.io/pricing/)
- [Trace the Claude Platform with OpenTelemetry (Sentry cookbook)](https://sentry.io/cookbook/trace-claude-platform-with-opentelemetry/)

Anthropic, read 2026-11-07:

- [OpenTelemetry tracing for the Claude API](https://platform.claude.com/docs/en/manage-claude/opentelemetry)
- [Set up OpenTelemetry with the Claude API](https://platform.claude.com/docs/en/manage-claude/opentelemetry/api)
- [Set up OpenTelemetry with the Claude SDK](https://platform.claude.com/docs/en/manage-claude/opentelemetry/sdk)
- [OpenTelemetry span reference](https://platform.claude.com/docs/en/api/opentelemetry/spans)
- [Inspect sessions and track usage](https://platform.claude.com/docs/en/managed-agents/session-observability)
- [Session event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [Managed Agents reference: event types](https://platform.claude.com/docs/en/managed-agents/reference)
- [Subscribe to webhooks](https://platform.claude.com/docs/en/managed-agents/webhooks)
- [Create and manage Workspaces in the Claude Console](https://support.claude.com/en/articles/9796807-create-and-manage-workspaces-in-the-claude-console)

Axiom, read 2026-11-07:

- [Pricing](https://axiom.co/pricing)
- [Edge deployments](https://axiom.co/docs/reference/edge-deployments)

Code, read-only at the clones' current branches:

- `flexi-day-be/src/instrument.ts`, `src/middleware/logger.ts`, `src/middleware/requestContext.ts`,
  `src/middleware/authSession.ts`, `src/utils/redact.ts`, `package.json`
- `flexi-day/instrumentation-client.ts`, `package.json`

Measurements: Sentry Explore queries on the `flexi-day-be` project, last 30 days (spans by
`span.op`, by transaction, by `span.name`; logs by severity and `http.event`) and last 7 days
(`helmetMiddleware` spans by `url.path`).
