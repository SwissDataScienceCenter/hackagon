#!/usr/bin/env bash
# Fetch upstream's scripts/docker-compose/ tree into vendor/ (sparse, depth-1)
# and record the exact commit in vendor/UPSTREAM.txt so a fetch is reproducible.
#
# Upstream's own install.sh is NOT run: it prompts for a domain, needs sudo,
# and ends by starting everything. up.sh does the same preparation
# non-interactively (secret randomization + CADDY_DOMAIN) and keeps control.
#
# Usage: fetch-upstream.sh [--force]      env: OPENREPLAY_REF=v1.2.3
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

[ "${1:-}" = "--force" ] && rm -rf "$VENDOR"
if [ -f "$VENDOR/docker-compose.yaml" ]; then
  echo "already fetched: $(cat "$VENDOR/UPSTREAM.txt" 2>/dev/null | head -1)"
  echo "(use --force to refetch)"
  exit 0
fi

command -v git >/dev/null || { echo "error: git not found" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "==> cloning $UPSTREAM_REPO @ $UPSTREAM_REF (sparse)…"
# Everything relative, inside $tmp. lib.sh exports MSYS_NO_PATHCONV=1 for
# docker's sake, which stops Git Bash translating POSIX paths for Windows
# binaries — so git.exe would put an absolute /tmp/... clone somewhere this
# shell cannot see. Relative paths sidestep it on every platform.
(
  cd "$tmp"
  git clone --depth 1 --filter=blob:none --sparse --branch "$UPSTREAM_REF" \
    "$UPSTREAM_REPO" or 2>&1 | tail -1
  cd or
  git sparse-checkout set scripts/docker-compose
  git rev-parse HEAD > ../SHA
)
sha="$(cat "$tmp/SHA")"
[ -d "$tmp/or/scripts/docker-compose" ] || {
  echo "error: sparse checkout produced no scripts/docker-compose tree" >&2; exit 1; }

mkdir -p "$VENDOR"
cp -r "$tmp/or/scripts/docker-compose/." "$VENDOR/"
{
  echo "$UPSTREAM_REPO @ $UPSTREAM_REF"
  echo "commit $sha"
  echo "fetched $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$VENDOR/UPSTREAM.txt"

echo "==> vendored $(find "$VENDOR" -type f | wc -l) files at ${sha:0:12}"
echo "    $VENDOR"
