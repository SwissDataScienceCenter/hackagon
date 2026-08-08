#!/usr/bin/env bash
# Point the SvelteKit tracker at this OpenReplay, or unpoint it.
#
#   wire-frontend.sh              wire: read the live tunnel URL + project key,
#                                 write the `replay:` block, restart the frontend
#   wire-frontend.sh --restore    turn recording back OFF (the default state)
#   wire-frontend.sh --print      show what it would write, change nothing
#
# Recording is OFF unless this script (or a human) has written
# `replay.enabled: true`. That is the whole point of the flag: an absent block
# parses to `{enabled:false}`, so nothing records because someone forgot.
#
# The project key is fetched from OpenReplay's own API rather than pasted from
# its UI, because a quick tunnel mints a NEW hostname on every `up.sh` and a
# stale ingestPoint fails silently — the tracker just never delivers anything.
# Credentials come from OPENREPLAY_EMAIL / OPENREPLAY_PASSWORD (the account
# created at <url>/signup; the first one is the admin).
#
# ⚠ This restarts the frontend. Do not run it while an e2e suite is in flight —
# the pages keep answering 200 through the handover, so the damage shows up as
# one unrelated-looking test failure and nothing points here.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
FRONTEND_CFG="$ROOT_DIR/components/frontend/data/test/config/config.yaml"

MODE="wire"
case "${1:-}" in
  --restore) MODE="restore" ;;
  --print) MODE="print" ;;
  "") ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

# Strip any existing replay block: from the `replay:` line to the next line
# that starts in column 0 (a new top-level key) or EOF. Rewriting beats
# patching in place — the block has optional keys, and a sed that edits one
# line at a time leaves a half-updated block when the shape changes.
# Trailing blank lines are held back and only emitted when a non-blank line
# follows, so `--restore` puts the file back BYTE-IDENTICAL. Without that, each
# wire/restore cycle left a stray newline behind and `git diff` on a config
# file reported a change nobody made.
strip_replay() {
  awk '
    /^replay:/ { inblock = 1; next }
    inblock && /^[^[:space:]#]/ { inblock = 0 }
    inblock { next }
    /^[[:space:]]*$/ { held = held $0 "\n"; next }
    { printf "%s", held; held = ""; print }
  ' "$FRONTEND_CFG"
}

# The frontend reads config.yaml ONCE at boot, so a rewrite is inert until it
# restarts — and getting that restart right is the whole trick here.
#
# TWO different servers can own :8081. process-compose's `frontend` is `vite
# dev`; the e2e harness replaces it with the adapter-node BUILD via
# hackathon-e2e/scripts/prod-frontend.sh, and after a suite run that is what
# is actually serving. Restarting only process-compose's copy therefore
# succeeds, prints "Process frontend restarted", and changes nothing at all:
# the page keeps rendering `replay: null` from a config the live server read
# before this script edited it. Bounce BOTH.
#
# The commands also live in two worlds: `docker` is on the HOST, while `just`
# and process-compose are INSIDE the dev container, where they additionally
# need the Nix dev shell (a bare `just deploy::proc-comp` there dies with
# `process-compose: command not found`).
in_shell() { # run a command in the dev shell, wherever this script started
  local pc="$ROOT_DIR/.claude/skills/devcontainer-up/scripts/exec.sh"
  if command -v process-compose >/dev/null 2>&1; then
    (cd "$ROOT_DIR" && bash -c "$1")
  elif [ -f "$pc" ]; then
    (cd "$ROOT_DIR" && MSYS_NO_PATHCONV=1 bash "$pc" just nix::develop default bash -c "$1")
  else
    return 1
  fi
}

restart_frontend() {
  local ok=1
  in_shell 'just deploy::proc-comp process restart frontend' >/dev/null 2>&1 && ok=0
  # The built server, when the e2e harness put one there.
  if in_shell 'test -s .output/run/e2e-prod-frontend.pid' >/dev/null 2>&1; then
    in_shell 'bash .claude/skills/hackathon-e2e/scripts/prod-frontend.sh stop &&
              bash .claude/skills/hackathon-e2e/scripts/prod-frontend.sh ensure' >/dev/null 2>&1 && ok=0
  fi
  [ "$ok" -eq 0 ] && return 0
  echo "note: restart the frontend for this to take effect:" >&2
  echo "      just deploy::proc-comp process restart frontend" >&2
  echo "      (or, if the e2e built server is serving :8081)" >&2
  echo "      bash .claude/skills/hackathon-e2e/scripts/prod-frontend.sh stop && … ensure" >&2
}

# Replace the config only if the new content actually differs, and restart only
# when it did. This script BOUNCES THE FRONTEND, so an "idempotent" re-run is
# not free: calling `--restore` on an already-restored config while an e2e
# suite is mid-flight would restart the server the suite is driving. Nothing in
# the output would say so — the pages keep answering 200 — and the failure
# would land on whichever test happened to be in the handover.
#
# ⚠ Do not run this while a suite is running, even so.
apply() { # <new-content-file> <message>
  if cmp -s "$1" "$FRONTEND_CFG"; then
    rm -f "$1"
    echo "$2 (already; nothing changed, frontend left alone)"
    return 0
  fi
  mv "$1" "$FRONTEND_CFG"
  echo "$2"
  restart_frontend
}

if [ "$MODE" = "restore" ]; then
  strip_replay > "$FRONTEND_CFG.tmp"
  apply "$FRONTEND_CFG.tmp" "==> session replay is OFF"
  exit 0
fi

require_docker
url="$(tunnel_url || true)"
[ -n "$url" ] || { echo "error: no OpenReplay tunnel running — scripts/up.sh first" >&2; exit 1; }

email="${OPENREPLAY_EMAIL:-}"
password="${OPENREPLAY_PASSWORD:-}"
[ -n "$email" ] && [ -n "$password" ] || {
  echo "error: set OPENREPLAY_EMAIL and OPENREPLAY_PASSWORD (the account from $url/signup)" >&2
  exit 1
}

jwt="$(curl -fsS -X POST "$url/api/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\"}" |
  sed -n 's/.*"jwt":"\([^"]*\)".*/\1/p')"
[ -n "$jwt" ] || { echo "error: OpenReplay login failed for $email" >&2; exit 1; }

key="$(curl -fsS "$url/api/projects" -H "Authorization: Bearer $jwt" |
  sed -n 's/.*"projectKey":"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$key" ] || { echo "error: no project found — sign up at $url/signup first" >&2; exit 1; }

block=$(cat <<YAML

replay:
  enabled: true
  ingestPoint: $url/ingest
  projectKey: $key
  # The dev stack is http://localhost, and the tracker refuses to record a
  # page that is not on https. True only here, never in a deployment.
  allowInsecureOrigin: true
YAML
)

if [ "$MODE" = "print" ]; then
  echo "$block"
  exit 0
fi

{ strip_replay; echo "$block"; } > "$FRONTEND_CFG.tmp"
apply "$FRONTEND_CFG.tmp" "==> session replay is ON"
echo "    ingestPoint  $url/ingest"
echo "    projectKey   $key"
echo "    ⚠ every visitor to http://localhost:8081 is now recorded (masked — see"
echo "      components/frontend/src/lib/components/observability/SessionReplay.svelte)"
