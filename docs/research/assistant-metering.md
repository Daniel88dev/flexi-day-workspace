# Metering model cost and enforcing the weekly cap

Resolves Fenro T-674, a research ticket under the map T-667 (AI assistant and Flexi Day MCP
server). Written 2026-11-07; every URL below was read on that date. The question: how do we price
each model call from its token usage, and stop an organization at its 10 USD weekly limit
(Monday 00:00 UTC reset) when several chats run at once on two App Runner instances?

Fixed inputs from earlier tickets. T-670 put the Assistant on Bedrock `bedrock-runtime` in
`eu-central-1` with EU inference profiles, called through `AnthropicBedrock`, with no
`count_tokens`. T-672 runs Sonnet 5.5 at effort `medium` with a Haiku 5.5 screen on every user
turn, about $0.073 per typical conversation at list price. T-671 puts a cached prefix (tools,
overview, article index) in front of every conversation, shared by all organizations.

## Short answer

- **Price.** Keep a price table in code, keyed by the Bedrock model id, with an effective date per
  row. Fill it from the AWS price list, which publishes the EU numbers for both models (below).
  Whether the meter uses the Bedrock EU price we pay or Anthropic's list price is the user's call;
  I recommend the Bedrock EU price.
- **Usage.** Read `usage` from the stream. `message_start` carries input, cache write, cache read
  and the 5-minute/1-hour split; the last `message_delta` carries cumulative `output_tokens`, which
  includes thinking. Bedrock adds no server tool charges for us.
- **Enforce.** Reserve, then settle. Before every model call, take a Postgres advisory lock on
  the organization, sum this week's ledger, and insert a `reserved` row sized to the call's worst
  case. Refuse the call if the sum would pass 10 USD. After the call, overwrite the reservation
  with the actual cost. The lock is held for milliseconds, never during the model call. The week
  is derived from the row's date, so the reset needs no job.
- **Store** one ledger row per model call: organization, user, conversation, model, purpose
  (main or screen), the five token counts, cost in micro-USD, the price version, and the Bedrock
  request id. No message content.
- **Reconcile** monthly by hand against Cost Explorer or a CUR 2.0 export, grouped by usage
  type. The billing usage types split input, output, cache read and the two cache write TTLs, so
  the comparison is token for token. IAM principal cost allocation separates the backend's
  traffic from evals and dev.

| What                                         | State on 2026-11-07                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Sonnet 5.5 EU price (per MTok)               | $2.20 in, $2.75 / $4.40 cache write (5 min / 1 h), $0.11 cache read, $11 out    |
| Haiku 5.5 EU price, prompt up to 100k tokens | $0.11 in, $0.1375 / $0.22 cache write, $0.011 cache read, $0.55 out             |
| Haiku 5.5 EU price, prompt over 100k tokens  | $0.55 in, $0.6875 / $1.10 cache write, $0.055 cache read, $2.75 out             |
| Source of those numbers                      | AWS price list API, offer `AmazonBedrockFoundationModels`, `eu-central-1`       |
| `count_tokens` for Sonnet 5.5 in the EU      | Not available (`bedrock-mantle` only, and mantle serves this model in GovCloud) |
| TTL split in Bedrock usage                   | Converse: yes (`cacheDetails`). InvokeModel: not documented, check in the spike |
| Shared-prefix cold write, 6k tokens, Sonnet  | about 1.6 cents more than a read                                                |
| Typical conversations per 10 USD             | 138 at Anthropic list, 125 at the Bedrock EU price                              |

## Prices

The AWS pricing page renders its Claude table in the browser, so T-670 derived the EU figures from
the 10 percent premium. The AWS price list API has them directly. Claude models are not in the
`AmazonBedrock` offer; they sit in a separate offer, `AmazonBedrockFoundationModels`, because AWS
sells them through AWS Marketplace
([offer index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json),
[eu-central-1 offer](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/eu-central-1/index.json),
publication date 2026-10-12, effective date 2026-10-01 for both models).

Each model has two rows per token type. The usage type with `_global_` is the Global profile, and
the one without it is Geo and in-region, which is what the `eu.` profile bills. For Sonnet 5.5:

