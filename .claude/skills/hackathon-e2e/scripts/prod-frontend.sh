#!/usr/bin/env bash
# Serve the ADAPTER-NODE BUILD on :8081 for a suite run, IN PLACE OF vite.
#
# Why this exists: regenerating protos wipes ~260 files under
# src/lib/server/grpc/generated/, which invalidates that much of vite's
# transform cache. `src/` is on the 9p bind mount, so the first SSR request
# then takes tens of minutes while process-compose's readiness probe kills the
# process mid-warm-up — the log says "readiness check fail - signal: killed",
# which reads like a crash and is not one. Measured 2026-08-08 on a freshly
# booted vite here: `curl /` returned 0 bytes after FIVE MINUTES. The built
# output has no transform step and boots in seconds (smoke: 3.0m -> 1.4m).
#
# "IN PLACE OF" is the load-bearing word. process-compose's `frontend` process
# IS `vite dev`, and it binds exactly the address this script wants:
# [::1]:8081. `just deploy::down` does not free that port either — it only
# kills :8180 and :3000 — so a vite can also outlive its supervisor. Without
# stop_vite() below, node dies in its first second with
#
#   Error: listen EADDRINUSE: address already in use ::1:8081
#
# and the caller then spends 300s waiting for a "frontend that did not come
# up", pointing at the built server when the culprit is vite. Worse, it was a
# RACE — vite binds ~35s after process-compose starts it, so whoever got there
# first won, and the identical command passed for one suite and failed for the
# next. Stopping vite explicitly is what makes a run deterministic.
#
# The other three traps, each hit repeatedly before being encoded here:
#
#   HOST=::  collides with the socat bridge already on :8081 (EADDRINUSE).
#   HOST=127.0.0.1  binds an address `localhost` does not resolve to — inside
#                   this container localhost is ::1.
#   AUTH_URL  must accompany ORIGIN, or login completes and then does nothing.
#
# :8081 rather than :8082 because Keycloak's hackagon-dev client only allows
# redirect URIs on 8081; moving the app dies at login with
# "Invalid parameter: redirect_uri". :8082 belongs to the cloudflare-tunnel
# skill's own built server, which is why everything here is scoped to servers
# launched with PORT=8081 — a blanket `pkill -f build/service/index.js` also
# killed the tunnel's upstream, and nothing ever restarted it.
#
# Usage: prod-frontend.sh start [origin]   (default origin http://localhost:8081)
#        prod-frontend.sh stop
#        prod-frontend.sh ensure [origin]  start unless OUR server already serves
set -euo pipefail
# `set -e` aborts silently, and this script's failures have now been
# mis-attributed twice — once to the built server when vite held the port, once
# to "the frontend did not come up" when the server was up and a helper had
# merely returned non-zero. Say which line gave up.
trap 'echo "prod-frontend.sh: aborted at line $LINENO (status $?)" >&2' ERR
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

FRONTEND_DIR="$ROOT_DIR/components/frontend"
ENTRY="build/service/index.js"
PIDFILE="$ROOT_DIR/.output/run/e2e-prod-frontend.pid"
LOG="$ROOT_DIR/.output/run/e2e-prod-frontend.log"
# The build log belongs to the build, which is shared — see FRONTEND_BUILD below.
# Written by `just deploy::up` (tools/deploy/process-compose/justfile); holds
# the path of the process-compose control socket.
PC_SOCKET_FILE="$ROOT_DIR/tools/deploy/process-compose/.socket-path-test-services"
PORT=8081
STORE="${HACKAGON_STORE_ENDPOINT:-http://rustfs:9000}"

serving() { curl -fsS -o /dev/null --max-time 5 "http://localhost:$PORT/" 2>/dev/null; }

