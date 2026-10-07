#!/usr/bin/env bash
#
# SessionStart hook. On a laptop it does nothing. In a cloud session it runs tools/cloud/setup.sh,
# which is quick on a cached container: what the setup script already installed is skipped, and
# what the filesystem snapshot cannot keep, a running PostgreSQL, is started again.

set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

WORKSPACE=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)

"$WORKSPACE/tools/cloud/setup.sh"

# Node 24 is linked into ~/.local/bin; the env file carries it into every tool shell even when
# the session's PATH does not already list that directory.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$HOME/.local/bin:\$PATH\"" >>"$CLAUDE_ENV_FILE"
fi
