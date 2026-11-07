# Anthropic API or AWS Bedrock for the Assistant

Resolves Fenro T-670, a research ticket under the map T-667 (AI assistant and Flexi Day MCP
server). Written 2026-11-07; every URL below was read on that date. The question: should the
Assistant call Claude Sonnet 5.5 through the Anthropic API or through AWS Bedrock, given a backend
on App Runner in `eu-central-1`, Terraform applied by hand, and EU customers.

Short version: use Bedrock, on the `bedrock-runtime` endpoint in `eu-central-1`, with the EU
geographic inference profile `eu.anthropic.claude-sonnet-5-5`. It is the only option of the three
that keeps prompts and outputs inside the EU, and it adds no new subprocessor, because AWS already
is one and Anthropic gets no access to Bedrock traffic. The App Runner instance role authenticates
it, so no new secret exists. The price is 10 percent above Anthropic list. The features we give up
are the MCP connector, server-side tools, the Files API and batches, and the Assistant needs none
of them if the agent loop runs in our backend, which it has to anyway for the confirmation cards.

| What                            | State on 2026-11-07                                                          |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Sonnet 5.5 launch               | 2026-09-28 on the Claude API, Bedrock and Claude Platform on AWS, same day   |
| Anthropic API list price        | $2 input, $10 output, $2.50 / $4 cache write (5 min / 1 h), $0.10 cache read |
| Anthropic API inference geos    | `global` (default) and `us` (1.1x). No EU                                    |
| Anthropic API storage location  | US only (workspace geo `us` is the only value)                               |
| Bedrock Sonnet 5.5 in Frankfurt | `bedrock-runtime`, Geo (EU) and Global. No in-region, no `bedrock-mantle`    |
| Bedrock EU profile routes to    | Frankfurt, Stockholm, Milan, Spain, Ireland, Paris                           |
| Bedrock price                   | Global at list; Geo and in-region 10 percent above Global                    |
| `@anthropic-ai/sdk`             | 1.6.0                                                                        |
| `@anthropic-ai/bedrock-sdk`     | 1.1.1 (`AnthropicBedrock`, SigV4 through the AWS credential chain)           |
| `@anthropic-ai/aws-sdk`         | 1.1.2, beta (Claude Platform on AWS)                                         |

## The three options

There are three ways to reach Sonnet 5.5 from an AWS account today, not two.

1. **The Claude API** at `api.anthropic.com`. Anthropic runs inference and is the data processor.
2. **Amazon Bedrock.** AWS runs inference on its own accounts. Anthropic's docs put it this way:
   Bedrock "runs on AWS-managed infrastructure with zero operator access: Anthropic personnel have
   no access to the inference infrastructure"
   ([Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)).
   AWS's own data protection page says model providers "don't have access to Amazon Bedrock logs or
   to customer prompts and completions"
   ([Bedrock data protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)).
