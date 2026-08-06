#!/usr/bin/env bash
# Reset-to-zero: stop the stack and wipe all Postgres + Keycloak state, so the
# next boot is deterministic (realm re-imported from the checked-in JSON,
# empty database, casbin admin re-bootstrapped from config).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

echo "==> Stopping services..."
(cd "$ROOT_DIR" && just deploy::down) || true

echo "==> Wiping Postgres + Keycloak state..."
(cd "$ROOT_DIR" && just clean::state)

# Cross-act journey state is only meaningful for the DB it was created on.
rm -f "$STATE_DIR/journey.json"

echo "==> Reset complete."
