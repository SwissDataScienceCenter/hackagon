#!/usr/bin/env bash
# Stop all quick tunnels (compose tunnel service + generic port tunnels).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/.devcontainer/docker-compose.yml"
case "$(uname -s)" in
MINGW* | MSYS*)
    export MSYS_NO_PATHCONV=1
    export MSYS2_ARG_CONV_EXCL="*"
    COMPOSE_FILE="$(cygpath -m "$COMPOSE_FILE")"
    ;;
esac
# Stop the built server on :8082 first. `auth-wire.sh --restore` deliberately
# leaves a running one alone (it would be a hole in the public link mid-suite),
# so if this did not kill it the box would keep a server pinned to a tunnel
# issuer for a tunnel that no longer exists. No-op when nothing is running.
# (It never owned :8081, so `vite dev` needs no handover — that used to be this
# step's real job, and the reason a suite run blacked out the public link.)
docker compose -f "$COMPOSE_FILE" exec -T -u vscode -e USER=vscode dev \
    bash -lc 'cd /workspaces/hackagon && bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh stop' ||
    echo "warn: prod-serve stop skipped (dev container not running?)" >&2

# If a --with-auth run rewired the OIDC issuers, put them back too (no-op
# when there is no config.local.yaml to delete; skipped if the dev container is
# down, in which case the next `just up` still needs a manual --restore).
docker compose -f "$COMPOSE_FILE" exec -T -u vscode -e USER=vscode dev \
    bash -lc 'cd /workspaces/hackagon && bash .claude/skills/cloudflare-tunnel/scripts/auth-wire.sh --restore' ||
    echo "warn: auth restore skipped (dev container not running?)" >&2

docker compose -f "$COMPOSE_FILE" --profile tunnel rm -sf tunnel caddy 2>/dev/null || true
for name in $(docker ps --format '{{.Names}}' | grep -E '^cf-quicktunnel-' || true); do
    docker rm -f "$name" >/dev/null
    echo "stopped $name"
done
echo "tunnels down"
