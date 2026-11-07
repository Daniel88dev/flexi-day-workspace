# A knowledge base the Assistant and MCP clients can both use

Resolves Fenro T-671, a research ticket under the map T-667 (AI assistant and Flexi Day MCP
server). Written 2026-11-07; every URL in [Sources](#sources) was read on that date. Facts about
Flexi Day come from the four repos on that date, cited by path. Token counts for the knowledge base
are my estimates, marked as such, because the Bedrock EU profile has no `count_tokens` (T-670).

The question: how should Flexi Day build a knowledge base that the Assistant reads to understand
the app and advise users, that external MCP clients can use too, that grows as modules are added,
and that works in every app language?

## Recommendation

Write the knowledge base as short Markdown help articles, one per task or concept, and give the
model a table of contents instead of the whole thing.

- **Content.** About 48 articles for the first release, roughly 30,000 tokens in English (estimate).
  Each has frontmatter with an id, title, one-line summary, module, roles, the app routes it
  documents and the MCP tools it relates to.
- **The Assistant.** Its cached system prompt carries a short product overview (about 1,500 tokens)
  and the article index (about 2,500 tokens). Two read-only tools, `search_docs` and `read_doc`,
  fetch whole articles on demand. `read_doc` returns `search_result` blocks, so answers cite the
  article, and Bedrock supports that block.
- **External MCP clients.** The same two tools sit in the shared tool list from T-668, so Claude,
  ChatGPT and Cursor get identical knowledge. The server's `instructions` field carries the
  overview and tells the client to look things up before answering how-to questions. Articles are
  also listed as MCP resources for the clients that show them; that is cheap because it reads the
  same data.
- **Search.** In-process over titles, summaries, keywords and headings, with no database and no
  embeddings. At 48 to 150 articles the model picks from the index better than a vector store
  picks chunks. Embeddings (pgvector on our RDS, Titan Text Embeddings V2 in Frankfurt) stay a
  later swap behind the same `search_docs` interface, for when evals show misses.
- **Languages.** English is the source. Each article has a Czech sibling written in the same pull
  request, pinned to the English version by a hash that CI checks. UI labels appear as
  `{{ui:key}}` references resolved from the app's own dictionaries, so neither language can name a
  button the app doesn't have. The Assistant reads the user's language and falls back to English.
- **Home.** `flexi-day` (the frontend), next to the UI the articles describe and the dictionaries
  they quote. Its build emits a versioned bundle the backend loads, and the same files can render a
  public help center later. That contradicts the map's note that the knowledge base lives in
  `flexi-day-be`; T-677 decides, and the trade-off is under [Where articles live](#where-articles-live).

Don't put the whole knowledge base in the prompt, don't adopt Bedrock Knowledge Bases, and don't
build on Agent Skills or the Files API. The first costs about ten times more per conversation while
the cache is cold, which is most of the time at launch volume. The second needs Aurora or OpenSearch
we don't run. The third and fourth are unavailable on Bedrock.

## What the knowledge base has to cover

Today's product, from the routes in `flexi-day/app/(app)/*/page.tsx`, the backend glossary
(`flexi-day-be/GLOSSARY.md`), its user-facing docs (`docs/calendar-record-types.md`,
`docs/attendance.md`, `docs/directory.md`, `docs/calendar-direct-sync.md`,
`docs/account-deletion.md`) and the inventory in `docs/research/hr-suite-roadmap.md`:

| Module                      | Articles | What they explain                                                                                                        |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Account and getting started | 5        | Sign-up and verification, sign-in with 2FA or Google/Microsoft/Apple, joining by invite code or link, settings, iPhone   |
| Organization and plans      | 5        | Owner and org admins, Free/Pro/Enterprise and group slots, billing, lapsed organizations, the Sick day benefit           |
| Groups                      | 5        | Creating a group, working days and holiday country, member roles, invites, mirroring                                     |
| Leave                       | 8        | The nine calendar record types, booking, half days and times, attachments, approving, cancelling, private details, quota |
| Quotas                      | 2        | Allowances per year and group, rollover                                                                                  |
| Reports                     | 2        | Report scope, the Excel export                                                                                           |
| Calendars                   | 2        | The `.ics` feed, direct sync to Google or Microsoft                                                                      |
| Attendance                  | 6        | Setup, clocking in and out, breaks, worked time and balance, entered sessions and the self-service window, ceilings      |
| People directory            | 5        | Employments and spells, profiles and sensitive sections, external workers, directory invites and claims, the read log    |
| Group events and birthdays  | 2        | One-off and recurring events, birthday sharing                                                                           |
| Notifications and email     | 1        | The six in-app notification types, email settings                                                                        |
| Assistant and MCP           | 2        | What the Assistant can do, connecting an external AI client                                                              |
| Troubleshooting             | 3        | Mail that didn't arrive, "I can't book", "I can't see someone"                                                           |
| **Total, first release**    | **~48**  |                                                                                                                          |

At an average of 450 English words, that is about 21,000 words. Claude's tokenizer runs at roughly
1.3 to 1.4 tokens per English word, so **about 28,000 to 30,000 tokens of English article text**,
or 35,000 with frontmatter and headings. Czech will run higher per article, because inflected words
split into more tokens; I'd plan for 1.5 to 2 times, 50,000 to 70,000 tokens. Both numbers are
estimates. The first build ticket should measure them with `count_tokens` on the Claude API, which
sees only our public articles and no customer data.

The index, one line per article with id, title and summary, is about 50 tokens a line, **2,500
tokens** for 48 articles.

Growth: the roadmap's next modules (timesheets and overtime, leave policies, profile fields and an
org chart, Slack and Teams, a public API, documents, onboarding, SSO) add perhaps 30 articles. A
year out, expect 80 articles, 55,000 to 60,000 English tokens and a 4,000-token index. Still well
under the 200,000 tokens where Anthropic says retrieval becomes necessary, but large enough that
sending all of it on every call stops making sense.

## The options

### A. The whole knowledge base in a cached system prompt

Anthropic's own retrieval write-up says a knowledge base under 200,000 tokens can go straight into
the prompt, with no RAG, and that prompt caching makes this cheaper and faster
([Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)). Ours fits. Recall is
as good as it gets, because the model sees every article.

Three things count against it here.

1. **Cost while the cache is cold.** A cache entry lives on the server that wrote it. A request
   served by a different server, "such as one in another Region", writes a fresh entry
   ([Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)).
   The EU profile spreads requests over six or more regions (T-670), the 5-minute TTL resets only on
   a hit, and each language is its own prefix. At launch, with a handful of Enterprise
   organizations, most conversations will start cold and pay the write. See
   [Cost per conversation](#cost-per-conversation).
2. **Context rot.** Anthropic's context engineering guide treats context as "a finite resource
   with diminishing marginal returns" and reports recall dropping as token counts grow
   ([Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
   An Assistant that mostly books, approves and looks up balances would carry 35,000 tokens of
   attendance and directory prose into every one of those calls.
3. **External clients never see our system prompt.** Claude, ChatGPT and Cursor build their own.
   We'd still need a second delivery path for them, so A doesn't remove any work.

### B. Embeddings and a vector store

The classic RAG pipeline: chunk articles, embed the chunks, embed each question, and put the top
matches in the prompt.

What it would take on our stack:

- **pgvector on RDS.** RDS runs PostgreSQL 17 (`flexi-day-be/terraform/rds.tf`, not 16 as the map
  says), and RDS ships pgvector for it, 0.8.1 as of 17.8
  ([RDS PostgreSQL release notes](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html)).
  One migration adds the extension and a table.
- **Embeddings in the EU.** Titan Text Embeddings V2 runs in-region in `eu-central-1`
  ([regional availability](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html)).
  It takes 8,192 tokens, outputs 1,024, 512 or 256 dimensions, lists Czech among its languages, and
  AWS warns it is "optimized for English" and that cross-language queries "will return sub-optimal
  results" ([Titan embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)).
  So the Czech question would have to meet the Czech article, never the English one.
- **Hybrid keyword search.** Anthropic's numbers show embeddings alone miss more than embeddings
  plus BM25 plus reranking (top-20 failure 3.7 percent against 1.9 percent). PostgreSQL has no
  Czech text search configuration. The list on our local PostgreSQL 17 runs from `arabic` to
  `yiddish` with no `czech`, so the keyword half falls back to `simple`, which doesn't stem.
- **Ingestion.** A job that re-embeds changed articles on every deploy, plus the contextual
  chunking step if we want Anthropic's improvement, which is one more model call per chunk.

**Bedrock Knowledge Bases** would manage all of that, but its PostgreSQL option is Aurora, set up
through the RDS Data API and a Secrets Manager secret; plain RDS isn't on the list. The other
stores are OpenSearch, S3 Vectors, Neptune and three third-party services
([Knowledge Bases vector stores](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-setup.html)).
Each is new infrastructure in Terraform for a corpus of 50 documents.

Even ignoring the plumbing, B is the wrong fit for this corpus. Chunk retrieval earns its keep when
the corpus is too big to read and too big to index by title. Ours is neither. A help article is
written to be read whole, and a 400-token chunk of "Approving requests" without the paragraph
about temp approvers above it gives a worse answer than the whole 700-token article. B also runs on
every user message, including "approve Jana's request", where it spends tokens on chunks nobody
needs.

### C. An index in the prompt and a docs tool

This is the "just in time" pattern from the context engineering guide. The agent keeps
"lightweight identifiers" in context and loads the data with tools when it needs it. It is also how
Agent Skills work: about 100 tokens of name and description per skill always loaded, the body read
only when triggered
([Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)).

For us:

- The system prompt holds the product overview and the index. Both are stable, so they sit behind
  the cache breakpoint with the tool definitions.
- `search_docs({ query, language? })` returns the best few index entries with id, title, summary
  and URL. With an empty query it returns the whole index, which is what an external client calls
  first.
- `read_doc({ id, language? })` returns one article. For the Assistant it comes back as a
  `search_result` block with the article title and public URL as the source, which turns on
  Claude's citations. Search result blocks are stable on Bedrock, InvokeModel included
  ([Search results](https://platform.claude.com/docs/en/build-with-claude/search-results)).
- Both are read-only tools in the shared registry from T-668: `readOnlyHint: true`,
  `openWorldHint: false`, no organization data, no permission check needed.

The trade-offs are real. A how-to question costs one more model round trip, a second or two. The
model can pick the wrong article, or stop after one when the answer spans two. The guide notes that
runtime exploration "is slower than retrieving pre-computed data". Good index summaries, a
`related` list at the foot of each article and evals that ask cross-article questions cover most of
it. At 48 entries the model choosing from a list it can read in full is the same job it does when
choosing a skill, and it does that reliably.

Search itself can stay simple. The Assistant rarely needs it, because the index is already in its
prompt and it can call `read_doc` by id. External clients use it more. An in-memory scorer over
title, summary, a `keywords` frontmatter list and headings, with diacritics folded and prefix
matching, is enough for 48 to 150 articles. The tool description asks for the query in English or
in the article's language, so the model translates the question before searching, which is
something models do well and Czech stemming does badly.

### D. MCP resources and prompts

Resources are "application-driven": the host decides whether to show a picker, search, or include
them automatically, and the spec mandates no interaction model
([MCP resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)).
Prompts are "user-controlled", usually slash commands
([MCP prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts)).

Client support differs:

- Claude supports tools, prompts and resources, but not resource subscriptions
  ([Build an MCP server for Claude](https://claude.com/docs/connectors/building)).
- Cursor lists tools, prompts and resources as supported
  ([Cursor MCP](https://cursor.com/docs/context/mcp)).
- OpenAI's Apps SDK guide describes tools and the server's `instructions`, and doesn't mention
  prompts ([Apps SDK, MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)).

In every client the model decides when to call a tool, and in most the user decides when to attach
a resource. So resources can't be how knowledge reaches the model mid-conversation. They are still
worth exposing, as `flexi-day://help/{language}/{id}` with `audience: ["user", "assistant"]` and
`lastModified`, because Claude and Cursor users can attach an article by hand, and the list comes
from the same bundle. A prompt or two ("Explain this Flexi Day feature") can come later; it adds
little.

The 2026-07-28 `server/discover` result has an optional `instructions` field, "natural-language
guidance for LLMs on how to use this server effectively"
([MCP discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)), and
ChatGPT reads it. That is where the product overview and "look up articles before answering how-to
questions" go for external clients. Keep it short; we don't control where a client puts it.

### E. Agent Skills and the Files API

Both are out for the Assistant. Anthropic lists the Files API, Agent Skills and code execution
under features Claude in Amazon Bedrock doesn't support
([Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)).
Skills on the Claude API also need the code execution container and aren't covered by zero data
retention.

The pattern survives without the product. Option C is progressive disclosure with a tool in place
of a filesystem.

There is one place Skills could matter later. Claude lets a vendor ship a plugin that bundles an MCP
server with skills that teach Claude to use it
([Build an MCP server for Claude](https://claude.com/docs/connectors/building)). A Flexi Day plugin
could carry a "how to use Flexi Day" skill for Claude users. It reaches only Claude, though, so it
comes after the tools, not instead of them.

### F. Hybrids

The recommendation is already a hybrid: a small always-loaded core (overview and index), articles
on demand, and resources as a side channel. The guide describes exactly this, with Claude Code
loading `CLAUDE.md` up front and grepping for the rest.

One other hybrid is worth naming and rejecting: the whole knowledge base in the prompt for the
Assistant, the tools for external clients. It keeps two delivery paths with different behaviour,
so a bug or a missing article shows up in one and not the other, and it still pays A's cold-cache
cost.

## Cost per conversation

Prices are the derived Bedrock EU figures from T-670: $2.20 input, $2.75 cache write (5 minutes),
$4.40 cache write (1 hour), $0.11 cache read, $11 output, per million tokens. Confirm them in the
console before T-674 uses them.

The model conversation: three user turns, six model calls (each turn makes one tool call and then
answers). The tools, system prompt and per-user context are the same in every option, about 10,000
tokens, and I leave them out. The rows show only what the knowledge base adds.

| Knowledge base cost, per conversation  | Cache cold (first call writes) | Cache warm (all reads) |
| -------------------------------------- | ------------------------------ | ---------------------- |
| A. 35k tokens in the prompt, 5-min TTL | $0.096 write + $0.019 reads    | $0.023                 |
| A. same, 1-hour TTL                    | $0.154 write + $0.019 reads    | $0.023                 |
| A. a year out, 60k tokens, 5-min TTL   | $0.165 write + $0.033 reads    | $0.040                 |
| C. 2.5k index + two 1.2k articles read | about $0.018                   | about $0.011           |

How C's figure adds up: the index costs $0.007 to write and $0.0017 to read six times. Two articles
enter the conversation as tool results, $0.0066 to write once through automatic caching and about
$0.001 to read in the later calls. The extra round trip re-reads the cached prefix and writes a
short tool call, about $0.002.

For scale, the conversation itself (the common 10,000-token prefix written once, and about 3,000
output tokens with adaptive thinking) comes to roughly $0.06. Option A more than doubles that on a
cold cache. Option C adds under a third.

Two details from the caching docs make the cold case the common one:

- Bedrock isolates caches at the organization level, meaning our AWS account
  ([Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). That
  part helps: every Flexi Day organization shares one cached prefix per language. It also means a
  conversation that finds the cache cold pays a write that the next organization benefits from,
  which matters for metering fairness (T-674).
- The prefix runs `tools`, then `system`, then `messages`, and "modifying tool definitions
  (names, descriptions, parameters) invalidates the entire cache". If approver-only tools are
  dropped from a member's request, members and approvers stop sharing a cache, and option A's
  35,000 tokens get written once per tool set. Option C's small prefix makes that mistake cheap;
  A makes it expensive.

## Quality

At this size, option A is the recall ceiling and option C comes close to it. C loses only when the
model fails to open the right article, and the index makes that visible: the transcript shows which
article it read. B is the weakest on a corpus of whole help articles, and its keyword half has no
Czech stemmer.

Three practices from Anthropic's material decide how close C gets:

- Write the summary line as the description of a skill: what the article answers and when to read
  it ("How an approver approves, rejects or comments on a request, alone or in bulk").
- Keep articles short, at most about 1,500 tokens, so `read_doc` never returns a wall of text and
  reading two is normal.
- Answers that say where they came from. `search_result` blocks give the chat UI a citation to
  link, and an eval can check that a how-to answer cites an article.

The evals belong to the map's "not yet specified" list. A golden question or two per article is the
natural seed, and the article ids make the expected answer checkable ("read `approve-requests`,
mentioned the temp approver").

## Languages

The app speaks English and Czech (`flexi-day/lib/i18n/config.ts`, `LOCALES = ["en", "cs"]`; the
backend stores the same two in `user_settings`). The dictionaries are large and current:
`lib/i18n/dictionaries/en.ts` and `cs.ts`, about 130 to 140 KB each.

The one thing the knowledge base must not get wrong across languages is the name of a button. If
the model writes from an English article and guesses the Czech label, it will sometimes guess a
word the UI doesn't use. So:

- Articles reference labels as `{{ui:nav.requests}}` and the build replaces each with the string
  from that locale's dictionary. A missing key fails the build. Renaming a label in the UI updates
  every article that mentions it, in both languages, with no edit.
- English is the source. The Czech file sits beside it and records `translatedFrom: <hash of the
English body>`. CI fails when the English body changes and the Czech hash doesn't. The agent that
  edits the English article writes the Czech one in the same commit; the owner, a Czech speaker,
  reviews both.
- The Assistant reads the user's language. A missing translation falls back to English, which the
  model answers from in Czech without trouble.
- A third language later is a third folder and a dictionary the app needs anyway.

A cheaper start would be English only, with labels resolved per locale and the model translating.
It works for the Assistant. It doesn't give a Czech help center, and it leaves the Czech wording to
the model on every answer. Writing both is cheap when an agent writes them in the same PR, so I'd
start with both.

## How external MCP clients get the same knowledge

- `search_docs` and `read_doc` in the shared tool list. Results carry the article's absolute public
  URL, which ChatGPT wants for citations, and an `id` for `read_doc`. OpenAI's company-knowledge
  `search` and `fetch` tools use the same shape (a query in, `id`, `title` and `url` out; full
  `text` on fetch) ([OpenAI MCP](https://developers.openai.com/api/docs/mcp)), so ours line up with
  it without being named after it.
- The server `instructions` carry the overview and the rule to look things up.
- Articles as resources, for clients that let the user attach them.
- Size limits are generous: Claude accepts tool results up to about 150,000 characters on claude.ai
  and 25,000 tokens in Claude Code ([Build an MCP server for Claude](https://claude.com/docs/connectors/building)).
  A 1,500-token article is nowhere near either.

The articles are public, so these two tools need no organization data. Two consequences, which
belong to other tickets: they could work before the user signs in (Claude supports lazy
authentication on the same page), and they need not sit behind whatever plan gate T-676 puts on the
data tools.

## Authoring, freshness and the help center

### Where articles live

Two homes are realistic. T-677 picks.

**`flexi-day/content/help/{en,cs}/<id>.md`, in the frontend.** I'd choose this one. The articles
describe screens, and the screens, their labels and the dictionaries all live in this repo, so the
label check runs locally. A feature's frontend branch ships the UI and its article in the same
deploy, so the article never describes a screen that isn't live yet. The static export can render
`/help/<id>/` pages from the same files when we want a public help center. The build writes one
bundle, `help/kb.<version>.json`, with the index and bodies per locale. The backend loads it on first
use and keeps it in memory under the HTTP cache headers CloudFront sends, so a frontend deploy
reaches the Assistant within minutes, with no job and no polling loop. The cost is a runtime
dependency of the backend on a frontend artifact, and backend-only rule changes (say, quota
rollover) need an edit in the frontend repo. Features already touch both repos on the same
`feat/<slug>` branch, so that edit has a place to go.

**`flexi-day-be/knowledge/`, in the backend.** This is what the map's repo note assumes. The
backend reads files from its own image, so there is no runtime fetch, and rule changes sit next to
the rules. But the label check needs the frontend dictionaries, which the backend's CI doesn't have,
so it would rely on a copied snapshot that drifts. And a public help center would have to fetch
articles from the backend at frontend build time or render them client-side.

### Facts that change

Keep numbers that already live in code out of the prose. Prices come from
`flexi-day/lib/billing/prices.ts`, which the pricing page already treats as its single source, so
`{{price:ENTERPRISE.monthly}}` can resolve the same way labels do. Plan limits live in the backend
(`flexi-day-be/src/services/billing/entitlements.ts`). Facts about the user's own organization
(their plan, whether attendance is set up, whether Sick day is on) come from tools at answer time.
Articles explain the concept. Tools give this organization's values.

### Who writes them, and how they stay current

The agent implementing a feature writes or updates its articles in the same ticket, and the owner
reviews them in the PR, the way glossary changes already land. That needs:

- `/to-tickets` to add "help articles updated" to every ticket that changes something a user sees;
- a short article template and a `help-article` skill (front matter, length, voice, the UI words
  rather than glossary terms where the two differ: the glossary's **Vacation** is a booking row,
  while the screen says request);
- CI checks in the frontend: every `{{ui:...}}` and `{{price:...}}` resolves in both locales;
  every route under `app/(app)/` appears in some article's `routes`; every Czech file's
  `translatedFrom` matches; no article over the length cap; links between articles resolve;
- and, on the backend, a check that every tool in the registry names at least one article id that
  exists in the current bundle, so a new tool can't ship without the article that explains it.

The first release needs a backfill: about 48 articles written from the code, the glossary and the
docs listed above. The "What Flexi Day has today" section of `docs/research/hr-suite-roadmap.md` is
a good outline.

### Could the articles feed a public help center?

Yes, and the design assumes it. The articles are public by construction (no organization data, no
internals), carry stable ids and URLs, and come in both languages. Rendering them in the static
export is a page template. Publishing them is a product decision, though, because a public page is
something customers and search engines read; it isn't free just because the files exist.

## Findings that touch other tickets

- **T-675, where the loop runs.** Send every user the same tool list and enforce permissions in the
  handlers. Tools come first in the cache prefix, so a per-role tool list splits the cache. Put
  per-user and per-organization context (name, organization, date, language) after the last cache
  breakpoint. Return `read_doc` results as `search_result` blocks.
- **T-674, metering.** The prompt cache is shared across all our organizations, so whoever finds it
  cold pays the write. The knowledge base design keeps that write small (about 4,000 tokens of
  overview and index, not 35,000). Each language is a separate prefix.
- **T-679, chat design.** Citations need a place in the message: a link to the article the answer
  came from, and a status line while `read_doc` runs.
- **T-672 and T-678, staying on topic.** The index is a usable definition of "Flexi Day questions".
  A rule like "answer how-to questions from an article or a tool, and say so when nothing covers it"
  is testable, because the transcript shows what was read.
- **T-673, client sign-in.** The docs tools carry public content and could work before sign-in.
- **T-676, plan gate.** The docs tools need not follow the plan gate on data tools.
- **The map.** RDS runs PostgreSQL 17 (`flexi-day-be/terraform/rds.tf`), not 16.

Two possible new decision tickets:

- **A public help center** at `flexi-day.com/help`. The knowledge base makes it cheap, citations
  work better with real URLs, and it changes what the marketing site offers. It needs its own yes.
- **Organization-specific knowledge.** Customers will ask the Assistant about their own leave
  policy, which no Flexi Day article covers. Letting an org admin add policy text is per-organization
  private content, with storage, permissions and possibly per-organization retrieval. It is a
  different system from this one and deserves its own ticket before anyone promises it.

## Open checks for the first build ticket

- Measure the article, index and overview token counts in both languages with `count_tokens` once
  the first articles exist, and replace the estimates here.
- Record the cache hit rate for the system prefix on the EU profile over a few hundred turns, and
  compare 5-minute and 1-hour TTL writes against it.
- Check that `search_result` blocks with citations come back through `AnthropicBedrock` on
  `InvokeModel` for Sonnet 5.5.
- Build a cross-article eval set before deciding whether search needs embeddings.

## Sources

- Anthropic:
  [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval),
  [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [Search results](https://platform.claude.com/docs/en/build-with-claude/search-results),
  [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview),
  [Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock),
  [Build an MCP server for Claude](https://claude.com/docs/connectors/building).
- MCP specification 2026-07-28:
  [Resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources),
  [Prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts),
  [Discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover),
  [Versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/lifecycle).
- AWS:
  [Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html),
  [Knowledge Bases vector stores](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-setup.html),
  [Titan Text Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html),
  [Regional availability by models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html),
  [RDS for PostgreSQL release notes](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html).
- Other clients:
  [OpenAI Apps SDK, MCP server](https://developers.openai.com/apps-sdk/build/mcp-server),
  [OpenAI MCP search and fetch](https://developers.openai.com/api/docs/mcp),
  [Cursor MCP](https://cursor.com/docs/context/mcp).
- PostgreSQL text search configurations: `SELECT cfgname FROM pg_ts_config` on a local
  PostgreSQL 17.11.
- Sibling findings: T-668 (`research/server-mcp-vs-webmcp`), T-670
  (`research/assistant-model-provider`).
