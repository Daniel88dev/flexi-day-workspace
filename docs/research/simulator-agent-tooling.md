# How can an agent drive the iPhone app on the Simulator without guessing from screenshots?

Written 2026-09-28; every URL below was read on that date. The question: which tool gives a Claude
Code session, or a background subagent working through Bash, the Flexi Day iPhone app's screen as
structured text (ids, labels, frames), lets it tap by `testID` or label, type, and assert, with no
GUI permission prompt and few tokens per step. Sign-in is out of scope: the planned deep link
(`xcrun simctl openurl booted "flexiday://dev-sign-in?ticket=…&to=/requests"`) handles it.

Short version: Maestro 2.10.0 is already on this machine, in `~/.maestro/bin`. `which` misses it
because that directory is not on `PATH`, and `JAVA_HOME` is unset, so it looked absent. Put it on
`PATH`, keep it for repeatable flows and assertions, and add AXe (`brew install
cameroncooke/axe/axe`) for the agent's step-by-step loop. AXe is a native binary that dumps the
accessibility tree as JSON and taps by accessibility identifier, which is what React Native sets
from `testID`. It runs from Bash with an explicit `--udid`, and it declares Xcode 27 support.
Skip the Maestro MCP server for subagents: it adds one shared process and gives nothing the CLI
lacks. The app already carries 394 `testID`s in 74 files. The gaps are the tab bar and the More
sheet, which is where every agent run starts.

| What                                | Version or state, 2026-09-28                                            |
| ----------------------------------- | ----------------------------------------------------------------------- |
| This Mac                            | macOS 27.0, Xcode 27.0 (27A266a), Node 24.21.0, Python 3.13.2           |
| Maestro CLI                         | 2.10.0 (2026-08-31), installed at `~/.maestro/bin`, not on `PATH`       |
| Java                                | `openjdk@21` via Homebrew, not linked; `/usr/bin/java` finds no runtime |
| AXe                                 | 1.8.0 (2026-07-20), MIT, 2.2k stars, not installed                      |
| idb                                 | 1.6.2 (2026-09-23), MIT, 5.3k stars, three releases in Sept 2026        |
| MobileBuildMCP (was XcodeBuildMCP)  | 2.7.1 (2026-09-23), MIT, 6.4k stars; UI tools run on AXe                |
| agent-device (Callstack)            | 0.21.16 on npm (2026-09-28), MIT, 4.8k stars, pre-1.0                   |
| mobile-mcp                          | 1.0.5 on npm (2026-09-23), Apache-2.0, 8.2k stars                       |
| ios-simulator-mcp                   | 2.1.0 (2026-08-13), MIT, 2.2k stars; needs idb                          |
| Appium XCUITest driver / appium-mcp | 12.13.3 (2026-09-28) / 1.95.1 (2026-09-26), Apache-2.0                  |
| `expo-mcp` (local half of Expo MCP) | 0.2.4 `latest` (2026-02-12), 0.3.1 `next` (2026-06-26)                  |
| Detox                               | 20.51.4 on npm (2026-06-16), MIT                                        |
| App                                 | Expo `~57.0.25`, RN 0.86.3, NativeWind 5.0.0-rc.0, scheme `flexiday`    |
| App bundle id                       | `com.flexiday.app` (`flexi-day-rn/app.json`)                            |

Versions and dates come from `gh api repos/<owner>/<repo>/releases` and
`https://registry.npmjs.org/<package>`. Local state comes from `xcodebuild -version`, `sw_vers`,
`brew list`, and `~/.maestro/bin/maestro --version`.

## How React Native reaches the iOS accessibility tree

