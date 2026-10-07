#!/usr/bin/env bash
# PostToolUse(Write|Edit) hook: format the written file with the prettier of the repo that owns it.
#
# Prettier resolves ignore files from its working directory, and the root .prettierignore lists
# every sub-repo, so it runs from inside the owning repo; that repo's binary also brings its own
# prettier version and plugins (tailwind in the frontend and rn).
set -u

file=$(jq -r '.tool_response.filePath // .tool_input.file_path // ""' 2>/dev/null) || exit 0
[ -f "$file" ] || exit 0

workspace=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P) || exit 0
dir=$(cd "$(dirname "$file")" 2>/dev/null && pwd -P) || exit 0
owner=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0

case "$owner" in
  "$workspace" | "$workspace"/*) ;;
  *)
    # A sub-repo reached through a symlink (a cloud session that cloned the repos as
    # siblings) resolves outside the workspace, so match it by its link instead.
    linked=0
    for name in flexi-day flexi-day-be flexi-day-emails flexi-day-rn; do
      [ -L "$workspace/$name" ] || continue
      if [ "$(cd "$workspace/$name" 2>/dev/null && pwd -P)" = "$owner" ]; then
        linked=1
        break
      fi
    done
    [ "$linked" = 1 ] || exit 0
    ;;
esac

[ -x "$owner/node_modules/.bin/prettier" ] || exit 0
cd "$owner" || exit 0
./node_modules/.bin/prettier --write --ignore-unknown "$dir/$(basename "$file")" >/dev/null 2>&1
exit 0
