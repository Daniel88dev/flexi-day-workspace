#!/usr/bin/env bash
#
# Install dependencies in the four product repos with the package manager each one uses:
# pnpm where the repo has pnpm-lock.yaml, npm otherwise. Running npm in a pnpm repo would write
# a package-lock.json into it.

set -euo pipefail

WORKSPACE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
REPOS=(flexi-day flexi-day-be flexi-day-emails flexi-day-rn)

for name in "${REPOS[@]}"; do
  if [ -f "$WORKSPACE/$name/pnpm-lock.yaml" ] && ! command -v pnpm >/dev/null; then
    echo "error: $name uses pnpm, which is not installed" >&2
    exit 1
  fi
done

for name in "${REPOS[@]}"; do
  dir="$WORKSPACE/$name"
  if [ -f "$dir/pnpm-lock.yaml" ]; then
    printf '\n==> pnpm install in %s\n' "$name"
    (cd "$dir" && pnpm install)
  else
    printf '\n==> npm install in %s\n' "$name"
    npm --prefix "$dir" install
  fi
done
