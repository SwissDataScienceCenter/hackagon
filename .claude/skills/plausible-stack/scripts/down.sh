#!/usr/bin/env bash
# Stop the rig.
#
#   down.sh             stop the containers, keep the collected statistics
#   down.sh --volumes   …and delete the databases (Postgres AND ClickHouse)
#
# It also UNWIRES THE FRONTEND, and that is not tidiness. A wired app points at
# a tunnel hostname that stops existing the moment this script runs; leaving the
# block behind means every browser loading the app tries to fetch a tracker
# script from a dead host on every page. Nothing breaks visibly — which is
# exactly why it would stay that way.
#
# `.secrets.env` is never touched: after `--volumes` the next up.sh re-creates
# the same owner account from it, which is what makes a wipe recoverable.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
require_docker

VOLUMES=0
[ "${1:-}" = "--volumes" ] && VOLUMES=1

bash "$HERE/wire-frontend.sh" --restore || true

if [ "$VOLUMES" -eq 1 ]; then
  echo "==> stopping and deleting volumes"
  compose down -v --remove-orphans
  # The tunnel URL and the "which URL was this wired at" marker describe a
  # world that no longer exists.
  rm -f "$STATE/tunnel-url"
else
  echo "==> stopping (statistics kept)"
  compose down --remove-orphans
fi

echo "    done. Bring it back with: bash $HERE/up.sh"
[ "$VOLUMES" -eq 1 ] && echo "    (a new tunnel URL will be minted, and the owner account re-created from .secrets.env)"
exit 0