# Node is the authority on whether it can bind, so ask it the same question the
# server is about to ask. Deliberately NOT `ss`: iproute2 is not on PATH inside
# the Nix dev shell, so a check built on it silently reported "free" every time
# and the wait below was a no-op — which is how the EADDRINUSE race survived a
# fix aimed straight at it. Binding ::1 specifically also ignores the socat
# bridge, which holds 172.26.0.7:8081 (IPv4) for the whole life of the
# container and must not read as a conflict.
port_held() {
  node -e '
const net = require("net");
const s = net.createServer();
s.once("error", (e) => process.exit(e.code === "EADDRINUSE" ? 0 : 1));
s.once("listening", () => s.close(() => process.exit(1)));
s.listen(Number(process.argv[1]), "::1");
' "$PORT" 2>/dev/null
}

# Our servers only: same entrypoint as the tunnel's :8082 server, told apart by
# the PORT it was launched with.
our_servers() {
  local pid
  for pid in $({ pgrep -f "$ENTRY" 2>/dev/null || true; }); do
    if tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | grep -qx "PORT=$PORT"; then
      echo "$pid"
    fi
  done
  return 0
}

ours_is_up() {
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null | grep -q "$ENTRY"
}

# setsid forks, so $! can be the launcher rather than the server. Re-resolve, or
# `stop` chases a PID that has already exited and leaves the real one holding
# the port.
resolve_pid() {
  # Deliberately no `| head -1`. With `set -o pipefail`, head exiting after the
  # first line SIGPIPEs our_servers, the pipeline reports 141, the assignment
  # inherits it and `set -e` exits the script — one line after the server came
  # up healthy, so the caller sees a dead harness and a perfectly good server.
  # Take the first line in the shell instead, and never fail: a pid we could not
  # resolve is a worse `stop`, not a reason to abort a working start.
  local pids
  pids="$(our_servers)" || true
  pids="${pids%%$'\n'*}"
  [ -n "$pids" ] && echo "$pids" >"$PIDFILE"
  return 0
}

# Put process-compose's `frontend` (vite) DOWN and keep it down.
#
# This is not tidiness — an un-stopped vite next to our server on :8081 is the
# single most expensive failure mode this container has. vite cannot bind, exits
# 1, and `availability.restart` sends it round again; each round is a full
# `just develop` = `nix develop` on a DIRTY worktree, which takes the repo-wide
# fetch lock on `git+file:///workspaces/hackagon`. Measured 2026-08-13: 44 s to
# enter that shell unopposed, 80 s with one competitor, and a stack found in
# this state had 54 restarts in 50 minutes — a lock acquisition every ~55 s,
# forever. Everything else that enters the shell then queues behind it: the
# backend's own start command is `just develop just run`, and its readiness
# budget is spent WAITING FOR NIX rather than on the server. When the budget
# runs out process-compose SIGTERMs it, the Go server shuts down gracefully,
# exit code 0 — which `restart: on_failure` does not consider a failure, so the
# backend stays down and everything downstream reads as connection refused.
#
# It is invisible from `process list`, which reported `frontend Running Ready`
# throughout: the readiness probe is `curl http://localhost:8081` and OUR server
# was answering it. The probe measures the PORT, not the PROCESS.
stop_vite() {
  local sock
  sock="$(cat "$PC_SOCKET_FILE" 2>/dev/null || true)"
  if [ -n "$sock" ] && [ -S "$sock" ]; then
    process-compose --unix-socket "$sock" process stop frontend >/dev/null 2>&1 || true
  fi
  # A deliberate stop is not a failure, so `restart: on_failure` leaves it down.
  # The pkill is for the orphan case: `just deploy::down` pkills
  # process-compose without freeing :8081, and the socket file is gone by then.
  pkill -f "vite.js dev" 2>/dev/null || true
}

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  # Anything else of ours holding the port — a run killed mid-flight leaves one.
  local pid
  for pid in $(our_servers); do kill "$pid" 2>/dev/null || true; done
  stop_vite

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
  for pid in $(our_servers); do kill -9 "$pid" 2>/dev/null || true; done
  pkill -9 -f "vite.js dev" 2>/dev/null || true
  sleep 2
}

