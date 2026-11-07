# Keeping the Assistant on topic, and which models to run

Resolves Fenro T-672, a research ticket under the map T-667 (AI assistant and Flexi Day MCP
server). Written 2026-11-07; every URL below was read on that date. Two questions. How do we keep
the Assistant answering only Flexi Day questions? And should it run one model or several, with or
without a router such as Jev?

Fixed inputs from earlier tickets. T-670 put the Assistant on Amazon Bedrock in `eu-central-1`
with EU inference profiles, data retention off, at 1.1x Anthropic list price. T-668 put the agent
loop in our backend, calling the shared tool handlers in-process. The map caps each organization
at 10 USD of model spend a week, metered at Anthropic list price, and puts a confirmation card in
front of every write.

## Short answer

Run one main model, Claude Sonnet 5.5 (`eu.anthropic.claude-sonnet-5-5`), at effort `medium`.
Put a Claude Haiku 5.5 screen (`eu.anthropic.claude-haiku-5-5`) in front of every user turn. It
returns a structured verdict, in scope or not and attack or not, and costs about 0.03 cents per
four-turn conversation. Write a system prompt that names the scope and the refusal, and handle
Anthropic's own `stop_reason: "refusal"`. Prove all of it with an eval set that weighs tool
arguments (dates, group, request) above chat answers.

Skip Bedrock Guardrails for the launch. Its denied topics are a deny-list and the docs forbid
"all content except X" definitions, which is exactly the rule we need. Czech, our second language,
is only "Supported" (tested, not tuned) and only on the Standard tier.

Skip a per-turn router. On a typical conversation a 50/50 Haiku/Sonnet split saves 23 percent,
not the 47 percent you would expect, because each model keeps its own prompt cache. On Bedrock,
Sonnet 5.5 is not documented to read Haiku 5.5's thinking blocks, so each switch also drops
reasoning. Jev is not a router at all. It is a US-hosted classifier in early access, and it would
add a new subprocessor and a transfer of HR data to the US, to save fractions of a cent.

The one lineup change worth keeping open is Haiku 5.5 as the main model. It is 17 times cheaper
per conversation. Run the same eval set against it, and switch through config if it matches
Sonnet on tool accuracy.

| What                                | State on 2026-11-07                                                       |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Current lineup                      | Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5                                |
| List price, input / output per MTok | Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50 (<100k)   |
| EU profiles from `eu-central-1`     | `eu.` profile exists for all three, same six EU destination regions       |
| Forced `tool_choice`                | Not on Sonnet 5.5 or Opus 5.5 (`auto`, `none` only); Haiku 5.5 accepts it |
| Structured outputs on Bedrock       | Sonnet 5.5, Opus 5.5, Haiku 5.5                                           |
| Bedrock intelligent prompt routing  | Not supported for any of the three                                        |
| Bedrock Guardrails price            | $0.15 per 1,000 text units for denied topics and content filters          |
| Guardrails, Czech                   | Standard tier only, "Supported"; Classic tier is English, French, Spanish |
| Jev                                 | Early access since 2026-09-15, `jev-1.14.0`, $0.042 per MTok input, US    |

## The models

Anthropic's models overview lists four current models. Haiku 5.5 is "for high-volume,
latency-sensitive tasks such as classification, extraction, and routing", Sonnet 5.5 is "the best
combination of speed and intelligence", Opus 5.5 is for long-running agentic work, and Fable 5.1 is
for the hardest reasoning
([Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)). Fable 5.1
costs $10 / $50 and requires data retention on Bedrock (T-670), so it is out.

| Per MTok, list  | Input | 5 min cache write | Cache read | Output |
| --------------- | ----- | ----------------- | ---------- | ------ |
| Opus 5.5        | $4    | $5                | $0.20      | $20    |
| Sonnet 5.5      | $2    | $2.50             | $0.10      | $10    |
| Haiku 5.5 ≤100k | $0.10 | $0.125            | $0.01      | $0.50  |
| Haiku 5.5 >100k | $0.50 | $0.625            | $0.05      | $2.50  |

