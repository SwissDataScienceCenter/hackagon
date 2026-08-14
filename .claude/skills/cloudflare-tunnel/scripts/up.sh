#!/usr/bin/env bash
# Create a Cloudflare tunnel to the hackagon stack and print its public URL.
#   up.sh              -> tunnel the stack (view-only: login stays local)
#   up.sh --with-auth  -> same, plus rewire OIDC so login works through the tunnel
#   up.sh --prod       -> ALSO run the production BUILD on :8082 and let the
#                         tunnel prefer it (54 requests/page instead of 150;
#                         combine with --with-auth). `vite dev` keeps :8081.
#                         Undo with down.sh or prod-serve.sh stop.
#   up.sh --named      -> force a NAMED tunnel on your own hostname
#   up.sh --quick      -> force an ephemeral *.trycloudflare.com quick tunnel
#   up.sh --port <n>   -> tunnel any local port via host.docker.internal
#
# TWO MODES, and the default picks between them:
#
#   NAMED  a persistent hostname on a zone you own (HACKAGON_HOSTNAME in the
#          gitignored .env — see SKILL.md, "Named tunnels"). Chosen
#          automatically when those credentials are present. The hostname
#          survives restarts, so the issuer wiring below stays correct instead
#          of having to be redone every time.
#   QUICK  cloudflared's free ephemeral *.trycloudflare.com URL. No account, no
#          DNS, nothing to configure — and a new hostname on every start. Used
#          whenever named mode is not configured, which keeps this the
#          zero-setup path it has always been.
#
# The two are mutually exclusive per run: bringing one up stops the other, because
# the OIDC issuer can only name ONE hostname and the other would keep serving
# every page while silently failing every login.
#
# Every hackagon-stack run also ENSURES the tunnel's upstream can serve the
# public hostname: caddy prefers :8082 and falls back to vite on :8081, but the
# e2e harness parks an adapter-node build there with ORIGIN=http://localhost:8081
# — which serves pages through the tunnel and 403s every form POST, so login
# silently does nothing. prod-serve.sh ensure starts a correct-origin :8082 in
# that case and refuses rather than hand over a broken link.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/.devcontainer/docker-compose.yml"
# shellcheck source=../../lib/cf-named-tunnel.sh
source "$ROOT_DIR/.claude/skills/lib/cf-named-tunnel.sh"
CFN_NAME="${HACKAGON_TUNNEL_NAME:-hackagon}"

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
MODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --port)
      shift
      PORT="${1:?--port needs a port number}"
      ;;
    --with-auth) WITH_AUTH=1 ;;
    --prod) PROD=1 ;;
    --named) MODE=named ;;
    --quick) MODE=quick ;;
    -h | --help)
      sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
if [ -n "$PORT" ] && [ -n "$MODE" ]; then
  echo "error: --named/--quick only apply to the hackagon stack, not --port mode." >&2
  exit 2
fi

# Which mode, and SAY SO. Auto-selection reads the gitignored .env; --named and
# --quick override it. An explicit --named with nothing configured is an error
# rather than a silent downgrade to an ephemeral hostname: somebody who asked
# for a stable URL and got a throwaway one finds out at the worst moment.
resolve_mode() {
  if [ "$MODE" = "named" ]; then
    cf_configured && [ -n "${HACKAGON_HOSTNAME:-}" ] || {
      echo "error: --named needs Cloudflare credentials and HACKAGON_HOSTNAME." >&2
      cf_explain_unconfigured >&2
      exit 2
    }
    return
  fi
  [ -n "$MODE" ] && return
  if cf_configured && [ -n "${HACKAGON_HOSTNAME:-}" ]; then MODE=named; else MODE=quick; fi
}

