#!/usr/bin/env bash
# Preflight. Cheaper than discovering the same facts three images into a pull.
#
# Plausible's own floor is modest (upstream README: 2 GB RAM for ClickHouse +
# Plausible), which is a third of what the openreplay rig wants — the two
# CAN coexist on this machine, and the measured numbers are in SKILL.md.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
fail=0
warn=0
ok() { printf '  [x] %s\n' "$1"; }
bad() {
  printf '  ✕   %s\n' "$1"
  fail=1
}
soft() {
  printf '  !   %s\n' "$1"
  warn=1
}

echo "── docker"
if docker info >/dev/null 2>&1; then ok "daemon reachable"; else bad "daemon not reachable"; fi
docker compose version >/dev/null 2>&1 && ok "compose v2" || bad "docker compose v2 required"

echo "── architecture"
arch=$(uname -m)
case "$arch" in
  x86_64 | amd64 | aarch64 | arm64) ok "$arch (ClickHouse needs SSE4.2 or NEON)" ;;
  *) bad "$arch — ClickHouse requires SSE 4.2 (x86) or NEON (arm)" ;;
esac

echo "── resources (as seen by the docker host)"
mem=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
memgb=$((mem / 1024 / 1024 / 1024))
if [ "$memgb" -ge 4 ]; then
  ok "${memgb} GB RAM"
elif [ "$memgb" -gt 0 ]; then
  soft "${memgb} GB RAM — 2 GB is upstream's floor, and that is for Plausible ALONE"
else soft "could not read MemTotal"; fi

cpus=$(docker info --format '{{.NCPU}}' 2>/dev/null || echo 0)
[ "$cpus" -ge 2 ] && ok "${cpus} vCPU" || soft "${cpus} vCPU"

avail=$(df -Pk "$SKILL_DIR" 2>/dev/null | awk 'NR==2{print int($4/1024/1024)}')
[ -n "$avail" ] && { [ "$avail" -ge 10 ] && ok "${avail} GB free" || soft "${avail} GB free — 10 GB recommended"; }

echo "── ports"
# The only host port this stack takes. Something else on it does not merely
# collide: `compose up` fails after the databases have started, which reads as
# a stack failure rather than a port clash.
# `ss` on Linux, `netstat` on a Windows host — and when NEITHER is available,
# say so rather than printing "free". A probe that cannot run and a probe that
# found nothing look identical from the outside, and only one of them is
# information.
listeners() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ano 2>/dev/null | grep -i listen
  else
    return 1
  fi
}
if ports="$(listeners)"; then
  if printf '%s\n' "$ports" | grep -qE "[:.]$LOCAL_PORT[[:space:]]"; then
    # Ours holding it is fine; anything else is not.
    if docker ps --format '{{.Names}} {{.Ports}}' | grep -q ":$LOCAL_PORT->"; then
      ok "port $LOCAL_PORT held by a container (this stack, presumably)"
    else
      bad "port $LOCAL_PORT in use by something else — set PLAUSIBLE_PORT"
    fi
  else
    ok "port $LOCAL_PORT free"
  fi
else
  soft "no ss/netstat here — could not check whether port $LOCAL_PORT is free"
fi

echo "── neighbours"
if docker ps --format '{{.Names}}' | grep -qx 'clickhouse'; then
  soft "the openreplay rig is running — it has its OWN ClickHouse; this one is separate (~1 GB more)"
fi

# ── a stack that is up: is ALL of it up? ───────────────────────────────────
# `docker compose ps` shows what IS there and says nothing about what is not.
# A service whose container was removed reads exactly like a service that was
# never meant to run — that is how openreplay's `sink` went missing while every
# client-side check stayed green.
if [ -f "$VENDOR/compose.yml" ] && [ -n "$(compose ps -q 2>/dev/null)" ]; then
  echo "── running stack"
  missing=""
  running="$(compose ps --format '{{.Service}}' 2>/dev/null | sort -u)"
  while IFS= read -r svc; do
    [ -n "$svc" ] || continue
    printf '%s\n' "$running" | grep -qx "$svc" || missing="$missing $svc"
  done <<EOF
$(compose config --services 2>/dev/null | sort -u)
EOF
  if [ -n "$missing" ]; then
    bad "not running:$missing — start them with: bash $HERE/up.sh"
  else
    ok "every compose service has a running container"
  fi
fi

echo ""
[ "$fail" -eq 0 ] && echo "Preflight passed$([ "$warn" -eq 1 ] && echo " (with warnings)")." ||
  {
    echo "Preflight FAILED — fix the ✕ items first."
    exit 1
  }