From [Pricing](https://platform.claude.com/docs/en/about-claude/pricing). Haiku 5.5 is priced by
prompt length, and a request over 100,000 tokens pays the higher row for the whole request,
cache reads included. Our conversations stay far below that. Bedrock's EU profiles add 10 percent
to all of it.

All three are on Bedrock's `bedrock-runtime` endpoint in Frankfurt through a Geo (EU) profile that
routes to Frankfurt, Stockholm, Milan, Spain, Ireland and Paris. None of them has in-region
inference in Frankfurt
([Haiku 5.5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html),
[Sonnet 5.5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html),
[Opus 5.5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html)
model cards). So any combination of these models stays inside T-670's data-protection answer: AWS
is the only processor, and data stays in the EU.

Four model facts shape the design.

- **No forced tool use on Sonnet 5.5.** `tool_choice` `any` or `tool` returns a 400. Anthropic's
  replacement is `auto` with `strict: true` tools, or structured outputs, plus a prompt that says
  when a tool applies
  ([What's new in Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5)).
  The Bedrock card for Opus 5.5 carries the same restriction. Haiku 5.5's card lists no such
  restriction, and Anthropic's pricing table gives it a token count for `any` and `tool`.
- **Effort, not model, is the first cost lever.** Sonnet 5.5 defaults to `high`. Anthropic says
  "For chat and other latency-sensitive work, start at `medium` or `low`", and `medium` for
  well-specified multistep tool use. Thinking counts as output, and output is close to half the
  cost of a conversation in the model below.
- **Thinking blocks are tied to the model.** Sonnet 5.5 reads Haiku 5.5 blocks only "on the Claude
  API and Claude Models on Google Cloud (Google managed)", and Haiku 5.5 never reads Sonnet 5.5
  blocks ([Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking)).
  The page says nothing for Bedrock, so assume a switch drops the reasoning. Anthropic warns that a
  model which loses earlier reasoning "re-creates that reasoning", which costs output tokens.
- **Each model has its own prompt cache.** The caching docs don't say this outright. They isolate
  caches by organization on Bedrock and by prefix everywhere
  ([Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). A KV
  cache is computed by one model's weights, so I take it as given that Haiku can't reuse Sonnet's.
  Verify with a two-call test before relying on either reading.

## Keeping it on topic

Five layers were on the list. They do different jobs and cost very different amounts.

### 1. A scoped system prompt

Anthropic's guidance for a role-bound assistant is to set the role in the system prompt, list the
likely scenarios with the expected reply, and say how to refuse
([Keep Claude in character](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency),
[Mitigate jailbreaks](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)).
For us that means the scope (Flexi Day features, the user's own data through tools, the knowledge
base), what to do with anything else (one fixed sentence in the app language, pointing back to
what it can do), and a few borderline examples. It costs nothing extra, since the prompt sits in
the cached prefix.

It is necessary and not enough. A prompt is a request to the model, and a determined user can talk
around a request. On its own it also gives us nothing to count or alert on.

### 2. A Haiku 5.5 screen before the main model

This is Anthropic's first listed mitigation: "Use a lightweight model such as Claude Haiku 5.5 to
pre-screen user input before it reaches your main conversation", with structured outputs to force
a classification. Their docs add that Haiku's safety classifiers can decline the screening call
itself, and to "treat a response with `stop_reason: "refusal"` as a harmful verdict".

For the Assistant the screen asks two things in one call: is this turn about Flexi Day, and does
it try to override instructions or pull out the system prompt. The input is the user message plus
the previous assistant message, so a bare "yes, do it" still classifies. Run it with thinking
disabled (Haiku 5.5 allows `disabled`) and a JSON schema in `output_config`. Bedrock lists
structured outputs as supported for Haiku 5.5.

Cost is negligible. With a 700-token cached instruction and 400 tokens of context, a four-turn
conversation spends about $0.0003 on screening, under half a percent of the Sonnet bill.

Latency is the real cost. Anthropic publishes only relative latency ("Fastest" for Haiku), so
measure it. Two ways to wire it:

- **Sequential.** Screen, then call Sonnet. Off-topic turns never reach Sonnet, at the price of one
  Haiku round trip on every turn.
- **Parallel.** Start both, execute no tool and stream no text until the verdict arrives. Sonnet
  thinks before it answers, so the verdict will usually land first. A rejected turn still pays for
  part of a Sonnet call.

I'd start parallel and keep sequential as a per-user fallback after repeated rejections. The cap
is org-wide, so one user farming the Assistant for general chat spends everyone's budget.
Anthropic's docs also suggest throttling repeat offenders. The screen verdicts give us the counter
for it without storing message content.

The same screen can check tool results for injected instructions. That is T-681's question, and
the shape carries over.

### 3. Anthropic's own safeguards

Sonnet 5.5 and Haiku 5.5 run safety classifiers that can decline a request with HTTP 200,
`stop_reason: "refusal"` and a `stop_details` category (`cyber`, `bio`, `frontier_llm`,
`reasoning_extraction`, `general_harms`). They cover harm, not topic. A user asking for a pasta
recipe gets an answer from them. We still have to handle the refusal shape in the loop and show a
polite message, and on Bedrock the fallback-credit beta can retry a refused Sonnet 5.5 request on
Sonnet 5 at cache-read rates. Bedrock adds its own abuse detection on top (T-670).

### 4. Bedrock Guardrails

Guardrails has the two policies that sound right, denied topics and a prompt-attack filter, and
both are cheap. Three things make it a poor fit for launch.

**It filters by deny-list.** A denied topic is a name, a definition and up to five sample
phrases, with at most 30 topics per guardrail. The docs say "Don't define negative topics or
exceptions", and give "All contents except medical information" as the example not to write
([Denied topics](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-denied-topics.html)).
Our rule is an allow-list, so we would have to enumerate the rest of the world in 30 topics. The
docs also note that topic order can change the outcome.

**Czech is weak and needs the Standard tier.** The Classic tier supports English, French and
Spanish only. The Standard tier lists Czech as "Supported", meaning tested but not tuned, against
"Optimized and supported" for German or Polish. AWS's own warning: "Guardrails are ineffective
with languages that aren't supported"
([Supported languages](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html)).
Standard tier requires a guardrail profile. `eu.guardrail.v1:0` from `eu-central-1` routes to
Frankfurt, Ireland, Paris and Stockholm, so data protection holds
([Guardrail profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-cross-region-support.html)).
That part is fine.

**The prompt-attack filter has gaps for an agent.** It "does not evaluate tool results", and with
`InvokeModel` it only reads content wrapped in input tags; untagged prompts go unfiltered
([Prompt attacks](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-prompt-attack.html)).
Prompt-leakage detection exists on Standard tier only.

Price, for the record: $0.15 per 1,000 text units for denied topics and $0.15 for content filters,
where a text unit is up to 1,000 characters. Standard and Classic cost the same
([Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)). Checking input and output for both
policies is about $0.0036 per four-turn conversation, over ten times the Haiku screen and still small.
`ApplyGuardrail` runs a guardrail on any text without a model call, so it fits our own loop.

Keep it as a later option. If the eval shows jailbreaks getting past the Haiku screen, add the
Standard-tier prompt-attack filter on user input through `ApplyGuardrail` and test it in Czech.

### 5. Output checks

For writes, the output check already exists. The confirmation card shows the exact dates, group or
request before anything changes, and the tool handlers run the same validation and permission
checks as the web app. That covers what matters most, a request with the wrong dates.

For text answers I would not add a second model pass at launch. The screen has already stopped
off-topic turns, so a model check on every answer doubles the screening cost to catch a rare
failure. Watch the refusal and screen counters instead, and let the eval set catch regressions.
Bedrock Guardrails' streaming mode would also add latency in its default synchronous mode, since
it "will buffer and apply the configured policies to one or more response chunks"
([Streaming](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-streaming.html)).

### 6. The eval set

This is the piece that makes the others trustworthy, and the map lists it as not yet specified.
A shape that fits the ticket's priority, with tool arguments before chat polish:

- **Tool accuracy, about half the cases.** Fixed "today" and seeded data. Relative dates in English
  and Czech ("next Friday", "příští pátek", "the week after Easter"), half days, ranges over
  weekends and public holidays, a user in two groups, cancelling the right one of three requests,
  approving the right person, clock-in near midnight. The check reads the tool call arguments, the
  same payload the confirmation card shows. No model judge is needed.
- **In-scope questions** answered from the knowledge base.
- **Off-topic**, in both languages: general knowledge, coding help, homework, recipes, other HR
  products. The expected result is the fixed refusal and no tool call.
- **Borderline**, which needs a product decision first: Czech labour-law questions about leave,
  "write my boss an email asking for Friday off", questions about a colleague the user can't see.
- **Attacks**: role override, "ignore previous instructions", system prompt extraction, base64 or
  language-switch tricks, many-shot. Indirect injection through request notes and directory fields
  belongs to T-681 but should live in the same suite.

Run it against the real Bedrock EU profiles, on every change to the prompt, tools or model config,
and before any model swap. A single-turn case costs about two Sonnet calls, so 200 cases come to a
few dollars per run on Sonnet and cents on Haiku.

## One model or several

### Cost per conversation

The model is a script, not a measurement. Its assumptions:

- A 6,000-token cached prefix (tool definitions and system prompt), written cold at the start of
  each conversation with the 5-minute cache.
- Each model call adds new input (user message or tool results) and output (text, tool calls,
  thinking). The next call writes both to cache and reads everything before them.
- Typical: 4 user turns, 8 model calls, 600 new input and 400 output tokens per call.
- Heavy: 10 turns, 25 calls, 1,000 new input and 600 output per call.
- Router: alternate turns go to Haiku and Sonnet, each model with its own cache.
- Screen: 700-token cached instruction, 400 tokens of context, 20 tokens out, once per turn.

| Lineup                      | Typical, list | Typical, EU bill | Per 10 USD | Heavy, list | Per 10 USD |
| --------------------------- | ------------- | ---------------- | ---------- | ----------- | ---------- |
| Sonnet 5.5 only             | $0.073        | $0.080           | 138        | $0.325      | 31         |
| Sonnet 5.5 + Haiku screen   | $0.073        | $0.080           | 137        | $0.325      | 31         |
| Sonnet + Bedrock Guardrails | $0.076        | $0.084           | 131        | $0.334      | 30         |
| Sonnet + Jev screen         | $0.073        | $0.080           | 137        | $0.325      | 31         |
| Router 50/50 + screen       | $0.056        | $0.062           | 179        | $0.211      | 47         |
| Haiku 5.5 only + screen     | $0.004        | $0.005           | 2,336      | $0.020      | 502        |
| Opus 5.5 only               | $0.145        | $0.160           | 69         | $0.649      | 15         |

"Per 10 USD" is conversations per organization per week at list price, which is what the cap
meters. In the typical Sonnet case, cache writes are about 47 percent of the bill, output 44
percent and cache reads 9 percent. Without caching the same conversation would cost almost three times as
much.

What the numbers say:

- **The cap is tight on Sonnet.** 138 typical conversations a week is about three per person for a
  50-person organization. Effort is the cheapest lever. Every 100 output tokens per call cut from
  thinking saves at least 11 percent of the typical conversation.
- **The router saves less than it looks.** Sending half the turns to a model 20 times cheaper
  saves 23 percent on the typical conversation and 35 percent on the heavy one. Each switch writes
  the prefix and the history into the other model's cache at write prices. It also drops the
  thinking blocks, which the table doesn't price.
- **Haiku-only is the real saving, at a quality risk.** 17 times more conversations per dollar.
  AWS says Haiku 5.5 has "improved performance over Claude Haiku 4.5 on coding and agent tasks".
  Anthropic positions it for classification, routing and subagents, not as the agent itself. Only
  our eval can say whether it gets "next Friday but not the holiday" right as often as Sonnet.
- **Screens are free in this budget.** Haiku, Guardrails and Jev each add under a cent.

### Per-turn routing

A router has to decide, before the turn runs, whether the turn is easy. Our easy-looking turns are
the risky ones. "Book Friday off" is short, and it is a write with date arithmetic, the place where
the ticket says quality matters most. A wrong route there is a wrong request on a confirmation card
or a support ticket.

The router also doubles the work around models. Two prompts tuned to two models, two eval runs per
change, two price-table entries and two sets of IAM ARNs. On Bedrock, conversations lose their
reasoning at every switch. Bedrock's own intelligent prompt routing is not offered for any of the
three models, per their cards, so a router would be ours to build or a vendor's.

If the eval shows Haiku 5.5 is good enough for some turns, a cleaner split is by conversation.
Pick the model when the chat starts and keep it. That keeps one cache and one reasoning chain per
conversation.

### Jev

The ticket calls Jev a router. TypeSafe AI calls it something else, "a frontier-intelligence
function call: unstructured state in, typed probabilistic decisions out"
([announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev)). You send a state
(text, JSON or images) and typed questions (`Choice`, `Score`, `Noul` for true or false, `Box`),
and get back answers with probabilities and confidence
([docs](https://docs.typesafe.ai/introduction)). It does not generate text, so it can't be the
Assistant, and it doesn't route between LLMs by itself. It could be our screen, and TypeSafe ships a
guardrail cookbook that does exactly that with five `Noul` questions per message
([LLM guardrails](https://docs.typesafe.ai/cookbooks/llm_guardrails.md)).

What the vendor states:

- Model `jev-1.14.0`, available from 2026-10-14. $0.042 per million input tokens, output free.
  64k tokens per request
  ([Models](https://docs.typesafe.ai/models.md)).
- Early access with a waitlist, first public release 2026-09-15.
- A JavaScript SDK, `@typesafe-ai/sdk`, linked at v0.7.0, ESM and CommonJS with types, Node 22 or
  newer ([JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md)). That fits our Node 24
  Express backend.
- Speed and cost claims of "193.6x Faster, 444.6x Cheaper". The benchmark scores Jev against
  reference probabilities from other LLMs, on workflows TypeSafe's own team built, and the post
  says so.
- No supported-language list and no deprecation policy.

On maturity, I found no independent benchmark. The coverage I could find restates TypeSafe's own
figures, and the numbers drift between outlets. It is a seven-week-old early-access product from
a well-funded lab with a credible founder. That is a reason to watch it, not to put HR data
through it.

Data protection is the deciding point. The privacy policy says "The Services are hosted in the
United States" and names no transfer mechanism for EU users. It promises no training on input and
keeps data "as long as reasonably necessary"
([Privacy policy](https://typesafe.ai/legal/privacy-policy)). The docs mention a DPA and zero data
retention "for enterprise customers"
([Legal](https://docs.typesafe.ai/legal.md)). Using it means a new subprocessor on our list, a
customer notice under our DPA, and a transfer to the US of every user message, which includes
absence reasons. T-670 chose Bedrock precisely to avoid that. The saving would be about $0.0002 per
conversation against the Haiku screen.

Other hosted routers (OpenRouter and the like) carry the same cost in data-protection terms, a
second vendor in the path and usually US processing, plus a single point of failure ahead of
Bedrock. I did not evaluate them further.

## Swapping models

Keep the model choice in config, per environment:

- `ASSISTANT_MODEL` (default `eu.anthropic.claude-sonnet-5-5`), `ASSISTANT_EFFORT` (`medium`),
  `ASSISTANT_SCREEN_MODEL` (`eu.anthropic.claude-haiku-5-5`).
- A price table keyed by model id, at Anthropic list price, for T-674's meter. Screen calls count
  against the cap too.
- The Terraform IAM policy from T-670, extended with each model's EU profile ARN and its
  foundation-model ARN in the six destination regions. A model missing from IAM fails closed.

Store the model id on each conversation and finish a conversation on the model that started it.
Thinking blocks don't carry across models on Bedrock, and Sonnet 5.5 rejects replayed blocks after
any change to earlier history. A new model therefore reaches new conversations only. That rule
makes a swap a config change plus an eval run. Two Bedrock-specific risks from T-670 remain. A new
model can be global-only for weeks before its `eu.` profile appears, and the EU price must be read
from the console.

## Recommendation

1. Main model Sonnet 5.5 on `eu.anthropic.claude-sonnet-5-5`, effort `medium`, adaptive thinking.
   Sweep `low` and `medium` in the eval before launch.
2. A Haiku 5.5 screen on every user turn, structured output, thinking off, run in parallel with
   the main call. No tool runs and no text streams before the verdict. Count rejections per user
   and fall back to sequential screening for repeat offenders.
3. A system prompt with the scope, the borderline examples and one refusal sentence in each app
   language. Handle `stop_reason: "refusal"` from both models.
4. No Bedrock Guardrails, no router, no Jev at launch. Revisit Guardrails' Standard-tier prompt
   attack filter if the eval shows attacks getting through. Revisit Jev only if it offers EU
   hosting and a published subprocessor list.
5. The eval set above, in English and Czech, gating every prompt, tool or model change.
6. Run the same eval on Haiku 5.5 as the main model. If it matches Sonnet on tool accuracy,
   switch through config for 17 times more conversations under the cap.

## Open checks for the build tickets

- Measure Haiku screen latency from App Runner to the EU profile, p50 and p95, and decide
  parallel or sequential on the number.
- Confirm with two calls that Haiku and Sonnet don't share a prompt cache, and that switching
  models on Bedrock drops thinking blocks.
- Confirm that `thinking: {"type": "disabled"}` plus `output_config.format` works for Haiku 5.5 on
  `bedrock-runtime` through `AnthropicBedrock`.
- Record real token counts for the tool definitions once the tool list exists. The 6,000-token
  prefix above is a guess.

## Sources

- Anthropic:
  [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview),
  [Pricing](https://platform.claude.com/docs/en/about-claude/pricing),
  [Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview),
  [What's new in Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/whats-new-haiku-5-5),
  [Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview),
  [What's new in Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5),
  [Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks),
  [Increase output consistency (keep Claude in character)](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency),
  [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).
- AWS:
  [Haiku 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html),
  [Sonnet 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html),
  [Opus 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html),
  [Denied topics](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-denied-topics.html),
  [Safeguard tiers](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-tiers.html),
  [Prompt attacks](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-prompt-attack.html),
  [Supported languages](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html),
  [Cross-Region guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-cross-region.html),
  [Guardrail profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-cross-region-support.html),
  [ApplyGuardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-independent-api.html),
  [Streaming with guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-streaming.html),
  [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/),
  [Guardrails price cut, December 2024](https://aws.amazon.com/about-aws/whats-new/2024/12/amazon-bedrock-guardrails-reduces-pricing-85-percent/).
- TypeSafe AI (vendor claims):
  [Home](https://typesafe.ai/),
  [Introducing System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
  [Docs introduction](https://docs.typesafe.ai/introduction),
  [Models](https://docs.typesafe.ai/models.md),
  [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md),
  [LLM guardrails cookbook](https://docs.typesafe.ai/cookbooks/llm_guardrails.md),
  [Legal](https://docs.typesafe.ai/legal.md),
  [Privacy policy](https://typesafe.ai/legal/privacy-policy).
- Flexi Day: `flexi-day/lib/i18n/config.ts` (app languages `en` and `cs`), T-670 findings on
  `research/assistant-model-provider`.
