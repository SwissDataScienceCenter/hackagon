#!/usr/bin/env bash
# Block until every service the tests rely on is answering. Fails loudly with
# the service name on timeout.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

TIMEOUT="${E2E_READY_TIMEOUT:-300}"

# A crash-looping service is not a "ready" stack, and process-compose will not
# tell you unasked.
#
# On 2026-08-13 this stack ran for 50 minutes with its `frontend` process at 54
# restarts — vite exiting 1 on "Port 8081 is already in use" roughly once a
# minute, each round a full `just develop`, i.e. one acquisition of the repo-wide
# `git+file:///workspaces/hackagon` fetch lock. That starved every other startup
# on the machine; the backend's own start command is `just develop just run` and
# its readiness budget is spent WAITING FOR NIX. When the budget ran out
# process-compose SIGTERMed a perfectly healthy backend, which exited 0, which
# `restart: on_failure` did not treat as a failure — so it stayed down and the
# suite reported connection-refused failures at four different points in four
# runs.
#
# Nothing reported any of it. `process list` said `frontend Running Ready`
# because the readiness probe is a GET of :8081 and the OTHER server was
# answering — a probe on a PORT cannot say which PROCESS holds it. The RESTARTS
# column said 54 the whole time and no one read it. This reads it.
#
# A warning rather than a hard failure: a restart or two during boot is normal
# (`restart: on_failure` retrying a service whose dependency was a second late),
# and refusing to run the suite over that would be its own kind of flake. What is
# never normal is a number that keeps climbing, so print the count AND the exit
# code, which together name the cause.
report_restarts() {
  local sock pc line name restarts exitcode noisy=0
  sock="$(cat "$ROOT_DIR/tools/deploy/process-compose/.socket-path-test-services" 2>/dev/null || true)"
  [ -n "$sock" ] && [ -S "$sock" ] || return 0
  command -v process-compose >/dev/null 2>&1 || return 0
  pc="$(process-compose --unix-socket "$sock" process list -o wide 2>/dev/null || true)"
  [ -n "$pc" ] || return 0
  while read -r line; do
    name="$(echo "$line" | awk '{print $2}')"
    # RESTARTS and EXITCODE are the LAST TWO columns, counted from the end on
    # purpose: HEALTH is "Not Ready" — TWO whitespace-separated words — for every
    # service that is starting up, so fixed field numbers ($6/$7) read the health
    # text as the restart count on exactly the rows worth reading. Counting from
    # NF is stable across both widths, and "Disabled" rows (`- -`) too.
    restarts="$(echo "$line" | awk '{print $(NF - 1)}')"
    exitcode="$(echo "$line" | awk '{print $NF}')"
    case "$restarts" in '' | *[!0-9]*) continue ;; esac
    if [ "$restarts" -ge 3 ]; then
      echo "  ⚠ $name has restarted $restarts times (last exit code $exitcode)." >&2
      noisy=1
    fi
  done <<EOF
$(echo "$pc" | awk 'NR>1 && NF>=7')
EOF
  if [ "$noisy" -eq 1 ]; then
    echo "  ⚠ A service that keeps restarting is a service whose every attempt" >&2
    echo "    re-enters the Nix dev shell and takes the repo-wide fetch lock," >&2
    echo "    which starves the startup of everything else. Check its log under" >&2
    echo "    .output/run/process-compose/ before trusting this run's results." >&2
  fi
}

echo "==> Waiting for the stack to be ready (timeout ${TIMEOUT}s per service)..."
wait_for "postgres" "$TIMEOUT" pg_isready -h 127.0.0.1 -p 5432 -U postgres
wait_for "keycloak" "$TIMEOUT" curl -fsS \
  "$KEYCLOAK_URL/realms/hackagon/.well-known/openid-configuration"
wait_for "backend" "$TIMEOUT" grpcurl -plaintext "$GRPC_ADDR" list
# vite is unusable here — see prod-frontend.sh for why, and for the traps in
# starting the built server by hand. This is UNCONDITIONAL: the guard used to be
# "leave it alone if anything answers within 5s", which handed the run to a cold
# `vite dev` whenever it happened to reply in time, and left it holding
# [::1]:8081 against the built server whenever it did not.
#
# No `|| true` either. Swallowing the failure meant the real error (EADDRINUSE,
# printed the moment it happened) was followed by 300s of polling and a closing
# message blaming the frontend for not starting.
bash "$HERE/prod-frontend.sh" ensure "$FRONTEND_URL"

# --max-time is load-bearing, not belt-and-braces. wait_for checks its deadline
# BETWEEN attempts, so a probe that never returns defeats the timeout entirely:
# with a cold `vite dev` holding :8081 this curl blocked for 15+ minutes on a
# single attempt, printing not one dot, and the run looked hung rather than
# failed. Bound every attempt so the deadline can actually be reached.
if ! wait_for "frontend" "$TIMEOUT" curl -fsS --max-time 10 "$FRONTEND_URL"; then
  echo ""
  echo "  The frontend did not come up on $FRONTEND_URL." >&2
  echo "  If it is not part of the process-compose stack, start it manually:" >&2
  echo "    cd components/frontend && just serve" >&2
  exit 1
fi
# After everything answers, not before: a restart count taken mid-boot is mostly
# noise, and the question this answers is "is what I am about to test stable".
report_restarts
echo "==> Stack is ready."
