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

case "${1:-}" in
  --tunnel)
    compose stop tunnel && rm -f "$STATE/tunnel-url"
    echo "tunnel stopped — the public URL is gone; the stack is still running." ;;
  --volumes)
    echo "==> stopping and DELETING ALL VOLUMES (recorded sessions included)…"
    compose down --volumes --remove-orphans
    rm -f "$STATE/tunnel-url" "$STATE/env.prepared"
    echo "done. Next up.sh re-randomizes secrets and re-runs migrations." ;;
  *)
    compose down --remove-orphans
    rm -f "$STATE/tunnel-url"
    echo "stopped (data volumes kept)." ;;
esac