# vite served source; the build is a snapshot, so it has to be rebuilt when the
# source moved under it. Skipping this is how a suite silently tests yesterday's
# frontend and reports green.
#
# Both the question and the build now live in .claude/skills/lib/frontend-build.sh,
# because this script is not the only caller: cloudflare-tunnel/prod-serve.sh
# builds and serves the SAME build/service tree on :8082. Two concurrent
# `pnpm build`s into one output directory is not a theoretical race — it
# corrupted that tree three times in one day (`Unexpected end of JSON input`,
# then a missing build/service/server/index.js at boot). The helper holds an
# exclusive lock and swaps a COMPLETE tree into place; nothing here needs to
# know that, which is the point.
FRONTEND_BUILD="$ROOT_DIR/.claude/skills/lib/frontend-build.sh"
needs_build() {
  bash "$FRONTEND_BUILD" stale
}

launch() {
  local origin="$1"
  (
    cd "$FRONTEND_DIR"
    PORT="$PORT" HOST="::1" ORIGIN="$origin" AUTH_URL="$origin" \
      STORAGE_ENDPOINT="$STORE" \
      setsid nohup node "$ENTRY" \
        --config-dir ./data/test/config --data-dir ./data/test \
        >"$LOG" 2>&1 &
    echo $! >"$PIDFILE"
  )
}

wait_serving() {
  for _ in $(seq 1 30); do
    serving && return 0
    # The server exits in its first second on EADDRINUSE. Sitting out the full
    # 60s for a process that is already dead is what buried the real error.
    grep -q "EADDRINUSE" "$LOG" 2>/dev/null && return 1
    sleep 2
  done
  return 1
}

start() {
  local origin="${1:-http://localhost:$PORT}" attempt
  mkdir -p "$(dirname "$PIDFILE")"
  stop

  # `if-stale` re-asks the question INSIDE the lock, so two harnesses starting at
  # once produce one build and the loser serves it rather than rebuilding over
  # the winner. Do not hoist the staleness check back out here.
  if ! bash "$FRONTEND_BUILD" if-stale; then
    echo "error: the frontend build failed — see $ROOT_DIR/.output/run/frontend-build.log" >&2
    return 1
  fi

  for attempt in 1 2 3; do
    echo "==> Serving the built frontend on :$PORT (origin $origin)..."
    launch "$origin"
    if wait_serving; then
      resolve_pid
      echo "  ready"
      return 0
    fi
    grep -q "EADDRINUSE" "$LOG" 2>/dev/null || break
    echo "  :$PORT is still held by something else — freeing it (attempt $attempt/3)" >&2
    stop
  done

  echo "error: the built frontend did not come up on :$PORT — see $LOG" >&2
  echo "── $LOG (tail) ─────────────────────────────" >&2
  tail -30 "$LOG" >&2
  return 1
}

case "${1:-ensure}" in
  start)
    shift
    start "${1:-}"
    ;;
  stop)
    stop
    echo "stopped"
    ;;
  ensure)
    shift
    # "Something answers :8081" is not enough: a cold vite that happens to reply
    # inside the probe window is still unusable for a suite, and a build that
    # predates the last source edit is worse than useless. Only OUR server, up
    # and current, is left alone.
    if ours_is_up && serving && ! needs_build; then
      echo "==> The built frontend already serves :$PORT — leaving it alone."
      # "Leaving it alone" is about OUR server, never about vite. This branch
      # used to return without touching process-compose at all, and that is the
      # whole of how the crash loop documented above survived: `just deploy::up`
      # starts vite on every boot, our server already holds :8081 whenever a
      # previous run left one up (the common case — nothing stops it between
      # runs), vite therefore exits 1 and is restarted forever, and this fast
      # path was the one place that would have stopped it. `stop_vite` is
      # idempotent and costs one socket call, so it is unconditional now.
      stop_vite
    else
      start "${1:-}"
    fi
    ;;
  *)
    echo "usage: prod-frontend.sh [start|stop|ensure] [origin]" >&2
    exit 1
    ;;
esac
