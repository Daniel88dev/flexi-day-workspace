#!/usr/bin/env bash
# Calls one Fenro MCP tool over plain HTTP, without Claude. The weekly-deps workflow uses it to
# add a failure note to the report task when the run itself broke.
#
#   FENRO_TOKEN=... tools/weekly-deps/fenro-call.sh <tool> '<arguments as JSON>'
#
# Exits non-zero if the call or the tool fails. Never prints the token.
set -euo pipefail

FENRO_URL="${FENRO_URL:-https://www.fenro-dashboard.com/api/mcp}"

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <tool> <arguments-json>" >&2
  exit 2
fi
if [[ -z "${FENRO_TOKEN:-}" ]]; then
  echo "FENRO_TOKEN is not set" >&2
  exit 2
fi

tool="$1"
arguments="$2"
headers_file="$(mktemp)"
trap 'rm -f "$headers_file"' EXIT

# The token goes to curl on stdin as a header file, so it never shows in the process list.
post() {
  local body="$1" session="${2:-}"
  local extra=()
  [[ -n "$session" ]] && extra=(-H "Mcp-Session-Id: $session")
  printf 'Authorization: Bearer %s\n' "$FENRO_TOKEN" |
    curl -sS --fail-with-body --max-time 30 \
      -H @- \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      ${extra[@]+"${extra[@]}"} \
      -D "$headers_file" \
      --data "$body" \
      "$FENRO_URL"
}

# A streamable-HTTP server may answer as SSE; keep only the JSON-RPC payload.
payload() {
  local raw="$1"
  if grep -q '^data:' <<<"$raw"; then
    grep '^data:' <<<"$raw" | tail -n 1 | sed 's/^data: *//'
  else
    printf '%s' "$raw"
  fi
}

init_body="$(jq -nc '{jsonrpc:"2.0",id:1,method:"initialize",params:{
  protocolVersion:"2025-06-18",capabilities:{},
  clientInfo:{name:"weekly-deps-failure",version:"1"}}}')"
post "$init_body" >/dev/null
session="$(grep -i '^mcp-session-id:' "$headers_file" | head -n 1 | cut -d: -f2- | tr -d ' \r' || true)"

post '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$session" >/dev/null

call_body="$(jq -nc --arg tool "$tool" --argjson args "$arguments" \
  '{jsonrpc:"2.0",id:2,method:"tools/call",params:{name:$tool,arguments:$args}}')"
if ! raw="$(post "$call_body" "$session")"; then
  echo "Fenro $tool failed over HTTP: $raw" >&2
  exit 1
fi
response="$(payload "$raw")"

if ! jq -e '.result != null or .error != null' <<<"$response" >/dev/null 2>&1; then
  echo "Fenro $tool returned no JSON-RPC result: $raw" >&2
  exit 1
fi
if jq -e '.error != null or .result.isError == true' <<<"$response" >/dev/null; then
  echo "Fenro $tool failed:" >&2
  jq -r '.error.message // (.result.content[]?.text // "unknown error")' <<<"$response" >&2
  exit 1
fi
jq -r '.result.content[]?.text // empty' <<<"$response"
