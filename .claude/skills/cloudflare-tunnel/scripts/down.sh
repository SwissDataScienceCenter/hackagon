#!/usr/bin/env bash
# Stop all tunnels to this stack — the compose quick tunnel, the named tunnel's
# container, and any generic port tunnels — and undo the OIDC rewiring.
#
# THE NAMED TUNNEL'S HOSTNAME AND DNS RECORD SURVIVE THIS, on purpose. Stopping
# the container is "take the link down for now"; the whole value of a named
# tunnel is that the same hostname comes back on the next up.sh, with the issuer
# wiring still correct. To give the hostname up for good — delete the tunnel and
# its DNS record from Cloudflare — that is a separate, explicit act:
#
#   bash .claude/skills/lib/cf-named-tunnel.sh destroy hackagon <hostname>
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

# THIS STACK's named tunnel only. `cf-named-*` also covers the plausible and
# openreplay rigs, which have their own hostnames and their own down.sh — taking
# an analytics dashboard offline as a side effect of stopping the app's link is
# exactly the kind of over-broad cleanup that gets discovered days later.
docker rm -f "cf-named-${HACKAGON_TUNNEL_NAME:-hackagon}" >/dev/null 2>&1 &&
  echo "stopped cf-named-${HACKAGON_TUNNEL_NAME:-hackagon}" || true

for name in $(docker ps --format '{{.Names}}' | grep -E '^cf-quicktunnel-' || true); do
  docker rm -f "$name" >/dev/null
  echo "stopped $name"
done
echo "tunnels down"
echo "(a named tunnel's hostname and DNS record are kept — the next up.sh reuses"
echo " them. Give them up with: lib/cf-named-tunnel.sh destroy <name> <hostname>)"
