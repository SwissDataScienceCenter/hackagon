#!/usr/bin/env bash
# The rig's current URLs. Reads cloudflared's log rather than the state file:
# a tunnel that was restarted has a new public URL and the same state file, and
# a stale URL fails SILENTLY — the tracker keeps posting into nothing.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

url="$(tunnel_url || true)"
if [ -z "$url" ]; then
  echo "no tunnel running — bash $HERE/up.sh" >&2
  exit 1
fi

echo "$url"
if [ "${1:-}" = "--all" ]; then
  echo "local     $(local_url)"
  echo "cached    $(cat "$STATE/tunnel-url" 2>/dev/null || echo '-')"
  echo "BASE_URL  $(env_get BASE_URL)"
fi