| Usage type (prefix `EUC1-MP:EUC1_`) | Global | EU (what we pay) | Anthropic list |
| ----------------------------------- | ------ | ---------------- | -------------- |
| `input_tokens_standard`             | $2.00  | $2.20            | $2.00          |
| `cache_write_tokens_standard` (5 m) | $2.50  | $2.75            | $2.50          |
| `cache_write_tokens_1h_standard`    | $4.00  | $4.40            | $4.00          |
| `cache_read_tokens_standard`        | $0.10  | $0.11            | $0.10          |
| `output_tokens_standard`            | $10.00 | $11.00           | $10.00         |

So T-670's derived figures are right to the cent, and the Global row matches Anthropic's list
price ([Pricing](https://platform.claude.com/docs/en/about-claude/pricing)). Haiku 5.5 has the
same shape plus `long_ctx` rows. Anthropic's rule is that a request whose prompt (input plus cache
reads plus cache writes) is over 100,000 tokens "pays the higher prices even when part of its
prompt is a cache hit". Sonnet 5.5 has no long-context rows in the price list and Anthropic bills
its full 1M window at standard rates. These prices exclude tax.

The usage type names are what billing data shows, so they are also the join key for
reconciliation.

### Which price the meter uses

This is the user's decision. The map says "10 USD = our model cost at list price", and the two
readings give different numbers.

- **Bedrock EU price.** The meter counts what AWS charges us. An organization gets 10 USD of real
  spend, about 125 typical conversations a week instead of 138. Reconciliation compares like
  with like, with no factor in between. "List price" still holds in the sense of public on-demand
  price before any discount.
- **Anthropic list price.** The meter counts the Claude API price. An organization gets 138
  conversations, and each full cap costs us up to 11 USD. Reconciliation multiplies by 1.1.

I'd pick the Bedrock EU price. The sentence says "our model cost", the numbers come from a
machine-readable AWS source, and the 1.1 factor would otherwise live in every comparison. Either
way the price table stores the rates the meter uses, so switching is a data change.

## What each response reports

Anthropic's `usage` object
([Messages API](https://platform.claude.com/docs/en/api/messages/create)) has:

- `input_tokens`, the uncached input after the last cache breakpoint;
- `cache_creation_input_tokens`, with `cache_creation.ephemeral_5m_input_tokens` and
  `ephemeral_1h_input_tokens` summing to it;
- `cache_read_input_tokens`;
- `output_tokens`, "the inclusive, authoritative total used for billing", with
  `output_tokens_details.thinking_tokens` as a read-only breakdown;
- `server_tool_use` (web search and web fetch counts), `service_tier`, `inference_geo`, `speed`.

Total input is the sum of the first three. In a stream, `message_start` carries the full `usage`
object, and `message_delta` carries counts that "are _cumulative_"
([Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)). The delta type has
no `cache_creation` split, so the split comes from `message_start`.

### What Bedrock adds or drops

`AnthropicBedrock` (`@anthropic-ai/bedrock-sdk` 1.1.1) calls
`/model/{id}/invoke-with-response-stream`, decodes AWS's binary event stream, and re-emits each
chunk's JSON unchanged as an SSE event (`src/core/streaming.ts` in the package). Whatever Bedrock
puts in the chunk reaches our code.

- **Server tool charges.** None. Bedrock doesn't offer web search or web fetch for Claude
  ([Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)),
  and the Sonnet 5.5 card lists tool search as the only server-side tool. We use neither, so
  `server_tool_use` stays empty and every cost is a token cost.
- **TTL split.** Converse's `TokenUsage` documents `cacheDetails`, a "detailed breakdown of cache
  writes by TTL"
  ([TokenUsage](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_TokenUsage.html)).
  The InvokeModel response reference still lists only `input_tokens` and `output_tokens`
  ([Request and Response](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html)),
  which is out of date, since the caching guide tells callers to read the cache fields. Whether
  `cache_creation` comes through on InvokeModel is unknown until one call shows it. The meter
  shouldn't depend on it: use only the 5-minute TTL at launch, so every write is a 5-minute write.
  If a later change adds a 1-hour breakpoint and the split is missing, price unsplit writes at
  the 1-hour rate. That overcharges by at most the difference, and the call stays countable.
- **Pre-counting.** No `count_tokens` for Sonnet 5.5 on `bedrock-runtime` (model card, "Not
  Supported"). The only token-counting path is `bedrock-mantle`, and the model card lists mantle
  for this model in GovCloud West only. So the cap works from usage after each call, plus a bound
  computed before it (see [Reservations](#how-big-a-reservation-is)).

One source conflict to note. Anthropic's Bedrock page lists `eu-central-1` with Global and EU
endpoints for its mantle-based offering. The AWS model card for Sonnet 5.5 shows mantle in
GovCloud only. For an AWS endpoint I trust the AWS card, which agrees with T-670.

## The price table

A constant map in the backend, the way `PLAN_LIMITS` lives in
`src/services/billing/entitlements.ts`:

```ts
type Rates = {
  input: number; // micro-USD per million tokens
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
};

type ModelPrice = {
  version: string; // "sonnet-5-5-eu@2026-10-01"
  effectiveFrom: string;
  standard: Rates;
  longContext?: { promptOver: number; rates: Rates }; // Haiku 5.5 only
};

export const MODEL_PRICES: Record<string, ModelPrice[]> = {
  "eu.anthropic.claude-sonnet-5-5": [
    {
      version: "sonnet-5-5-eu@2026-10-01",
      effectiveFrom: "2026-10-01",
      standard: {
        input: 2_200_000,
        cacheWrite5m: 2_750_000,
        cacheWrite1h: 4_400_000,
        cacheRead: 110_000,
        output: 11_000_000,
      },
    },
  ],
  // eu.anthropic.claude-haiku-5-5: 110_000 / 137_500 / 220_000 / 11_000 / 550_000,
  // over 100k: 550_000 / 687_500 / 1_100_000 / 55_000 / 2_750_000
};
```

The choices behind it:

- **Keyed by the Bedrock profile id**, the same string as `ASSISTANT_MODEL` and
  `ASSISTANT_SCREEN_MODEL`. The backend refuses to start if either config value has no row. A
  model swap without a price row fails at deploy, not on an invoice.
- **Integer micro-USD per million tokens.** Every EU rate, down to Haiku's $0.011 cache read
  (11,000), is a whole number. A call's cost is `ceil(Σ tokens × rate / 1e6)` micro-USD, so
  rounding moves each call by under one micro-dollar. The largest product, 1M tokens at 4.4M,
  stays well inside `Number.MAX_SAFE_INTEGER`. The cap is 10,000,000 micro-USD.
- **Rows are appended, never edited.** A call is priced by the row in effect when it was
  admitted, and the ledger stores the row's `version` with the cost. A later price cut never
  re-prices history, and past weeks keep the totals people saw.
- **Model switches need nothing extra.** T-672 keeps a conversation on the model it started
  with, and each call row names its own model, so a week can hold calls on two models.

AWS has changed these prices before (the October 2026 cache-read cut). A small script that fetches
the offer file and diffs it against `MODEL_PRICES` would catch the next change. Run it by hand, or
add it to the weekly dependency job's checklist.

## Enforcing the cap

### Options

**Check, call, then add (allow overshoot).** Before each call, read the week's sum; if it's under
10 USD, call. Simple, and no lock is needed, because a lock only matters if the check reserves
something. The cap is crossed by whatever is in flight when the sum passes 10 USD. With one
active turn per user that is at most one call per active user, each up to the worst case below.
In practice a few cents. In a bad case, 30 people in one organization hitting send in the last
minute of the budget, a few dollars.

**Reserve, then settle.** Before each call, atomically check that spent plus live reservations
plus this call's worst case stays within 10 USD, and record the reservation. After the call,
replace the reservation with the actual cost. The cap holds as long as the worst-case bound
holds. The price is that an organization stops a little short of 10 USD, by about one worst-case
call per concurrent chat.

**A counter row** (`spent`, `reserved` columns on an org-week row, updated atomically) is the
classic form of the second option. It needs cleanup when an instance dies holding a reservation,
which means expiry, which means either a sweep or read-time arithmetic that the counter can't do.
The ledger sum below avoids that.

I'd go with reserve-then-settle on the ledger. It is one lock, one sum and one insert more than
the overshoot version, and it turns "about 10 USD" into "never more than 10 USD" with no tuning.

### The admission transaction

Per model call, including the Haiku screen, which is admitted together with the first Sonnet call
of a turn:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('assistant-cap:' || $org, 0));

SELECT coalesce(sum(CASE WHEN status = 'reserved' THEN reserved_micro_usd
                         ELSE cost_micro_usd END), 0) AS used
FROM assistant_model_calls
WHERE organization_id = $org
  AND week_start = date_trunc('week', now() AT TIME ZONE 'UTC')::date;

-- in code: if used + $reservation > 10_000_000, ROLLBACK and refuse
INSERT INTO assistant_model_calls (..., status, reserved_micro_usd, week_start)
VALUES (..., 'reserved', $reservation, date_trunc('week', now() AT TIME ZONE 'UTC')::date);
COMMIT;
```

Then the model call runs with no transaction open. Settlement is a single `UPDATE ... SET status
= 'settled', <token columns>, cost_micro_usd = $cost WHERE id = $id`, which needs no lock,
because it only swaps a reservation for an amount that is normally smaller.

Why this shape:

- **Advisory lock, not `lockOrganization`.** The backend already does both. `lockOrganization` in
  `organizationServices.ts` row-locks the organization for the group cap, and
  `directoryListServices.ts` takes a namespaced `pg_advisory_xact_lock(hashtextextended(...))`. A
  namespaced key keeps chat traffic from queuing behind group creation. It holds for the length of
  one indexed sum and one insert, a few milliseconds, so two instances and many chats don't
  notice it.
- **The week comes from Postgres's clock.** `date_trunc('week', ...)` truncates to Monday, and
  `now()` is the same clock for both instances. The reset is the next Monday's sum starting at
  zero, derived at read time like grace expiry in `entitlements.ts`. No job runs at midnight.
- **A call belongs to the week it was admitted in.** A call admitted Sunday 23:59:58 and settled
  Monday counts against the old week. Its reservation already did.
- **The ledger is the counter.** A busy organization makes about 2,000 call rows a week (138
  conversations, 8 Sonnet calls and 4 screens each). Summing them on an
  `(organization_id, week_start)` index takes about a millisecond.
- **A crashed instance leaves a `reserved` row, and it keeps counting at its reserved amount.**
  That overcharges the organization by the gap between the worst case and the real cost, for one
  call, and only when an instance dies mid-call. No expiry, no sweep, no window where the cap is
  wrong. Reconciliation lists reserved rows older than 15 minutes, and a person can settle one
  by hand if it matters.

### How big a reservation is

Without `count_tokens` the bound comes from what we already know about the conversation:

- **Input bound.** The previous call's total prompt tokens (input plus cache read plus cache
  write, exact from its usage), plus its output tokens, plus the UTF-8 byte length of what we
  append (the user message or tool results), plus 1,000 tokens for framing and the tool-use system
  prompt. A token covers at least one byte, so bytes bound tokens from above. For a conversation's
  first call, use the last prompt size seen for this model and prompt version, or the byte length
  of the request. Price the whole bound at the 5-minute cache write rate, the highest input rate
  we use.
- **Output bound.** `max_tokens` times the output rate. Thinking counts against `max_tokens`, so
  this is a hard ceiling.

An example mid-conversation Sonnet call: a 12,000-token previous prompt, 600 previous output, 2 KB
of tool results, and `max_tokens` 8,000. The reservation is 15,648 × $2.75 + 8,000 × $11 per
million, about $0.13. The settled cost of a typical call is under one cent. The output term
dominates, so `max_tokens` is the knob. At 4,096 the reservation drops to about $0.09. An
organization with three chats mid-turn stops about $0.30 short of 10 USD.

If the bound is ever wrong and the actual cost exceeds the reservation, settlement still records
the actual cost. The overshoot is that difference, logged so we notice.

### Behaviour at the limit

- **Refused at the start of a turn.** The Assistant doesn't start. The user sees that the
  organization's weekly limit is reached until Monday 00:00 UTC, shown in their timezone.
- **Refused mid-turn.** A tool loop needs a second or third call and the admission fails. End
  the turn with the same message. A pending confirmation card is not a model call, so the write
  still runs if the user confirms it; reporting the result back would need a call and is refused.
  The chat design ticket should decide how that reads.
- **One active turn per user.** A second tab sending while a turn is in flight gets a 409. This
  bounds concurrency per organization to its active users. It also makes the overshoot option
  less bad if the user prefers it.
- **A near-limit warning** when the remaining budget drops under, say, 0.50 USD, so the cutoff
  isn't a surprise.

### Errors and aborted streams

- **Refusal.** `stop_reason: "refusal"` still carries usage. Charge it.
- **Failure before `message_start`** (throttling, validation, access). No usage arrived. Settle
  at zero. AWS's docs don't say whether these are billed; reconciliation will show it if they are.
- **Failure after `message_start`.** We know the input side but not the final output. Leave the
  row `reserved`, which charges the worst case, and flag it. These should be rare enough not to
  matter.
- **The browser disconnects.** Keep reading the current Bedrock stream to its end so the usage is
  exact, and don't start the next call in the loop. Aborting upstream would leave the cost unknown
  and the reservation standing.

## What to store per call

One table, `assistant_model_calls`, one row per model call:

| Column                                          | Why                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `id`, `created_at`, `settled_at`                | Identity and timing                                               |
| `organization_id`                               | The cap and the usage view                                        |
| `user_id` (null on account deletion)            | Per-user breakdown; spend stays after the user goes               |
| `conversation_id` (null on chat delete), `turn` | Links cost to a chat while the chat exists                        |
| `week_start` (date)                             | The cap, the reset, past weeks                                    |
| `purpose` (`main`, `screen`)                    | Splits Haiku screen cost from Sonnet cost                         |
| `model_id`, `price_version`                     | Which rates priced the row                                        |
| `status` (`reserved`, `settled`)                | Reservation state                                                 |
| `reserved_micro_usd`, `cost_micro_usd`          | Worst case before, actual after                                   |
| `input_tokens`, `cache_write_5m_tokens`,        | The five billed quantities, so a price fix can be checked against |
| `cache_write_1h_tokens`, `cache_read_tokens`,   | the AWS bill token for token                                      |
| `output_tokens`                                 |                                                                   |
| `thinking_tokens`, `stop_reason`                | Tuning effort and spotting refusals; not billed separately        |
| `bedrock_request_id`                            | The `x-amzn-requestid` header, for AWS support and CloudTrail     |

Index `(organization_id, week_start)`. The usage view is three `GROUP BY` queries on it: this
week's total, this week by `user_id`, and totals by `week_start` for past weeks. Reserved rows
count at their reserved amount there too, so the view and the cap always agree.

No prompt or response text goes in this table. The conversation table holds content under its
180-day rule; this table holds amounts.

Retention is a choice for the user and the data protection texts. Per-user spend says who used the
Assistant and how much, which is personal data. Two workable rules: keep rows 13 months for
invoice reconciliation and null `user_id` after 180 days to match the chats, or roll each finished
week into a per-user weekly summary and drop the call rows after 90 days.

## The shared cache write

All Flexi Day organizations share one AWS account, and Bedrock isolates prompt caches per account,
not per our customer ([Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).
So the cached prefix from T-671 is shared. The conversation that finds it cold pays the write.

How much that is: a 6,000-token prefix costs $0.0165 to write and $0.00066 to read on Sonnet EU,
so a cold start costs about 1.6 cents more. T-672's $0.073 already assumes every conversation
writes the prefix cold, so lucky reads only lower an organization's cost below the estimate.

The EU profile makes cold starts common anyway. AWS says a cache entry "is stored on the server
that processed the request", and a request served "by a different server, such as one in another
Region" writes a new entry; busy periods "may lead to increased cache writes"
([Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)).
Six destination regions mean a warm prefix in Stockholm does nothing for a request routed to
Milan.

Options:

1. **Charge what the call reported.** The meter matches the bill. An organization pays up to 1.6
   cents per conversation more or less depending on timing, which is 0.16 percent of the cap.
2. **Charge prefix writes at the read rate.** Fairer, but the usage object doesn't say which
   breakpoint a write belongs to. We'd have to infer it from `cache_read_input_tokens` being
   smaller than the known prefix size, and eat the difference. More code, and a meter that no
   longer matches the bill.
3. **Pre-warm the prefix as a system cost.** The Claude API accepts `max_tokens: 0` to fill the
   cache, but per-server entries across six regions make one warm-up call unreliable, and
   keeping them warm is a timer, which the backend's no-polling rule rules out.

I recommend option 1. The amount is too small to justify a meter that disagrees with the invoice.
Cross-region misses are a real cost of the EU profile, and charging them is honest.

## Reconciling with AWS

Three AWS sources, from fastest to most exact:

- **CloudWatch** `AWS/Bedrock` metrics `InputTokenCount`, `OutputTokenCount`,
  `CacheReadInputTokenCount` and `CacheWriteInputTokenCount` by `ModelId`
  ([runtime metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html)).
  Near real time, but cache writes are not split by TTL. Good for an alarm if a day's tokens
  drift from the ledger.
- **Invocation logs** carry per-request token counts and caller-supplied `requestMetadata`, which
  could hold the organization id
  ([request metadata](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-request-metadata.html)).
  They also store the prompt and response bodies, and T-670 keeps logging off for data
  protection. Leave it off. AWS also states that request metadata "is not delivered as an AWS cost
  allocation tag", so it doesn't reach the bill.
- **Cost Explorer or a CUR 2.0 export**, grouped by usage type for the two Marketplace products
  ("Claude Sonnet 5.5 (Amazon Bedrock Edition)" and the Haiku one). AWS's own guidance is to
  reconcile "at the model and usage-type grain", because neither CUR version has a per-request id.
  The usage types split exactly the five quantities the ledger stores.

The check: for a closed month, sum the ledger's token columns per model and compare with
`usage_amount` per usage type. Then compare dollars. Tokens should match within a percent or so;
the gaps are reserved rows that never settled and any traffic outside the backend.

That last gap is real. Eval runs (T-672's eval set is a few dollars per run) and local development
call the same models. If they share the AWS account, the bill holds more than the ledger.
Bedrock has supported cost allocation by IAM principal since April 2026
([announcement](https://aws.amazon.com/about-aws/whats-new/2026/04/bedrock-iam-cost-allocation)):
tag the App Runner instance role, activate the tag, and Cost Explorer or a CUR 2.0 export with
caller identity data splits the backend's spend from everyone else's. That is a Terraform tag plus
a console activation, and it belongs in the map's Infrastructure list.

Run it as a script, by hand, monthly: `pnpm run assistant:reconcile --month 2026-11`. Cost
Explorer charges $0.01 per API request
([pricing](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/)). A month needs
a handful.

## Recommendation

1. Meter at the Bedrock EU price from the AWS price list (user's call; Anthropic list is the
   alternative). Prices in a versioned table keyed by Bedrock model id, integer micro-USD per
   million tokens, Haiku's long-context tier included.
2. Read usage from `message_start` (input, cache read, cache write and its TTL split) and the
   last `message_delta` (output). Use the 5-minute TTL only at launch, so a missing split can't
   mislead the meter.
3. Reserve, then settle, per model call. A namespaced advisory lock on the organization, a sum
   over this week's ledger rows, an insert of a reserved row sized from the previous call's
   usage plus `max_tokens`. Settle with the actual cost. The week comes from `date_trunc` on the
   database clock; no reset job.
4. One active turn per user. A crashed call stays charged at its reservation.
5. One ledger row per call with the five token counts, cost, price version and request id, and no
   content.
6. Charge shared-prefix cache writes as reported.
7. Reconcile monthly against Cost Explorer by usage type, with the App Runner role tagged for IAM
   principal cost allocation.

## Open checks for the build tickets

- One `InvokeModelWithResponseStream` call with a cache write: confirm `message_start` carries
  `cache_creation` with the TTL split, and that `message_delta` carries cumulative output.
- Whether a request that fails with throttling or a mid-stream error appears in the bill. The
  first month's reconciliation answers it.
- The prefix size in tokens once tools exist, which sets the first-call reservation.
- `max_tokens` for the main model at effort `medium`. It sets both the hard output ceiling and
  most of the reservation.

## Sources

- AWS price list:
  [offer index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json),
  [AmazonBedrockFoundationModels, eu-central-1](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/eu-central-1/index.json).
- AWS Bedrock:
  [Sonnet 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html),
  [Prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html),
  [Messages API](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html),
  [APIs supported](https://docs.aws.amazon.com/bedrock/latest/userguide/apis.html),
  [InvokeModel](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html),
  [Claude request and response](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html),
  [TokenUsage](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_TokenUsage.html),
  [Runtime metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html),
  [Invocation logging](https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html),
  [Per-request metadata](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-request-metadata.html),
  [IAM principal cost allocation](https://aws.amazon.com/about-aws/whats-new/2026/04/bedrock-iam-cost-allocation),
  [Cost Explorer pricing](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/).
- Anthropic:
  [Pricing](https://platform.claude.com/docs/en/about-claude/pricing),
  [Messages API](https://platform.claude.com/docs/en/api/messages/create),
  [Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming),
  [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock).
- `@anthropic-ai/bedrock-sdk` 1.1.1 from the npm registry, `src/client.ts` and
  `src/core/streaming.ts`.
- Flexi Day: `flexi-day-be/src/services/billing/entitlements.ts`,
  `src/services/organization/organizationServices.ts` (`lockOrganization`),
  `src/services/directory/directoryListServices.ts` (advisory lock); sibling findings on
  `research/assistant-model-provider`, `research/assistant-guardrails-and-models` and
  `research/assistant-knowledge-base`.
