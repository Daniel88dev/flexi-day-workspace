#!/usr/bin/env bash
#
# Install dependencies in the four product repos with pnpm.

set -euo pipefail

WORKSPACE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
REPOS=(flexi-day flexi-day-be flexi-day-emails flexi-day-rn)

command -v pnpm >/dev/null || {
  echo "error: pnpm is not installed" >&2
  exit 1
}

for name in "${REPOS[@]}"; do
  printf '\n==> pnpm install in %s\n' "$name"
  pnpm -C "$WORKSPACE/$name" install
done
