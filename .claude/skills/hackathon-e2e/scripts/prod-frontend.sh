#!/usr/bin/env bash
# Serve the ADAPTER-NODE BUILD on :8081 for a suite run, when vite cannot.
#
# Why this exists: regenerating protos wipes ~260 files under
# src/lib/server/grpc/generated/, which invalidates that much of vite's
# transform cache. `src/` is on the 9p bind mount, so the first SSR request
# then takes tens of minutes while process-compose's readiness probe kills the
# process mid-warm-up — the log says "readiness check fail - signal: killed",
# which reads like a crash and is not one. The built output has no transform
# step and boots in seconds (smoke: 3.0m -> 1.4m).
#
# It had been hand-rolled at the prompt about six times, and every repetition
# hit the same three traps, so they are encoded here once:
#
#   HOST=::  collides with the socat bridge already on :8081 (EADDRINUSE).
#   HOST=127.0.0.1  binds an address `localhost` does not resolve to — inside
#                   this container localhost is ::1.
#   AUTH_URL  must accompany ORIGIN, or login completes and then does nothing.
#
# :8081 rather than :8082 because Keycloak's hackagon-dev client only allows
# redirect URIs on 8081; moving the app dies at login with
# "Invalid parameter: redirect_uri".
#
# Usage: prod-frontend.sh start [origin]   (default origin http://localhost:8081)
#        prod-frontend.sh stop
#        prod-frontend.sh ensure [origin]  start only if nothing serves :8081
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

FRONTEND_DIR="$ROOT_DIR/components/frontend"
PIDFILE="$ROOT_DIR/.output/run/e2e-prod-frontend.pid"
LOG="$ROOT_DIR/.output/run/e2e-prod-frontend.log"
PORT=8081
STORE="${HACKAGON_STORE_ENDPOINT:-http://rustfs:9000}"

serving() { curl -fsS -o /dev/null --max-time 5 "http://localhost:$PORT/" 2>/dev/null; }

# Deliberately NOT `ss`: iproute2 is not on PATH inside the Nix dev shell, so a
# check built on it silently reported "free" every time and the wait below was a
# no-op — which is how the EADDRINUSE race survived a fix aimed straight at it.
# Node itself is the authority on whether it can bind.
port_held() { return 1; }

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  # Anything else of ours holding the port — a run killed mid-flight leaves one.
  pkill -f "build/service/index.js" 2>/dev/null || true

  # Wait for the socket to actually be released. `kill` returns immediately and
  # node takes a moment to close its listener, so starting straight afterwards
  # raced and died with EADDRINUSE — which the caller then reported as "the
  # frontend did not come up", 300 seconds later and pointing at the wrong
  # thing entirely.
  for _ in $(seq 1 25); do
    port_held || return 0
    sleep 1
  done
  # Still held after 25s: escalate, then give it a last moment.
  pkill -9 -f "build/service/index.js" 2>/dev/null || true
  sleep 2
}

start() {
  local origin="${1:-http://localhost:$PORT}"
  mkdir -p "$(dirname "$PIDFILE")"
  stop

  if [ ! -f "$FRONTEND_DIR/build/service/index.js" ]; then
    echo "==> Building the frontend (no build/ yet)..."
    (cd "$FRONTEND_DIR" && pnpm build >/dev/null 2>&1)
  fi

  echo "==> Serving the built frontend on :$PORT (origin $origin)..."
  (
    cd "$FRONTEND_DIR"
    PORT="$PORT" HOST="::1" ORIGIN="$origin" AUTH_URL="$origin" \
      STORAGE_ENDPOINT="$STORE" \
      setsid nohup node build/service/index.js \
        --config-dir ./data/test/config --data-dir ./data/test \
        >"$LOG" 2>&1 &
    echo $! >"$PIDFILE"
  )

  for _ in $(seq 1 40); do
    serving && { echo "  ready"; return 0; }
    sleep 2
  done
  echo "error: the built frontend did not come up on :$PORT — see $LOG" >&2
  return 1
}

case "${1:-ensure}" in
  start) shift; start "${1:-}" ;;
  stop) stop; echo "stopped" ;;
  ensure)
    shift
    if serving; then echo "==> Something already serves :$PORT — leaving it alone."; else start "${1:-}"; fi
    ;;
  *) echo "usage: prod-frontend.sh [start|stop|ensure] [origin]" >&2; exit 1 ;;
esac
