#!/usr/bin/env bash
# Run the mutation-testing manifest INSIDE the devcontainer — the default way
# to run it, and a sibling of e2e.sh. All arguments forward verbatim to
# .claude/skills/hackathon-e2e/scripts/mutate.sh:
#
#   mutate.sh list                 # the manifest
#   mutate.sh check                # every anchor still matches its source
#   mutate.sh run                  # the fast tier (go + vitest, no stack)
#   mutate.sh run owner.last-guard # one mutation
#   mutate.sh restore              # after a run that was killed outright
#
# The fast tier needs NO running stack: it drives `go test` and `vitest`
# straight from source. That is deliberate — it means mutation testing stays
# available while the stack is down, being rebuilt, or in use by someone else.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

require_docker
if ! container_running; then
  bash "$HERE/up.sh"
fi

args=""
if [ $# -gt 0 ]; then args=$(printf "%q " "$@"); fi
in_container "bash .claude/skills/hackathon-e2e/scripts/mutate.sh $args"
