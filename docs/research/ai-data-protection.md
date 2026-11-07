# What our legal texts and GDPR require when Anthropic becomes a subprocessor

Research for Fenro T-692, a child of the map T-667 (AI assistant and Flexi Day MCP server). Checked
on 2026-11-07 against our own legal pages in `flexi-day/app/(legal)/` (English and Czech, legal
pages last updated 28 October 2026), the GDPR text, EDPB Guidelines 07/2020 and Opinion 22/2024,
Anthropic's Data Processing Addendum, Commercial Terms, Usage Policy, subprocessor list, retention
pages and Managed Agents docs, and the Data Privacy Framework participant list. Sources are listed
at the end.

This is not legal advice. Where the reading is uncertain, the doc says so, and the last section
lists what a lawyer has to settle.

## Short answer

- **Our DPA already has the machinery, and it binds us on every plan.** Section 7 gives a general
  authorisation for sub-processors and promises that any addition is announced by updating the list
  and its date at least 30 days before the change, and by email to the owner, with a right to object
  and, failing agreement, to delete the organization. Adding Anthropic triggers that promise. No
  email template for it exists today.
- **Three statements in our texts become false** the day the Assistant runs: "Organization data is
  stored in the European Union" (DPA section 8), "Your data is hosted within the European Union"
  (Privacy section 7), and "Your data stays within the European Union" (Security page). Chats sit in
  Anthropic's US storage until we delete them.
- **The cleanest structure copies the people directory**: a versioned "AI features agreement" that
  adds to the DPA, which the owner accepts when turning the Assistant or AI connections on, with the
  acceptance recorded per organization, version, user and time. That acceptance is the specific
  written authorisation Article 28(2) asks for. Keep the 30-day email to every owner as well, because
  the DPA's wording covers any addition to the list, not only organizations that use it.
- **Transfers rest on the SCCs alone.** Anthropic is not an active participant in the EU-U.S. Data
  Privacy Framework (searched 2026-11-07), and its DPA incorporates SCC Modules 2 and 3. We need a
  transfer impact assessment. With `global` inference, prompts may be processed "in any available
  geography", which nobody can assess country by country. Pinning `inference_geo: "us"` (1.1x price)
  makes the transfer a single, assessable destination.
- **Anthropic's terms flow down most of our DPA**, with four gaps: retention of flagged content (up to
  2 years, classifier scores up to 7) for Anthropic's own safety purposes, a 15-day objection window
  and "reasonable notice" for its own sub-processors against our 30 days, an audit right limited to
  once a year at our cost, and no termination right on objection. The DPA has to disclose them.
- **AI connections need a mention but not a sub-processor entry.** The member's app provider is a
  recipient the member chooses, under the member's own agreement, on the owner's instruction (the
  setting). It is not engaged by us. Our texts must say so, and the owner's dialog must warn that a
  member's consumer account may have its own retention and training terms.
- **Article 13 and 14 notices to employees are the organization's duty**, as controller of
  organization data. Our job is to give owners what they need: the sub-processor entry, a short
  notice they can pass on, and DPIA input, which this feature will likely need (employees as
  data subjects, new technology, possible health data in sick leave).

## The facts this rests on

From the map's decisions:

- The Assistant uses the **Anthropic API with an API key and `global` inference** (T-670, superseded
  by T-675 on 2026-11-07). The Bedrock option that kept AWS as the only processor was weighed and
  rejected.
- **Claude Managed Agents runs the loop** (T-686). Sessions sit in Anthropic's US storage; there is no
  EU workspace geo and no zero data retention. Our nightly tick deletes a session 30 days after its
  last message, and deleting a chat deletes its session at once. Our database keeps the display record
  of a chat for 180 days.
- A **Haiku screen** runs on every message before it is sent to the session (T-686, round 3). That is
  a separate Messages API call.
