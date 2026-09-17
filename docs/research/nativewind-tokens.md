# NativeWind and porting the web design tokens

Research for [issue #15](https://github.com/Daniel88dev/flexi-day-workspace/issues/15), part of the
mobile app map (#12). Verified on 2026-09-15 against the npm registry, the NativeWind and
react-native-css repositories, and the Expo and React Native docs. Versions named below are the ones
current on that date.

## Short answer

NativeWind is viable, but only its v5 release candidate speaks the web's language. NativeWind
4.2.7 (the `latest` tag) is a Tailwind v3 engine that drops every `oklch()` value with a warning.
NativeWind 5.0.0-rc.0, published 2026-09-13 for Expo 57, runs Tailwind v4 CSS config and converts
OKLCH to hex at build time through colorjs.io. Go with the RC, pinned exactly.

`flexi-day/app/globals.css` cannot be imported as is. Three things in it break on native: the
`.dark` class selector, the `var(--accent-c)` and `var(--accent-h)` references inside `oklch()`,
and the web-only imports (`shadcn/tailwind.css`, `tw-animate-css`, the `.legal-prose` and `.cs-*`
blocks).
The port is a hand-maintained `theme.css` in the new repo that copies the OKLCH values verbatim,
inlines the two accent variables, and swaps `.dark { }` for `@media (prefers-color-scheme: dark)
{ :root { } }`. No conversion script is needed for the v5 route. The engine does the conversion.

## What was verified, with dates

| Package                    | Version on 2026-09-15                                                   | Source                                                       |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `expo`                     | 57.0.23 (`latest`, `sdk-57`); SDK 57 released 2026-06-30                | `npm view expo dist-tags`; https://expo.dev/changelog/sdk-57 |
| `react-native` (SDK 57)    | 0.86.3 bundled; 0.87.1 is npm `latest`                                  | `bundledNativeModules.json` on the `sdk-57` branch           |
| `nativewind`               | 4.2.7 (`latest`, 2026-09-14); 5.0.0-rc.0 (`rc`, 2026-09-13)             | `npm view nativewind dist-tags`; releases page               |
| `react-native-css-interop` | 0.2.7 (v4 engine)                                                       | `npm view react-native-css-interop`                          |
| `react-native-css`         | 3.0.7 (`latest`); 3.1.0-rc.0 (`rc`, the v5 engine)                      | `npm view react-native-css dist-tags`                        |
| `tailwindcss`              | 4.3.3 on the web (`package-lock.json`); 4.1.12 pinned by the RC         | `flexi-day/package-lock.json`; RC release notes              |
| `expo-font`                | ~57.0.4 in SDK 57                                                       | `bundledNativeModules.json`                                  |
| `react-native-svg`         | 15.15.4 in SDK 57 (15.15.5 on npm)                                      | `bundledNativeModules.json`                                  |
| `@expo-google-fonts/*`     | hanken-grotesk 0.4.3, bricolage-grotesque 0.4.1, instrument-serif 0.4.1 | `npm view`                                                   |

Web frontend inputs read from `flexi-day/`:

- `app/globals.css:7-51` `@theme inline` mapping shadcn slot names onto CSS variables, and the
  seven-step radius scale as `calc(var(--radius) * n)`.
- `app/globals.css:55-135` light tokens, `:138-210` dark tokens under `.dark`. Nine leave-type hues
  at `:60-68` and `:163-171`. `--radius: 1rem` at `:121`.
- `app/globals.css:81-83, 102, 113, 125, 149-151, 179, 190, 200` build the primary colors from
  `var(--accent-c)` and `var(--accent-h)` (`0.165` and `285`, set at `:56-57`).
- `app/layout.tsx:9-27` loads Hanken Grotesk 400/500/600/700 normal and italic, Bricolage Grotesque
  400 to 800, Instrument Serif 400 normal and italic, via `next/font/google`.
- `components/theme-provider.tsx` wraps `next-themes` with `attribute="class"` and
  `defaultTheme="system"` (`app/layout.tsx:47-52`), which is why the web uses a `.dark` class.
- `components/brand/logo.tsx:29-53` draws the mark with nested spans and two `box-shadow` rings.

## NativeWind's current major, Expo SDK and New Architecture support

NativeWind has two live lines.

**4.2.7 is `latest`.** The install docs say "Nativewind 4.2.7 is the stable release and uses
Tailwind CSS v3" and prescribe `tailwindcss@^3.4.17`, a JS `tailwind.config.js` with
`presets: [require("nativewind/preset")]`, a Babel preset and `withNativeWind(config, { input:
"./global.css" })` in Metro (https://www.nativewind.dev/docs/getting-started/installation). Its
peer dependency is `tailwindcss: >3.3.0`, but the engine it depends on,
`react-native-css-interop@0.2.7`, peers on `tailwindcss: ~3` (`npm view`). The 0.2.7 release note
says it "supports Expo SDK 57 while maintaining Nativewind v4 with Tailwind 3"
(https://github.com/nativewind/nativewind/releases/tag/react-native-css-interop%400.2.7).

**5.0.0-rc.0 is the Tailwind v4 line.** The release note titled "Nativewind v5 Expo 57 release
candidate" says it "pairs with react-native-css 3.1.0-rc.0 for Expo 57", targets "Expo 57.0.22,
React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, and Worklets 0.10.1", and installs
`tailwindcss@4.1.12 @tailwindcss/postcss@4.1.12 lightningcss@1.30.1`
(https://github.com/nativewind/nativewind/releases/tag/5.0.0-rc.0). The npm peer is
`tailwindcss: >4.1.11` and `react-native-css: 3.1.0-rc.0` exactly. The engine's peers are
`react-native >=0.81`, `@expo/metro-config >=54`, `react >=19`, `lightningcss >=1.27.0`. The docs
site announces "Pre-release v5 of Nativewind is now available!" and carries a separate tree at
https://www.nativewind.dev/v5. Stable promotion "follows RC user feedback"; the `latest` tag will
not move during the RC.

**New Architecture is not optional any more, so it is not a NativeWind question.** React Native
0.82 (2025-10-08) made the New Architecture "the only architecture for this and future versions"
(https://reactnative.dev/blog/2025/10/08/react-native-0.82). Expo's guide: "SDK 55 and later run
entirely on the New Architecture. The New Architecture is always enabled and cannot be disabled"
(https://docs.expo.dev/guides/new-architecture/). Both NativeWind lines ship releases tested on
Expo 57, which is Fabric only. The older New Architecture bugs in the tracker (#1328, #1441) are
closed. The one open limitation the RC documents is Android only: cancelling a CSS animation can
leave the last transform in place, tracked upstream as Reanimated #10507
(https://github.com/nativewind/nativewind/blob/main/docs/known-issues.md).

## Can `globals.css` be consumed directly?

No. Each blocker, with what the v5 engine does about it.

**OKLCH itself is fine on v5, fatal on v4.** React Native's own color parser accepts hex, `rgb`,
`hsl`, `hwb`, named colors and color ints, and nothing else
(https://reactnative.dev/docs/colors). The v4 engine matches that list: its `parseColor` lumps
`oklch`, `oklab`, `lab`, `lch`, `display-p3` and friends into one branch that logs
`Invalid color unit` and returns `undefined`
(`packages/react-native-css-interop/src/css-to-rn/parseDeclaration.ts:2021-2037` at tag
`nativewind@4.2.7`). The v5 engine depends on `colorjs.io@0.7.0` and builds a `Color` in the
`oklch` space, then serialises with `format: "hex"` unless `hexColors: false` or `colorPrecision`
is set (`react-native-css/src/compiler/declarations.ts:1691, 1765-1775, 1837-1841`). The compiler
test "reads global CSS variables" turns `--color-red-500: oklch(63.7% 0.237 25.331)` inside
`@layer theme { :root, :host { } }` into `#fb2c36` (`src/__tests__/compiler/compiler.test.tsx:29-44`),
which is exactly the shape Tailwind v4 emits for `@theme`. Alpha survives: the `color-mix` test
resolves `oklch(0.577 0.245 27.325)` mixed 50% with transparent to `rgba(231, 0, 11, 0.5)`
(`src/__tests__/native/color-mix.test.tsx:28-48`).

**`var()` inside `oklch()` is not fine.** `--primary: oklch(0.55 var(--accent-c) var(--accent-h))`
cannot be resolved by lightningcss, so it reaches the engine as an unparsed token stream. The
runtime function whitelist in `parseUnparsed` has `rgb`, `rgba`, `hsl`, `hsla` and no `oklch`
(`declarations.ts:1223-1272`); anything else falls to the default branch, which records a warning
and returns nothing (`declarations.ts:1300-1303`). Ten declarations in `globals.css` use this form.
The port inlines the two numbers: `oklch(0.55 0.165 285)`.

**The `.dark` class does not exist on native.** The web toggles dark mode by putting `class="dark"`
on `<html>` through `next-themes`. The RC rejects that shape outright: "selectors like `:root.dark`
now produce an error on native. Use `prefers-color-scheme` media queries and Appearance there"
(release notes; also `react-native-css/docs/v5-engine-contracts.md:5`). The port moves the dark
block into `@media (prefers-color-scheme: dark) { :root { ... } }`. The compiler keeps a variable
that is set more than once as a runtime variable with per-condition values
(`compiler.test.tsx:46-78`, README "Inline CSS Custom Properties"), and a media-query test shows
`prefers-color-scheme: dark` rules flipping when the scheme changes
(`src/__tests__/native/media-query.test.tsx:42-63`).

**`1rem` is 14 on native unless told otherwise.** "All `rem` units are converted to `dp` units at
build time. On native, the default dp is 14" (react-native-css README, "Inline REM units";
`inlineRem = 14` also in the v4 engine at `parseDeclaration.ts:1840`). The web is a 16px base, so
`--radius: 1rem` would come out as 14 and `p-4` as 14 instead of 16. A `:root { font-size: 16px }`
rule overrides the base, and a `1rem` value reached through `var()` picks that up too
(`src/__tests__/native/units.test.tsx:129-166`). The `calc(var(--radius) * 0.6)` chain does
evaluate at runtime (`src/__tests__/native/calc.test.tsx:85-104` covers `calc(var(--my-var) +
20px)`), but writing the seven radii as plain px is less to go wrong: 9.6, 12.8, 16, 22.4, 28.8,
35.2, 41.6.

**Web-only content.** `@import "shadcn/tailwind.css"` and `@import "tw-animate-css"` have no
native meaning. `@custom-variant dark (&:is(.dark *))` must go (Tailwind v4's default `dark`
variant already is the `prefers-color-scheme` media query, https://tailwindcss.com/docs/dark-mode,
and NativeWind v5 compiles it to the same, `v5-engine-contracts.md:3`). The `--shadow-*` tokens
are CSS shadow strings the web uses in `box-shadow`; on native the RC exposes `elevation-*` and
`shadow-*` utilities instead (`nativewind/theme.css` on `main`). `--nav-bg` uses `color-mix(in
oklch, var(--bg) 82%, transparent)`, which the engine handles dynamically (`color-mix.test.tsx`,
"dynamic color-mix uses weights"), but the sticky nav it feeds is web-only. The `@layer base`
rules with `*`, `html`, `body`, `h1..h6` selectors, `.legal-prose` and `.cs-*` do not apply.

**`@theme inline` is a Tailwind-side directive, so the engine never sees it.** Tailwind resolves
`inline` before PostCSS output: "the utility class will use the theme variable value instead of
referencing the actual theme variable" (https://tailwindcss.com/docs/theme). With `@theme inline {
--color-background: var(--background) }` the utility `bg-background` compiles to
`background-color: var(--background)`, a plain runtime variable reference, which is the same shape
as the v5 themes guide's `text-[--color-primary]` example (https://www.nativewind.dev/v5/guides/themes).
The guide's documented pattern is a plain `@theme` block plus the same values on `:root`, "so the
CSS variables have default values at runtime". Either shape works; the `inline` one keeps the
native file a line-for-line sibling of the web file. The scaffold ticket should render one screen
with each before settling, since the engine's test suite exercises `@layer theme { :root }` output
and not the `inline` variant specifically.

### The token file the port produces

`flexi-day-rn/theme.css`, imported from `global.css` after `@import "nativewind/theme"`:

```css
@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--text);
  --color-card: var(--surface);
  --color-muted: var(--surface-2);
  --color-muted-foreground: var(--text-muted);
  --color-border: var(--border-soft);
  --color-input: var(--border-strong);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-fg);
  --color-accent: var(--primary-soft);
  --color-destructive: var(--destructive);
  --color-ring: var(--ring);
  --color-leave-vacation: var(--c-vacation);
  /* ...the other eight leave types, warm, ok, danger and their -soft variants */
  --font-sans: "HankenGrotesk-Regular";
  --font-display: "BricolageGrotesque-SemiBold";
  --font-serif-italic: "InstrumentSerif-Italic";
  --radius-sm: 9.6px;
  --radius-md: 12.8px;
  --radius-lg: 16px;
  --radius-xl: 22.4px;
  --radius-2xl: 28.8px;
  --radius-3xl: 35.2px;
  --radius-4xl: 41.6px;
}

:root {
  font-size: 16px;
  --c-vacation: oklch(0.6 0.16 285);
  /* every light value from globals.css:60-113, accent vars inlined */
  --primary: oklch(0.55 0.165 285);
  --primary-fg: oklch(0.99 0.01 285);
  --primary-soft: oklch(0.55 0.165 285 / 0.1);
  --ring: oklch(0.55 0.165 285 / 0.5);
}

@media (prefers-color-scheme: dark) {
  :root {
    --c-vacation: oklch(0.7 0.15 285);
    /* every dark value from globals.css:139-190 */
    --primary: oklch(0.68 0.165 285);
    --primary-fg: oklch(0.16 0.02 285);
    --primary-soft: oklch(0.68 0.165 285 / 0.16);
    --ring: oklch(0.68 0.165 285 / 0.55);
  }
}
```

Maintenance rule: a token change on the web is a copy-paste into this file. Reviewers can diff the
two `:root` blocks by eye because the values are the same strings. That is the whole reason to stay
on OKLCH rather than generating hex.

### If the RC fails and v4 is the fallback

Then the tokens must be hex and live in `tailwind.config.js`, because the v4 engine drops OKLCH.
The conversion is a 60-line script with `culori@4.0.2` (`npm view`, released 2026-04-03):
`parse()` the OKLCH string, `toGamut("rgb", "oklch")` to clip, `formatHex` or `formatHex8` when
alpha is below 1. I ran it against every color token in `globals.css`. All are inside sRGB except
three that the gamut clip nudges by one step: light `--surface` (`#fffefb`), light `--primary-fg`
(`#fbfbff`) and dark `--primary-strong` (`#a299ff`). The full table:

| Token              | Light OKLCH                   | Light hex   | Dark OKLCH                     | Dark hex    |
| ------------------ | ----------------------------- | ----------- | ------------------------------ | ----------- |
| `--c-vacation`     | `oklch(0.6 0.16 285)`         | `#796eda`   | `oklch(0.7 0.15 285)`          | `#968ff7`   |
| `--c-home`         | `oklch(0.6 0.12 158)`         | `#309564`   | `oklch(0.72 0.13 158)`         | `#51bd85`   |
| `--c-sick`         | `oklch(0.62 0.16 18)`         | `#d55661`   | `oklch(0.7 0.15 20)`           | `#ed7477`   |
| `--c-bank`         | `oklch(0.7 0.13 70)`          | `#d18e35`   | `oklch(0.78 0.13 72)`          | `#eaa950`   |
| `--c-pto`          | `oklch(0.6 0.11 232)`         | `#268bb6`   | `oklch(0.7 0.11 232)`          | `#4caad7`   |
| `--c-nonpaid`      | `oklch(0.6 0.1 200)`          | `#0d9298`   | `oklch(0.72 0.1 200)`          | `#48b7bd`   |
| `--c-study`        | `oklch(0.66 0.14 110)`        | `#989912`   | `oklch(0.75 0.14 110)`         | `#b4b53d`   |
| `--c-other`        | `oklch(0.55 0.03 270)`        | `#6b7184`   | `oklch(0.72 0.04 270)`         | `#9ba4be`   |
| `--c-sickday`      | `oklch(0.62 0.14 350)`        | `#c35f92`   | `oklch(0.72 0.14 350)`         | `#e57db1`   |
| `--bg`             | `oklch(0.985 0.008 78)`       | `#fdfaf4`   | `oklch(0.165 0.013 288)`       | `#0e0d14`   |
| `--bg-tint`        | `oklch(0.965 0.012 78)`       | `#f8f3eb`   | `oklch(0.195 0.014 288)`       | `#14141b`   |
| `--surface`        | `oklch(0.998 0.004 80)`       | `#fffefb`   | `oklch(0.205 0.015 288)`       | `#17161e`   |
| `--surface-2`      | `oklch(0.972 0.009 78)`       | `#f9f5ef`   | `oklch(0.245 0.016 288)`       | `#201f28`   |
| `--border-soft`    | `oklch(0.915 0.01 80)`        | `#e6e2dc`   | `oklch(0.295 0.016 288)`       | `#2c2b34`   |
| `--border-strong`  | `oklch(0.86 0.012 80)`        | `#d5d0c8`   | `oklch(0.36 0.018 288)`        | `#3c3c46`   |
| `--text`           | `oklch(0.26 0.018 290)`       | `#24232c`   | `oklch(0.96 0.006 288)`        | `#f1f1f6`   |
| `--text-muted`     | `oklch(0.52 0.014 288)`       | `#686871`   | `oklch(0.72 0.012 288)`        | `#a4a4ac`   |
| `--text-faint`     | `oklch(0.66 0.012 288)`       | `#919199`   | `oklch(0.58 0.012 288)`        | `#7a7981`   |
| `--primary`        | `oklch(0.55 0.165 285)`       | `#6b5ecc`   | `oklch(0.68 0.165 285)`        | `#9086f9`   |
| `--primary-strong` | `oklch(0.48 0.165 285)`       | `#5848b5`   | `oklch(0.74 0.165 285)`        | `#a299ff`   |
| `--primary-fg`     | `oklch(0.99 0.01 285)`        | `#fbfbff`   | `oklch(0.16 0.02 285)`         | `#0c0c16`   |
| `--primary-soft`   | `oklch(0.55 0.165 285 / 0.1)` | `#6b5ecc1a` | `oklch(0.68 0.165 285 / 0.16)` | `#9086f929` |
| `--warm`           | `oklch(0.66 0.14 42)`         | `#d87248`   | `oklch(0.74 0.13 44)`          | `#ee8e64`   |
| `--warm-soft`      | `oklch(0.66 0.14 42 / 0.12)`  | `#d872481f` | `oklch(0.74 0.13 44 / 0.16)`   | `#ee8e6429` |
| `--danger`         | `oklch(0.58 0.18 25)`         | `#cf4040`   | `oklch(0.7 0.16 25)`           | `#f2716a`   |
| `--danger-soft`    | `oklch(0.58 0.18 25 / 0.12)`  | `#cf40401f` | `oklch(0.7 0.16 25 / 0.16)`    | `#f2716a29` |
| `--ok`             | `oklch(0.58 0.13 155)`        | `#249057`   | `oklch(0.72 0.13 155)`         | `#57bc80`   |
| `--ok-soft`        | `oklch(0.58 0.13 155 / 0.14)` | `#24905724` | `oklch(0.72 0.13 155 / 0.16)`  | `#57bc8029` |
| `--destructive`    | `oklch(0.6 0.18 22)`          | `#d6464d`   | `oklch(0.7 0.18 22)`           | `#fa686a`   |
| `--ring`           | `oklch(0.55 0.165 285 / 0.5)` | `#6b5ecc80` | `oklch(0.68 0.165 285 / 0.55)` | `#9086f98c` |

On v4 the dark values go through `darkMode: "media"`, which is the preset's default
(`packages/nativewind/src/tailwind/dark-mode.ts:7-13` at the tag), with CSS variables defined
through a `:root` / `@media (prefers-color-scheme: dark)` pair in `global.css` and colors declared
as `"var(--primary)"` strings in the config, per the v4 themes guide
(https://www.nativewind.dev/docs/guides/themes). The StyleSheet-plus-generated-tokens fallback from
the map is never needed: both NativeWind lines run on Expo 57.

## Fonts

**Packages exist for all three faces.** `@expo-google-fonts/hanken-grotesk` 0.4.3 ships nine
weights in normal and italic, `@expo-google-fonts/bricolage-grotesque` 0.4.1 ships 200 to 800
without italics, `@expo-google-fonts/instrument-serif` 0.4.1 ships 400 normal and italic (`npm
pack --dry-run`). They are static TTFs, one file per weight, which is what Expo recommends:
"Variable fonts... do not have support across all platforms. For full platform support, use static
fonts" (https://docs.expo.dev/develop/user-interface/fonts/). Each package exports a `useFonts`
hook and one constant per file, named `HankenGrotesk_600SemiBold`,
`BricolageGrotesque_700Bold`, `InstrumentSerif_400Regular_Italic` and so on (`index.js` in each
tarball).

**Two ways to load, and the name you write depends on which.** With `useFonts`, "the map keys
become the `fontFamily` style prop values" (https://docs.expo.dev/versions/v57.0.0/sdk/font/), so
the constant names above are the family names. With the `expo-font` config plugin, fonts are
embedded at build time, which the NativeWind v5 fonts guide prefers because "fonts are available
immediately without a loading state" (https://www.nativewind.dev/v5/guides/custom-fonts); then
"on iOS, the font family name is always taken directly from the font file" (Expo font docs). I
read the name tables of the shipped TTFs. The PostScript names are `HankenGrotesk-Regular`,
`-Medium`, `-SemiBold`, `-Bold`, `-Italic`, `-MediumItalic`, `-SemiBoldItalic`, `-BoldItalic`;
`BricolageGrotesque-Regular`, `-Medium`, `-SemiBold`, `-Bold`, `-ExtraBold`;
`InstrumentSerif-Regular`, `InstrumentSerif-Italic`. The family names are "Hanken Grotesk",
"Bricolage Grotesque", "Instrument Serif". The config plugin is the right choice for this app: the
dev client is a custom build anyway, and the welcome screen should not wait on a font promise.

**Mapping to NativeWind.** One `--font-*` entry per face in `@theme`, each a single quoted name:
"React Native does not support fallback fonts. The value must be a single font name, not a
comma-separated list" (v5 custom fonts guide). The guide is blunt about weights: `font-bold` "sets
the `fontWeight` property, not the font family", so the documented path is a family per weight,
`font-sans` plus `font-sans-semibold` and so on. React Native's iOS code is friendlier than that
doc lets on. `RCTFont.mm` takes a font name that is not a family, resolves it, reads
`font.familyName`, then picks "the closest font that matches the given weight for the fontFamily"
among the registered faces, matching italic too
(`packages/react-native/React/Views/RCTFont.mm:454-497` on `0.86-stable`). So with all eight
Hanken faces embedded, `font-sans font-semibold italic` should land on `HankenGrotesk-SemiBoldItalic`
on iPhone. Nothing promises that on Android, and NativeWind does not document it, so the scaffold
ticket should test it on the device and fall back to per-weight families if it misbehaves. Font
loading is outside NativeWind either way: "Nativewind will not load/link fonts into your app".

The web's heading rule (`globals.css:239-250`: display face, 600, `-0.02em` tracking, 1.05 line
height) becomes a `Heading` component with `font-display font-semibold tracking-tight leading-none`
rather than a base-layer rule, since native has no `h1`.

## Dark mode following the system

The RC follows the system through the `prefers-color-scheme` media query: "The default `dark:`
variant compiles to `prefers-color-scheme: dark`" (`v5-engine-contracts.md:3`), backed by React
Native's `Appearance`. Manual override is `Appearance.setColorScheme("dark" | "light")`;
`"unspecified"` restores the system preference on Expo 57 (RC notes; React Native documents
`'auto'` as the current name and `'unspecified'` as deprecated,
https://reactnative.dev/docs/appearance). Reading the scheme is `useColorScheme` from
`react-native`. The map says dark mode follows the system, so the app never calls
`setColorScheme` and the token file's media query is the only switch.

One trap. Expo's `userInterfaceStyle` "defaults to `light`" when absent
(https://docs.expo.dev/versions/latest/config/app/). Without `"userInterfaceStyle": "automatic"` in
`app.json`, iOS reports light forever and the dark block never fires. The RC install steps say the
same. `expo-system-ui` is listed in those steps but Expo only requires it "to work on Android".

The v4 line behaves the same on this point: "By default, Nativewind will follow the device's system
appearance" with `darkMode` defaulting to `media`.

## Porting the logo

`logo.tsx` is not an SVG on the web. The mark is a disc at 18% opacity, a centred dot at 52% of
the size, and two rings drawn with `box-shadow: 0 0 0 3px var(--bg), 0 0 0 4.5px var(--primary)`
(`logo.tsx:34-51`). The wordmark is text in the display face, bold, `-0.03em` tracking, with "day"
in primary (`logo.tsx:19-27`).

Two native options, both fine:

- **Nested `View`s, no extra dependency.** Outer `View` with `rounded-full bg-primary/[0.18]`, a
  middle `View` with a 1.5pt primary border and a 3pt background-colored border (or two Views),
  inner dot `View` `rounded-full bg-primary`. All colors come from the token file through
  `className`, so dark mode is free. React Native also supports a spec-compliant `boxShadow` string
  with spread on the New Architecture (https://reactnative.dev/docs/view-style-props), so the
  literal `0 0 0 3px ... , 0 0 0 4.5px ...` could be kept, but two bordered Views are easier to
  reason about than shadow spread on a 26pt element.
- **`react-native-svg` 15.15.4** (bundled with SDK 57; `npx expo install react-native-svg`,
  https://docs.expo.dev/versions/latest/sdk/svg/). Four `Circle`s at radii `size/2` (fill primary,
  `fillOpacity 0.18`), `size*0.26 + 4.5` (primary), `size*0.26 + 3` (background), `size*0.26`
  (primary). The `color` prop on `Svg` "define[s] a kind of color variable that can be used by
  children elements" through `fill="currentColor"`
  (https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md), which is enough for
  the primary; the background ring needs a second explicit color. Fabric is supported since
  react-native-svg 13 (README compatibility table).

The `invert` prop swaps primary and primary-foreground and is a two-line ternary in either
version. `href` becomes an Expo Router `Link` or nothing. The SVG route earns its dependency once
the app needs icons or the empty-state illustrations from the web; for the mark alone the Views
win. The wordmark is a `Text` with `font-display font-bold` and `letterSpacing: size * 0.74 *
-0.03` in points, because React Native's `letterSpacing` is a number, not an em value.

## Recommendation

NativeWind is viable. Use the v5 release candidate, not the stable v4.

- `nativewind@5.0.0-rc.0` with `react-native-css@3.1.0-rc.0`, `tailwindcss@4.1.12`,
  `@tailwindcss/postcss@4.1.12`, `lightningcss@1.30.1`, all `--save-exact`, on Expo SDK 57. The RC
  targets this SDK by name, and it is the only NativeWind that accepts the web's Tailwind v4 CSS
  config and OKLCH values. Starting on v4 would mean a Tailwind v3 JS config and a hex table that
  get thrown away at the v5 migration the RC notes already describe.
- Tokens are ported by hand into `flexi-day-rn/theme.css` in the shape shown above: OKLCH strings
  copied from `globals.css`, `var(--accent-c)`/`var(--accent-h)` inlined, `.dark` replaced by a
  `prefers-color-scheme` media query on `:root`, `:root { font-size: 16px }` to keep the web's rem
  base, radii as px, shadows dropped, no web-only imports. No generator script. The engine converts
  OKLCH to hex at build time.
- Retreat path if the RC misbehaves in the scaffold ticket: `nativewind@4.2.7` and
  `tailwindcss@~3.4`, tokens as hex in `tailwind.config.js` from the table above (or the culori
  script that produced it), `darkMode` left at its `media` default. The StyleSheet fallback from
  the map is retired.

Accepted risk: the RC is two days old and "stable npm tags will not change during this RC
publication". Pin exact versions, keep `package-lock.json` committed, and treat the first upgrade as
its own ticket.

## Facts later tickets depend on

- Expo SDK 57 (`expo@57.0.23` on 2026-09-15) with React Native 0.86.3, React 19.2.3,
  `expo-router ~57.0.21`, `expo-dev-client ~57.0.19`, `expo-font ~57.0.4`, `expo-sqlite ~57.0.3`,
  `react-native-svg 15.15.4`, `react-native-reanimated 4.5.1`,
  `react-native-safe-area-context ~5.7.0`. New Architecture only.
- NativeWind pins: `nativewind@5.0.0-rc.0`, `react-native-css@3.1.0-rc.0`, `tailwindcss@4.1.12`,
  `@tailwindcss/postcss@4.1.12`, `postcss`, `lightningcss@1.30.1`. Plus
  `npx expo install react-native-reanimated react-native-worklets react-native-safe-area-context
expo-system-ui`.
- Config files: `postcss.config.mjs` (`{ plugins: { "@tailwindcss/postcss": {} } }`; Expo 57 does
  not discover `postcss.config.cjs`), `metro.config.js` wrapping `getDefaultConfig` in
  `withNativewind` from `nativewind/metro`, `global.css` with the three `tailwindcss/*.css` layer
  imports, `@import "nativewind/theme"` and `@import "./theme.css"`, `nativewind-env.d.ts` with
  `/// <reference types="react-native-css/types" />`, `babel-preset-expo` unchanged (no NativeWind
  Babel preset, no `jsxImportSource`), `app.json` with `"userInterfaceStyle": "automatic"`.
- `theme.css` as specified above; conversion tool: none. For the v4 retreat only, `culori@4.0.2`.
- Fonts: `@expo-google-fonts/hanken-grotesk@0.4.3`, `@expo-google-fonts/bricolage-grotesque@0.4.1`,
  `@expo-google-fonts/instrument-serif@0.4.1`, embedded through the `expo-font` config plugin
  with paths like `node_modules/@expo-google-fonts/hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf`.
  Faces to embed match `layout.tsx`: Hanken 400/500/600/700 plus italics, Bricolage 400 to 800,
  Instrument 400 plus italic. iOS family names after embedding are the PostScript names listed
  under Fonts. `@theme` entries: `--font-sans: "HankenGrotesk-Regular"`, `--font-display:
"BricolageGrotesque-SemiBold"`, `--font-serif-italic: "InstrumentSerif-Italic"`, and per-weight
  entries if the iOS weight matching does not hold on device.
- Dark mode: media query in `theme.css`, `useColorScheme` from `react-native` when JS needs it, no
  `Appearance.setColorScheme` calls.
- Logo: nested Views by default; `react-native-svg` only if a later ticket needs vectors.

## Sources

- NativeWind releases: https://github.com/nativewind/nativewind/releases (5.0.0-rc.0 2026-09-13,
  nativewind@4.2.7 and react-native-css-interop@0.2.7 2026-09-14)
- NativeWind v4 install docs: https://www.nativewind.dev/docs/getting-started/installation
- NativeWind v4 dark mode, themes, fonts: https://www.nativewind.dev/docs/core-concepts/dark-mode,
  https://www.nativewind.dev/docs/guides/themes,
  https://www.nativewind.dev/docs/tailwind/typography/font-family
- NativeWind v5 docs: https://www.nativewind.dev/v5,
  https://www.nativewind.dev/v5/getting-started/installation,
  https://www.nativewind.dev/v5/core-concepts/dark-mode, https://www.nativewind.dev/v5/guides/themes,
  https://www.nativewind.dev/v5/guides/custom-fonts, https://www.nativewind.dev/v5/customization/colors
- NativeWind repo docs on `main`: `docs/expo57-rc.md`, `docs/rc-compatibility.md`,
  `docs/known-issues.md`, `theme.css`, `skills/nativewind-v4-to-v5/SKILL.md`
- NativeWind v4 engine source at tag `nativewind@4.2.7`:
  `packages/react-native-css-interop/src/css-to-rn/parseDeclaration.ts`,
  `packages/nativewind/src/tailwind/dark-mode.ts`, `packages/nativewind/src/tailwind/native.ts`
- react-native-css at commit `a5002c5`: `src/compiler/declarations.ts`,
  `src/compiler/compiler.types.ts`, `README.md`, `docs/v5-engine-contracts.md`,
  `src/__tests__/compiler/compiler.test.tsx`, `src/__tests__/native/color-mix.test.tsx`,
  `src/__tests__/native/media-query.test.tsx`, `src/__tests__/native/units.test.tsx`,
  `src/__tests__/native/calc.test.tsx`
- React Native: https://reactnative.dev/docs/colors, https://reactnative.dev/docs/appearance,
  https://reactnative.dev/docs/view-style-props,
  https://reactnative.dev/blog/2025/10/08/react-native-0.82,
  `packages/react-native/React/Views/RCTFont.mm` on `0.86-stable`
- Expo: https://expo.dev/changelog/sdk-57, https://docs.expo.dev/guides/new-architecture/,
  https://docs.expo.dev/versions/v57.0.0/sdk/font/, https://docs.expo.dev/develop/user-interface/fonts/,
  https://docs.expo.dev/versions/latest/sdk/svg/, https://docs.expo.dev/versions/latest/config/app/,
  `packages/expo/bundledNativeModules.json` on the `sdk-57` branch
- Tailwind: https://tailwindcss.com/docs/theme, https://tailwindcss.com/docs/dark-mode
- react-native-svg: https://github.com/software-mansion/react-native-svg (README and USAGE.md)
- npm registry via `npm view` on 2026-09-15 for every version above; `npm pack --dry-run` for the
  font package contents; TTF name tables read from the packed tarballs
