#!/usr/bin/env bash
# Point localhost:5432 and localhost:8180 inside the dev container at the
# `postgres` and `keycloak` CONTAINERS (compose profile "services").
#
# Why: every checked-in config addresses those services on localhost —
# components/backend/data/test/config/config.yaml, the frontend's oidc.issuer,
# just rpc-as, the e2e skill. Bridging keeps all of them working when the
# services move out of the dev container, instead of forking the configs.
#
#   docker compose -f .devcontainer/docker-compose.yml --profile services up -d
#   docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
#       bash /workspaces/hackagon/.devcontainer/service-bridge.sh
#
# This is the mirror image of host-bridge.sh, which republishes loopback ports
# onto the container interface so sidecars can reach IN.
#
# NOTE: devenv's own postgres/keycloak must NOT be running, or they already own
# these ports. `just up` starts them today (the Nix shell has a withPostgres
# flag but no withKeycloak one), so this path currently suits running the
# backend/frontend by hand.
set -euo pipefail

PG_HOST="${HACKAGON_PG_HOST:-postgres}"
PG_PORT="${HACKAGON_PG_PORT:-5432}"
KC_HOST="${HACKAGON_KC_HOST:-keycloak}"
KC_PORT="${HACKAGON_KC_PORT:-8180}"

command -v socat >/dev/null || {
    echo "error: socat not found (post-create.sh installs it)" >&2
    exit 1
}

bridge() { # <local-port> <target-host> <target-port>
    local lport="$1" thost="$2" tport="$3"
    # Build the pattern in a variable so pkill cannot match its own argv.
    local listen="TCP-LISTEN"
    pkill -f "socat ${listen}:${lport}," 2>/dev/null || true

    if ! getent hosts "$thost" >/dev/null 2>&1; then
        echo "error: '$thost' does not resolve — is the services profile up?" >&2
        exit 1
    fi

    socat "TCP-LISTEN:${lport},bind=127.0.0.1,fork,reuseaddr" \
        "TCP:${thost}:${tport}" &
    echo "  127.0.0.1:${lport} -> ${thost}:${tport}"
}

echo "==> Bridging containerised services onto loopback:"
bridge 5432 "$PG_HOST" "$PG_PORT"
bridge 8180 "$KC_HOST" "$KC_PORT"
echo "Done. Verify: pg_isready -h 127.0.0.1 -p 5432 && curl -fsS http://localhost:8180/realms/hackagon/.well-known/openid-configuration"
