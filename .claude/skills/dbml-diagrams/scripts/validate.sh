#!/usr/bin/env bash
# Validate a DBML file with the official parser (@dbml/cli, the engine behind
# dbdiagram.io). Emits "OK" on success; on failure prints the same errors
# dbdiagram.io would show (line:column).
#
# Usage: validate.sh [file.dbml]   (default: docs/backend/schema.dbml)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
FILE="${1:-docs/backend/schema.dbml}"

cd "$ROOT_DIR"
if [ ! -f "$FILE" ]; then
    echo "error: no such file: $FILE" >&2
    exit 2
fi

if command -v pnpm >/dev/null 2>&1; then
    pnpm --package=@dbml/cli dlx dbml2sql "$FILE" >/dev/null
elif command -v npx >/dev/null 2>&1; then
    npx -y -p @dbml/cli dbml2sql "$FILE" >/dev/null
else
    # No node toolchain on this shell — run inside the devcontainer's Nix shell.
    bash "$HERE/../../devcontainer-up/scripts/exec.sh" \
        just develop pnpm --package=@dbml/cli dlx dbml2sql "$FILE" >/dev/null
fi

echo "OK: $FILE parses — safe to paste into dbdiagram.io"
