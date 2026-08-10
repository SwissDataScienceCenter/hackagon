#!/usr/bin/env bash
# Convert a captured RPC journal into DRAFT recipe actions.
#
# The journal is written by the backend's audit interceptor
# (components/backend/internal/audit), which is OFF unless
# `audit.enabled: true` — see docs/backend/rpc-journal.md.
#
# Usage:
#   journal-to-recipe.sh [journal.jsonl] [--out f] [--dedupe] [--keep-health] [--keep-reads]
#
# With no path it reads the default journal location,
# components/backend/.output/audit/rpc-journal.jsonl.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

DEFAULT_JOURNAL="$ROOT_DIR/components/backend/.output/audit/rpc-journal.jsonl"

args=("$@")
if [ ${#args[@]} -eq 0 ] || [[ "${args[0]}" == -* ]]; then
  args=("$DEFAULT_JOURNAL" "${args[@]+"${args[@]}"}")
fi

if [ ! -f "${args[0]}" ]; then
  echo "error: no journal at ${args[0]}" >&2
  echo "       enable it first: audit.enabled: true in components/backend/data/test/config/config.yaml" >&2
  exit 1
fi

exec node "$HERE/journal-to-recipe.mjs" "${args[@]}"
