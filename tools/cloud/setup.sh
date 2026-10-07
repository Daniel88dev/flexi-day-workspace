#!/usr/bin/env bash
#
# Prepare a Claude Code cloud container for the Flexi Day stack.
#
# Runs as the cloud environment's setup script, once per container before the filesystem is
# snapshotted, and again from the SessionStart hook on every session, where whatever is already
# in place is skipped. It refuses to run outside a cloud container unless passed --force, because
# it edits pg_hba.conf, creates database roles and links Node into ~/.local/bin.
#
#   tools/cloud/setup.sh            install, provision and migrate
#   tools/cloud/setup.sh --force    skip the cloud check
#
# FLEXI_CLOUD_WITH_RN=1 also installs the iPhone app's dependencies. They are the largest install
# by far, which is what keeps them opt-in: the setup script has to finish inside the five-minute
# window or the container is never cached.

set -euo pipefail

WORKSPACE=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
GITHUB_OWNER=Daniel88dev
SUB_REPOS=(flexi-day flexi-day-be flexi-day-emails flexi-day-rn)
NODE_MAJOR=$(tr -d '[:space:]' <"$WORKSPACE/.nvmrc")
NVM_DIR=${NVM_DIR:-/opt/nvm}
LINK_DIR=${FLEXI_CLOUD_NODE_LINK_DIR:-$HOME/.local/bin}
DB_NAME=flexi-day
TEST_DB_NAME=testdb
WITH_RN=${FLEXI_CLOUD_WITH_RN:-0}
# Named in every DATABASE URL: the laptop's URL has no user and node-postgres falls back to $USER,
# which a cloud shell does not set.
OS_USER=$(id -un)
RUN_DIR="$WORKSPACE/.stack"
PG_HBA_MARK="# flexi-day cloud: loopback connects without a password"

log() { printf '\n==> %s\n' "$*"; }
die() {
  echo "error: $*" >&2
  exit 1
}

is_cloud() { [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ -d /root/.ccr ]; }

force=0
for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    *) die "unknown option: $arg" ;;
  esac
done
if [ "$force" = 0 ] && ! is_cloud; then
  die "not a Claude Code cloud container (CLAUDE_CODE_REMOTE is not true); pass --force to run anyway"
fi

mkdir -p "$RUN_DIR"
started=$(date +%s)

# --- Node -----------------------------------------------------------------------------------

ensure_node() {
  if [[ "$(node -v 2>/dev/null)" == "v$NODE_MAJOR."* ]]; then
    log "Node $(node -v) is active"
    return
  fi
  log "Installing Node $NODE_MAJOR with nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || die "nvm not found at $NVM_DIR (set NVM_DIR)"
  set +u
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm install "$NODE_MAJOR" >/dev/null
  nvm alias default "$NODE_MAJOR" >/dev/null
  local bin
  bin=$(dirname "$(nvm which "$NODE_MAJOR")")
  set -u
  # ~/.local/bin sits ahead of the image's Node 22 on PATH, so the links make 24 the default
  # for every later shell, including the ones Claude's tools open.
  mkdir -p "$LINK_DIR"
  local tool
  for tool in node npm npx corepack; do
    ln -sfn "$bin/$tool" "$LINK_DIR/$tool"
  done
  export PATH="$bin:$PATH"
  log "Node $(node -v) linked into $LINK_DIR"
}

# --- The four product repos ---------------------------------------------------------------

ensure_sub_repos() {
  local name target sibling
  for name in "${SUB_REPOS[@]}"; do
    target="$WORKSPACE/$name"
    if [ -f "$target/package.json" ]; then
      continue
    fi
    [ -L "$target" ] && rm -f "$target"
    [ -e "$target" ] && die "$target exists but holds no checkout; move it away"
    sibling="$WORKSPACE/../$name"
    if [ -f "$sibling/package.json" ]; then
      # A session with several repositories clones them as siblings of this one.
      log "Linking $name to the sibling clone"
      ln -s "../$name" "$target"
    else
      log "Cloning $GITHUB_OWNER/$name"
      git clone --quiet "https://github.com/$GITHUB_OWNER/$name.git" "$target"
    fi
  done
}