3. **Claude Platform on AWS**, launched 2026-05-11. Anthropic runs it, AWS handles IAM and bills it
   through AWS Marketplace. It is the Claude API with SigV4 auth and an AWS invoice: "Anthropic is
   the data processor for inference inputs and outputs", and the workspace's AWS region "does not
   pin where model inference runs"
   ([Claude Platform on AWS](https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws)).
   AWS adds that it "is not covered by standard AWS compliance programs" and lists Anthropic and AWS
   both as data processors
   ([Claude Platform on AWS vs Amazon Bedrock](https://docs.aws.amazon.com/claude-platform/latest/userguide/cpa-vs-bedrock.html)).

Option 3 has the same residency story as option 1, only US or global inference, and adds AWS as a
second processor. It solves billing and auth, not data location. I drop it from the rest of the
comparison and treat it as the Claude API with IAM auth.

## Where the data goes

This is the deciding row.

**Claude API.** `inference_geo` takes `"global"` or `"us"`, nothing else, and workspace geo (where
data rests) takes only `"us"`
([Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)). Anthropic's
privacy centre says traffic may be routed "to select countries in the US, Europe, Asia and
Australia" and that "data is stored in the US"
([Where are your servers located?](https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers)).
So an EU customer's request notes, names and absence reasons leave the EU on every turn, and the
transfer rests on the SCCs in Anthropic's DPA.

**Bedrock.** The EU geographic profile keeps routing inside EU regions. From `eu-central-1` it
reaches Frankfurt, Stockholm, Milan, Spain, Ireland and Paris; London joins only when London is
the source
([Sonnet 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html)).
Cross-region traffic "remains on the AWS network and does not traverse the public internet", and
CloudTrail logs each request in the source region with the region that served it in
`additionalEventData.inferenceRegion`
([Cross-region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)).
IAM can enforce this. Grant `bedrock:InvokeModel*` on the EU profile ARN and on the foundation
model in each destination region, with a `bedrock:InferenceProfileArn` condition, and add an
explicit deny on `aws:RequestedRegion = unspecified`, which blocks the global profile
([Inference profile prerequisites](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html)).
A config typo that names `global.anthropic...` then fails instead of quietly sending data to the US.

## Retention and zero data retention

**Claude API.** Standard commercial retention deletes inputs and outputs "within 30 days";
Usage Policy flags extend that to 2 years
([commercial retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)).
ZDR exists but needs a contract with Anthropic sales, per organization. The MCP connector is not
ZDR-eligible; prompt caching is
([API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)).

**Bedrock.** Retention is a per-region account setting with modes `none`, `default`, `aws_review`.
Under `none`, "no request or response data is written to durable storage by AWS or shared with
the model provider"
([Bedrock data retention](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html)).
Only Claude Fable 5 and 5.1 require retention today; Sonnet 5.5 is not on that list
([Bedrock abuse detection](https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html)).
So we get ZDR self-serve: one `PUT https://bedrock.eu-central-1.amazonaws.com/data-retention` with
`{"mode":"none"}`. A model that later demands retention fails with a `ValidationException` rather
than retaining silently, which is the behaviour we want. Invocation logging is opt-in and stays off.

## DPA and subprocessors

Our own 180-day chat history in Postgres is ours either way. The question is who else touches the
content.

- **Bedrock:** AWS, already our subprocessor for App Runner, RDS and SES in `eu-central-1`. The
  AWS DPA and its SCCs apply automatically
  ([AWS GDPR Center](https://aws.amazon.com/compliance/gdpr-center/)). The subprocessor list does
  not change; the privacy policy and DPA gain a sentence that AI features run on Amazon Bedrock in
  EU regions. Anthropic is not a subprocessor, since it never sees the data.
- **Claude API:** Anthropic becomes a new subprocessor. Its DPA with SCCs comes automatically with
  the Commercial Terms
  ([Anthropic DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa)),
  but we must add Anthropic to our list, give customers whatever notice our DPA promises, and
  describe a transfer to the US. For HR data in EU organizations that is a sales objection we would
  rather not carry.

## Price

| Sonnet 5.5, per MTok | Claude API (global) | Bedrock EU profile |
| -------------------- | ------------------- | ------------------ |
| Input                | $2.00               | $2.20              |
| Output               | $10.00              | $11.00             |
| Cache write, 5 min   | $2.50               | $2.75              |
| Cache write, 1 h     | $4.00               | $4.40              |
| Cache read           | $0.10               | $0.11              |

The Claude API column is from
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing). I could not read the
Bedrock column directly: the AWS pricing page renders its Anthropic table in JavaScript, and Claude
bills through AWS Marketplace rather than the public price list. The Bedrock figures are derived
from two first-party statements. Anthropic: "Regional and multi-region endpoints include a 10
percent premium over global endpoints." AWS: Geographic cross-region inference is "standard
pricing", Global gives "approximately 10% savings"
([Cross-region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)).
Bedrock also cut the Sonnet 5.5 cache read by 50 percent on 2026-10-07, matching Anthropic's change
the same day. Confirm the exact EU numbers in the console before T-674 hard-codes them.

The map meters the 10 USD weekly cap at Anthropic list price. On the EU profile that cap costs us
up to 11 USD per organization per week.

## Prompt caching, tool use, streaming

Both support everything the Assistant needs.

- **Caching.** Bedrock supports explicit `cache_control` breakpoints and top-level automatic
  caching on Sonnet 5.5, 5-minute and 1-hour TTL, minimum 512 tokens per checkpoint, 4 checkpoints
  ([Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)).
  One catch: a cache entry lives on the server that wrote it, so a request the EU profile routes to
  another region writes a fresh entry instead of reading. AWS warns that busy periods "may lead to
  increased cache writes". The Claude API has the same per-server behaviour but routes globally.
  Expect a lower hit rate than a single-region setup would give; measure it in the spike.
- **Tool use.** Client-side tools work on both. The Bedrock model card limits Sonnet 5.5's
  `tool_choice` to `auto` and `none`. Anthropic's tool-use pricing table leaves the `any`/`tool`
  cell empty for the model, which points to the same limit on the Claude API. Plan the agent loop
  so it never forces a tool call.
- **Streaming.** SSE on both. `AnthropicBedrock` uses `InvokeModelWithResponseStream` and hands back
  the same stream events as `@anthropic-ai/sdk`.
- **Token counting.** Bedrock's `count_tokens` for Sonnet 5.5 exists only on `bedrock-mantle`, which
  has no EU region for this model. The cap check must work from the reported usage after each call,
  not from a pre-count. The Claude API has `count_tokens`.

## Token usage for metering

Every Messages response carries `usage` with `input_tokens`, `output_tokens`,
`cache_creation_input_tokens` and `cache_read_input_tokens`; the Claude API also splits cache
writes by TTL under `usage.cache_creation`. Bedrock's caching guide tells callers to read these
fields to see what was written or read, and its Converse API adds `cacheDetails` with the TTL.
Whether `InvokeModel` returns the per-TTL split for Claude is not stated in AWS's response
reference, which still lists only input and output. If it does not, T-674 either uses one TTL
throughout or prices every write at the 1-hour rate. A one-request check in the spike settles it.

Adaptive thinking is on by default for Sonnet 5.5 and bills as output tokens on both platforms.

## MCP connector

The MCP connector (`mcp_servers`, beta header `mcp-client-2026-09-15`) is Claude API and Claude
Platform on AWS only. Bedrock lists "MCP connector" under features not supported
([Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)).

I don't think we lose anything. The connector has Anthropic's servers call our MCP server over the
public internet with a bearer token we hand them, and it runs each tool call itself. Two map
decisions push against that. Every Assistant write must wait for a confirmation card, which needs
the loop to stop before the write runs, and the connector gives us no such hook. The connector is
also not ZDR-eligible. So the loop belongs in our backend, calling the shared tool layer directly or
as an MCP client, and then Bedrock and the Claude API are equal here. That is T-675's call; this
finding only removes the connector as a reason to pick the Claude API.

## New models and swapping through config

The last four launches (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5) reached Bedrock on the same day
as the Claude API
([release notes](https://platform.claude.com/docs/en/release-notes/overview)). The catch is the
EU profile. On 2026-09-28 AWS announced Sonnet 5.5 "through the Global CRIS (global.) inference
profile" only
([AWS launch post](https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-5-on-aws/));
the `eu.` profile exists now, but AWS didn't announce when it arrived. Assume a new model can sit
global-only for some weeks, so we stay on the previous one until its `eu.` profile appears.
`GetInferenceProfile` from `eu-central-1` answers whether it has.

The config key holds the Bedrock profile id (`eu.anthropic.claude-sonnet-5-5`), not the Claude API
id. A swap is one env var plus one IAM resource list in Terraform, because the policy names each
model's ARNs. Feature lag is real too: beta features need AWS to wire them, while Claude Platform on
AWS gets them "same-day". Nothing on the Assistant's list depends on a beta.

## Auth and SDK

**Bedrock.** `@anthropic-ai/bedrock-sdk` exports `AnthropicBedrock`, which signs with SigV4 through
the default AWS credential chain
([bedrock-sdk README](https://github.com/anthropics/anthropic-sdk-typescript/tree/main/packages/bedrock-sdk)).
On App Runner that is the instance role, the same way SES works today. Terraform gets one
`aws_iam_role_policy` on `aws_iam_role.apprunner_instance`, as
`flexi-day-be/docs/terraform.md` already asks for each new service. No secret, no rotation. The
request and response types are the main SDK's, so the agent loop code doesn't care which client it
holds. Model access for Sonnet 5.5 needs a one-time enablement in the Bedrock console.

**Claude API.** An API key in Secrets Manager, wired through `secrets.tf`, `apprunner.tf` and
`iam.tf`. Workload Identity Federation can exchange an AWS IAM identity for a short-lived token and
remove the static key
([Authentication](https://platform.claude.com/docs/en/manage-claude/authentication)), at the cost of
three Console resources and token-exchange setup.

Bedrock's default quota is 2 million input tokens per minute, raisable to 5 million without
Anthropic's approval. That is far beyond what a 10 USD weekly cap per organization allows.

## Recommendation

Bedrock, `bedrock-runtime` in `eu-central-1`, profile `eu.anthropic.claude-sonnet-5-5`, client
`AnthropicBedrock` on the App Runner instance role, account data retention set to `none` in
`eu-central-1`, IAM limited to the EU profile with global routing denied.

The reasons, in order: prompts stay in the EU, AWS is the only processor and already on our list,
ZDR is a setting rather than a contract, and there is no secret to manage. Against it: 10 percent
more per token, a possible lag before a new model gets its EU profile, no `count_tokens`, and no MCP
connector, which we would not use.

Switch to the Claude API only if a feature we need is missing from Bedrock for months, or the
10 percent starts to matter more than residency. Neither looks likely for this product.

## Open checks for the first build ticket

- Read the exact EU prices from the Bedrock console and put them in the metering config.
- Confirm whether an `InvokeModel` response for Claude carries `usage.cache_creation` with the
  5-minute and 1-hour split.
- Run a few hundred cached turns through the EU profile and record the cache hit rate.
- Call `GetInferenceProfile` for `eu.anthropic.claude-sonnet-5-5` from `eu-central-1` and keep the
  destination list in the Terraform policy in step with it.
- Check that `GET /data-retention` returns `none` after the switch, and that a Sonnet 5.5 call
  still succeeds under it.

## Sources

- Anthropic: [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview),
  [Pricing](https://platform.claude.com/docs/en/about-claude/pricing),
  [Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency),
  [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention),
  [Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock),
  [Claude Platform on AWS](https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws),
  [MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector),
  [Authentication](https://platform.claude.com/docs/en/manage-claude/authentication),
  [Release notes](https://platform.claude.com/docs/en/release-notes/overview),
  [Commercial retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data),
  [Server locations](https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers),
  [DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa).
- AWS:
  [Sonnet 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html),
  [Regional availability by models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html),
  [Messages API on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html),
  [Cross-region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html),
  [Inference profile prerequisites](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html),
  [Prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html),
  [Data protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html),
  [Data retention](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html),
  [Abuse detection](https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html),
  [Claude Platform on AWS vs Bedrock](https://docs.aws.amazon.com/claude-platform/latest/userguide/cpa-vs-bedrock.html),
  [Sonnet 5.5 launch post](https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-5-on-aws/),
  [GDPR Center](https://aws.amazon.com/compliance/gdpr-center/).
- npm registry, read with `pnpm view`: `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk`,
  `@anthropic-ai/aws-sdk`.
