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
# Credentials come from OPENREPLAY_EMAIL / OPENREPLAY_PASSWORD, or — when
# those are unset — from .secrets.env, the file signup.sh wrote when it
# created the admin account during up.sh.
#
# ⚠ This restarts the frontend. Do not run it while an e2e suite is in flight —
# the pages keep answering 200 through the handover, so the damage shows up as
# one unrelated-looking test failure and nothing points here.
#
# NOTHING TRACKED IS EDITED. The `replay` block goes into config.local.yaml,
# the gitignored overlay the loader deep-merges over config.yaml
# (components/frontend/src/lib/server/settings.ts). This used to `sed` the
# TRACKED config.yaml, which meant a wired dev machine had a dirty working tree
# holding a `*.trycloudflare.com` ingest hostname that dies in a few hours —
# the exact shape of a bug this repo has already paid for once, when a `git add
# -A` committed the tunnel's OIDC issuer and a dead hostname sat in HEAD for
# several commits.
#
# THIS SCRIPT OWNS EXACTLY ONE KEY IN THAT FILE: `replay`. cloudflare-tunnel's
# auth-wire.sh owns `oidc` in the same file and knows nothing about this one,
# so --restore removes the BLOCK, never the file: clobbering the overlay would
# drop the tunnel's issuer, and a tunnel with no issuer keeps serving pages —
# only signing in breaks, which nobody notices until they try.
# .claude/skills/lib/config-overlay.sh does the per-key surgery.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
FRONTEND_LOCAL="$ROOT_DIR/components/frontend/data/test/config/config.local.yaml"
OVERLAY="$ROOT_DIR/.claude/skills/lib/config-overlay.sh"

MODE="wire"
case "${1:-}" in
  --restore) MODE="restore" ;;
  --print) MODE="print" ;;
  "") ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

# The frontend reads its config ONCE at boot, so a rewrite is inert until it
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

# Restart only when the overlay actually changed — config-overlay.sh answers
# `changed` or `unchanged` for exactly this. This script BOUNCES THE FRONTEND,
# so an "idempotent" re-run is not free: calling `--restore` on an
# already-restored config while an e2e suite is mid-flight would restart the
# server the suite is driving. Nothing in the output would say so — the pages
# keep answering 200 — and the failure would land on whichever test happened to
# be in the handover.
#
# ⚠ Do not run this while a suite is running, even so.
apply() { # <changed|unchanged> <message>
  if [ "$1" = "changed" ]; then
    echo "$2"
    restart_frontend
  else
    echo "$2 (already; nothing changed, frontend left alone)"
  fi
}

if [ "$MODE" = "restore" ]; then
  # `remove`, never `rm`: the tunnel's `oidc` block may share this file.
  apply "$(bash "$OVERLAY" remove "$FRONTEND_LOCAL" replay)" \
    "==> session replay is OFF"
  exit 0
fi

require_docker
url="$(tunnel_url || true)"
[ -n "$url" ] || { echo "error: no OpenReplay tunnel running — scripts/up.sh first" >&2; exit 1; }

# The project key, by preference from OpenReplay's own API. The credentials
# normally come from .secrets.env (written by signup.sh, which up.sh runs);
# the environment overrides it, and `OPENREPLAY_PROJECT_KEY` short-circuits
# the login entirely — e.g. for an account someone created by hand with a
# password the file does not know. The stack itself only stores a hash, but
# the key is plain in Postgres:
#
#   docker exec postgres sh -lc \
#     'PGPASSWORD="$POSTGRESQL_PASSWORD" psql -U postgres -d postgres \
#        -tAc "select project_key from public.projects;"'
key="${OPENREPLAY_PROJECT_KEY:-}"
if [ -z "$key" ]; then
  load_secrets
  email="${OPENREPLAY_EMAIL:-}"
  password="${OPENREPLAY_PASSWORD:-}"
  [ -n "$email" ] && [ -n "$password" ] || {
    echo "error: no credentials — expected $SECRETS_FILE (written by signup.sh)," >&2
    echo "       or OPENREPLAY_EMAIL + OPENREPLAY_PASSWORD in the environment," >&2
    echo "       or OPENREPLAY_PROJECT_KEY to skip the login entirely" >&2
    exit 1
  }

  jwt="$(curl -fsS -X POST "$url/api/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" |
    sed -n 's/.*"jwt":"\([^"]*\)".*/\1/p')"
  [ -n "$jwt" ] || { echo "error: OpenReplay login failed for $email" >&2; exit 1; }

  key="$(curl -fsS "$url/api/projects" -H "Authorization: Bearer $jwt" |
    sed -n 's/.*"projectKey":"\([^"]*\)".*/\1/p' | head -1)"
fi
[ -n "$key" ] || { echo "error: no project found — sign up at $url/signup first" >&2; exit 1; }

# The whole block, key line included — config-overlay.sh checks that it starts
# with the key it is being filed under, so a block can never land in the
# overlay under a name that nothing can remove it by.
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

apply "$(printf '%s\n' "$block" | bash "$OVERLAY" set "$FRONTEND_LOCAL" replay)" \
  "==> session replay is ON"
echo "    ingestPoint  $url/ingest"
echo "    projectKey   $key"
echo "    ⚠ visitors to http://localhost:8081 are now ASKED whether to be recorded."
echo "      Nothing is recorded until somebody clicks \"Allow recording\" in the"
echo "      banner — so an empty OpenReplay UI after wiring is the correct default,"
echo "      not a broken ingest. What is recorded is masked; see"
echo "      components/frontend/src/lib/components/observability/SessionReplay.svelte"
echo "      and docs/frontend/session-replay.md."