# --- Dependencies -------------------------------------------------------------------------

# npm ci only when package-lock.json changed since the last install, so a cached container
# and a resumed session both skip it.
install_deps() {
  local dir=$1 name stamp lock_hash
  name=$(basename "$dir")
  stamp="$dir/node_modules/.flexi-cloud-lock-sha256"
  lock_hash=$(sha256sum "$dir/package-lock.json" | cut -d' ' -f1)
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$lock_hash" ]; then
    echo "dependencies current in $name"
    return 0
  fi
  echo "npm ci in $name"
  if (cd "$dir" && npm ci --no-audit --no-fund) >"$RUN_DIR/setup-$name.log" 2>&1; then
    echo "$lock_hash" >"$stamp"
    echo "installed $name"
  else
    echo "npm ci failed in $name:" >&2
    tail -n 40 "$RUN_DIR/setup-$name.log" >&2
    return 1
  fi
}

ensure_deps() {
  log "Installing dependencies"
  local dirs=("$WORKSPACE" "$WORKSPACE/flexi-day" "$WORKSPACE/flexi-day-be" "$WORKSPACE/flexi-day-emails")
  if [ "$WITH_RN" = 1 ]; then
    dirs+=("$WORKSPACE/flexi-day-rn")
  else
    echo "skipping flexi-day-rn (FLEXI_CLOUD_WITH_RN=1 includes it)"
  fi
  local dir pids=() failed=0
  for dir in "${dirs[@]}"; do
    install_deps "$dir" &
    pids+=($!)
  done
  local pid
  for pid in "${pids[@]}"; do
    wait "$pid" || failed=1
  done
  [ "$failed" = 0 ] || die "a dependency install failed"
}

ensure_chromium() {
  local browsers=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}
  if [ -x "$browsers/chromium" ]; then
    log "Chromium for Playwright at $browsers/chromium"
    return
  fi
  log "Installing Chromium for Playwright"
  (cd "$WORKSPACE" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='' npx --no-install playwright install chromium) ||
    echo "warning: Chromium install failed; the Playwright MCP will not start" >&2
}

# --- PostgreSQL ---------------------------------------------------------------------------

psql_admin() {
  if [ "$(id -u)" = 0 ]; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qtAX "$@"
  else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -qtAX "$@"
  fi
}

ensure_postgres() {
  command -v pg_lsclusters >/dev/null || die "PostgreSQL is not installed; the cloud image ships it, so install postgresql-16 by hand elsewhere"
  local line ver cluster status
  line=$(pg_lsclusters -h | head -n 1)
  [ -n "$line" ] || die "no PostgreSQL cluster is defined"
  read -r ver cluster _ status _ <<<"$line"

  # The backend's DATABASE URL carries no user or password: it connects as the OS user. The
  # packaged pg_hba.conf wants scram over TCP, so these rules go in front of it. First match wins.
  local hba="/etc/postgresql/$ver/$cluster/pg_hba.conf" reload=0
  if ! grep -qF "$PG_HBA_MARK" "$hba"; then
    log "Letting loopback connect to PostgreSQL $ver without a password"
    local tmp
    tmp=$(mktemp)
    {
      echo "$PG_HBA_MARK"
      echo "host    all    all    127.0.0.1/32    trust"
      echo "host    all    all    ::1/128         trust"
      cat "$hba"
    } >"$tmp"
    cat "$tmp" >"$hba"
    rm -f "$tmp"
    reload=1
  fi

  if [ "$status" != online ]; then
    log "Starting PostgreSQL $ver/$cluster"
    pg_ctlcluster "$ver" "$cluster" start
  elif [ "$reload" = 1 ]; then
    pg_ctlcluster "$ver" "$cluster" reload
  fi
  local i
  for i in $(seq 1 30); do
    pg_isready -q -h 127.0.0.1 && break
    [ "$i" = 30 ] && die "PostgreSQL did not come up"
    sleep 1
  done

  local db
  if [ "$(psql_admin -c "select 1 from pg_roles where rolname = '$OS_USER'")" != 1 ]; then
    log "Creating the $OS_USER role"
    psql_admin -c "create role \"$OS_USER\" superuser login"
  fi
  for db in "$DB_NAME" "$TEST_DB_NAME"; do
    if [ "$(psql_admin -c "select 1 from pg_database where datname = '$db'")" != 1 ]; then
      log "Creating the $db database"
      psql_admin -c "create database \"$db\" owner \"$OS_USER\""
    fi
  done
  log "PostgreSQL $ver answers on :5432 as $OS_USER, databases $DB_NAME and $TEST_DB_NAME"
}

