---
name: help-article
description: Write or update Flexi Day help articles in `flexi-day/content/help`, English and the Czech sibling. Use when a change alters what users see or can do (a page, a label, a rule, a limit, a price, a notification, an Assistant or MCP tool), when a ticket has a "Help articles updated" criterion, or when `help:check` fails.
---

# Help articles

The Assistant and AI connections answer how-to questions from the help articles, so an article
that lags the app becomes a wrong answer. Articles live in `flexi-day` even when the change is in
the backend, the emails or the iPhone app; paths below are relative to `flexi-day`.

The code is the source of truth for the format. `lib/help/knowledge-base.ts` holds the frontmatter
schemas, `HELP_MODULES`, `HELP_ROLES` and the price keys, and `pnpm run help:check` runs every rule
CI runs. This skill covers what the check can't see: which articles a change touches, how to write
them, and the Czech sibling.

## Steps

1. **Find the articles.** Grep `content/help/en/` for the page's route, the backend tool name, the
   dictionary keys you changed (`{{ui:` paths) and the feature's words. Update the article that
   covers the topic; add one only for a task or question no article answers. Done when you can name
   every article you will change or add, and what changes in each.
2. **Edit the English file** `content/help/en/<id>.md`, using the template and the writing rules
   below. Format it before anything reads its hash: the format hook does this for Write and Edit,
   and `pnpm exec prettier --write content/help` does it for a file written through Bash.
3. **Write the Czech sibling** `content/help/cs/<id>.md` (see "The Czech sibling"). For a new
   file, start with `translatedFrom: "000000000000"`.
4. **Route coverage.** A page added or removed under `app/(app)/` changes coverage (see "Route
   coverage").
5. **Check.** Run `pnpm run help:check`. A Czech hash failure names the right value
   (`en/<id>.md hashes to <hash>`); paste it only once the Czech text says what the English says.
   Done when `help:check` and `pnpm run format:check` both pass. The evidence for a "Help articles
   updated" criterion is the list of article ids and that passing run.

## Template

English, `content/help/en/<id>.md`. Unknown keys fail the check.

```markdown
---
id: <id> # the file name without .md, lowercase words joined by dashes
title: <one line> # the task or question, in the user's words
summary: <one line> # what the article answers; the Assistant picks articles by it
module: <module> # one of HELP_MODULES
roles: [<role>] # at least one of HELP_ROLES: who the article is for
routes: [/<path>] # optional: the app pages it documents
tools: [<tool_name>] # optional: backend tools whose behaviour it explains
keywords: [<word>] # at least one: words users type, synonyms the body doesn't use
related: [<id>] # optional: other article ids
goldenQuestions: # one to three
  - question: <a question as a user types it>
    expectedArticles: [<id>] # this article, plus any other the answer needs
    mustMention: [<fact>] # optional: short facts a correct answer contains
---

One or two sentences that answer the title.

## A heading named for what the reader wants to do

Body.
```

Czech, `content/help/cs/<id>.md`. It holds only what is translated, plus the hash. `module`,
`roles`, `routes`, `tools` and `related` come from the English file and fail here.

```markdown
---
id: <id>
translatedFrom: "<12 hex>" # quoted, always
title: <Czech title>
summary: <Czech summary>
keywords: [<Czech words>]
goldenQuestions:
  - question: <Czech question>
    expectedArticles: [<id>]
    mustMention: [<Czech fact>]
---
```

`content/help/{en,cs}/_overview.md` is the product overview: the English one has no frontmatter,
the Czech one only `translatedFrom`. It sits in every Assistant prompt, under the same cap. Edit it
when the product's shape changes: a new module, a plan change, a new kind of user.

## Writing the body

- **Voice.** Second person, present tense, short plain sentences, per the `unslop` skill. Open
  with the answer, then `##` and `###` sections named for what the reader wants to do ("Turning it
  on and off", "Who can use it"). Headings feed the search scorer.
- **One topic per article**, about 1,500 tokens at most: the check counts the resolved body's
  characters / 3.5, so about 5,200 characters. Over it, split into two articles that link each
  other.
- **Who can do it.** Name the roles and plans a feature needs, and what everyone else sees instead.
- **UI words over glossary terms.** The glossaries name the data model; the article names what the
  screen shows. Write "request", never "vacation": the glossary's Vacation is one booking row per
  day. Table names, endpoint paths, environment variables and tool names stay out of the body.
- **Facts you checked.** Every number, limit, plan, role and default in an article is one you
  read in the code or the ticket.
- **Labels** are `{{ui:<path>}}`, the string at that path in `lib/i18n/dictionaries/{en,cs}.ts`
  (a plain string, not a function), e.g. `{{ui:nav.settings}}`. A later copy change then reaches
  the article with no edit. A label whose key doesn't exist yet goes in as quoted plain text, and
  the ticket that adds the key swaps it in.
- **Prices** are `{{price:PRO.monthly}}` and the other keys in `PRICES`, formatted per language.
  Type no amount by hand.
- Placeholders resolve in the body, the title and the summary. Keywords and golden questions are
  taken literally: write the label as that language's screen shows it.
- **Links between articles** are `[text](help:<id>)` or `help:<id>#anchor`. The check rejects
  `/help/...` and `https://www.flexi-day.com/help/...`.
- Text and Markdown only. The renderer drops images and raw HTML.

## Golden questions

The eval asks each one, then checks the answer cites `expectedArticles` and contains every
`mustMention` fact.

- Write the question the way a user types it, in their words rather than the article's: "Can the
  Assistant book a day off for me?", not "What can the Assistant do?". A question whose words
  differ from the headings is the one that tests search.
- One to three per article, each a different intent.
- `mustMention` holds two or three short facts a correct answer must contain: a label, a number, a
  rule. A fact containing a comma needs quotes (`"Monday, 00:00 UTC"`) or block list syntax,
  because a comma splits a YAML flow list.
- The Czech questions are what a Czech user would ask, not a word-for-word translation, and their
  facts use the Czech screen's words.

## The Czech sibling

- Write it in the same ticket, every time. The check passes without one, because a missing Czech
  file falls back to English, so this skill is the only thing that catches it.
- Address the reader as "ty", like the existing articles and the Assistant's Czech copy.
- `translatedFrom` pins the English **body** alone. A change to the English title, summary,
  keywords or golden questions leaves the hash alone: update the Czech frontmatter by hand in the
  same edit.
- A dictionary change behind a `{{ui:}}` label changes no hash, so it needs no re-pinning.

## Route coverage

Every page under `app/(app)/` is in some English article's `routes` or in
`content/help/uncovered-routes.json`. A route is the page's path with route groups dropped:
`app/(app)/groups/detail/page.tsx` is `/groups/detail`.

- A new signed-in page goes into the `routes` of the article that documents it. Only when no
  article can yet, it goes into the list, and the ticket says why.
- An article that starts covering a listed route takes it off the list; the check fails until it
  does.

## Tools

`tools` names the Assistant and MCP tools whose behaviour the article explains. A new or renamed
backend tool goes into the `tools` of its article in the same ticket. CI doesn't cross-check this
against the backend, so the grep in step 1 is what keeps it current.
