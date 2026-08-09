#!/usr/bin/env bash
# Serve the ADAPTER-NODE PRODUCTION BUILD on :8082 — the tunnel's own upstream,
# ALONGSIDE process-compose's `vite dev` on :8081, which it never touches.
# Runs INSIDE the dev container (up.sh execs it there; re-execs itself into the
# Nix dev shell when the toolchain is not on PATH).
#
#   prod-serve.sh start <https://public-url>   build, serve it on :8082
#   prod-serve.sh start <url> --no-build       reuse the existing build/
#   prod-serve.sh stop                         stop the built server
#   prod-serve.sh status                       what is on :8082 and on :8081
#   prod-serve.sh origin                       print ORIGIN, exit 1 if not prod
#
# Why: `vite dev` ships unbundled ES modules. Measured on the landing page
# (Playwright, cold cache): 150 requests / 7.7 MB dev vs 54 / 2.9 MB built —
# and of that, CODE is 136 requests / 5.1 MB vs 42 / 0.26 MB (the remainder is
# unoptimised JPEGs, identical either way). Fine on localhost, painful through
# a Cloudflare quick tunnel.
#
# Why a DEDICATED port: this used to take :8081 over from vite, which meant
# hackathon-e2e/scripts/run.sh had to hand the port back for the duration of a
# suite and restore prod mode afterwards. Nothing listened on :8081 during
# either switch, so caddy answered the PUBLIC link with 502 Bad Gateway for
# ~40s on every single test run. Caddy now tries dev:8082 first and falls back
# to dev:8081 (.devcontainer/Caddyfile.tunnel), so the two servers coexist and
# a suite run is invisible from outside.
#
# This is the same server `just run-service` starts (components/frontend/
# justfile), with three deliberate differences, all load-bearing:
#
#   ORIGIN    The recipe hardcodes http://localhost:8081. SvelteKit compares
#             every form POST's Origin header against it and answers 403
#             "cross-site form submission forbidden" when they differ — so with
#             the localhost value EVERY action through the tunnel breaks (login
#             kick-off, join, submit, vote). ORIGIN must be the URL the visitor
#             actually typed, hence the required argument.
#   AUTH_URL  Must equal ORIGIN, or login completes and then does nothing.
#             Auth.js derives its cookie NAMES from the scheme it believes it
#             is on (`__Secure-authjs.session-token` vs `authjs.session-token`)
#             and it works that out in TWO different ways: the /auth/* routes
#             get `event.request`, whose URL adapter-node builds from ORIGIN
#             (https); `event.locals.auth()` — the session read every page and
#             the route guard depend on — calls createActionURL(), which uses
#             the X-Forwarded-Proto HEADER, and caddy deliberately does not
#             send https on the frontend route (see Caddyfile.tunnel). So the
#             callback wrote `__Secure-authjs.session-token` and every later
#             request looked for the unprefixed name, found nothing, and
#             bounced the freshly-logged-in visitor back to `/?returnTo=…`
#             with real tokens in hand. AUTH_URL short-circuits the header
#             sniffing (@auth/core `createActionURL`, read from
#             $env/dynamic/private) so both halves agree on https.
#   HOST      adapter-node binds 0.0.0.0 (IPv4 only) by default; caddy proxies
#             `dev:8082`, which resolves to the dev container's eth0 IP, while
#             local checks use ::1/127.0.0.1. HOST=:: is a dual-stack wildcard
#             that covers all of them. (:8082 is deliberately NOT published in
#             docker-compose.yml — caddy reaches it over the compose network,
#             and editing that file would recreate `dev` and kill the stack.)
#
# Everything else must match the dev recipe: config is NOT env-based, it comes
# from YAML found via --config-dir/--data-dir resolved against process.cwd(),
# so the server has to run with cwd = components/frontend.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"

FRONTEND_DIR="$ROOT_DIR/components/frontend"
SERVER_ENTRY="build/service/index.js"
# The tunnel's own upstream. Must match the first `reverse_proxy` upstream in
# .devcontainer/Caddyfile.tunnel; :8081 stays with process-compose's vite.
PROD_PORT=8082
DEV_PORT=8081
CONFIG_DIR="./data/test/config"
DATA_DIR="./data/test"
# Same run/log location process-compose writes into (.output is gitignored).
RUN_DIR="$ROOT_DIR/.output/run"
PID_FILE="$RUN_DIR/frontend-prod.pid"
LOG_FILE="$RUN_DIR/frontend-prod-log"
# ORIGIN is baked in at launch and cannot be read back off the process, but
# anything that has to bounce this server (hackathon-e2e/scripts/run.sh) needs
# to put the same value back. Park it next to the pid.
ORIGIN_FILE="$RUN_DIR/frontend-prod.origin"

