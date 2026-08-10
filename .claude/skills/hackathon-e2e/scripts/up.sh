#!/usr/bin/env bash
# Start the full stack (Keycloak + Postgres + backend + frontend) detached via
# process-compose. Safe to call when already running (no-op).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

echo "==> Starting services (process-compose, detached)..."
(cd "$ROOT_DIR" && just deploy::up)
