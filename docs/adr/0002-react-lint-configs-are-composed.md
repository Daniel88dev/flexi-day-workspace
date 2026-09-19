# React lint configs are composed, not inherited from vendor bundles

The frontend's flat config came entirely from `eslint-config-next`, which pins
`eslint-plugin-react ^7.37.0`. That plugin calls `context.getFilename()`, removed in ESLint 10, so
lint dies on the first rule it loads (Daniel88dev/flexi-day#91). It has not published since
2025-04-03, its `master` has not moved since 2026-05-17, and its ESLint 10 fix sits in three
unmerged pull requests; `eslint-config-next@canary` carries a dependency set byte-identical to
latest, and the Next maintainers say they are blocked on the same upstream PR. We chose to stop
consuming `eslint-config-next` and compose the flat config from the individual plugins —
`@next/eslint-plugin-next`, `typescript-eslint`, `eslint-plugin-react-hooks`,
`eslint-plugin-jsx-a11y` — with `@eslint-react/eslint-plugin` in place of `eslint-plugin-react`,
and `eslint-plugin-import` dropped for earning a single rule
(Daniel88dev/flexi-day#145, Daniel88dev/flexi-day#147). Hook rules stay with
`eslint-plugin-react-hooks`: `@eslint-react` ships a `disable-conflict-eslint-plugin-react-hooks`
preset that would hand `rules-of-hooks` and `exhaustive-deps` to a third party, and we invert it
instead, switching off `@eslint-react`'s overlapping rules, because the React team's plugin is the
reference implementation of what a hook violation is, moves with the compiler, and already
declares `eslint ^10`. `flexi-day-rn` follows this shape where `eslint-config-expo` allows it
(Daniel88dev/flexi-day-rn#14).

The alternatives were waiting, pinning and filtering the preset. Waiting is gated on a chain —
the jsx-eslint fix, then an `eslint-config-next` release carrying it — that has not moved in
months, and standing still costs a Dependabot pull request that reopens on every ESLint 10.x
release and is closed by hand. Pinning `eslint-plugin-react` through npm `overrides` has nothing
to pin to: `7.8.0-rc.0`, named as the fix both in Daniel88dev/flexi-day#91 and in the frontend's
own `docs/eslint-10.md`, is a stale prerelease from the early-7.x era whose own peer range is
`^3 || ^4`, and no release of that plugin, stable or pre, supports ESLint 10. Filtering the vendor
preset — mapping over the config array to strip the react plugin and its rules — keeps the bundle
but depends on the internal shape of someone else's config array and breaks silently on their next
refactor. Type-aware linting was measured rather than argued and rejected on the numbers:
`recommended-type-checked` adds exactly one rule over `recommended`, that rule fires zero times on
this codebase, and it costs roughly 1.8 times the lint wall-clock.

The trade is ownership. Vercel curated the rule set and now we do, so when Next changes its
recommendations we find out by reading a changelog rather than by running `npm update`, and the
config is ours to maintain. Two plugins outlive the change with peer ranges capped at ESLint 9:
`eslint-plugin-jsx-a11y` is kept, because its six accessibility rules have no replacement anywhere
and `@eslint-react` ships no a11y coverage at all, and resolved with a narrow npm `overrides`
entry that tells npm something untrue about a range; `eslint-plugin-import` was dropped rather
than overridden, because one rule does not justify carrying an unmaintained dependency.
`--legacy-peer-deps` was rejected outright — it disables peer checking for the entire tree to
paper over one plugin. The hook inversion has no upstream preset, so the list of suppressed
`@eslint-react` rules is hand-maintained and a newly added overlapping rule arrives looking like
ordinary warning drift, which is why `@eslint-react` gets its own Dependabot group instead of
riding the weekly minor-and-patch bundle. `flexi-day-be` needed none of this and reached ESLint 10
without incident, because it has no React plugins — which is the whole diagnosis.

## What would reverse this

`eslint-config-next` shipping a rule set materially better curated than ours, enough to make
re-inheriting it worth the stale transitive pins again. The bundle merely gaining an
ESLint-10-compatible `eslint-plugin-react` range is not itself a reason: the position here is that
composing directly is preferable regardless of whether the blocker is present. Or
`@eslint-react` becoming unmaintained in its turn, which would return us to the same fork with one
fewer option on the table.
