#!/usr/bin/env bash
# Mutation testing: break the product on purpose and check the suite notices.
#
#   mutate.sh list                     # the manifest, one line per mutation
#   mutate.sh run                      # every FAST mutation (go + vitest)
#   mutate.sh run cap.ungoverned-flat  # one, by id
#   mutate.sh run cap                  # every id under the `cap.` prefix
#   mutate.sh run --tier all           # includes the e2e tier (minutes each)
#   mutate.sh run --arena go
#   mutate.sh run --record             # print the reds instead of judging them
#   mutate.sh restore                  # undo a run that was killed outright
#
# A mutation that produces NO REDS fails the run. That is the whole point: it
# means nothing in the suite is holding that property.
#
# Two things this script is responsible for that the runner cannot be:
#
#  1. A SECOND, INDEPENDENT restore path. The runner journals every edit before
#     making it and restores on exit and on signal; this trap restores from the
#     same journal even if node dies in a way that runs none of its handlers.
#     A mutation left in the tree that then gets committed is the worst outcome
#     this tool can produce, so it gets two locks rather than one.
#  2. Keeping `nix develop` out of the loop. Every other script here calls
#     ensure_toolchain, which re-enters the dev shell — a repo-wide mutex that
#     costs 44s unopposed on a permanently-dirty worktree (container trap 4).
#     devenv's profile has go, node and pnpm already and costs nothing, so the
#     fast tier runs 30 mutations in the time one `nix develop` takes.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$HERE")"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
RUNNER="$SKILL_DIR/mutations/run.mjs"
JOURNAL="$SKILL_DIR/mutations/.state/journal.json"

DEVENV_BIN="$ROOT_DIR/.devenv/profile/bin"
if [ -d "$DEVENV_BIN" ]; then
  export PATH="$DEVENV_BIN:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is not on PATH and $DEVENV_BIN does not exist." >&2
  echo "       Run this inside the dev container (devcontainer-up/scripts/mutate.sh)," >&2
  echo "       or enter the Nix dev shell first." >&2
  exit 1
fi

# The belt to the runner's braces. `[ -s ]` rather than `[ -f ]`: the runner
# writes an empty array when it has nothing outstanding, and restoring from an
# empty journal would print a scary message about a run that ended cleanly.
on_exit() {
  if [ -s "$JOURNAL" ] && ! grep -q '^\[\]$' "$JOURNAL" 2>/dev/null; then
    echo
    echo "!! mutations were still applied when this script exited — restoring" >&2
    node "$RUNNER" restore || true
  fi
  # Verified, not assumed. Scoped to components/, which is the only tree the
  # runner may touch; the repo-wide check can never pass in this container
  # (three git-lfs pointer files read as permanently modified — trap 4).
  local left
  left="$(git -C "$ROOT_DIR" status --porcelain -- components/ || true)"
  if [ -n "$left" ]; then
    echo >&2
    echo "!! components/ IS NOT CLEAN after the run:" >&2
    echo "$left" >&2
    echo "!! Do not commit. Inspect, then: git -C '$ROOT_DIR' checkout -- components/" >&2
    exit 1
  fi
}
trap on_exit EXIT

# NOT `exec`. `exec` replaces this shell with node, and a process that no longer
# exists runs no EXIT trap — the second restore path above would have been
# decoration. Run it as a child, keep its status, and let the trap fire.
STATUS=0
node "$RUNNER" "$@" || STATUS=$?
exit "$STATUS"
