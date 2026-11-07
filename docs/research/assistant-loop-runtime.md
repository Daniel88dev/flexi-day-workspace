# Where the Assistant's agent loop runs, and what it costs

Resolves Fenro T-685, a research ticket under the map T-667 (AI assistant and Flexi Day MCP
server). Written 2026-11-07. Every URL below was read on that date, and the AWS prices come from
the AWS price list API for `eu-central-1` (publication dates noted in the tables). Our settings
come from `flexi-day-be/terraform/` on `main`.

The fixed inputs are the decisions in T-675 ("Where the agent loop runs and how it reaches the
tools"): Anthropic API with an API key and `global` inference, tools defined once and run
in-process in the backend, writes parked as pending actions behind a confirmation card, SSE with
`text`, `tool`, `card`, `error` and `done`, one active turn per user, a meter reservation before
every model call (T-674), and a Haiku 5.5 screen before Sonnet 5.5 on every turn (T-672).

## Short answer

Run the loop in a Lambda outside the VPC, streaming to the browser through a Function URL, and
calling back to HMAC-signed internal routes on the backend for everything that touches the
database. It is the only option that meets every T-675 and T-674 requirement on today's
infrastructure. It keeps running when the browser goes away (AWS documents this), allows a turn of
up to 15 minutes, needs no NAT gateway or load balancer, and costs nothing until about 16 Enterprise
organizations, because the Lambda free tier covers the compute. At 100 organizations it adds about
$27 a month, under 1 percent of the model bill.

The backend on App Runner is cheaper to build but fails two requirements. App Runner cuts every
request at 120 seconds, and it throttles the CPU of an instance with no request in flight, so a
loop that outlives its browser connection crawls. A service of our own on Fargate fixes both but
costs about $40 a month before the first conversation. Claude Managed Agents can pause for a card
cleanly, but it can't reserve the meter before each model call, it keeps transcripts until we
delete them, it is beta, and it still needs our backend as the relay, so App Runner's limits come
back.

Write the loop against a narrow port with an in-process adapter and a callback adapter. If T-683
moves the backend to ECS Express Mode, the loop can move back into the backend process and the
Lambda goes away.

## Load and the numbers every option shares

From `research/assistant-guardrails-and-models` and `research/assistant-metering`:

- A typical conversation has 4 user turns and 8 Sonnet calls, plus one Haiku screen per turn. It
  costs about $0.073 at Anthropic list price, and 138 of them fit the 10 USD weekly cap.
- At the cap that is 138 × 52 / 12 ≈ **598 conversations and 2,392 turns per organization per
  month**. I price every option at that load, which is the most an Enterprise organization can use.
- Model spend at the cap is about $43.65 per organization per month, $4,365 at 100. The plumbing
  below should be judged against that.

I could not find a published output speed for Sonnet 5.5, so turn length is my estimate: about
20 seconds of loop time for a typical turn (two Sonnet calls of about 400 output tokens, a screen,
a few tool calls), 80 seconds per conversation, 13.3 hours of loop time per organization per month.
A heavy turn of 10 calls runs past 100 seconds, and one call that uses its full `max_tokens` of
8,000 can take minutes by itself. The spike should measure this.

## What exists today

From `flexi-day-be/terraform/`:

| What                | State on `main`                                                                     |
| ------------------- | ----------------------------------------------------------------------------------- |
| App Runner instance | 0.25 vCPU, 0.5 GB, `min_size` 1, `max_size` 2, `max_concurrency` 100                |
| App Runner egress   | Default public egress, no VPC connector (`apprunner.tf`)                            |
| VPC                 | One VPC, an internet gateway, two public subnets for RDS (`vpc.tf`)                 |
| NAT gateway         | **None.** No `aws_nat_gateway` anywhere in the module                               |
| RDS                 | Publicly accessible, port 5432 open, forced SSL (`security-groups.tf`, `rds.tf`)    |
| Attachment Lambda   | `nodejs24.x`, no `vpc_config`, calls `https://api.flexi-day.com` (`attachments.tf`) |

The attachment Lambda reports back through `POST /api/attachments/processed`, signed with
`x-attachment-signature`, the hex HMAC-SHA256 of the raw body under a shared secret from Secrets
Manager (`attachmentCallbackRouter.ts`). That is the pattern option 2 extends.

Because RDS has a public endpoint, anything in a public subnet with a public IP reaches it without
NAT. That keeps option 3 cheaper than the usual Fargate setup.

## Option 1. The loop in the backend on App Runner

**Turn length.** "There is a total of 120 seconds request timeout limit on the HTTP requests. The
120 seconds include the time the application takes to read the request, including the body, and
complete writing the HTTP response"
([App Runner developer guide](https://docs.aws.amazon.com/apprunner/latest/dg/develop.html)). It
is fixed. A typical turn fits. A 10-call turn or one long call does not, and the stream breaks
mid-turn.

**Streaming.** App Runner supports HTTP 1.0 and 1.1 to the container. Its docs don't say whether it
buffers a chunked response. I found nothing either way, so SSE through App Runner needs a spike
before anyone relies on it.

**Disconnect.** When the browser leaves, or the 120 seconds run out, the request ends but the Node
loop keeps going. The problem is CPU. App Runner bills vCPU only while an instance is "processing
requests" ([pricing](https://aws.amazon.com/apprunner/pricing/)), and AWS's App2Container guide is
blunter: "App Runner heavily throttles container CPU when requests are not actively being
processed", so an application "must not be dependent on background processing"
([App2Container and App Runner](https://docs.aws.amazon.com/app2container/latest/UserGuide/a2c-integrations-apprunner.html)).
At 100 organizations other requests would usually keep the instance awake. At one organization the
loop would finish reading the model stream on a throttled CPU, if at all. That breaks T-674's rule
to read every stream to the end so usage is exact.

**Tools and meter.** In-process. Exactly what T-675 assumed.

**Availability.** App Runner "is no longer open to new customers". Existing customers keep full use
and AWS keeps investing "in security and availability", but it does "not plan to introduce new
features" and recommends ECS Express Mode
([availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)).
The 120-second limit will not move. That is T-683's question, not this one, but it means option 1
can't wait for a fix.

**Terraform.** One secret for the Anthropic API key. Nothing else.

**Cost.** Only new active time. From T-669 (`research/mcp-cost`): one active instance costs
$0.0186 an hour, with a one-minute vCPU minimum each time an idle instance starts serving. The
upper bound per organization is one activation per turn, 2,392 minutes or $0.74 a month. The lower
bound is the loop time, 13.3 hours or $0.25. Much of it overlaps time the user's own page requests
already pay for. At 100 organizations the first instance is busy through most working hours, and
its whole month costs $13.60, which caps the line. About 7 streams are open on average in working
hours at that load, well under `max_concurrency` 100, so the second instance stays idle.

## Option 2. A Lambda outside the VPC, without database access

The backend mints a short-lived turn ticket. The browser POSTs to the Lambda's Function URL with
it and reads SSE from the response. The Lambda runs the loop and calls HMAC-signed internal routes
on the backend that name only the turn id: load the transcript, reserve and settle the meter, run a
tool or a preview, save a message, finish the turn.

**Turn length.** The function timeout goes up to 900 seconds
([Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)).
That leaves room for 10 calls at any `max_tokens` we'd choose.

**Streaming.** With invoke mode `RESPONSE_STREAM` a Function URL streams up to 200 MB
([invoking with function URLs](https://docs.aws.amazon.com/lambda/latest/dg/config-rs-invoke-furls.html)).
The first 6 MB stream at uncapped bandwidth and the rest at 2 MBps, so a chat transcript never sees
the cap. Lambda supports streaming "on Node.js managed runtimes"
([response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)),
and the attachment processor already runs `nodejs24.x`. The same page says streaming "is not yet
available in all AWS Regions". Confirm `eu-central-1` in the spike. Function URLs don't stream from
inside a VPC, which doesn't matter here because this function has no VPC.

**Disconnect.** This is the strongest point. "Streamed responses are not interrupted or stopped
when the invoking client connection is broken. Customers are billed for the full function duration"
(same page). The loop finishes the turn, settles every call and saves the messages. The browser
reloads the conversation by GET, as T-675 planned.

**CORS and auth.** The Function URL is its own origin (`<url-id>.lambda-url.eu-central-1.on.aws`).
It takes a CORS config with `AllowOrigins`, `AllowMethods`, `AllowHeaders` and `MaxAge`, and AWS
recommends setting CORS there rather than in the function, since both sets of headers would
otherwise appear
([function URLs](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html)). Auth type
`NONE` with our own ticket in an `Authorization` header is the fit. `AWS_IAM` would mean SigV4 in
the browser. The session cookie never goes to this origin, so `AllowCredentials` stays off. Reserved
concurrency caps the function, and a function over it answers 429. That is our cost ceiling, the
way `apprunner_max_size` is for App Runner.

**Cold starts.** Lambda bills the init phase, and AWS publishes no figure for it. For a small Node
bundle I expect under a second on the first turn after an idle spell. The spike should measure it
next to the time to first token.

**Tools and meter.** Through callbacks. Each model call costs two extra HTTPS round trips (reserve,
settle), each tool call one, plus one each to load and save. They are tens of milliseconds against
calls of several seconds. Tools still run in the backend, as the user, inside the organization
fence, which is what T-675 requires. The callback routes become a privileged API, so they must be
narrow (see the requirements).

**Deploys.** Updating Lambda code doesn't kill invocations already running. An App Runner
deployment replaces the instance under open streams.

**Terraform.** About the size of the Lambda half of `attachments.tf`: function, Function URL,
role and policy, log group, two secrets (Anthropic key, callback secret), the CD job's
`UpdateFunctionCode` grant, and the URL passed to the backend as an env var.

**Cost.** Prices from the price list (`AWSLambda`, `eu-central-1`, published 2026-10-30):

| Usage type                                       | Price                              |
| ------------------------------------------------ | ---------------------------------- |
| `EUC1-Lambda-GB-Second-ARM`, first 7.5 billion   | $0.0000133334 per GB-second        |
| `EUC1-Request-ARM`                               | $0.20 per million                  |
| `EUC1-Lambda-Streaming-Response-Processed-Bytes` | $0.008 per GiB                     |
| Free tier                                        | 400,000 GB-seconds, 1 million reqs |

At 512 MB on arm64 the loop uses 598 × 80 s × 0.5 GB = 23,920 GB-seconds per organization a month,
$0.32 before the free tier. The free tier absorbs the first 16 organizations. At 100 it is
2,392,000 − 400,000 = 1,992,000 GB-seconds, **$26.56**. Requests (239,200 turns) stay inside the
free million, and the streamed bytes come to cents. Lambda bills wall time, including the seconds
spent waiting on the model, which is why this grows linearly while App Runner's cost flattens.

The callbacks keep App Runner active about as long as option 1's streams do, so option 2 pays
option 1's App Runner line as well.

## Option 3. A long-running service of our own

The natural form today is ECS Express Mode, which AWS now recommends instead of App Runner. One API
call creates "an ECS service on Fargate, an Application Load Balancer, auto scaling, and
networking", with no charge beyond those resources
([Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html)).
In public subnets it turns on public IPs for the tasks. In private subnets it makes an internal load
balancer, and NAT is ours to supply
([resources Express Mode creates](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-work.html)).

**Turn length and streaming.** No request cap. The load balancer closes a connection only after it
idles past its timeout, 60 seconds by default and up to 4,000
([ALB attributes](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html)).
An SSE stream that sends a comment line every 15 seconds never idles. Fargate gives the task its
CPU whether or not a request is open, so a loop that outlives its browser keeps going.

**Database.** With the backend's own image and its `DATABASE` secret, the service reaches RDS over
the public endpoint and runs tools in-process, so T-675 holds literally. Without database access it
needs the same callbacks as option 2 and adds a fixed cost on top of them for nothing.

**Cost.** Prices from the price list (`AmazonECS` published 2026-10-19, `AWSELB` and `AmazonVPC`
2026-11-05, NAT from the `AmazonEC2` offer):

| Item                                  | Price          | Monthly            |
| ------------------------------------- | -------------- | ------------------ |
| Fargate arm64, 0.25 vCPU and 0.5 GB   | $0.0114 / hour | $8.29 per task     |
| Application Load Balancer             | $0.027 / hour  | $19.71             |
| ALB capacity units at our traffic     | $0.008 / LCU-h | under $2           |
| Public IPv4 (task, plus ALB in 2 AZs) | $0.005 / hour  | $3.65 each, $10.95 |
| NAT gateway, if private subnets       | $0.052 / hour  | $37.96 per AZ      |
| NAT data processing                   | $0.052 / GB    | small              |
| Interface VPC endpoint, if private    | $0.012 / hour  | $8.76 per AZ each  |

One task in public subnets comes to about **$40 a month**, $52 with a second task for redundancy,
whatever the load. Tasks in private subnets need NAT, $38 per AZ, and an internet-facing load
balancer in front, which Express Mode won't build for private subnets, so that is plain ECS. One
task and one NAT come to about $74, two of each to about $121. VPC endpoints can carry the AWS
traffic, but the Anthropic API is on the internet, so NAT stays. Even at 100 organizations a
dedicated service costs more than option 2, and at 1 organization the fixed cost is 50 times the
work. That is the pattern the user doesn't want.

**Terraform and upkeep.** The most of the four: cluster, service, task definition, roles, load
balancer with listener and certificate, a DNS record, security groups, a CD job, and another service
to patch and watch.

If T-683 moves the whole backend to Express Mode, this option stops being separate. The loop runs
in the backend with no 120-second limit and no throttled CPU, and the $40 replaces App Runner's
roughly $7 instead of adding to it.

## Option 4. Claude Managed Agents

Anthropic's hosted runtime, beta behind the `managed-agents-2026-04-01` header, available on the
Claude API for Sonnet 5.5 and Haiku 5.5
([overview](https://platform.claude.com/docs/en/managed-agents/overview)). An agent holds the model,
system prompt and tools. A session runs it in an environment, and events flow over SSE.

**Custom tools.** Supported, and they run on our side: "Claude does not run a custom tool itself.
It emits a structured request, your code runs the operation, and you return the result to the
session" ([tools](https://platform.claude.com/docs/en/managed-agents/tools)). The session emits
`agent.custom_tool_use`, then goes `idle` with `stop_reason.type` `requires_action` and the blocking
ids in `stop_reason.event_ids`. We answer each with `user.custom_tool_result`, and once all are
answered the session runs again
([event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)).

**The card.** This is where it fits best. A write tool call already pauses the session, and idle
time isn't billed. The backend parks the pending action, sends the card, and answers the call only
when the user clicks. Several writes in one response give several blocking ids, and the session
resumes after the last answer, which is T-675's "one card per write" rule. A new user message has
to answer the pending call first ("the user declined"). I found no documented limit on how long a
session may sit in `requires_action`. Permission policies (`always_ask`) cover only the built-in and
MCP tools, so they don't add anything here.

**Streaming.** `agent.message` events are buffered per model request. Live text needs the opt-in
`event_deltas` stream parameter, whose deltas are never persisted
([reference](https://platform.claude.com/docs/en/managed-agents/reference)). The browser can't hold
our API key, so the backend relays the stream and translates it to our five events. The relay runs
on App Runner, and its 120 seconds apply again. Reconnecting is built in (open a stream, list past
events, skip the ones already seen), which softens the cut.

**Disconnect.** The session runs on at Anthropic. It stops at the next custom tool call until
someone answers. Webhooks can wake the backend (`session.status_idled`), but Anthropic tries a
delivery three times and then drops it with "no signal that it was lost"
([webhooks](https://platform.claude.com/docs/en/managed-agents/webhooks)). A missed webhook leaves
the turn stalled until the next time the user opens the chat.

**Meter.** No hook before each model call. What exists is a per-session budget in whole US cents,
checked "between model requests, not mid-request", with overshoot of up to one request per thread
([budgets](https://platform.claude.com/docs/en/managed-agents/budgets)). It is per session, and our
cap is per organization across all its sessions. It can be emulated: since every model call after
the first follows one of our tool results, the backend could raise the session's budget by one
call's reservation before each `user.message` or tool result. That is an extra `sessions.update` per
call, and the budget counts runtime at list price as well as tokens. Usage arrives after the fact in
`span.model_request_end` (`model_usage`) and `session.usage`. It works against the grain of the API.

**Where state lives.** Anthropic stores the transcript, and "transcripts persist until you delete
them". Managed Agents is not eligible for zero data retention. T-675 accepted 30-day retention for
the Messages API, and this is longer unless we delete each session ourselves. Every session also
gets "its own fresh Linux container", which our agent never uses
([choosing an environment](https://platform.claude.com/docs/en/managed-agents/choosing-an-environment)).
Our own copy of the messages becomes a mirror of theirs, and T-675's byte-identical replay from our
JSONB rows loses its purpose.

**Cost.** Tokens at Messages API rates, plus $0.08 per session-hour, metered on `running` time only
([pricing](https://platform.claude.com/docs/en/about-claude/pricing)). At 13.3 running hours per
organization that is $1.06 a month, $106 at 100. The relay adds option 1's App Runner line. The
harness's own system prompt adds tokens I couldn't measure from the docs. The Haiku screen stays a
plain Messages API call before each `user.message`.

**Terraform.** Only the API key and the webhook signing secret. The agent and environment live at
Anthropic, managed through the API or `ant apply`, outside our Terraform.

## Side by side

Monthly cost of the plumbing at the cap-level load, model tokens excluded:

| Option                              | 1 org      | 10 orgs | 100 orgs |
| ----------------------------------- | ---------- | ------- | -------- |
| 1. Backend on App Runner            | $0.25–0.75 | $2–7    | $4–14    |
| 2. Lambda plus callbacks            | $0.25–0.75 | $2–7    | $31–41   |
| 3. Fargate, public subnets, no NAT  | $40–52     | $40–52  | $40–52   |
| 3. Fargate, private subnets, NAT    | $74–121    | $74–121 | $74–121  |
| 4. Managed Agents, relay on backend | $1.30–1.80 | $13–18  | $110–120 |
| Model tokens, for scale             | $43.65     | $437    | $4,365   |

Option 2's App Runner line is the same as option 1's, and its Lambda line is $0 up to about 16
organizations. Option 3 assumes the backend image with database access. Without it, add option 1's
line.

| Question           | 1. App Runner         | 2. Lambda              | 3. Fargate       | 4. Managed Agents         |
| ------------------ | --------------------- | ---------------------- | ---------------- | ------------------------- |
| Turn limit         | 120 s per request     | 900 s                  | None             | None, relay hits 120 s    |
| Stream reaches you | Backend SSE, unproven | Function URL SSE       | ALB SSE          | Relayed by our backend    |
| Tools and meter    | In-process            | HMAC callbacks         | In-process       | Custom tools, budget hack |
| Browser disconnect | Loop crawls (CPU)     | Runs on, documented    | Runs on          | Stalls at next tool call  |
| Card flow          | As T-675              | As T-675               | As T-675         | Native pause, fits well   |
| Per-call meter     | Yes                   | Yes                    | Yes              | No, emulated              |
| Transcript owner   | Us                    | Us                     | Us               | Anthropic, until deleted  |
| New Terraform      | API key secret        | Lambda, URL, 2 secrets | Whole ECS stack  | 2 secrets                 |
| Upkeep             | Lowest                | Second deploy unit     | A second service | Beta API, session cleanup |

## Recommendation

Option 2. It costs nothing at launch and less than 1 percent of the model bill at 100
organizations. It is event-driven (one invocation per turn, nothing idle, no polling), and it meets
every requirement the earlier tickets set. The attachment Lambda already proved the deploy job, the
secret handling and the signed callback in this codebase.

I'd reject option 1 for production. The 120-second cut is survivable with a turn cap, but the
throttled CPU after a disconnect isn't, because it makes metering depend on someone else's traffic.
It is still the right host for local development and tests, through the in-process adapter.

Option 3 is the right answer only as part of T-683. On its own it pays $40 a month to hold a door
open. Option 4 is the most interesting technically. Its pause for custom tools is exactly our card.
It is beta, though, it moves the transcript and the cap out of our hands, and it still needs our
backend in the stream path. I'd look again when it is generally available and offers a hook before
each model call.

Nothing here contradicts T-675's decisions. Two points to carry into the grilling ticket T-686:

- T-675's "a browser disconnect doesn't stop the loop" holds only for options 2 and 3. On App
  Runner it is not dependable.
- Choosing option 4 would reopen T-675's "our own loop" decision and its transcript storage, and it
  would turn the per-call reservation into a budget workaround.

## Requirements for the build tickets

**Loop module.** Write the loop once, against a port with these operations: load turn, screen
verdict, reserve, settle, run read tool, park write (preview plus pending action), save message,
finish turn. Ship two adapters. The in-process adapter serves local development, tests and any
future in-process host. The callback adapter serves the Lambda. `pnpm run dev:scenario` and the
`ui-test` loop must keep working with no Lambda, by streaming from the backend directly.

**Starting a turn** (backend, authenticated). `POST /api/assistant/conversations/:id/turns`
checks the one-active-turn rule (409), stores the user message, creates the turn row with user,
organization and `channel: "assistant"`, and returns the stream URL and a ticket. The ticket names
only the turn id, expires within 60 seconds, and works once. Redeeming it marks the turn as
streaming.

**Callback routes.** Mount them outside `/api` under an internal prefix, signed like the attachment
callback (HMAC-SHA256 over the raw body) with their own secret, `ASSISTANT_CALLBACK_SECRET`, never
the attachment one. Include a timestamp in the signed body and reject anything outside a short
window. Every route takes only a turn id, derives user, organization and channel from the turn row,
and refuses a turn that is not active. Settle and save carry idempotency keys, so a retried callback
changes nothing. The routes call the same tool layer and meter as the in-process adapter.

**The Lambda.** `nodejs24.x`, arm64, 512 MB, timeout 300 seconds as the turn's wall-clock limit,
and a reserved concurrency as the cost cap. Function URL with `RESPONSE_STREAM`, auth `NONE`, CORS
`AllowOrigins` from the browser entries of `trusted_origins` (the same filter as the attachments
bucket), `AllowMethods` `POST`, `AllowHeaders` `authorization` and `content-type`, no credentials.
It verifies the ticket before anything else, runs the Haiku screen through reserve and settle, and
keeps reading the model stream when a write to the browser fails. The Anthropic key lives in the
Lambda's secrets. The backend needs it only for local development.

**Ending turns without a job.** A turn whose Lambda died counts as ended once `started_at` plus the
Lambda timeout plus a margin has passed, computed when the next turn is requested. No sweep. Its
leftover `reserved` rows go through T-674's reconciliation.

**Cards.** The confirm and cancel routes stay on the backend. Confirm runs the stored args with
fresh guards, records the `tool_result`, creates the follow-up turn and returns its ticket in the
same response, so the browser opens the next stream without a second round trip.

**Frontend.** `fetch` POST to the stream URL with `Authorization: Bearer <ticket>`, parse SSE, and
on a network error reload the conversation by GET. The stream comes from a second origin.

**Terraform.** An `assistant.tf` modelled on `attachments.tf`: function with placeholder code and
`ignore_changes`, Function URL, role and policy (the two secrets, its log group), log group with
retention, the CD role's `UpdateFunctionCode` and `GetFunction` grant, the Anthropic key and
callback secrets, and the Function URL passed to App Runner as `ASSISTANT_STREAM_URL`, with the
callback secret in `runtime_environment_secrets`. The task isn't finished until these are in the
Terraform files.

**Spike first.** Confirm Function URL streaming in `eu-central-1`, and measure cold start, time to
first token through the URL, wall time of a typical and a 10-call turn, and the round-trip time of a
callback from Lambda to `api.flexi-day.com`.

## Open questions

- Whether App Runner passes SSE through unbuffered. It only matters if option 1 or 4 is chosen, or
  for local parity.
- How App Runner counts active time across callbacks a few seconds apart. The docs give only the
  one-minute minimum per activation.
- The token overhead of the Managed Agents harness, if option 4 comes back.

## Sources

- AWS App Runner:
  [developer guide, runtime](https://docs.aws.amazon.com/apprunner/latest/dg/develop.html),
  [availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html),
  [pricing](https://aws.amazon.com/apprunner/pricing/),
  [App2Container and App Runner](https://docs.aws.amazon.com/app2container/latest/UserGuide/a2c-integrations-apprunner.html).
- AWS Lambda:
  [response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html),
  [streaming through function URLs](https://docs.aws.amazon.com/lambda/latest/dg/config-rs-invoke-furls.html),
  [function URLs and CORS](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html),
  [quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html).
- AWS ECS and networking:
  [Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html),
  [resources Express Mode creates](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-work.html),
  [ALB attributes](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html).
- AWS price list for `eu-central-1`: offers `AWSLambda`, `AmazonECS`, `AWSELB`, `AmazonVPC` from
  `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<offer>/current/eu-central-1/index.json`,
  and the NAT gateway usage types `EUC1-NatGateway-Hours` and `EUC1-NatGateway-Bytes` from the
  `AmazonEC2` offer through the Price List query API.
- Anthropic:
  [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview),
  [tools](https://platform.claude.com/docs/en/managed-agents/tools),
  [event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming),
  [reference](https://platform.claude.com/docs/en/managed-agents/reference),
  [budgets](https://platform.claude.com/docs/en/managed-agents/budgets),
  [webhooks](https://platform.claude.com/docs/en/managed-agents/webhooks),
  [session operations](https://platform.claude.com/docs/en/managed-agents/session-operations),
  [choosing an environment](https://platform.claude.com/docs/en/managed-agents/choosing-an-environment),
  [pricing](https://platform.claude.com/docs/en/about-claude/pricing).
- Flexi Day: `flexi-day-be/terraform/` (`apprunner.tf`, `vpc.tf`, `security-groups.tf`, `rds.tf`,
  `attachments.tf`, `variables.tf`, `terraform.tfvars`),
  `flexi-day-be/src/routes/attachmentCallbackRouter.ts`; sibling findings on
  `research/mcp-cost`, `research/assistant-model-provider`,
  `research/assistant-guardrails-and-models` and `research/assistant-metering`.
