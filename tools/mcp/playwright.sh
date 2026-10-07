#!/usr/bin/env bash
#
# Starts the Playwright MCP server for .mcp.json. On a laptop it opens the installed Google Chrome,
# headed, so no Playwright browser download is needed. In a cloud session it runs headless on the
# Chromium the image ships, named explicitly because the pinned playwright-core looks for a newer
# build than the one under PLAYWRIGHT_BROWSERS_PATH.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

args=(--output-dir .playwright-mcp)
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  chromium="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium"
  args+=(--browser chromium --headless --no-sandbox)
  [ -x "$chromium" ] && args+=(--executable-path "$chromium")
fi

exec node_modules/.bin/playwright-mcp "${args[@]}" "$@"