# Toolchain (just, process-compose, node, pnpm) — re-exec in the Nix dev shell
# when invoked from a plain shell (same trick as auth-wire.sh).
if ! command -v process-compose >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  if [ -n "${HACKAGON_TUNNEL_NIX_WRAPPED:-}" ]; then
    echo "error: toolchain not found even inside the Nix dev shell" >&2
    exit 1
  fi
  export HACKAGON_TUNNEL_NIX_WRAPPED=1
  cd "$ROOT_DIR"
  exec just nix::develop default bash "$HERE/$(basename "${BASH_SOURCE[0]}")" "$@"
fi

wait_for() { # <name> <timeout_s> <cmd...>
  local name="$1" timeout="$2" start
  shift 2
  start=$(date +%s)
  printf "  waiting for %-16s " "$name"
  until "$@" >/dev/null 2>&1; do
    if [ $(($(date +%s) - start)) -ge "$timeout" ]; then
      echo "FAILED (timeout after ${timeout}s)"
      return 1
    fi
    printf "."
    sleep 2
  done
  echo "ok"
}

# A PID alone is not proof: PIDs get recycled, and the file survives a crash.
# Only treat it as ours when the live process really is the built server.
is_prod_server() { # <pid>
  local pid="${1:-}"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null | grep -q "$SERVER_ENTRY"
}

prod_pid() {
  local pid=""
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  fi
  if is_prod_server "$pid"; then
    echo "$pid"
    return 0
  fi
  # Fall back to a scan: the pid file can be stale (or absent after a manual
  # launch), but a second copy of the server holding the port would be
  # invisible. `|| true` because pgrep exits 1 on no match and pipefail would
  # propagate it into the caller's `$(...)` assignment, which set -e turns into
  # an abort.
  { pgrep -f "$SERVER_ENTRY" 2>/dev/null | head -1; } || true
}

prod_html() { curl -fsS --max-time 5 "http://localhost:$PROD_PORT/" 2>/dev/null; }

# vite binds [::1] only, so ask for that directly rather than making curl walk
# a refused 127.0.0.1 first. The long budget is not paranoia: a cold `vite dev`
# SSRs the landing page in ~19s here, and a 5s probe reports "nothing is
# serving" for a dev server that is merely thinking.
dev_html() { curl -fsS --max-time 45 "http://[::1]:$DEV_PORT/" 2>/dev/null; }

# How to tell the two servers apart from their markup. The dev page pulls its
# client entry straight off disk through vite's `/@fs/` prefix (unbundled — the
# 150 requests this whole mode exists to avoid); the built page references
# hashed `/_app/immutable/` bundles. Note there is NO literal "@vite/client" in
# the document: SvelteKit's entry module imports it, the HTML does not.
DEV_MARKER="/@fs/"
PROD_MARKER="/_app/immutable/"

# ── start ───────────────────────────────────────────────────────────────────
cmd_start() {
  local origin="${1:-}" build=1
  shift || true
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-build) build=0 ;;
      *)
        echo "unknown argument: $1" >&2
        exit 2
        ;;
    esac
    shift
  done
  case "$origin" in
    http://* | https://*) ;;
    *)
      echo "usage: prod-serve.sh start <http(s)://public-url> [--no-build]" >&2
      echo "  the URL becomes ORIGIN — SvelteKit 403s every form POST whose" >&2
      echo "  Origin header does not match it." >&2
      exit 2
      ;;
  esac
  origin="${origin%/}"

  local existing
  existing="$(prod_pid)"
  if [ -n "$existing" ]; then
    echo "==> A built server is already on :$PROD_PORT (pid $existing) — restarting it."
    cmd_stop
  fi

  if [ "$build" -eq 1 ]; then
    echo "==> Building the frontend (pnpm run build:prod)..."
    (cd "$FRONTEND_DIR" && pnpm run build:prod)
  fi
  if [ ! -f "$FRONTEND_DIR/$SERVER_ENTRY" ]; then
    echo "error: $SERVER_ENTRY missing — run without --no-build." >&2
    exit 1
  fi

  # NOTHING is stopped here. process-compose keeps `vite dev` on :$DEV_PORT for
  # localhost work and for the e2e suites; this server owns :$PROD_PORT and the
  # two never meet. The socat bridge (.devcontainer/host-bridge.sh) is likewise
  # left alone: it binds the eth0 IP on :$DEV_PORT only, so the EADDRINUSE that
  # HOST=:: used to hit when both wanted :8081 cannot happen on a free port.

  mkdir -p "$RUN_DIR"
  : >"$LOG_FILE"
  echo "$origin" >"$ORIGIN_FILE"

  echo "==> Starting the built server (ORIGIN=$origin)..."
  # Args go on the command line, unmodified: src/lib/server/args.ts hands
  # process.argv to command-line-args BY IDENTITY, and the library only strips
  # the node+script pair for that exact array — rebuilding argv in a wrapper
  # makes it swallow --config-dir instead.
  (
    cd "$FRONTEND_DIR"
    PORT="$PROD_PORT" HOST="::" ORIGIN="$origin" AUTH_URL="$origin" \
      setsid node "$SERVER_ENTRY" --config-dir "$CONFIG_DIR" --data-dir "$DATA_DIR" \
      >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )

  # --max-time bounds each attempt: wait_for only checks its deadline BETWEEN
  # attempts, so a probe that never returns would defeat the 90s budget.
  if ! wait_for "built frontend" 90 curl -fsS -o /dev/null --max-time 10 "http://localhost:$PROD_PORT/"; then
    echo "error: the built server never answered on :$PROD_PORT." >&2
    echo "── $LOG_FILE (tail) ─────────────────────────────" >&2
    tail -40 "$LOG_FILE" >&2
    rm -f "$PID_FILE" "$ORIGIN_FILE"
    exit 1
  fi
  # setsid normally execs in place, but re-resolve anyway so `stop` never
  # chases a PID that belonged to the launcher.
  prod_pid >"$PID_FILE.tmp" && mv "$PID_FILE.tmp" "$PID_FILE"

  echo
  echo "Serving the PRODUCTION BUILD on :$PROD_PORT (pid $(cat "$PID_FILE"))."
  echo "  ORIGIN: $origin"
  echo "  log:    $LOG_FILE"
  echo "  tunnel: caddy prefers :$PROD_PORT, falls back to vite on :$DEV_PORT"
  echo "  stop:   prod-serve.sh stop  (vite on :$DEV_PORT is untouched either way)"
}

