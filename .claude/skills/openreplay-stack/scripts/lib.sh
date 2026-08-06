# shellcheck shell=bash
# Shared helpers. Source after setting HERE.

SKILL_DIR="$(dirname "$HERE")"
VENDOR="$SKILL_DIR/vendor"
STATE="$SKILL_DIR/.state"
PROJECT="${OPENREPLAY_PROJECT:-openreplay}"
# Pin upstream. Override with OPENREPLAY_REF=v1.x.y for a release tag.
UPSTREAM_REPO="${OPENREPLAY_REPO:-https://github.com/openreplay/openreplay.git}"
UPSTREAM_REF="${OPENREPLAY_REF:-main}"

mkdir -p "$STATE"

# Paths handed to docker.exe. On Git Bash/MSYS, MSYS_NO_PATHCONV stops the
# automatic POSIX→Windows translation (needed so docker's own /container/paths
# survive), which means a `/c/Users/...` argument reaches docker.exe verbatim
# and it resolves `C:\c\Users\...`. Hand it a Windows-style path instead;
# MSYS leaves those alone. Same fix as devcontainer-up/scripts/lib.sh.
COMPOSE_VENDOR="$VENDOR/docker-compose.yaml"
COMPOSE_OVERLAY="$SKILL_DIR/compose.tunnel.yaml"
COMPOSE_DIR="$VENDOR"
case "$(uname -s)" in
  MINGW* | MSYS*)
    export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"
    COMPOSE_VENDOR="$(cygpath -m "$COMPOSE_VENDOR")"
    COMPOSE_OVERLAY="$(cygpath -m "$COMPOSE_OVERLAY")"
    COMPOSE_DIR="$(cygpath -m "$COMPOSE_DIR")"
    ;;
esac

compose() {
  docker compose -p "$PROJECT" \
    -f "$COMPOSE_VENDOR" -f "$COMPOSE_OVERLAY" \
    --project-directory "$COMPOSE_DIR" "$@"
}

require_docker() {
  command -v docker >/dev/null 2>&1 || { echo "error: docker not found" >&2; exit 1; }
  docker info >/dev/null 2>&1 || { echo "error: docker daemon not reachable" >&2; exit 1; }
}

require_vendor() {
  [ -f "$VENDOR/docker-compose.yaml" ] || {
    echo "error: upstream not fetched — run scripts/fetch-upstream.sh" >&2; exit 1; }
}

# Read the quick-tunnel URL out of cloudflared's log (it only ever prints it there).
tunnel_url() {
  docker logs "$(compose ps -q tunnel 2>/dev/null)" 2>&1 |
    grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
}
