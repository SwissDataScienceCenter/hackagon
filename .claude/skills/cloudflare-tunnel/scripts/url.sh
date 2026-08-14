#!/usr/bin/env bash
# Print the public URL(s) of running quick tunnels.
set -euo pipefail
found=0
for name in $(docker ps --format '{{.Names}}' | grep -E '^cf-quicktunnel-|tunnel' || true); do
    url=$(docker logs "$name" 2>&1 | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1 || true)
    if [ -n "$url" ]; then
        echo "$name: $url"
        found=1
    fi
done
[ "$found" -eq 1 ] || {
    echo "no running quick tunnels found" >&2
    exit 1
}
