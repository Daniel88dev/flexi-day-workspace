#!/usr/bin/env bash
# PreToolUse(Bash) hook: format staged files with prettier before a commit is created.
#
# The PostToolUse prettier hooks only match Write|Edit, so anything written through Bash
# (sed, a heredoc, a python one-liner) reaches the index unformatted and fails CI's
# format:check. This is the backstop for that path.
#
# Always exits 0 — a formatting hiccup must not block the commit.
set -u

payload=$(cat)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0

case "$command" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

workspace=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
report=""

# "." is the workspace repo itself, which runs its own format:check in CI.
for repo in . flexi-day flexi-day-be flexi-day-emails; do
  dir="$workspace/$repo"
  [ -x "$dir/node_modules/.bin/prettier" ] || continue
  cd "$dir" || continue

  # ACMR skips deletions; prettier cannot format a path that is gone.
  # -z throughout: paths may contain spaces, and BSD xargs has no -d.
  staged=$(git diff --cached -z --name-only --diff-filter=ACMR 2>/dev/null) || continue
  [ -n "$staged" ] || continue

  changed=$(printf '%s' "$staged" | xargs -0 ./node_modules/.bin/prettier --write --ignore-unknown --list-different 2>/dev/null) || true
  [ -n "$changed" ] || continue

  printf '%s' "$changed" | tr '\n' '\0' | xargs -0 git add || true
  label=$([ "$repo" = "." ] && echo workspace || echo "$repo")
  report="$report $label: $(printf '%s' "$changed" | tr '\n' ' ')"
done

[ -n "$report" ] && echo "prettier reformatted and re-staged —$report" >&2
exit 0