- `testID` becomes the native `accessibilityIdentifier`. Fabric's `RCTViewComponentView.mm` sets
  `accessibilityView.accessibilityIdentifier = identifier` from `newViewProps.testId`
  ([source](https://github.com/facebook/react-native/blob/main/packages/react-native/React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm),
  lines 573-583). idb and AXe call this attribute `AXUniqueId`; Maestro calls it `id`.
- `testID` also turns off layout-only view flattening for that view, so the view survives into
  the native tree ([View props](https://reactnative.dev/docs/view#testid)).
- The docs say "By default, all touchable elements are accessible", and a touchable with no
  `accessibilityLabel` takes its label from its `Text` children, "concatenating all Text node
  children separated by spaces"
  ([Accessibility](https://reactnative.dev/docs/accessibility)). A `Pressable` with no `testID`
  still shows up, with its visible text as its label.
- Children of an accessible element collapse into it. Maestro documents this for iOS: React
  Native "sometimes 'swallows'" inner elements, and the fix is `accessible={false}` on the
  outer element
  ([Maestro React Native](https://docs.maestro.dev/get-started/supported-platform/react-native.md)).
  Maestro issue [#2051](https://github.com/mobile-dev-inc/Maestro/issues/2051) is the same
  report, still open: the row `Pressable`'s `testID` is visible, the `testID`s inside it are not.
  In this app, `stat-${id}-value` inside the `stat-${id}` `Pressable` (`stat-strip.tsx`) and
  `clock-disc-offline` inside `clock-disc` (`clock-disc.tsx`) are expected to be unreachable.
  Assert on the outer element's label instead.
- NativeWind changes nothing here. `className` compiles to styles and never touches
  accessibility props. A plain `View` with no `testID` and no text leaves no trace in the tree.
- One claim not verified: XCUITest-based readers (Maestro, Appium, agent-device's interactions)
  usually list a container `View` that has a `testID` as an `Other` element. Readers that use only
  the accessibility API (AXe, idb) may leave it out when it is neither accessible nor holds an
  accessible child. Check `dashboard` and `my-attendance` in the first real dump.

## Maestro

Sources: [install](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli.md),
[CLI reference](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options.md),
[MCP](https://docs.maestro.dev/get-started/maestro-mcp.md),
[how it works](https://docs.maestro.dev/get-started/how-maestro-works.md),
[env vars](https://docs.maestro.dev/maestro-cli/environment-variables.md),
[CHANGELOG](https://github.com/mobile-dev-inc/Maestro/blob/main/CHANGELOG.md),
[`PrintHierarchyCommand.kt`](https://github.com/mobile-dev-inc/Maestro/blob/main/maestro-cli/src/main/java/maestro/cli/command/PrintHierarchyCommand.kt).

- **What it reads.** The CLI "installs and communicates with a small companion driver app on the
  device", an XCTest runner on iOS. `maestro hierarchy` prints the full tree as JSON. `--compact`
  prints CSV (`element_num,depth,attributes,parent_num`), which is much cheaper to read. The
  command isn't in the docs table but exists in source. `hierarchy` reinstalls the XCTest driver
  by default, and `--no-reinstall-driver` skips that.
- **How it acts.** Flows in YAML: `tapOn: {id: "…"}`, `tapOn: "text"`, `inputText`,
  `assertVisible`, `extendedWaitUntil`, `openLink`, `scrollUntilVisible`. The docs say it
  "automatically wait[s] for the screen to 'settle'". `testID` maps to `id`.
- **Setup.** Needs Java 17+ and `JAVA_HOME`, and Xcode with the command line tools. Already
  installed here, so the work is two exports (see Recommendation). Set
  `MAESTRO_CLI_NO_ANALYTICS=true`.
- **Headless.** Yes. `maestro --device <udid> test flow.yaml` needs no GUI and no prompts. Maestro
  Studio and the MCP's Viewer are GUI extras.
- **Speed.** Each CLI call starts a JVM and connects to or reinstalls the driver, so it takes
  seconds. Not measured here: no simulator was booted, to keep the machine untouched. Batch
  several steps into one flow rather than calling the CLI once per tap.
- **MCP.** `maestro mcp` ships inside the CLI (`claude mcp add maestro -- maestro mcp`). Tools:
  `list_devices`, `inspect_screen` ("compact JSON"), `take_screenshot`, `run` (inline YAML or
  files), `cheat_sheet`, `open_maestro_viewer`, and cloud tools that need `maestro login`. The
  local tools need no account.
- **Maintenance.** 2.7.0 (2026-07-20) sped up iOS hierarchy reads and fixed transient
  `kAXErrorInvalidUIElement` failures. Issue [#3367](https://github.com/mobile-dev-inc/Maestro/issues/3367),
  "Expo SDK 56 / RN 0.85.3: visible RN UI missing from Maestro hierarchy", was closed as
  completed on 2026-07-04. Open Xcode 27 issues concern foldables and the Simulator.app to
  DeviceHub rename in Studio ([#3606](https://github.com/mobile-dev-inc/Maestro/issues/3606)), not
  the CLI. [#3633](https://github.com/mobile-dev-inc/Maestro/issues/3633) reports a failed driver
  session triggering a sysdiagnose of up to 10 minutes on Xcode 26+. Budget for it.
- **Tab bars.** [#3148](https://github.com/mobile-dev-inc/Maestro/issues/3148) reports `tapOn`
  on a React Navigation bottom tab "reports COMPLETED but doesn't navigate", on iOS 26.2 with
  Expo Router 55. It was closed for lack of a repro. This app's bar is `expo-router/ui`
  `TabTrigger` around a plain `Pressable`, a different component, but an agent should assert the
  screen after every tab tap anyway.
- **License/cost.** Apache-2.0, free locally. Cloud is paid and not needed.

## AXe

Sources: [README](https://github.com/cameroncooke/AXe),
[command reference](https://axe-cli.com/docs/command-reference),
[CHANGELOG](https://github.com/cameroncooke/AXe/blob/main/CHANGELOG.md).

- **What it reads.** `axe describe-ui --udid <udid>` dumps "the accessibility tree as JSON for the
  whole screen or a single point" (`--point x,y`). It goes through Apple's private accessibility
  APIs from the host, built on idb's XCFrameworks. No driver app is installed in the simulator.
- **How it acts.** `axe tap --id <AXUniqueId>`, `--label`, `--value`, or `-x/-y`, plus
  `--element-type`, `--wait-timeout` and `--poll-interval`, so a tap can wait for its target
  (added in 1.6.0). `axe type 'text'` (or `--stdin`/`--file`), `key`, `swipe`, `gesture`,
  `slider --id`, `screenshot`. `axe batch --step "tap --id Email" --step "type '…'"` runs several
  steps in one call.
- **Typing caveat.** The docs say `type` handles "US keyboard characters only; accented and
  non-ASCII characters fail". It sends HID key events, so the Czech input-source mangling and the
  dev client's `r`/`d` shortcuts both apply. Tap a field by id first, and keep typed test data
  ASCII.
- **Setup.** `brew install cameroncooke/axe/axe`. It "supports Xcode 26 and Xcode 27. Xcode 27
  simulator automation uses Device Hub; Simulator.app is not required" (1.8.0, validated on Xcode
  27 beta 3 and iOS 27).
- **Headless.** Yes. A plain CLI, one process per call, explicit `--udid`, no daemon, no prompt.
- **Speed.** No JVM and no driver, so it should be much faster per call than Maestro. Not measured
  here.
- **Tokens.** The JSON carries frames and attributes for every element. Pipe it through `jq` to
  one line per element (`AXUniqueId`, `AXLabel`, `type`, `frame`) before the agent reads it.
- **Maintenance.** Last release 2026-07-20, roughly monthly before that. One maintainer (Cameron
  Cooke, who also started XcodeBuildMCP). MIT. `axe init` installs a bundled agent skill.

## idb

Sources: [README](https://github.com/facebook/idb),
[UI automation](https://github.com/facebook/idb/blob/main/website/docs/idb/ui.mdx),
[accessibility backends](https://github.com/facebook/idb/blob/main/website/docs/idb/accessibility.mdx),
[installation](https://github.com/facebook/idb/blob/main/website/docs/idb/installation.mdx).

idb is active again: v1.6.0 to v1.6.2 all shipped in September 2026, and the companion is moving
to Swift. Its UI surface now covers everything this task needs:

- `idb ui describe-all --key AXUniqueId --key AXLabel --key frame` returns only the attributes
  asked for, the cheapest read of any tool here.
- `idb ui tap <marker> --match-key AXUniqueId` is an accessibility press on the element, not a
  coordinate.
- `idb ui wait <marker> --match-key AXUniqueId --timeout 10 --json` works as an assertion.
- `idb ui quiet 30` exits when the app's "main run loop is idle and it has no animations in
  flight", a real settle signal.
- `idb ui set-value <marker> --value '…'` fills a field "with no keyboard involved". That would
  avoid the Czech layout and the dev client's `r`/`d` shortcuts, but it is not verified that a
  React Native `TextInput` fires `onChangeText` on an accessibility value set.

Setup: `brew install facebook/fb/idb` installs both halves. It needs an arm64 Mac on macOS 15+,
"Xcode 26 or later", and Python 3.10+ for the client. A companion process attaches per target,
which adds one more moving part than AXe. The docs don't mention Xcode 27 or Device Hub by name.
MIT.

## MobileBuildMCP (formerly XcodeBuildMCP)

Sources: [README](https://github.com/getsentry/MobileBuildMCP),
[ui-automation workflow](https://github.com/getsentry/MobileBuildMCP/blob/main/manifests/workflows/ui-automation.yaml),
[`tap.ts`](https://github.com/getsentry/MobileBuildMCP/blob/main/src/mcp/tools/ui-automation/tap.ts),
[privacy](https://github.com/getsentry/xcodebuildmcp.com/blob/main/app/docs/_content/privacy.mdx).

Sentry now owns it, and the repo has been renamed. It is an MCP server and CLI
(`brew install mobilebuildmcp` from the `getsentry/xcodebuildmcp` tap, or npm). Its
`ui-automation` workflow has `snapshot_ui`, `wait_for_ui`, `batch`, `tap`, `type_text`,
`screenshot` and gestures. `tap` takes an `elementRef` from the last snapshot and runs through AXe
helpers. The value on top of AXe is build/run tooling (`build_run_sim`), which this workspace
already covers with `expo run:ios`. Sentry error telemetry is on by default; turn it off with
`XCODEBUILDMCP_SENTRY_DISABLED=true`. MIT. It's worth adopting only if the build side is wanted too.

## agent-device (Callstack)

Sources: [README](https://github.com/callstack/agent-device),
[selectors](https://oss.callstack.com/agent-device/docs/selectors),
[installation](https://oss.callstack.com/agent-device/docs/installation).

This is the tool most closely shaped for this job. `agent-device snapshot -i` prints interactive
elements as refs (`@e2 [button] "Add"`), and `press @e2 --settle` returns a diff of what changed
rather than a new full tree. That design saves the most tokens of any option here. `find id "…"`,
`find label "…"`, `wait` and `fill` accept selectors. The README describes "React Native component
trees" and React profiling. Sessions are "scoped to the caller's git worktree", and device claims
"stop parallel agents from taking over each other's simulators", which fits the two-subagent
limit. Runs can be exported as Maestro YAML. On iOS it "uses a local accessibility bridge for iOS
Simulator snapshots and XCTest for iOS interactions", so there is an XCTest runner to build and
start. The docs don't give simulator requirements or first-run cost. `npm install -g
agent-device` needs Node 22.12+. MIT. Against it: it's pre-1.0 with several releases a week, so
behaviour moves under a pinned workflow.

## Other candidates

- **mobile-mcp** ([README](https://github.com/mobile-next/mobile-mcp)).
  `mobile_list_elements_on_screen` returns elements with coordinates, but taps are
  `mobile_click_on_screen_at_coordinates` only. The iOS simulator path runs through `mobilecli`.
  Telemetry (PostHog, Scarf) is on by default and turned off with `MOBILEMCP_DISABLE_TELEMETRY=1`.
  MCP only; no by-id tap.
- **ios-simulator-mcp** ([README](https://github.com/joshuayoes/ios-simulator-mcp)). A wrapper
  over idb with `ui_describe_all`, `ui_find_element` and `ui_tap` (x/y only). Everything it does,
  idb does directly from Bash.
- **Appium XCUITest + appium-mcp**
  ([requirements](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/system-requirements/),
  [appium-mcp](https://github.com/appium/appium-mcp)). The tree is full XCUITest page source and
  finds by accessibility id. It needs Appium 3 and a WebDriverAgent that "get[s] installed/built
  during session initialization". appium-mcp wants Node 22+ and a JDK, and its focus is generating
  Java/TestNG tests. It's the heaviest setup for the same tree, so skip it.
- **Expo MCP** ([docs](https://docs.expo.dev/eas/ai/mcp/)). A remote server at
  `https://mcp.expo.dev/mcp` that needs an Expo account and browser sign-in. The local
  capabilities need `npx expo install expo-mcp --dev`, `expo login`, and Metro started with
  `EXPO_UNSTABLE_MCP_SERVER=1`. Tools: `automation_tap` (x/y or `testID`), `automation_find_view`
  (one `testID` to position, size, visibility), `automation_take_screenshot`, `open_devtools`,
  `collect_app_logs`. The automation tools aren't marked paid; only some server tools say
  "requires an EAS paid plan". It has no whole-screen tree dump, so an agent cannot discover what
  is on screen, only probe ids it already knows. Local data "is proxied through Expo MCP Server".
  It supports "a single development server connection at a time". It adds an account, a cloud hop
  and a dev dependency, and still gives no tree. Skip it.
- **Detox** ([project setup](https://wix.github.io/Detox/docs/introduction/project-setup)). A
  gray-box Jest test framework with its own build configuration. For Expo it defers to Expo's own
  guide. It has no ad-hoc "dump the screen, tap this" CLI, so it's the wrong shape for an agent
  loop.
- **Xcode 27's own agent tools.** WWDC26's State of the Union says agents in Xcode 27 can
  "tap, swipe, and type" in the simulator
  ([session 102](https://developer.apple.com/videos/play/wwdc2026/102/)). External agents reach
  Xcode tools through `claude mcp add --transport stdio xcode -- xcrun mcpbridge`, but only with
  the project open in Xcode and "Allow external agents to use Xcode tools" switched on, and "Xcode
  alerts you when the external agent connects"
  ([Apple](https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode)).
  Apple doesn't say whether the simulator tools reach mcpbridge. It needs the GUI, so background
  subagents can't use it.
- **The desktop app's simulator tool.** It works by screenshot and coordinates and prompts once
  per device, which is why subagents avoid it already.

## Comparison

| Tool           | Screen as text                    | Tap by `testID`               | Install here                | Headless from Bash  | Tokens per read       |
| -------------- | --------------------------------- | ----------------------------- | --------------------------- | ------------------- | --------------------- |
| Maestro CLI    | `hierarchy` JSON, `--compact` CSV | yes, `tapOn: {id}` in a flow  | done; PATH + `JAVA_HOME`    | yes                 | high, medium compact  |
| Maestro MCP    | `inspect_screen` compact JSON     | yes, via `run` YAML           | same binary                 | MCP, shared process | medium                |
| AXe            | `describe-ui` JSON                | yes, `tap --id`               | `brew`, native              | yes                 | medium, low with `jq` |
| idb            | `describe-all --key …`            | yes, `--match-key AXUniqueId` | `brew`, companion + Python  | yes                 | low                   |
| agent-device   | `snapshot -i` refs + diffs        | yes, `find id` / refs         | `npm -g`, XCTest runner     | yes                 | lowest                |
| MobileBuildMCP | `snapshot_ui`                     | yes, element refs (AXe)       | `brew` or npm               | yes (CLI mode)      | medium                |
| mobile-mcp     | element list + coordinates        | no, coordinates               | npx                         | MCP only            | medium                |
| Appium + MCP   | XCUITest page source              | yes, accessibility id         | Appium 3, WDA, JDK          | yes                 | high                  |
| Expo MCP       | none, one `testID` at a time      | yes                           | account, cloud hop, dev dep | MCP, remote         | low but blind         |
| Detox          | none ad hoc                       | yes, in Jest tests            | build config, Jest          | tests only          | n/a                   |

## Recommendation for this workspace

Use two tools. **AXe** runs the agent's interactive loop and **Maestro CLI** runs anything worth
repeating. Both are plain CLIs with an explicit simulator id, which suits the one-simulator-per-
ticket, two-subagents-at-most setup. Neither shows a prompt.

Install and wire-up, done once by the user:

```bash
brew install cameroncooke/axe/axe
# Maestro 2.10.0 is already in ~/.maestro; make it findable
echo 'export PATH="$HOME/.maestro/bin:$PATH"' >> ~/.zshrc
echo 'export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' >> ~/.zshrc
echo 'export MAESTRO_CLI_NO_ANALYTICS=true' >> ~/.zshrc
```

Subagent shells don't always read `~/.zshrc`, so the subagent brief should also spell out
`~/.maestro/bin/maestro` and the `JAVA_HOME` value, as the memory note on simulators already does.

Leave the Maestro MCP server out of `.mcp.json`. Subagents share the session's MCP connections, so
two subagents on two simulators would drive one server process. Its `run` tool takes YAML the CLI
already runs. It's worth adding only if someone wants the Maestro Viewer in the main session.

Keep **agent-device** on a short trial list. Its snapshot diffs and worktree-scoped device claims
fit this exact problem better than anything else. Try it on one ticket before replacing AXe, and
pin the version.

The loop a subagent runs, with `$UDID` its own simulator:

1. Sign in: `xcrun simctl openurl $UDID "flexiday://dev-sign-in?ticket=…&to=/requests"`.
2. Wait for the target screen. AXe documents `--wait-timeout` only on `tap`, so poll `axe describe-ui` until the
   screen root's `testID` (`dashboard`, `my-attendance`, `settings`) appears. Alternatively, run
   a one-step Maestro flow with `extendedWaitUntil`.
3. Read: `axe describe-ui --udid $UDID | jq -c '… {id: .AXUniqueId, label: .AXLabel, type, frame}'`
   and keep only elements with an id or label. Screenshot only when the tree is ambiguous.
4. Act: `axe tap --id approval-<key>-approve --tap-style physical --wait-timeout 5 --udid $UDID`. To type, tap the field
   by id, then `axe type '…'` with ASCII only.
5. Assert: read the tree again and check the expected id or label. For anything the ticket should
   keep testing, write the same steps as `flexi-day-rn/.maestro/<feature>.yaml` with `tapOn: {id}`
   and `assertVisible: {id}`, and run `maestro --device $UDID test` on it.
6. Hand back: `xcrun simctl shutdown $UDID`.

Settle the `jq` filter once in a small script under `flexi-day-rn/scripts/` rather than in every
brief. The jq path depends on AXe's JSON shape, which its docs don't print; read it from the first
real dump.

## `testID` coverage the app needs

Most screens are already covered (394 `testID`s in 74 files, 56 `accessibilityLabel`s):
`dashboard`, `dashboard-new-request`, `stat-*`, `approvals-card` with `approval-<key>-approve` /
`-decline` / `-open`, `new-request` with `type-field-<type>` / `new-request-submit` /
`new-request-sent`, `request-detail` with `request-approve` / `request-decline`, `clock-sheet` /
`clock-widget` with action buttons whose `testID` is the action name (`clock-in`, `clock-out`, …) and
`clock-status`, `my-attendance` with `attendance-view-<view>`, and `settings` with its rows. The
gaps, in order of how often an agent hits them:

T-84 has since added the tab bar and More sheet ids (gaps 1 and 2).

1. **Tab bar.** `TabButton` (`src/components/shell/tab-button.tsx`) takes no `testID`, and the
   `barSlot` / More button in `src/app/(app)/_layout.tsx` pass none. Add `tab-<link.key>`
   (`tab-dashboard`, `tab-requests`, …) and `tab-more`. Today the only handle is the translated
   label, which changes between `en` and `cs`. `clock-disc` is already covered.
2. **More sheet** (`src/components/shell/more-sheet.tsx`). Rows, sign-out and the backdrop have no
   ids. Add `more-<link.key>` (settings, report, groups, calendar-sync, my-attendance),
   `more-sign-out` and `more-close`. This is the only route to settings and attendance when they
   aren't on the bar.
3. **Shared primitives.** `Button` and `TextLink` spread their props, so callers can pass a
   `testID`. `Field` forwards it to `TextInput` and derives `<id>-error`. No change is needed, but
   new call sites should pass one.
4. **Nested ids that won't be reachable.** `stat-<id>-value` and `stat-<id>-loading` sit inside the
   `stat-<id>` `Pressable`; `clock-disc-offline` sits inside `clock-disc`. Either assert on the
   outer element's label, or set `accessible={false}` on the outer element where it doesn't need
   to be one target.
5. **Date fields.** `dates-field.tsx` renders `@react-native-community/datetimepicker` with
   `display="compact"`. Its popover is native UI with no app `testID`s, so it's the hardest control
   here to drive. Plan to drive it by the picker's own labels, or accept the default dates.
6. **Auth screens.** `welcome.tsx`, `auth/two-factor.tsx`, `screen-header.tsx` and `code-boxes.tsx`
   have no ids. That's low priority while the deep link handles sign-in; the sign-in form already
   has `sign-in-email`, `sign-in-password` and `sign-in-submit`.

Screen roots also matter as "arrived" markers. `dashboard`, `requests-list`, `my-attendance`,
`settings`, `request-detail`, `new-request` and `notifications` exist. `groups.tsx`, `report.tsx`
and `calendar-sync.tsx` need a root `testID` if agents are to confirm navigation there.
