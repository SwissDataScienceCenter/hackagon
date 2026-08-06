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
if ! wait_for "frontend" "$TIMEOUT" curl -fsS "$FRONTEND_URL"; then
  echo ""
  echo "  The frontend did not come up on $FRONTEND_URL." >&2
  echo "  If it is not part of the process-compose stack, start it manually:" >&2
  echo "    cd components/frontend && just serve" >&2
  exit 1
fi
echo "==> Stack is ready."
