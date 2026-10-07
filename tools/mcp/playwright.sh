#!/usr/bin/env bash
#
# Starts the Playwright MCP server for .mcp.json. On a laptop it opens a headed browser. In a
# cloud session it runs headless on the Chromium the image ships, named explicitly because the
# pinned playwright-core looks for a newer build than the one under PLAYWRIGHT_BROWSERS_PATH.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

args=(--browser chromium)
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  chromium="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium"
  args+=(--headless --no-sandbox --output-dir .playwright-mcp)
  [ -x "$chromium" ] && args+=(--executable-path "$chromium")
fi

exec node_modules/.bin/playwright-mcp "${args[@]}" "$@"
