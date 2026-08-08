#!/usr/bin/env bash
# Block until every service the tests rely on is answering. Fails loudly with
# the service name on timeout.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

TIMEOUT="${E2E_READY_TIMEOUT:-300}"

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
echo "==> Stack is ready."
