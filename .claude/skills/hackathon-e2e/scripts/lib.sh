# shellcheck shell=bash
# Shared helpers for the hackathon-e2e scripts. Source after setting HERE:
#   HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$HERE/lib.sh"

SKILL_DIR="$(dirname "$HERE")"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
STATE_DIR="$SKILL_DIR/.state"
GRPC_ADDR="${E2E_GRPC_ADDR:-localhost:3000}"
KEYCLOAK_URL="${E2E_KEYCLOAK_URL:-http://localhost:8180}"
FRONTEND_URL="${E2E_BASE_URL:-http://localhost:8081}"

# Everything here needs the repo toolchain (just, process-compose, grpcurl,
# pnpm, psql, jq — all provided by the Nix dev shell). When invoked from a
# plain shell, re-exec the calling script inside `just nix::develop default`.
# Usage: ensure_toolchain "${BASH_SOURCE[0]}" "$@"
ensure_toolchain() {
  local script="$1"
  shift
  if command -v process-compose >/dev/null 2>&1 && command -v grpcurl >/dev/null 2>&1; then
    return 0
  fi
  if [ -n "${HACKAGON_E2E_NIX_WRAPPED:-}" ]; then
    echo "error: toolchain not found even inside the Nix dev shell" >&2
    exit 1
  fi
  echo "==> Toolchain not on PATH — re-executing inside the Nix dev shell..."
  export HACKAGON_E2E_NIX_WRAPPED=1
  script="$(cd "$(dirname "$script")" && pwd)/$(basename "$script")"
  cd "$ROOT_DIR"
  exec just nix::develop default bash "$script" "$@"
}

# wait_for <name> <timeout_seconds> <cmd...> — poll until cmd succeeds.
wait_for() {
  local name="$1" timeout="$2"
  shift 2
  local start
  start=$(date +%s)
  printf "  waiting for %-12s " "$name"
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

# Access token for a dev-realm user via the password grant (same flow as
# `just rpc::as`).
keycloak_token() {
  local user="$1" password="$2"
  curl -s -X POST \
    "$KEYCLOAK_URL/realms/hackagon/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d client_id="hackagon-backend" \
    -d username="$user" \
    -d password="$password" \
    -d grant_type="password" \
    -d scope="openid profile" | jq -r ".access_token"
}