# --- Env files ----------------------------------------------------------------------------

secret() { openssl rand -hex 32; }

# Written once and never overwritten, so a value changed by hand survives the next session.
write_if_missing() {
  local path=$1
  if [ -e "$path" ]; then
    echo "$path exists, left alone"
    cat >/dev/null
    return
  fi
  cat >"$path"
  echo "wrote $path"
}

ensure_env_files() {
  log "Env files"
  # The frontend's dev sign-in page sends the same token the backend checks, so the two files
  # share one value, read back from .env when only .env.local is missing.
  local dev_token
  dev_token=$(sed -n 's/^DEV_TOOLS_TOKEN=//p' "$WORKSPACE/flexi-day-be/.env" 2>/dev/null | head -n 1)
  [ -n "$dev_token" ] || dev_token=$(secret)

  write_if_missing "$WORKSPACE/flexi-day-be/.env" <<ENV
# Written by tools/cloud/setup.sh for a cloud session. Secrets are random per container.
NODE_ENV=dev
PORT=8080
DATABASE=postgres://$OS_USER@localhost:5432/$DB_NAME
BETTER_AUTH_SECRET=$(secret)
BETTER_AUTH_URL=http://localhost:8080

# The seeding and sign-in surface the ui-test skill drives. Loopback-only and token-gated.
DEV_TOOLS_ENABLED=true
DEV_TOOLS_TOKEN=$dev_token
DEV_SEED_EMAIL_DOMAIN=dev.local

APP_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:3000,flexiday://
EMAIL_TEMPLATE_STAGE=dev
SENTRY_ENABLE=false
ENV

  write_if_missing "$WORKSPACE/flexi-day-be/.env.e2e.test" <<ENV
# Written by tools/cloud/setup.sh: the e2e suite against the native testdb, no Docker.
NODE_ENV=test
PORT=8080
DATABASE=postgresql://$OS_USER@localhost:5432/$TEST_DB_NAME
BETTER_AUTH_SECRET=$(secret)
BETTER_AUTH_URL=http://localhost:8080
TRUSTED_ORIGINS=http://localhost:3000,flexiday://
ENV

  write_if_missing "$WORKSPACE/flexi-day/.env.local" <<ENV
# Written by tools/cloud/setup.sh. NEXT_PUBLIC_DEV_TOOLS turns on /dev-sign-in/ for this build
# only, and the token is the one flexi-day-be/.env holds.
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_DEV_TOOLS=1
NEXT_PUBLIC_DEV_TOOLS_TOKEN=$dev_token
ENV
}

# --- Migrations ---------------------------------------------------------------------------

ensure_migrated() {
  log "Applying migrations"
  (cd "$WORKSPACE/flexi-day-be" && npm run --silent db:migrate)
  (cd "$WORKSPACE/flexi-day-be" && DATABASE="postgresql://$OS_USER@localhost:5432/$TEST_DB_NAME" npm run --silent db:migrate)
}

ensure_node
ensure_sub_repos
ensure_deps
ensure_chromium
ensure_postgres
ensure_env_files
ensure_migrated

log "Ready in $(($(date +%s) - started))s. Next: npm run stack:start, then npm run dev:scenario."