# ── stop ────────────────────────────────────────────────────────────────────
# Only stops the built server. It never owned :$DEV_PORT, so there is nothing to
# hand back — caddy notices :$PROD_PORT refusing connections and falls through
# to vite on its own.
cmd_stop() {
  local pid
  pid="$(prod_pid)"
  if [ -n "$pid" ]; then
    echo "==> Stopping the built server (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      is_prod_server "$pid" || break
      sleep 0.5
    done
    is_prod_server "$pid" && kill -9 "$pid" 2>/dev/null || true
  else
    echo "==> No built server running."
  fi
  rm -f "$PID_FILE" "$ORIGIN_FILE"
}

# ── status ──────────────────────────────────────────────────────────────────
# Both ports, because with a fallback upstream "is prod up?" and "what does the
# public link serve?" are no longer the same question.
cmd_status() {
  local pid prod dev
  pid="$(prod_pid)"
  prod="$(prod_html || true)"
  dev="$(dev_html || true)"

  if [ -n "$pid" ] && [ -n "$prod" ]; then
    echo ":$PROD_PORT  PRODUCTION BUILD (adapter-node, pid $pid)"
    echo "       origin: $(cat "$ORIGIN_FILE" 2>/dev/null || echo '(unknown)')"
    echo "       log:    $LOG_FILE"
  elif [ -n "$pid" ]; then
    echo ":$PROD_PORT  built server is RUNNING (pid $pid) but not answering"
  else
    echo ":$PROD_PORT  not running"
  fi

  if [ -n "$dev" ] && printf '%s' "$dev" | grep -q -- "$DEV_MARKER"; then
    echo ":$DEV_PORT  DEV SERVER (vite, via process-compose)"
  elif [ -n "$dev" ]; then
    echo ":$DEV_PORT  something is serving, but no '$DEV_MARKER' in the markup"
  else
    echo ":$DEV_PORT  not serving"
  fi

  if [ -n "$prod" ]; then
    echo "tunnel serves the PRODUCTION BUILD (caddy prefers :$PROD_PORT)"
    { printf '%s' "$prod" | grep -o "$PROD_MARKER[^\"]*" | head -1 |
      sed 's/^/       asset: /'; } || true
  elif [ -n "$dev" ]; then
    echo "tunnel falls back to the DEV SERVER on :$DEV_PORT"
    { printf '%s' "$dev" | grep -o "$DEV_MARKER[^\"]*" | head -1 |
      sed 's/^/       asset: /'; } || true
  else
    echo "tunnel has NO upstream — it will answer 502"
    return 1
  fi
}

# ── origin ──────────────────────────────────────────────────────────────────
# Machine-readable "is prod mode live, and with which ORIGIN?" — one place that
# knows, so callers do not re-implement the pid/cmdline check.
cmd_origin() {
  local pid origin
  pid="$(prod_pid)"
  [ -n "$pid" ] || return 1
  origin="$(cat "$ORIGIN_FILE" 2>/dev/null || true)"
  [ -n "$origin" ] || return 1
  echo "$origin"
}

case "${1:-}" in
  start)
    shift
    cmd_start "$@"
    ;;
  stop)
    shift
    cmd_stop "$@"
    ;;
  status)
    cmd_status
    ;;
  origin)
    cmd_origin
    ;;
  -h | --help | "")
    sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "unknown command: $1 (see --help)" >&2
    exit 2
    ;;
esac
