#!/usr/bin/env bash
#
# Run the backend and the frontend as detached processes, with logs and pid files in .stack/.
# The desktop app's preview_start has no equivalent in a cloud session, and a server started
# from a Bash tool call dies with it; these survive until stopped.
#
#   tools/stack.sh start [be|fe]    migrate, start what is down, wait until it answers
#   tools/stack.sh stop  [be|fe]    stop what this script started
#   tools/stack.sh status           the dev CLI's stack status
#   tools/stack.sh logs  [be|fe]    last lines of each log; -f follows

set -euo pipefail

WORKSPACE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
RUN_DIR="$WORKSPACE/.stack"
BE_PORT=$(sed -n 's/^PORT=\([0-9]\{1,5\}\)\s*$/\1/p' "$WORKSPACE/flexi-day-be/.env" 2>/dev/null | head -n 1)
BE_URL="http://localhost:${BE_PORT:-8080}/health"
FE_URL="http://localhost:3000/"
START_TIMEOUT=240

mkdir -p "$RUN_DIR"

die() {
  echo "error: $*" >&2
  exit 1
}

answers() { curl -sf -o /dev/null --max-time 10 "$1"; }

alive() {
  local pidfile="$RUN_DIR/$1.pid"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

ensure_postgres() {
  command -v pg_lsclusters >/dev/null || return 0
  [ "$(id -u)" = 0 ] || return 0
  local ver cluster status
  read -r ver cluster _ status _ <<<"$(pg_lsclusters -h | head -n 1)"
  [ -n "${ver:-}" ] && [ "$status" != online ] || return 0
  echo "starting PostgreSQL $ver/$cluster"
  pg_ctlcluster "$ver" "$cluster" start
  for _ in $(seq 1 30); do
    pg_isready -q -h 127.0.0.1 && return 0
    sleep 1
  done
  die "PostgreSQL did not come up"
}

# A session of its own gives the npm process its own process group, so stop can take the whole
# tree (npm, the nested npm, node) down with one signal. macOS has no setsid(1), so perl makes the
# setsid(2) call there. Both exec in place, which keeps $! the group leader's pid.
if command -v setsid >/dev/null; then
  DETACH=(setsid)
else
  # shellcheck disable=SC2016 # $! and @ARGV are perl's
  DETACH=(perl -MPOSIX -e 'POSIX::setsid() != -1 or die "setsid: $!\n"; exec @ARGV or die "exec $ARGV[0]: $!\n"' --)
fi

start_one() {
  local name=$1 url=$2 script=$3
  if answers "$url"; then
    echo "$name already answers at $url"
    return
  fi
  if alive "$name"; then
    echo "$name is still starting (pid $(cat "$RUN_DIR/$name.pid"))"
  else
    echo "starting $name: npm run $script, log in .stack/$name.log"
    "${DETACH[@]}" nohup npm --prefix "$WORKSPACE" run "$script" >"$RUN_DIR/$name.log" 2>&1 </dev/null &
    echo $! >"$RUN_DIR/$name.pid"
  fi
  for _ in $(seq 1 "$START_TIMEOUT"); do
    if answers "$url"; then
      echo "$name answers at $url"
      return
    fi
    if ! alive "$name"; then
      tail -n 30 "$RUN_DIR/$name.log" >&2
      die "$name exited before it answered; the log is .stack/$name.log"
    fi
    sleep 1
  done
  tail -n 30 "$RUN_DIR/$name.log" >&2
  die "$name did not answer within ${START_TIMEOUT}s; the log is .stack/$name.log"
}

stop_one() {
  local name=$1 pidfile="$RUN_DIR/$1.pid" pid
  if ! alive "$name"; then
    echo "$name is not running under this script"
    rm -f "$pidfile"
    return
  fi
  pid=$(cat "$pidfile")
  echo "stopping $name (process group $pid)"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  kill -KILL -- "-$pid" 2>/dev/null || true
  rm -f "$pidfile"
}

targets() {
  case "${1:-}" in
    "") echo "be fe" ;;
    be | fe) echo "$1" ;;
    *) die "unknown target: $1 (be|fe)" ;;
  esac
}

command=${1:-}
shift || true

case "$command" in
  start)
    ensure_postgres
    for t in $(targets "${1:-}"); do
      case "$t" in
        be)
          npm --prefix "$WORKSPACE" run --silent db:migrate
          # drizzle-kit leaves the cursor on its spinner line.
          echo
          start_one be "$BE_URL" dev:be
          ;;
        fe) start_one fe "$FE_URL" dev:fe ;;
      esac
    done
    node "$WORKSPACE/tools/dev-cli.mjs" status
    ;;
  stop)
    for t in $(targets "${1:-}"); do stop_one "$t"; done
    ;;
  status)
    node "$WORKSPACE/tools/dev-cli.mjs" status
    ;;
  logs)
    follow=0
    names=()
    for arg in "$@"; do
      case "$arg" in
        -f) follow=1 ;;
        *) names+=("$(targets "$arg")") ;;
      esac
    done
    [ "${#names[@]}" -gt 0 ] || names=(be fe)
    files=()
    for n in "${names[@]}"; do files+=("$RUN_DIR/$n.log"); done
    if [ "$follow" = 1 ]; then
      tail -n 20 -f "${files[@]}"
    else
      tail -n 40 "${files[@]}"
    fi
    ;;
  *)
    sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
