# shellcheck shell=bash
# Shared helpers for the devcontainer-up scripts. Source after setting HERE:
#   HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$HERE/lib.sh"

SKILL_DIR="$(dirname "$HERE")"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/.devcontainer/docker-compose.yml"
SERVICE="dev"
CONTAINER_USER="vscode"
WORKDIR="/workspaces/hackagon"

# Git Bash / MSYS on Windows rewrites absolute POSIX paths in arguments
# (/workspaces/... -> C:/Program Files/Git/workspaces/...). Disable that for
# every docker invocation.
case "$(uname -s)" in
  MINGW* | MSYS*)
    export MSYS_NO_PATHCONV=1
    export MSYS2_ARG_CONV_EXCL="*"
    # With conversion disabled, docker.exe would receive the POSIX-style
    # /c/... compose path verbatim and resolve it as C:\c\... — hand it a
    # Windows-style (C:/...) path instead; MSYS leaves those untouched.
    COMPOSE_FILE="$(cygpath -m "$COMPOSE_FILE")"
    ;;
esac

require_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "error: docker is not available (is Docker Desktop / the daemon running?)" >&2
    exit 1
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

# Run a command inside the dev container as the vscode user, with a login
# shell so the Nix profile and direnv hooks from post-create.sh are loaded.
# TTY is attached only when we actually have one (CI/scripting safe).
in_container() {
  local tty_flag="-T"
  if [ -t 0 ] && [ -t 1 ]; then tty_flag=""; fi
  # -e USER: docker exec does not set it, and Nix's profile script silently
  # no-ops when USER is unset — leaving the whole toolchain off PATH.
  # shellcheck disable=SC2086
  compose exec $tty_flag -u "$CONTAINER_USER" -e USER="$CONTAINER_USER" \
    -w "$WORKDIR" "$SERVICE" bash -lc "$*"
}

container_running() {
  [ -n "$(compose ps -q --status running "$SERVICE" 2>/dev/null)" ]
}
