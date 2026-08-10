#!/usr/bin/env bash
# Run the hackathon-e2e suite INSIDE the devcontainer — the default way to run
# it. Ensures the container is up and ready first, then forwards all
# arguments to .claude/skills/hackathon-e2e/scripts/run.sh:
#
#   e2e.sh                  # smoke suite
#   e2e.sh journey          # full lifecycle recipe
#   e2e.sh all --grep act5  # any run.sh arguments pass through
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

require_docker
if ! container_running; then
  bash "$HERE/up.sh"
fi

args=""
if [ $# -gt 0 ]; then args=$(printf "%q " "$@"); fi
in_container "bash .claude/skills/hackathon-e2e/scripts/run.sh $args"
