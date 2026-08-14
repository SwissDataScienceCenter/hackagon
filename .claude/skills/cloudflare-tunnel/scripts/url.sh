#!/usr/bin/env bash
# Print the public URL(s) of running tunnels — named and quick.
#
# Read off the RUNNING containers, never off a state file: a quick tunnel that
# restarted has a new URL and the same state file, and a named tunnel that is
# not running has a hostname that resolves to a 1033 error page. Both failures
# are silent from a cached value.
set -euo pipefail
found=0

# Named tunnels carry their hostname as a container label (see
# lib/cf-named-tunnel.sh) — the label is written at `docker run` time from the
# same value the DNS record was pointed at.
for name in $(docker ps --format '{{.Names}}' | grep -E '^cf-named-' || true); do
  host=$(docker inspect "$name" \
    --format '{{index .Config.Labels "hackagon.tunnel.hostname"}}' 2>/dev/null || true)
  if [ -n "$host" ]; then
    echo "$name: https://$host"
    found=1
  fi
done

for name in $(docker ps --format '{{.Names}}' | grep -E '^cf-quicktunnel-|tunnel' || true); do
  url=$(docker logs "$name" 2>&1 | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1 || true)
  if [ -n "$url" ]; then
    echo "$name: $url"
    found=1
  fi
done

[ "$found" -eq 1 ] || {
  echo "no running tunnels found" >&2
  exit 1
}
