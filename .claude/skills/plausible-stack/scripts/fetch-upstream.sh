#!/usr/bin/env bash
# Fetch upstream's compose.yml + clickhouse/ into vendor/ and record the exact
# commit in vendor/UPSTREAM.txt, so a fetch is reproducible.
#
# Upstream's README is a manual quick-start (edit .env by hand, then
# `docker compose up -d`, then create the first user in a browser). up.sh does
# the same preparation non-interactively and keeps control — same relationship
# openreplay-stack has with upstream's install.sh.
#
# The COMPOSE FILE IS THE VERSION. `ghcr.io/plausible/community-edition:v3.2.1`
# is written inside it, so the ref pinned here and the release running are one
# decision rather than two that can drift.
#
# Usage: fetch-upstream.sh [--force]      env: PLAUSIBLE_REF=v3.2.1
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

[ "${1:-}" = "--force" ] && rm -rf "$VENDOR"
if [ -f "$VENDOR/compose.yml" ]; then
  echo "already fetched: $(head -1 "$VENDOR/UPSTREAM.txt" 2>/dev/null)"
  echo "(use --force to refetch)"
  exit 0
fi

command -v git >/dev/null || {
  echo "error: git not found" >&2
  exit 1
}
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "==> cloning $UPSTREAM_REPO @ $UPSTREAM_REF…"
# Everything relative, inside $tmp. lib.sh exports MSYS_NO_PATHCONV=1 for
# docker's sake, which stops Git Bash translating POSIX paths for Windows
# binaries — so git.exe would put an absolute /tmp/... clone somewhere this
# shell cannot see. Relative paths sidestep it on every platform.
#
# `-c core.autocrlf=false -c core.eol=lf`: these files are read by LINUX
# containers, not by the host. ClickHouse's XML survives CRLF, but a compose
# file with CR line endings puts a trailing CR inside every unquoted scalar —
# which is how `BASE_URL` acquires an invisible character and Plausible starts
# generating links to a hostname nothing resolves. Same class of failure that
# cost openreplay-stack an afternoon of S3 signature mismatches.
(
  cd "$tmp"
  git -c core.autocrlf=false -c core.eol=lf \
    clone --depth 1 --branch "$UPSTREAM_REF" --single-branch \
    "$UPSTREAM_REPO" ce 2>&1 | tail -1
  cd ce
  git rev-parse HEAD >../SHA
)
sha="$(cat "$tmp/SHA")"
[ -f "$tmp/ce/compose.yml" ] || {
  echo "error: no compose.yml at $UPSTREAM_REF" >&2
  exit 1
}
[ -d "$tmp/ce/clickhouse" ] || {
  echo "error: no clickhouse/ config dir at $UPSTREAM_REF — compose bind-mounts it" >&2
  exit 1
}

mkdir -p "$VENDOR"
cp "$tmp/ce/compose.yml" "$VENDOR/compose.yml"
cp -r "$tmp/ce/clickhouse" "$VENDOR/clickhouse"
cp "$tmp/ce/README.md" "$VENDOR/README.md" 2>/dev/null || true
{
  echo "$UPSTREAM_REPO @ $UPSTREAM_REF"
  echo "commit $sha"
  echo "fetched $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "image   $(grep -oE 'ghcr.io/plausible/community-edition:[^ ]*' "$VENDOR/compose.yml" | head -1)"
} >"$VENDOR/UPSTREAM.txt"

echo "==> vendored $(find "$VENDOR" -type f | wc -l) files at ${sha:0:12}"
sed 's/^/    /' "$VENDOR/UPSTREAM.txt"