# Make the RUNNING caddy match Caddyfile.tunnel, and prove one route did.
#
# caddy loads its config once, at container start. `docker compose up -d caddy`
# does not re-read the file for an already-running container, and recreating it
# is not an option on this compose project — `up -d` on anything that shares
# `dev`'s config can recreate `dev`, which kills the whole stack inside it
# (container trap 2). So a Caddyfile edit sits on disk, doing nothing, for as
# long as the container happens to live: days, across many tunnels.
#
# That is not a hypothetical. The `/objects` route's `header_up Host` rewrite —
# REQUIRED, because SigV4 signs the Host and the store recomputes the signature
# over whatever arrives — was committed and correct while the running config had
# no `headers` block at all. Every presigned UPLOAD through the public URL
# answered 403 SignatureDoesNotMatch, and nothing else did: public reads are
# unsigned, so every page and every image kept working. The report was "Storage
# rejected the upload (403)" from someone using the app normally.
#
# Reload, then ASK CADDY what it is serving. Checking the file proves nothing
# here — the file was already right. Verifying the reload took is the only part
# of this that could have caught the bug.
ensure_caddy_config() {
  # MSYS_NO_PATHCONV: on a Git Bash host, /etc/caddy/Caddyfile is rewritten to
  # C:/Program Files/Git/etc/caddy/Caddyfile before docker ever sees it, and the
  # reload fails with a path nobody typed. Ignored everywhere else.
  MSYS_NO_PATHCONV=1 docker compose -f "$COMPOSE_FILE" exec -T caddy \
    caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || {
    echo "warn: could not reload caddy's config; it is serving whatever it booted with" >&2
    return 0
  }
  # The Host rewrite on the /objects route, read back out of the live config.
  if docker compose -f "$COMPOSE_FILE" exec -T caddy \
    sh -c 'wget -qO- http://localhost:2019/config/ 2>/dev/null || curl -sS http://localhost:2019/config/' 2>/dev/null |
    tr -d ' \n' | grep -q '"strip_path_prefix":"/objects"'; then
    if ! docker compose -f "$COMPOSE_FILE" exec -T caddy \
      sh -c 'wget -qO- http://localhost:2019/config/ 2>/dev/null || curl -sS http://localhost:2019/config/' 2>/dev/null |
      tr -d ' \n' | grep -q 'upstream.hostport'; then
      echo "warn: caddy's /objects route has no Host rewrite — presigned UPLOADS" >&2
      echo "      through the public URL will 403 while reads keep working." >&2
    fi
  fi
}

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

  resolve_mode
  if [ "$MODE" = "named" ]; then
    echo "==> Mode: NAMED — https://$HACKAGON_HOSTNAME (persistent)"
    # caddy only. `up -d tunnel` would start the QUICK tunnel through
    # depends_on, which is the other mode; naming the service explicitly is
    # what keeps the two from both running.
    docker compose -f "$COMPOSE_FILE" --profile tunnel up -d caddy
    ensure_caddy_config
    # Stop the quick tunnel if a previous run left one up. Two tunnels onto the
    # same caddy is not a redundancy — the OIDC issuer names ONE hostname, so
    # the other would serve every page and fail every login, which is the
    # failure mode that only surfaces when somebody tries to sign in.
    if [ -n "$(docker compose -f "$COMPOSE_FILE" --profile tunnel ps -q tunnel 2>/dev/null)" ]; then
      echo "    stopping the quick tunnel (named mode owns the issuer)"
      docker compose -f "$COMPOSE_FILE" --profile tunnel rm -sf tunnel >/dev/null 2>&1 || true
    fi
    # caddy's network, read off the container rather than assumed: the compose
    # network name is overridable (HACKAGON_DEV_NETWORK) and a wrong guess
    # fails as a DNS lookup for `caddy` inside cloudflared, which Cloudflare
    # renders as a plain 502 while every container reports healthy.
    caddy_net=$(docker inspect "$(docker compose -f "$COMPOSE_FILE" --profile tunnel ps -q caddy)" \
      --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
    cfn_up "$CFN_NAME" "$HACKAGON_HOSTNAME" "$caddy_net" "http://caddy:80"
    url="https://$HACKAGON_HOSTNAME"
  else
    echo "==> Mode: QUICK — an ephemeral *.trycloudflare.com hostname"
    if cfn_running "$CFN_NAME"; then
      echo "    stopping the named tunnel (one issuer, one hostname)"
      cfn_stop "$CFN_NAME"
    fi
    docker compose -f "$COMPOSE_FILE" --profile tunnel up -d tunnel
    # After caddy exists (compose starts it via depends_on), before anyone is
    # handed the link: a running container keeps its boot-time config forever.
    ensure_caddy_config
    name=$(docker compose -f "$COMPOSE_FILE" --profile tunnel ps -q tunnel)
    url=$(wait_for_url "$name")
  fi

  if [ -n "$WITH_AUTH" ]; then
    # Rewire issuers + realm allowlist so OIDC login works via the tunnel.
    docker compose -f "$COMPOSE_FILE" exec -T -u vscode -e USER=vscode dev \
      bash -lc "cd /workspaces/hackagon && bash .claude/skills/cloudflare-tunnel/scripts/auth-wire.sh '$url'"
  fi

  # LAST, and only now: the built server reads config.yaml once into a module
  # singleton at boot, so the issuer overlay above has to be on disk before it
  # starts. (Nothing is duplicated by ordering it this way — auth-wire.sh
  # restarts the built server only when one is ALREADY running, which on this
  # path it is not.)
  #
  # ORIGIN is the tunnel URL, not localhost: SvelteKit rejects any form POST
  # whose Origin header does not match ORIGIN, so a localhost value would 403
  # every action a visitor takes through the public link — login first.
  #
  # `ensure` runs on EVERY hackagon-stack tunnel, not just `--prod`, because
  # caddy's fallback to :8081 is only correct when `vite dev` is what is there.
  # Whenever the adapter-node build holds that port — which is what the e2e
  # harness leaves behind, and what `hackathon-e2e/scripts/wait-ready.sh` sets
  # up on every single run — its ORIGIN is http://localhost:8081 and the public
  # URL serves every page while every form POST 403s. That is silent: the link
  # looks perfect until somebody tries to sign in, which is exactly what
  # `devcontainer-up/scripts/start.sh --tunnel` then failed to prove, with
  # nothing in any log naming the cause. `ensure` starts a correct-origin server
  # on :8082 only in that case, leaves a vite fallback alone, and exits non-zero
  # rather than handing over a URL it knows is broken. `--prod` still forces the
  # built server (and a build) for the request-count win.
  if [ -n "$PROD" ]; then
    UPSTREAM_CMD="bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh start '$url'"
  else
    UPSTREAM_CMD="bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh ensure '$url'"
  fi
  if ! docker compose -f "$COMPOSE_FILE" exec -T -u vscode -e USER=vscode dev \
    bash -lc "cd /workspaces/hackagon && $UPSTREAM_CMD &&
      echo && echo '==> Tunnel upstream:' &&
      bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh status"; then
    echo "error: the tunnel is up but its upstream cannot serve $url correctly." >&2
    echo "       Fix that before using the link — see the lines above." >&2
    exit 1
  fi

  echo
  if [ -n "$WITH_AUTH" ]; then
    echo "Public URL (login-capable): $url"
  else
    echo "Public URL (frontend, view-only): $url"
  fi
  if [ "$MODE" = "named" ]; then
    echo "Mode:                       NAMED — this hostname persists across restarts,"
    echo "                            so the OIDC wiring stays valid and does not have"
    echo "                            to be redone on the next up.sh."
  else
    echo "Mode:                       QUICK — this hostname dies with the tunnel."
  fi
  if [ -n "$PROD" ]; then
    echo "Back to the dev server:     scripts/prod-serve.sh stop  (down.sh does it too)"
  else
    echo "Which server answers it:    printed above by prod-serve.sh status"
    echo "Fewer requests per page:    re-run with --prod (bundled build, 54 vs 150)"
  fi
else
  name="cf-quicktunnel-$PORT"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --restart unless-stopped \
    cloudflare/cloudflared:latest \
    tunnel --no-autoupdate --url "http://host.docker.internal:$PORT" >/dev/null
  echo "Public URL (port $PORT): $(wait_for_url "$name")"
fi
