#!/usr/bin/env bash
# Create a Cloudflare quick tunnel and print its public URL.
#   up.sh              -> tunnel the hackagon stack (view-only: login stays local)
#   up.sh --with-auth  -> same, plus rewire OIDC so login works through the tunnel
#   up.sh --prod       -> ALSO run the production BUILD on :8082 and let the
#                         tunnel prefer it (54 requests/page instead of 150;
#                         combine with --with-auth). `vite dev` keeps :8081.
#                         Undo with down.sh or prod-serve.sh stop.
#   up.sh --port <n>   -> tunnel any local port via host.docker.internal
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

PORT=""
WITH_AUTH=""
PROD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --port)
      shift
      PORT="${1:?--port needs a port number}"
      ;;
    --with-auth) WITH_AUTH=1 ;;
    --prod) PROD=1 ;;
    -h | --help)
      sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $1 (see --help)" >&2
      exit 2
      ;;
  esac
  shift
done
if [ -n "$PORT" ] && [ -n "$PROD" ]; then
  echo "error: --prod only applies to the hackagon stack, not --port mode." >&2
  exit 2
fi

wait_for_url() { # container-name
  local name="$1" url=""
  for _ in $(seq 1 30); do
    url=$(docker logs "$name" 2>&1 | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1 || true)
    if [ -n "$url" ]; then
      echo "$url"
      return 0
    fi
    sleep 2
  done
  echo "error: no trycloudflare URL appeared in '$name' logs after 60s" >&2
  return 1
}

if [ -z "$PORT" ]; then
  # The app must already be serving: caddy proxies to it and cloudflared
  # resolves its target once at startup. This check lives here rather than as
  # a compose `depends_on: service_healthy` because the stack inside `dev` is
  # started by hand (`just up`), not by compose — see the comment on caddy in
  # docker-compose.yml.
  echo "==> Checking the app is up inside the dev container..."
  if ! docker compose -f "$COMPOSE_FILE" exec -T -u vscode dev bash -c \
    'curl -fsS -o /dev/null --max-time 5 "http://[::1]:8081/" ||
     curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:8081/"'; then
    echo "error: nothing is serving on :8081 inside the dev container." >&2
    echo "Start the stack first:  just up   (or scripts/up.sh in hackathon-e2e)" >&2
    exit 1
  fi

  # Vite binds loopback inside the dev container: republish it on the
  # container interface first so caddy (the tunnel's target, which
  # path-splits the hostname between frontend and Keycloak) can reach it.
  docker compose -f "$COMPOSE_FILE" exec -T -u vscode -e USER=vscode dev \
    bash -lc 'cd /workspaces/hackagon && bash .devcontainer/host-bridge.sh'
  docker compose -f "$COMPOSE_FILE" --profile tunnel up -d tunnel
  name=$(docker compose -f "$COMPOSE_FILE" --profile tunnel ps -q tunnel)
  url=$(wait_for_url "$name")
  if [ -n "$WITH_AUTH" ]; then
    # Rewire issuers + realm allowlist so OIDC login works via the tunnel.
    docker compose -f "$COMPOSE_FILE" exec -T -u vscode -e USER=vscode dev \
      bash -lc "cd /workspaces/hackagon && bash .claude/skills/cloudflare-tunnel/scripts/auth-wire.sh '$url'"
  fi

  if [ -n "$PROD" ]; then
    # LAST, and only now: the built server reads config.yaml once into a module
    # singleton at boot, so the issuer sed above has to be on disk before it
    # starts. (Nothing is duplicated by ordering it this way — auth-wire.sh
    # restarts the built server only when one is ALREADY running, which on this
    # path it is not.)
    #
    # ORIGIN is the tunnel URL, not localhost: SvelteKit rejects any form POST
    # whose Origin header does not match ORIGIN, so a localhost value would 403
    # every action a visitor takes through the public link.
    docker compose -f "$COMPOSE_FILE" exec -T -u vscode -e USER=vscode dev \
      bash -lc "cd /workspaces/hackagon && bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh start '$url'"
  fi

  echo
  if [ -n "$WITH_AUTH" ]; then
    echo "Public URL (login-capable): $url"
  else
    echo "Public URL (frontend, view-only): $url"
  fi
  if [ -n "$PROD" ]; then
    echo "Serving:                    PRODUCTION BUILD (adapter-node, :8082)"
    echo "Back to the dev server:     scripts/prod-serve.sh stop  (down.sh does it too)"
  else
    echo "Serving:                    dev server (vite :8081, unbundled — 150 requests/page)"
    echo "Faster public pages:        re-run with --prod"
  fi
else
  name="cf-quicktunnel-$PORT"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --restart unless-stopped \
    cloudflare/cloudflared:latest \
    tunnel --no-autoupdate --url "http://host.docker.internal:$PORT" >/dev/null
  echo "Public URL (port $PORT): $(wait_for_url "$name")"
fi
