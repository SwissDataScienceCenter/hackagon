#!/usr/bin/env bash
# Stop the devcontainer compose stack.
#   down.sh              # stop containers, keep volumes (nix store, devenv state)
#   down.sh --volumes    # ALSO delete the volumes — full cold-start next time
#                        # (re-downloads the entire Nix toolchain; ~minutes)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

require_docker
if [ "${1:-}" = "--volumes" ]; then
  echo "==> Stopping and REMOVING VOLUMES (nix store, devenv/postgres state)..."
  compose down --volumes
else
  echo "==> Stopping the devcontainer stack (volumes preserved)..."
  compose down
fi
echo "==> Done."
