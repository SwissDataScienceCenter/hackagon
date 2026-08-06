#!/usr/bin/env bash
# Run a command inside the running devcontainer (as vscode, in the workspace,
# login shell so the Nix profile is loaded). No arguments -> interactive bash.
#
#   exec.sh just start
#   exec.sh bash .claude/skills/hackathon-e2e/scripts/probe.sh
#   exec.sh            # interactive shell
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

require_docker
if ! container_running; then
  echo "error: devcontainer is not running — start it with scripts/up.sh" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  compose exec -u "$CONTAINER_USER" -w "$WORKDIR" "$SERVICE" bash -l
else
  # %q-quote each argument so spaces/quotes survive the bash -lc round-trip.
  cmd=$(printf "%q " "$@")
  in_container "$cmd"
fi