- Per-user context sent to the model: name, role, organization, language, date (T-686).
- The **turn-on dialog** (T-680) says what leaves Flexi Day ("to Anthropic, in the US, only what the
  member can see"), retention ("180 days with us, 30 days after the last message at Anthropic, no
  training"), the Weekly limit, and that owners and admins see usage and refused counts, never content.
  The resolution marks this copy as a draft awaiting the data protection review.

From Anthropic's own pages:

- **Managed Agents keeps session history "until you delete the session"**; it is "not currently
  eligible for Zero Data Retention" (Managed Agents monitoring page; API and data retention page).
  The 30-day deletion is our job, not Anthropic's default.
- **Workspace geo, where data is stored at rest, has one value today: `"us"`.** Inference geo is
  `"global"` (default, "any available geography") or `"us"` at 1.1x price. Managed Agents can pin
  `inference_geo` on the agent (data residency page).
- **Default commercial API retention**: inputs and outputs deleted "within 30 days of receipt or
  generation"; flagged Usage Policy violations kept up to 2 years and classifier scores up to 7 years
  (privacy center article, updated 2026-07-01). This applies to the Haiku screen.
- **Covered Models** (Fable 5.1, Mythos 5.1, Fable 5, Mythos 5) carry mandatory 30-day retention.
  Sonnet 5.5 and Haiku 5.5 are not on that list (API and data retention page).
- **No training**: "Anthropic may not train models on Customer Content from Services" (Commercial
  Terms, section B, effective 17 June 2025).

## What our legal pages say today

The English and Czech pages match on every point below. The Security page has no Czech twin.

| Page and section       | What it promises                                                                                                                                                                                                                                                                                                                       | Effect of the Assistant                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DPA 1, Terms 8         | The DPA applies to every organization on every plan; the owner accepts it with the Terms.                                                                                                                                                                                                                                              | Applies to Enterprise customers who turn the Assistant on, and the list change reaches everyone.                                                               |
| DPA 2, 3               | Subject matter, nature and data categories: leave, quotas, attendance, change log, attachments, directory.                                                                                                                                                                                                                             | No mention of an AI assistant, chats, or transmission to a model provider. Needs a new purpose, data category (chats, usage records) and processing operation. |
| DPA 4                  | Processing only on documented instructions, "including for transfers outside the EEA". No AI training, no own purposes.                                                                                                                                                                                                                | Turning the Assistant on can be the instruction. Anthropic's safety retention is a purpose of Anthropic's own; it has to be disclosed.                         |
| DPA 6, Security        | Hosting in the EU. "Your data stays within the European Union."                                                                                                                                                                                                                                                                        | False for chats.                                                                                                                                               |
| DPA 7                  | General authorisation. Four sub-processors (AWS, SES, Sentry, Apple). Additions announced at least 30 days ahead by list update and email to the owner; objection on reasonable data-protection grounds; if unresolved, the Controller may delete the organization. Sub-processors bound by the same obligations; we stay responsible. | Anthropic must be added with 30 days' notice and email. Anthropic's terms must give the same obligations in substance (see gaps below).                        |
| DPA 8                  | "Organization data is stored in the European Union." Transfers rely on adequacy or SCCs.                                                                                                                                                                                                                                               | First sentence becomes false. SCCs are the route.                                                                                                              |
| DPA 9, 10, 11, 13      | Help with requests, breach notice without undue delay, help with DPIAs, audits.                                                                                                                                                                                                                                                        | We need Anthropic's help to meet each; its DPA gives it (D, G, B.6, F).                                                                                        |
| DPA 12                 | On organization deletion: live data deleted at once, backups age out in 7 days.                                                                                                                                                                                                                                                        | Organization deletion must delete every Anthropic session of that organization. Anthropic's own backup period after a session delete is not published.         |
| Privacy 1, 3, 4        | We control account data, process organization data. Lists the data we collect and the legal bases.                                                                                                                                                                                                                                     | No mention of chats, AI connection records or usage records.                                                                                                   |
| Privacy 5              | Table of processors including Paddle; says organization-data processors are the DPA's sub-processors.                                                                                                                                                                                                                                  | Anthropic must appear here too.                                                                                                                                |
| Privacy 7              | "Your data is hosted within the European Union"; SCCs "where any transfer occurs".                                                                                                                                                                                                                                                     | Must name the US transfer.                                                                                                                                     |
| Privacy 8              | Retention periods for account and organization data.                                                                                                                                                                                                                                                                                   | Needs chat retention (180 days with us, up to 30 days at Anthropic, longer if flagged).                                                                        |
| Privacy 13, Terms 15   | Updates change the date; material changes get a more prominent notice. Continued use after changes means acceptance (Terms).                                                                                                                                                                                                           | The change is material, so a prominent notice is due under both.                                                                                               |
| Terms 6                | Licence to process Content "solely to provide and improve the Service".                                                                                                                                                                                                                                                                | Fine; nothing new.                                                                                                                                             |
| Directory agreement 10 | Versioned agreement, acceptance recorded, new versions accepted on next visit.                                                                                                                                                                                                                                                         | The model to copy for the Assistant.                                                                                                                           |

## What GDPR and the EDPB require

### Authorisation and notice (Article 28(2))

A processor must not engage another processor "without prior specific or general written
authorisation of the controller". Under a general authorisation, the processor must inform the
controller of any intended addition or replacement, "thereby giving the controller the opportunity
to object" (Article 28(2)).

EDPB Guidelines 07/2020 add:

- The processor must obtain the controller's authorisation in writing **before** any personal data is
  entrusted to the sub-processor, and give a list with each sub-processor's location, what it does and
  proof of its safeguards (para. 152).
- Under a general authorisation, failure to object within the set timeframe can count as
  authorisation (para. 157). The contract should fix the timeframe, how notice is communicated and
  what happens after an objection (para. 158).
- Notice must be active: giving access to a list "updated from time to time" is not enough; the
  processor must point at each new sub-processor (para. 128, footnote 54).

EDPB Opinion 22/2024 adds that controllers should have the identity (name, address, contact person)
of **all** processors and sub-processors down the chain readily available at all times, and that the
processor should provide and update it proactively (executive summary). That reaches Anthropic's own
sub-processors: Google Cloud, AWS, Microsoft Azure and Cloudflare for infrastructure, plus support,
fraud and analytics vendors (trust.anthropic.com/subprocessors, 22 entries, most "worldwide" or US).

Our DPA section 7 meets the general-authorisation route with a 30-day window and email. Two options
for the Assistant:

1. **General authorisation only.** Update the list and email every owner at least 30 days before any
   organization's data reaches Anthropic. Every owner on every plan gets the email, because the DPA
   applies to every organization and the promise covers "any intended addition".
2. **Specific authorisation at turn-on, plus the notice.** The owner accepts a versioned addendum when
   turning the Assistant on. Data reaches Anthropic only for organizations that accepted. This is
   stronger evidence of authorisation and matches how the people directory works. Sending the 30-day
   email to all owners as well keeps the DPA's literal promise.

Option 2 is the recommendation. Whether option 2 alone, without the 30-day notice, satisfies the DPA
for organizations that never turn the Assistant on is a question for the lawyer. The safe path is to
send the notice anyway: it costs one email.

### The same obligations down the chain (Article 28(4))

The sub-processor contract must impose "the same data protection obligations" as ours, and we stay
fully liable for the sub-processor (Article 28(4)). The EDPB reads "same" functionally, not word for
word (Guidelines 07/2020, para. 160). Opinion 22/2024 says the controller keeps the decision and the
duty to verify guarantees, and should verify more where the risk is high.

Anthropic's DPA (effective 24 February 2025) against ours:

| Our DPA promises                                                                                 | Anthropic's DPA gives                                                                                                | Gap                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Processing on instructions only (4)                                                              | Processing to provide the Services and for listed business purposes (B.2, B.3, Schedule 1)                           | Anthropic keeps flagged content to enforce its Usage Policy (privacy center: up to 2 years, scores up to 7). Disclose it.                                                            |
| No own purposes, no AI training (4)                                                              | No training on Customer Content (Commercial Terms B)                                                                 | Training covered. Safety retention is an own purpose; see above.                                                                                                                     |
| Breach notice without undue delay (10)                                                           | Within 48 hours (G.1)                                                                                                | None.                                                                                                                                                                                |
| Help with requests, DPIAs (9, 11)                                                                | Forwards requests, reasonable help (D.1, D.2); DPIA help (B.6)                                                       | None.                                                                                                                                                                                |
| Audits on reasonable notice, each party bears its costs (13)                                     | Reports (SOC 2) on request; audits at customer's cost, at most once in 12 months (F.1 to F.3)                        | Narrower. Probably acceptable as functional equivalence; lawyer to confirm.                                                                                                          |
| 30 days' notice of new sub-processors, objection, deletion of the organization if unresolved (7) | "Reasonable notice"; 15 days to object; "work together in good faith"; no termination right (C.3)                    | Anthropic can add a sub-processor faster than we promise our customers. Our DPA should say we pass Anthropic's changes on as soon as we receive them, and point at Anthropic's list. |
| Deletion at once, backups gone in 7 days (12)                                                    | Return or delete within 30 days of termination (H.1); session delete removes record and events (Managed Agents docs) | Anthropic's backend and backup period after a session delete is not published. Ask Anthropic or disclose "up to 30 days".                                                            |
| Transfers on instruction, with SCCs (4, 8)                                                       | SCC Modules 2 and 3, UK and Swiss addenda (I.1 to I.4, Schedule 3)                                                   | None, if Module 3 applies to us as a processor. The DPA does not say which module applies when; lawyer to confirm.                                                                   |

### Transfers to the US (Chapter V)

- Article 44 requires that a transfer, including an onward transfer by a processor, keeps the GDPR's
  level of protection. Article 46(2)(c) allows the Commission's SCCs.
- **Anthropic is not on the Data Privacy Framework list.** A search of the participant list on
  2026-11-07 for "Anthropic" returned no results; the same search finds Sentry, so the search works.
  The DPF adequacy decision of 10 July 2023 therefore does not cover Anthropic, and the SCCs in its
  DPA carry the transfer. (For background: the General Court dismissed the challenge to the DPF in
  T-553/23, Latombe, on 3 September 2025; an appeal, C-703/25 P, is pending according to secondary
  reporting. It doesn't affect an SCC-based transfer directly.)
- **We are processor to Anthropic as sub-processor**, so Module 3 (processor to processor) is the
  matching module. SCC Clause 14 requires the parties to assess the destination country's laws and
  practices (a transfer impact assessment), and Opinion 22/2024 says the controller must be able to
  show that documentation to its supervisory authority, built on what the processor provides.
- **`global` inference widens the transfer.** Storage is in the US, but under `global` "inference may
  run in any available geography". Neither Anthropic's pages nor its subprocessor list name those
  geographies beyond "worldwide" infrastructure. A transfer impact assessment for unknown countries is
  hard to write. Pinning `inference_geo: "us"` on the agent and on the Haiku screen keeps both storage
  and inference in the US, at 1.1x the token price. That moves the 10 USD Weekly limit's real cost
  to 11 USD, the same trade T-670 priced for Bedrock's EU profile.

### Information to people (Articles 13 and 14)

- For **organization data**, the organization is the controller. Article 13(1)(e) and (f) and Article
  14(1)(e) and (f) require it to tell its people the recipients or categories of recipients, and any
  third-country transfer with a reference to the safeguards. Article 14 applies to people whose data
  the organization did not collect from them, such as a colleague named in a chat. Our DPA already
  places this duty on the Controller for the directory (directory agreement section 3). We should give
  owners a short text to pass on, like the directory's "Tell members" notice.
- For **account data**, we are the controller and our Privacy Policy is the notice. The Assistant
  sends account data too (name, language), and AI connections create records we keep (which app,
  which organization, scope, last used).
- **Usage records per person** (spend this week, refused turns) are shown to owners and admins. That
  is personal data about employees and must appear in what the organization tells them. A per-person
  refused-turn count can read as monitoring; see the lawyer list.

### Whose data is a chat

Our texts split data into account data (we control) and organization data (we process). A chat fits
neither cleanly: the owner turns the feature on, it runs inside one organization, and its answers are
organization data, but the 180-day retention is ours, not a setting the organization controls.
Treating chats as **organization data**, processed on the organization's instruction with a fixed
retention the owner accepts in the addendum, keeps one controller per chat and fits the existing
model. The alternative, Flexi Day as controller of the chat log, would need its own legal basis and
would make us answer the employee's requests directly. Lawyer to confirm the first.

### Impact assessment (Article 35)

Article 35 requires a DPIA where processing is likely to result in a high risk. The EDPB-endorsed
WP248 criteria count vulnerable data subjects (employees) and innovative technology (AI); two criteria
usually mean a DPIA. Sick leave and attachments can reveal health data, which the DPA already flags
(section 3). The DPIA is the organization's to do. Our DPA section 11 promises the information for it,
so we should prepare that pack. Whether we also need our own DPIA for the parts we control is a
lawyer question.

### Records of processing (Article 30(2))

As a processor we must record the categories of processing per controller, transfers and their
safeguards. The under-250 exemption in Article 30(5) does not apply where processing is not
occasional or includes special categories, so it likely doesn't apply to us. If the record exists, it
needs the Anthropic transfer; if it doesn't, this is the moment to write it.

## AI connections

When a member connects their own AI app, Flexi Day sends organization data to that app's provider
through our MCP server. We do not choose the provider or contract with it, so it is not our
sub-processor under Article 28(2). It is a recipient: the member's agent, acting under the member's
agreement with that provider.

What our texts need:

- The DPA: the owner's AI connections setting is a documented instruction to let members send the
  organization data they can see to apps they choose, read only or read and write. Once data reaches
  the app, it leaves our processing and our responsibility. The same logic already covers exports.
- The Privacy Policy: what we keep about a connection (app name and address, organization, scope,
  last used), the legal basis (contract), how to disconnect, and that the app provider handles the
  data under the member's own agreement with it.
- The owner's dialog: a member may connect a **consumer** account whose provider keeps or trains on
  data under consumer terms. The organization's own policy decides which apps its people may use; we
  can't enforce it beyond Read only versus Read and write and revocation.
- The organization's notice to its people should mention it.

Whether a member's own AI app reading colleagues' leave data needs anything more (for example, the
organization as controller staying responsible for a disclosure its setting allowed) is a lawyer
question.

## Recording the owner's acceptance

Yes, record it, the way the directory does: `directory_agreement_acceptances` keeps one row per
enable or re-acceptance with organization, version, accepting user and time, and
`DIRECTORY_AGREEMENT_VERSION` lives in both the backend and `lib/legal.ts`. Reasons:

- Article 28(2) asks for written authorisation, "including in electronic form" per the EDPB, obtained
  before processing starts (Guidelines 07/2020, para. 152).
- Articles 5(2) and 24 make us show compliance; a row with version and time is the evidence.
- It gives a clean way to change the terms later: a new version asks the owner again, as the
  directory agreement section 10 does.

One agreement with two switches is enough. Record acceptance when the owner first turns either
setting on, and again when the version rises. Raising AI connections from Read only to Read and
write is a change of instruction under the same agreement and needs no new acceptance, only the
setting change log.

## Notifying existing customers

- **Who**: every organization's owner, by email, plus the list and date change on the DPA page, at
  least 30 days before Anthropic processes any organization's data. The DPA applies on every plan and
  the promise is about the list, so limiting the email to Enterprise owners is the riskier reading.
- **What**: Anthropic's name, purpose, location (US storage; inference in the US or worldwide,
  depending on the inference decision), that it applies only to organizations that turn the Assistant
  on, the objection route, and a link to the updated pages.
- **When**: the 30 days run before the switch can be turned on in production. The feature can ship
  dark before that.
- **Users**: the Privacy Policy change is material, so Privacy section 13 promises "a more prominent
  notice". An in-app banner or a line in the email to all users would meet it.
- Nothing in the flexi-day-emails repo serves this today; it needs a template.

## What Anthropic gives us to point at

- **DPA** (anthropic.com/legal/data-processing-addendum, effective 2025-02-24): Anthropic as processor,
  sub-processor list and notice (C), deletion (H), breach notice in 48 hours (G), audit reports (F),
  SCC Modules 2 and 3 with UK and Swiss addenda (I, Schedule 3). Incorporated by the Commercial Terms
  (section C).
- **Commercial Terms** (effective 2025-06-17): no training on Customer Content (section B).
- **Subprocessor list**: trust.anthropic.com/subprocessors. It renders client-side, so link to it rather
  than copying it; I could not find a documented subscription for change notices.
- **Retention pages**: the privacy center article on organization data (30-day default, flagged
  content exceptions) and the platform docs on API and data retention and on Managed Agents.
- **Usage Policy** (version effective 2026-11-12): employment decisions are high-risk area 7. A
  "High-risk AI Recommendation" about hours, shifts, performance or discipline needs meaningful review
  by a qualified person, and the affected person must be told AI was used. Consumer-facing agents must
  disclose they are AI. Our confirmation cards are a human review step; the Assistant should not
  recommend approving or rejecting someone else's request without it.
- **SOC 2 reports** on written request (DPA F.1), for the DPIA pack.

## The T-680 dialog copy, checked

| Draft says                                                          | Finding                                                                                                                                                         | Suggested change                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Data goes "to Anthropic, in the US"                                 | Storage is US. Inference under `global` runs "in any available geography".                                                                                      | Pin `us` and keep the sentence, or say "stored in the US, processed in the US and other countries".                             |
| "only what the member can see"                                      | Holds if the tool fence holds. Also sends name, role, language.                                                                                                 | Keep; add "and their name and role".                                                                                            |
| "30 days after the last message at Anthropic"                       | True only because our tick deletes sessions; Anthropic keeps them until deleted. Screen calls follow Anthropic's 30-day default. Flagged content up to 2 years. | "Up to 30 days after the last message. Anthropic keeps a message longer only if its safety systems flag it, for up to 2 years." |
| "180 days with us"                                                  | Matches T-686.                                                                                                                                                  | Keep.                                                                                                                           |
| "no training"                                                       | Commercial Terms B.                                                                                                                                             | Keep.                                                                                                                           |
| Owners and admins see "usage and refused counts, never content"     | Accurate. Per-person refused counts are personal data.                                                                                                          | Keep; tell the owner its people should be told.                                                                                 |
| (missing)                                                           | Accepting the AI features agreement, and Anthropic becoming a sub-processor.                                                                                    | Add a checkbox or line: "I accept the AI features agreement (version N) for <organization>", linking to it.                     |
| AI connections dialog: member's own agreement with the app provider | Accurate. Missing the consumer-account warning.                                                                                                                 | Add: "Personal accounts of AI apps may keep or train on what they read. Your own policy decides which apps your people use."    |

## Requirements for the build tickets

1. **AI features agreement page**, English and Czech (`/ai-agreement/`, `/cs/ai-agreement/`), adding
   to the DPA for the Assistant and AI connections: purpose, data (chats, display record, usage records,
   connection records), Anthropic as sub-processor with location and safeguards, Anthropic's own
   retention of flagged content, chat retention (180 days with us, up to 30 at Anthropic), the AI
   connections instruction and where our responsibility ends, no training, version section. Add it to
   `TranslatedLegalPage`.
2. **Acceptance record**: an `ai_agreement_acceptances` table mirroring
   `directory_agreement_acceptances`, an `AI_AGREEMENT_VERSION` constant in the backend and
   `lib/legal.ts`, written when the owner first turns either setting on; the switch API refuses to turn
   on without the current version accepted. A raised version asks the owner again on next visit and
   pauses nothing, as the directory does.
3. **DPA edits** (both languages): Anthropic in the section 7 table with "only for organizations that
   turn on the Assistant", location per the inference decision, and a link to Anthropic's list for its
   own sub-processors; a sentence that we pass on Anthropic's sub-processor changes as soon as we get
   them; section 2 and 3 additions pointing at the new agreement; section 8 rewritten so it no longer
   says all organization data is stored in the EU; section 12 covering session deletion at Anthropic.
4. **Privacy Policy edits** (both languages): sections 3, 4, 5 (Anthropic row), 7 (US transfer, SCCs,
   no DPF), 8 (chat and connection retention), and a short section on AI connections. Raise
   `LEGAL.updated`.
5. **Security page**: drop "Your data stays within the European Union" or qualify it; add the
   Assistant's sub-processor and deletion.
6. **Notice email**: a flexi-day-emails template for a sub-processor change, sent to every owner at
   least 30 days before the switch is usable in production, plus an in-app notice to all users for the
   Privacy Policy change. Record when the notice went out; that date starts the 30 days.
7. **Turn-on dialogs**: the copy changes in the table above, the agreement link and acceptance, in
   English and Czech.
8. **Deletion**: deleting an organization deletes every Anthropic session of its chats (interrupt
   first if running), alongside the existing chat delete and nightly tick from T-686. Account deletion
   follows the chat's classification (organization data stays with the organization).
9. **Inference geo**: decide `global` or `us` for the agent and the Haiku screen before the texts are
   written, because the location sentence depends on it. Recommendation: `us`.
10. **Assistant behaviour**: say it is an AI in the chat interface; never recommend approving or
    rejecting someone else's request; every write goes through a confirmation card. Tools never return
    attachment contents.
11. **Owner kit**: a short notice owners can give their people (recipients, US transfer, retention,
    usage visibility), shown after turn-on like the directory's "Tell members", and a DPIA information
    pack (data flow, sub-processors, SOC 2 request route, retention, safeguards).
12. **Records**: add the Anthropic transfer to our Article 30(2) record and keep a transfer impact
    assessment for the US with the SCC module named.
13. **Anthropic setup**: accept the DPA in the Console for both workspaces; watch the trust center for
    sub-processor changes; ask Anthropic how long a deleted session stays in its backups.

## What needs a lawyer

- Whether the owner's specific acceptance replaces the 30-day notice for organizations that never turn
  the Assistant on, or the notice must go to everyone (recommended: send it anyway).
- Whether chats are organization data (we process) or our own data (we control).
- Whether Anthropic's safety retention for its own purposes, its 15-day objection window, its audit
  limits and its lack of a termination right meet Article 28(4) "same obligations".
- Which SCC module applies under Anthropic's DPA when we are a processor, and the transfer impact
  assessment, especially if inference stays `global`.
- Whether per-person refused-turn counts shown to admins are employee monitoring under section 316 of
  the Czech Labour Code.
- Whether the Assistant falls under the EU AI Act's transparency duty (Article 50) or its high-risk
  employment category (Annex III), given that it answers questions and drafts confirmed actions.
- Whether we need our own DPIA and whether our Article 30(2) record is complete.
- Final wording of the AI features agreement, the DPA and Privacy edits, and the dialogs, in both
  languages. Every legal page in the repo already carries a "have it reviewed by a qualified lawyer"
  note.

## Sources

- Our pages: `flexi-day/app/(legal)/dpa/page.tsx`, `privacy/page.tsx`, `security/page.tsx`,
  `terms/page.tsx`, `directory-agreement/page.tsx`, the `cs/` twins, and `flexi-day/lib/legal.ts`.
- Acceptance model: `flexi-day-be/src/db/schema/directory-schema.ts`
  (`directory_agreement_acceptances`), `flexi-day-be/src/services/directory/directoryAgreement.ts`.
- GDPR (Regulation (EU) 2016/679), Articles 5, 13, 14, 24, 28, 30, 35, 44, 46:
  https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Standard Contractual Clauses, Commission Implementing Decision (EU) 2021/914:
  https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj
- EDPB Guidelines 07/2020 on controller and processor, version 2.0, adopted 7 July 2021, paras. 128,
  152 to 160: https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en
- EDPB Opinion 22/2024 on reliance on processors and sub-processors, adopted 7 October 2024:
  https://www.edpb.europa.eu/our-work-tools/our-documents/opinion-board-art-64/opinion-222024-certain-obligations-following_en
- WP29 Guidelines on DPIA (WP248 rev.01), endorsed by the EDPB:
  https://ec.europa.eu/newsroom/article29/items/611236
- Anthropic Data Processing Addendum: https://www.anthropic.com/legal/data-processing-addendum
- Anthropic Commercial Terms: https://www.anthropic.com/legal/commercial-terms
- Anthropic Usage Policy: https://www.anthropic.com/legal/aup
- Anthropic subprocessors: https://trust.anthropic.com/subprocessors
- Anthropic commercial retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- API and data retention: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Data residency: https://platform.claude.com/docs/en/manage-claude/data-residency
- Managed Agents retention: https://platform.claude.com/docs/en/managed-agents/secure-deployment-monitoring
- Data Privacy Framework list: https://www.dataprivacyframework.gov/list
- Latombe appeal (secondary reporting): https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework
