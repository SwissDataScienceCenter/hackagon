#!/usr/bin/env bash
# Print the current public URL (live from the tunnel's log, not the cached one).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
require_docker

url="$(tunnel_url || true)"
if [ -z "$url" ]; then
    echo "no tunnel running (start it with scripts/up.sh)" >&2
    [ -f "$STATE/tunnel-url" ] && echo "last known: $(cat "$STATE/tunnel-url")" >&2
    exit 1
fi
echo "$url"
[ "${1:-}" = "--all" ] && {
    echo "$url/signup"
    echo "$url/ingest"
}
