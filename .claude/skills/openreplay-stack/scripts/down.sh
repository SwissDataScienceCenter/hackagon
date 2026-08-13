#!/usr/bin/env bash
# Stop the stack.
#   down.sh              stop containers, keep data (pgdata, clickhouse, minio…)
#   down.sh --volumes    ALSO delete every volume — all recorded sessions go
#   down.sh --tunnel     stop only the tunnel (kills the public URL, app stays up)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
require_docker
require_vendor

# `up.sh` starts with COMPOSE_PROFILES=migration, so the four migration
# containers (fs-permission, minio-migration, db-migration,
# clickhouse-migration) exist. `down` WITHOUT that profile leaves every one of
# them behind, and `--remove-orphans` does not help: a profile-gated service is
# not an orphan, it is simply out of scope.
#
# Left behind, they keep a reference to the network compose just deleted, and
# the next `up` fails on
#   failed to set up container networking: network <id> not found
# for a network nobody can see any more — a stale ID with no name attached,
# which reads as a docker bug rather than a leftover container.
export COMPOSE_PROFILES=migration

case "${1:-}" in
--tunnel)
    compose stop tunnel && rm -f "$STATE/tunnel-url"
    echo "tunnel stopped — the public URL is gone; the stack is still running."
    ;;
--volumes)
    echo "==> stopping and DELETING ALL VOLUMES (recorded sessions included)…"
    compose down --volumes --remove-orphans
    rm -f "$STATE/tunnel-url" "$STATE/env.prepared"
    echo "done. Next up.sh re-randomizes secrets, re-runs migrations, and"
    echo "re-creates the admin account from .secrets.env (kept on purpose)."
    ;;
*)
    compose down --remove-orphans
    rm -f "$STATE/tunnel-url"
    echo "stopped (data volumes kept)."
    ;;
esac
