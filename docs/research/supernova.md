# Supernova and the Flexi Day design tokens

Research into whether Supernova (https://www.supernova.io/) is worth adopting for Flexi Day. Checked
on 2026-11-02 against supernova.io, learn.supernova.io (product docs and changelog),
developers.supernova.io, the `Supernova-Studio/exporters` repository at commit `1092e62`, and the
npm registry. No third-party reviews were used.

## Short answer

Supernova is a hosted design system platform. It stores tokens and component metadata, imports them
from Figma, Tokens Studio or manual entry, publishes a documentation site, exports tokens to code
through pipelines that open pull requests, and serves all of it to AI agents over MCP. For Flexi
Day it would not replace the hand-maintained token ports. It stores colors as 8-bit sRGB and accepts
only HEX, RGB or HSB input, so the OKLCH values in `globals.css` would come back as recomputed
strings like `oklch(55.07% 0.164 285.02)` instead of `oklch(0.55 0.165 285)`. Its Tailwind 4
exporter can emit a `.dark` block for the web but not the `prefers-color-scheme` block NativeWind
needs. The free Starter plan allows one pipeline, while Flexi Day has three token consumers. Pro is
$399 a month. Not worth adopting. Signing up for Starter costs nothing, but it would add a second
source of truth that the agents would also need to reach. If you want to try it anyway, give it
one hour: enter five tokens (`--primary`, `--primary-soft`, `--bg`, `--text`, `--c-vacation`) with
a dark theme, run the Tailwind CSS 4 exporter as "Build only" with `cssSelector: :root` and
`themeSelector: .dark`, and diff the download against `flexi-day/app/globals.css`. If the strings
don't match, stop there. If the port starts to hurt, a small generator script in the repo, or
Style Dictionary, fits better.

## What Supernova is

Supernova calls itself a "design system and knowledge management platform", and its current hero
line is "Get your design system ready for or built by the agents" (https://www.supernova.io/). The
home page groups the product into Manage, Document, Deliver and Improve.

**Manage: tokens, components, sources.**

- Token types: color, typography, shadow, border, gradient, blur, dimension, options, string. A
  color "can be defined as a HEX, RGB, or HSB value with an optional opacity". The page names no
  other color space
  (https://learn.supernova.io/latest/design-systems/design-tokens/types-of-tokens-yqeR2c29).
- Tokens can be created by hand in the app: "+ New token", a name, a value, then "Create token".
  Imported tokens cannot be deleted, and only manual ones can
  (https://learn.supernova.io/latest/design-systems/design-tokens/working-with-tokens/create-and-delete-tokens-GSe22unO).
- Themes are override layers on top of base values ("like Dark Mode"). A token without a theme
  value falls back to its base value
  (https://learn.supernova.io/latest/design-systems/design-tokens/theme-tokens-UEbQ3z4s).
- Data sources: Figma files, Figma variables, Tokens Studio, Storybook, or manual entry
  (https://learn.supernova.io/latest/design-systems/import-design-system-data/overview-O6vEmYdi).
  Figma is not required.
- Tokens Studio JSON can be pushed from a repo with the CLI: `supernova sync-tokens --apiKey
--designSystemId --tokenFilePath|--tokenDirPath --configFilePath`, plus a GitHub Actions
  template. That page was last updated 2024-05-30
  (https://developers.supernova.io/latest/supernova-with-ci-cd/cli-commands/sync-tokens-studio-data/tokens-studio-101-bmB0dwM8).
  `@supernovaio/cli` is at 2.3.4 on npm, modified 2026-10-06.
- Adoption dashboard (May 2026) and Figma extended collections for multi-brand (March 2026)
  (https://learn.supernova.io/changelog).

**Document: hosted docs site.** Pages with real-time editing, page history (August 2026), a public
or private site, custom domain and analytics on paid plans (https://www.supernova.io/pricing,
https://learn.supernova.io/changelog).

**Deliver: code automation.**

- Pipelines run an exporter on design system events and either open a pull request or produce a
  "Build only" download. Each pipeline can pick a brand and themes
  (https://learn.supernova.io/latest/automation/get-started/using-pipelines/create-a-pipeline-8Fu6QOeL).
  PRs go to a branch named after the exporter and get updated in place
  (https://learn.supernova.io/latest/code-automation/pipelines/open-a-pull-request/git-hub-fSiY48mk).
- Official exporters live in `Supernova-Studio/exporters`: CSS 3.5.0, Tailwind CSS 4 1.2.0, CSS in
  JS 2.1.4, Style Dictionary 2.4.1, Jetpack Compose 0.0.1, SVG to React, and new Claude Code,
  Codex, Cursor and skills exporters (`exporters/*/exporter.json`). Older ones (iOS, Android,
  Flutter, SCSS, LESS, React) sit in separate repos last pushed in February 2025. No React Native
  or NativeWind token exporter exists. The one React Native repo exports assets and was last pushed
  in 2022 (`gh api orgs/Supernova-Studio/repos`).
- The Tailwind CSS 4 exporter shipped in April 2025. It "transform[s] your design tokens into
  Tailwind config automatically", defaults to OKLCH output, and writes themed variables under a
  class
  (https://learn.supernova.io/latest/releases/april-2025/tailwind-css-v4-exporter-YrQbmYAh).
  Details from its source are under "Fit for Flexi Day".
- Custom exporters are TypeScript packages built on `@supernovaio/sdk-exporters` (2.5.1 on npm).
  Running a custom one needs Pro (https://www.supernova.io/pricing).

**AI features.**

- MCP: one endpoint, `https://mcp.supernova.io/mcp`. On sign-in you pick a design system (write)
  or a context (read only)
  (https://learn.supernova.io/latest/design-systems/features/mcp-for-design-system-LIHAMhjr-LIHAMhjr).
  The read server shipped as "Supernova Relay" in September 2025. Editor MCP, which gives write
  access to docs, tokens, components, skills, contexts and pipelines, arrived in August 2026 and
  went GA in October 2026 (https://learn.supernova.io/changelog,
  https://www.supernova.io/blog/introducing-supernova-editor-mcp).
- Contexts (June 2026) limit which parts of the system a given agent reads
  (https://learn.supernova.io/changelog).
- Supernova Agent: an in-app chat agent that edits docs, tokens, components and pipelines, with
  publishes and deletes held for approval. Public beta on every plan since 2026-10-26
  (https://www.supernova.io/blog/introducing-supernova-agent).
- Portal (September 2025): free access to design system data with "Ask AI" answers and unified
  search (https://learn.supernova.io/changelog, https://www.supernova.io/pricing).
- Prototyping is gone. Supernova Create, the AI prototyping product, was sunset on 2026-08-11
  because teams had standardised on Claude, Codex and Cursor. Its engine now reaches those tools
  through MCP
  (https://learn.supernova.io/latest/releases/august-2026/supernova-create-sunset-atGW4z1K).

## Plans and pricing

Per-seat pricing ended on 2026-10-09. Pro and Enterprise now carry one flat price per workspace
(https://learn.supernova.io/latest/releases/october-2026/goodbye-per-seat-pricing-zidi9E0L).

| Item                             | Starter (free) | Pro               | Enterprise           |
| -------------------------------- | -------------- | ----------------- | -------------------- |
| Price                            | Free           | $399/month, flat  | Contact sales        |
| Editor seats                     | 3              | 10                | Unlimited            |
| Private consumers                | None           | 200               | Unlimited            |
| Public viewers                   | Unlimited      | Unlimited         | Unlimited            |
| Design systems                   | 1              | 2                 | Unlimited            |
| Figma data sources               | 3              | 10                | Unlimited            |
| Automatic data source updates    | No             | Yes               | Yes                  |
| Figma variables import           | Yes            | Yes, configurable | Yes, configurable    |
| Design token themes              | 1              | Unlimited         | Unlimited            |
| Design system versions           | 1              | 10                | Unlimited            |
| Automation pipelines             | 1              | 5                 | Unlimited            |
| Custom code exporters            | No             | Yes               | Yes                  |
| SDK access                       | Yes            | Yes               | Yes                  |
| Documentation pages              | 20             | Unlimited         | Unlimited            |
| Docs site access                 | Public only    | Private or public | Private or public    |
| Custom domain, custom CSS/JS     | No             | Yes               | Yes                  |
| Page history                     | 7 days         | 30 days           | Unlimited            |
| Workspace credits per month      | 1,000          | 10,000            | Custom               |
| Editor MCP, Agent, Portal Ask AI | Yes            | Yes               | Yes                  |
| Consumer MCP servers             | 1              | 2                 | Unlimited            |
| Skills                           | Up to 10       | Unlimited         | Unlimited            |
| SSO                              | Google         | Google            | Google or SAML, SCIM |

Source for the table: https://www.supernova.io/pricing, read 2026-11-02.

Credits are spent on AI features, all from one workspace pool: Agent 50 per message, Ask AI 25 per
answer, Editor MCP writes 3 (5 for docs edits and bulk changes), MCP reads free, failed writes free
(https://learn.supernova.io/latest/releases/october-2026/workspace-credits-updates-PYmDrvnT).
Automations "consume credits" at an unstated rate. Monthly credits renew on the subscription day
and do not carry over. Extra monthly credits can be bought
(https://learn.supernova.io/latest/settings/workspace/billing/ai-credits-QppYjvRr). Starter's 1,000
credits come to 20 Agent messages, 40 Ask AI answers, or about 330 MCP writes a month.

Could not confirm:

- The annual price. The pricing page has a monthly/annual toggle but shows only $399 a month.
- What happens when credits run out, the price of extra credits, and the credit rate for
  automations. The pricing FAQ lists these questions, but the answers did not load.
- Starter seat count. The pricing page says 3 editors, the September 2025 plan note said 5 full
  seats
  (https://learn.supernova.io/latest/releases/september-2025/new-plans-free-pro-and-enterprise-mVg38QOn),
  and the October 2026 note says Starter has "every feature" without a number. The table uses the
  pricing page. A web search snippet also mentioned a "600 per day, 2,400 per month" free credit
  cap. The current credits page says 1,000 a month, so that figure looks stale.
- Whether "Design token themes: 1" counts the base. The theme docs treat themes as overrides on a
  base, so base plus one theme (light plus dark) should fit. Not tested.
- Whether a GitHub pull request destination works on Starter. The pipeline page carries a "Plan:
  All" badge but says nothing more.
- Whether the Starter plan has a trial of Pro. No trial is mentioned anywhere.

## Fit for Flexi Day

### How tokens live today

There is no Figma file. No repo references Figma, and no token JSON exists anywhere in the
workspace (`grep -ril figma` across all five repos, `node_modules` excluded). The tokens exist as
CSS and TypeScript in four copies:

1. `flexi-day/app/globals.css` is the source. Light tokens sit in `:root`, dark tokens in `.dark`,
   all OKLCH (78 `oklch(` occurrences). Ten primary-family values compose
   `oklch(L var(--accent-c) var(--accent-h))`. `@theme inline` maps shadcn slot names onto them.
2. `flexi-day-rn/src/theme.css` (170 lines) is the hand port described in
   `docs/research/nativewind-tokens.md`. It keeps the OKLCH strings identical so the two `:root`
   blocks "diff by eye", inlines the accent variables, puts dark values under
   `@media (prefers-color-scheme: dark)`, and writes radii as px. `flexi-day-rn/CLAUDE.md` says
   "A token change on the web is a copy-paste here, never a regeneration."
3. `flexi-day-emails/src/theme.ts` (54 lines) holds light-only tokens as hex for email clients.
   Each entry keeps its OKLCH source in a comment.
4. `flexi-day/design/attendance/assets/tokens.css` is a copy for the static mockups. Its header
   says "Re-copy when globals.css changes."

Components are shadcn/ui on the web (24 files in `flexi-day/components/ui`) and hand-built
NativeWind components on the phone. Neither repo uses Storybook.

### Would a Supernova pipeline replace the ports?

Not without losing what the port is built around. From the exporter source at `1092e62`:

- **OKLCH survives only as output.** Color tokens hold `r`, `g`, `b` channels. `ColorHelper`
  rounds them to integers (`utils/helpers/ColorHelper.ts:214-224`) and recomputes OKLCH from
  8-bit sRGB (`:97-100`, `:275-296`), printing lightness as a percentage. Input takes HEX, RGB or
  HSB only (types-of-tokens page). Going through the 8-bit hex step, light `--primary`
  `oklch(0.55 0.165 285)` becomes `#6b5ecc`, then roughly `oklch(55.07% 0.164 285.02)`. Light
  `--bg` `oklch(0.985 0.008 78)` comes back with hue 84.6. Dark `--primary-strong`
  `oklch(0.74 0.165 285)` sits outside sRGB, clips to `#a299ff`, and returns as roughly
  `oklch(73.27% 0.145 286.26)`. These are my calculations with the standard OKLab matrices, not the
  exporter's own output. Every value drifts by a rounding step, so the diff-by-eye rule stops
  working, and the three tokens `nativewind-tokens.md` found outside sRGB move further.
- **The accent knob goes away.** References in Supernova point at whole tokens. Nothing can
  reference a channel inside `oklch()`, so `--accent-c` and `--accent-h` turn into ten literal
  colors. They are build-time constants today (nothing outside `globals.css` reads them), so the
  loss is small, but it is a loss.
- **Web: close, with some cleanup.** The Tailwind 4 exporter defaults to `cssSelector: @theme`
  (`config.json:514`) and switches to `@theme inline` when tokens use references
  (`src/files/tailwind-file.ts:391-392`). `themeSelector` defaults to `.theme-{theme}`
  (`config.json:522`), so naming the theme `dark` with selector `.{theme}` gives `.dark`. Output
  would still need the shadcn slot mapping, the `--shadow-*` strings and the `color-mix` nav
  background kept by hand, because shadow tokens are structured values and `color-mix` is not a
  token type.
- **Native: no.** The theme selector is one string dropped in front of a single block
  (`tailwind-file.ts:306-309`). Neither the Tailwind 4 nor the CSS exporter has a media-query
  option (`grep -i "media\|prefers-color"` in both finds nothing). NativeWind v5 rejects `.dark`
  ("selectors like `:root.dark` now produce an error on native", per `nativewind-tokens.md`).
  Producing `@media (prefers-color-scheme: dark) { :root { } }` takes a post-processing step in the
  repo or a custom exporter, and custom exporters need Pro.
- **Emails: possible, with a different shape.** The CSS in JS exporter writes TypeScript objects
  with hex output (`exporters/css-in-js/README.md`), which could replace `theme.ts`, but the names
  and the light-only subset would need a mapping layer.
- **Plan limits.** Web, native and emails make three pipelines. Starter allows one. Pro allows
  five for $399 a month.

### Source of truth

Figma is optional, and tokens can be authored in Supernova or pushed from Tokens Studio JSON with
`supernova sync-tokens` in CI. Either way the source moves out of `globals.css`. Manual entry puts
it in a hosted UI that agents reach over MCP, with writes costing credits. The CLI route means
rewriting the tokens as Tokens Studio JSON and adding a sync job and an API key to CI, and Supernova
still stores the result as sRGB channels. Neither route gives code-first import of a CSS file.

### Other uses, and why they fit poorly

- **Docs site.** Twenty public pages on Starter. Flexi Day has one product, one developer, and
  agent instructions in `CLAUDE.md` files and `GLOSSARY.md`. A public design system site serves
  nobody here.
- **MCP for agents.** Claude Code already reads `globals.css`, `theme.css` and the components
  straight from the checkout. A Supernova MCP server would serve a copy of the same data from a
  remote service, with OAuth in every session and, in cloud sessions, a network dependency.
- **Supernova Agent and Ask AI.** These sit inside Supernova's app and work on Supernova's data, so
  they duplicate what Claude Code does in the repo, metered at 20 Agent messages a month on
  Starter.
- **Adoption tracking** is Enterprise-only and meant for organisations with many consuming teams.

### Cost against benefit for one person

Cost: an account, a second source of truth, an API key or GitHub App with write access to three
repos, a sync step, plus post-processing for the native media query and the accent inlining, and
$399 a month as soon as more than one pipeline is needed. Benefit: avoiding a copy-paste into
`theme.css` and `theme.ts` when a token changes. Tokens change rarely (one palette, light and dark).
The trade only pays for a team with designers in Figma and several consuming codebases.

### Alternatives worth naming

- **A generator script in the repo.** Parse the `:root` and `.dark` blocks of `globals.css`, inline
  the accent variables, and write `theme.css` (media query, px radii) plus `theme.ts` (hex through a
  color library) and the mockup copy. This keeps OKLCH strings exact, runs in CI as a drift check,
  and costs nothing. `nativewind-tokens.md` already sketched the hex half of this with `culori`.
- **Style Dictionary** (`style-dictionary` 5.7.1 on npm, https://styledictionary.com) is the
  open-source, code-first build tool for this job, with custom formats per platform. The W3C DTCG
  color module, final since 2025-10-28, allows `colorSpace: "oklch"`
  (https://www.designtokens.org/tr/2025.10/color/), so OKLCH tokens could stay in OKLCH. Whether
  Style Dictionary's built-in transforms keep OKLCH exact was not checked.
- **Tokens Studio** matters only if a Figma file ever becomes the design source. Supernova reads its
  JSON, but Tokens Studio's own sync can feed Style Dictionary without Supernova.

## Risks and open questions

- **Product churn.** In 14 months Supernova shipped new plans (2025-09), sunset its prototyping
  product (2026-08), shipped Editor MCP and the Agent, and retired per-seat pricing (2026-10)
  (https://learn.supernova.io/changelog). The free plan's contents changed twice in that time.
- **Stale docs.** The CLI token sync page dates from 2024-05-30. Most of the exporter repos were
  last pushed in February 2025. The MCP endpoint is given in two forms across docs pages
  (`/mcp/ds/{ID}` in older material and `/mcp` now).
- **Credits are metered.** AI features cost credits, unused credits expire monthly, and the price
  of extra credits is not published.
- **Write access.** A pull-request pipeline needs a GitHub App with read and write on code and pull
  requests in each repo it touches
  (https://learn.supernova.io/latest/code-automation/pipelines/open-a-pull-request/git-hub-fSiY48mk).
  That is another credential on repos that are public and protected today.
- **Open:** whether the in-app color picker keeps sub-integer channel precision before export
  rounds it (the exporter rounds regardless); whether Starter's one pipeline can deliver a PR; what
  the annual Pro price is.

## Sources

All read 2026-11-02.

- Product and pricing: https://www.supernova.io/, https://www.supernova.io/pricing
- Changelog: https://learn.supernova.io/changelog, including
  https://learn.supernova.io/latest/releases/october-2026/goodbye-per-seat-pricing-zidi9E0L,
  https://learn.supernova.io/latest/releases/october-2026/workspace-credits-updates-PYmDrvnT,
  https://learn.supernova.io/latest/releases/august-2026/supernova-create-sunset-atGW4z1K,
  https://learn.supernova.io/latest/releases/april-2025/tailwind-css-v4-exporter-YrQbmYAh,
  https://learn.supernova.io/latest/releases/september-2025/new-plans-free-pro-and-enterprise-mVg38QOn
- Blog: https://www.supernova.io/blog/introducing-supernova-agent,
  https://www.supernova.io/blog/introducing-supernova-editor-mcp
- Product docs:
  https://learn.supernova.io/latest/design-systems/design-tokens/types-of-tokens-yqeR2c29,
  https://learn.supernova.io/latest/design-systems/design-tokens/working-with-tokens/create-and-delete-tokens-GSe22unO,
  https://learn.supernova.io/latest/design-systems/design-tokens/theme-tokens-UEbQ3z4s,
  https://learn.supernova.io/latest/design-systems/import-design-system-data/overview-O6vEmYdi,
  https://learn.supernova.io/latest/design-systems/import-design-system-data/importing-via-tokens-studio/setting-up-tokens-studio-inyFJuPh,
  https://learn.supernova.io/latest/automation/get-started/using-pipelines/create-a-pipeline-8Fu6QOeL,
  https://learn.supernova.io/latest/code-automation/pipelines/open-a-pull-request/git-hub-fSiY48mk,
  https://learn.supernova.io/latest/settings/workspace/billing/ai-credits-QppYjvRr,
  https://learn.supernova.io/latest/design-systems/features/mcp-for-design-system-LIHAMhjr-LIHAMhjr
- Developer docs:
  https://developers.supernova.io/latest/supernova-with-ci-cd/cli-commands/sync-tokens-studio-data/tokens-studio-101-bmB0dwM8
- Source code: https://github.com/Supernova-Studio/exporters at `1092e62`:
  `exporters/tailwind-4/README.md`, `exporters/tailwind-4/config.json`,
  `exporters/tailwind-4/src/files/tailwind-file.ts`, `exporters/css/config.json`,
  `exporters/css-in-js/README.md`, `utils/helpers/ColorHelper.ts`, `exporters/*/exporter.json`;
  repo list from `gh api orgs/Supernova-Studio/repos`
- npm registry (`pnpm view`): `@supernovaio/cli` 2.3.4, `@supernovaio/sdk` 2.5.1,
  `@supernovaio/sdk-exporters` 2.5.1, `style-dictionary` 5.7.1
- W3C DTCG color module 2025.10: https://www.designtokens.org/tr/2025.10/color/
- Workspace files: `flexi-day/app/globals.css`, `flexi-day-rn/src/theme.css`,
  `flexi-day-rn/CLAUDE.md`, `flexi-day-emails/src/theme.ts`,
  `flexi-day/design/attendance/assets/tokens.css`, `docs/research/nativewind-tokens.md`
