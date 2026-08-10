#!/usr/bin/env bash
# Preflight. OpenReplay's floor is 2 vCPU / 8 GB RAM / 50 GB disk on x86 —
# below it the backend services simply do not start, which looks like a hang
# rather than an error. Check before pulling ~25 images.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
fail=0; warn=0
ok()   { printf '  [x] %s\n' "$1"; }
bad()  { printf '  ✕   %s\n' "$1"; fail=1; }
soft() { printf '  !   %s\n' "$1"; warn=1; }

echo "── docker"
if docker info >/dev/null 2>&1; then ok "daemon reachable"; else bad "daemon not reachable"; fi
docker compose version >/dev/null 2>&1 && ok "compose v2" || bad "docker compose v2 required"

echo "── architecture"
arch=$(uname -m)
case "$arch" in
  x86_64|amd64) ok "$arch" ;;
  *) bad "$arch — OpenReplay images are x86 only; on Apple Silicon expect emulation or outright failure" ;;
esac

echo "── resources (as seen by the docker host)"
mem=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
memgb=$((mem / 1024 / 1024 / 1024))
if   [ "$memgb" -ge 8 ]; then ok "${memgb} GB RAM"
elif [ "$memgb" -gt 0 ]; then bad "${memgb} GB RAM — 8 GB is the documented minimum"
else soft "could not read MemTotal"; fi

cpus=$(docker info --format '{{.NCPU}}' 2>/dev/null || echo 0)
[ "$cpus" -ge 2 ] && ok "${cpus} vCPU" || bad "${cpus} vCPU — 2 is the minimum"

avail=$(df -Pk "$SKILL_DIR" 2>/dev/null | awk 'NR==2{print int($4/1024/1024)}')
[ -n "$avail" ] && { [ "$avail" -ge 50 ] && ok "${avail} GB free" || soft "${avail} GB free — 50 GB recommended"; }

echo "── ports"
for p in 80 443; do
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$p "; then
    soft "port $p in use (harmless: the overlay publishes no host ports)"
  else ok "port $p free"; fi
done

echo "── conflicts"
if docker ps --format '{{.Names}}' | grep -q hackagon; then
  soft "the hackagon dev container is running — OpenReplay wants 8 GB *on top* of it"
fi

echo ""
[ "$fail" -eq 0 ] && echo "Preflight passed$([ "$warn" -eq 1 ] && echo " (with warnings)")." \
                  || { echo "Preflight FAILED — fix the ✕ items first."; exit 1; }
