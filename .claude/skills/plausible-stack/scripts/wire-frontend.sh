#!/usr/bin/env bash
# Point the SvelteKit app at this Plausible, or unpoint it.
#
#   wire-frontend.sh              wire: read the live tunnel URL, write the
#                                 `plausible:` block, restart the frontend
#   wire-frontend.sh --restore    turn measurement back OFF (the default state)
#   wire-frontend.sh --print      show what it would write, change nothing
#
# Measurement is OFF unless this script (or a human) has written
# `plausible.enabled: true`. An absent block parses to `{enabled:false}`, and
# the component then renders no script tag at all — no request, no console
# noise. Nothing counts because somebody forgot a flag.
#
# NOTHING TRACKED IS EDITED. The block goes into config.local.yaml, the
# gitignored overlay the loader deep-merges over config.yaml
# (components/frontend/src/lib/server/settings.ts). The value written here is a
# `*.trycloudflare.com` hostname that dies in a few hours: this repo has
# already had one of those committed and left dead in HEAD for several commits,
# and `internal/config/config_test.go` now asserts both tracked configs still
# say localhost.
#
# THIS SCRIPT OWNS EXACTLY ONE KEY IN THAT FILE: `plausible`. It is the THIRD
# writer — cloudflare-tunnel's auth-wire.sh owns `oidc`, openreplay-stack's
# wire-frontend.sh owns `replay` — and none of them knows about the others. So
# --restore removes the BLOCK, never the file: an `rm` here would silently
# unwire login (a tunnel with no issuer keeps serving every page and breaks
# only signing in) or stop session replay recording (an empty OpenReplay UI
# looks exactly like the correct default). .claude/skills/lib/config-overlay.sh
# does the per-key surgery for all three.
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
  *)
    echo "unknown argument: $1" >&2
    exit 2
    ;;
esac

# The frontend reads its config ONCE at boot, so a rewrite is inert until it
# restarts — and getting that restart right is the whole trick, exactly as it
# is for openreplay-stack's wiring. THREE servers can be serving this app:
#
#   process-compose `frontend`   vite dev on :8081
#   prod-frontend.sh             the adapter-node build on :8081 (the e2e
#                                harness puts it there and leaves it there)
#   prod-serve.sh                the adapter-node build on :8082, which is what
#                                the app's own Cloudflare tunnel proxies
#
# Restarting only the first succeeds, prints "Process frontend restarted", and
# changes nothing at all.
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

# ⚠ EVERY STEP HERE REPORTS. The first version of this function ran the
# restarts with `>/dev/null 2>&1` on both ends of an `&&` chain, which is how a
# stopped :8082 — the app tunnel's ONLY upstream — sat down for ten minutes
# with this script printing "analytics is ON" and nothing else. A restart that
# stops a server and fails to start it again is the one outcome that must never
# be quiet, because the public URL keeps answering (caddy falls back) right up
# until the fallback is down too.
#
# Each step is therefore: run, capture, and on failure print the tail and name
# the port that is now down. Slow, honest, and it costs one nix-shell entry per
# step (trap 4 in .claude/CLAUDE.md) — which is why they are three steps and
# not one.
step() { # <label> <command…>
  local label="$1"
  shift
  local out
  if out="$(in_shell "$*" 2>&1)"; then
    echo "    $label: ok"
    return 0
  fi
  echo "    $label: FAILED" >&2
  printf '%s\n' "$out" | tail -6 | sed 's/^/        /' >&2
  return 1
}

restart_frontend() {
  local ok=1

  # vite, when process-compose is the thing serving :8081.
  in_shell 'just deploy::proc-comp process restart frontend' >/dev/null 2>&1 && ok=0

  # The built server on :8081, when the e2e harness put one there. `ensure`
  # rebuilds if the source is newer than the build — which it is the first time
  # this feature is wired, because it also adds a component. That build takes
  # minutes, and its failure used to be invisible.
  if in_shell 'test -s .output/run/e2e-prod-frontend.pid' >/dev/null 2>&1; then
    if step ":8081 built server" \
      'bash .claude/skills/hackathon-e2e/scripts/prod-frontend.sh stop &&
       bash .claude/skills/hackathon-e2e/scripts/prod-frontend.sh ensure'; then
      ok=0
    else
      echo "    ⚠ :8081 IS DOWN — restart it: prod-frontend.sh ensure" >&2
    fi
  fi

  # The built server on :8082 — the app tunnel's upstream. Restarted with ITS
  # OWN origin, read back from the running process: an adapter-node server is
  # launched with a FIXED ORIGIN, and handing it the wrong one 403s every form
  # POST through the public URL while every page still renders.
  local origin
  origin="$(in_shell 'bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh origin' 2>/dev/null |
    tr -d '\r' | grep -oE 'https?://[^ ]+' | tail -1 || true)"
  if [ -n "$origin" ]; then
    step ":8082 tunnel upstream ($origin)" \
      "bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh stop &&
       bash .claude/skills/cloudflare-tunnel/scripts/prod-serve.sh ensure '$origin'" ||
      echo "    ⚠ THE APP TUNNEL HAS NO UPSTREAM — restart it: prod-serve.sh ensure $origin" >&2
  fi

  [ "$ok" -eq 0 ] && return 0
  echo "note: restart the frontend for this to take effect:" >&2
  echo "      just deploy::proc-comp process restart frontend" >&2
  echo "      (or, if the e2e built server is serving :8081)" >&2
  echo "      bash .claude/skills/hackathon-e2e/scripts/prod-frontend.sh stop && … ensure" >&2
}

# Restart only when the overlay actually CHANGED — config-overlay.sh answers
# `changed` or `unchanged` for exactly this. A needless bounce of :8081 mid-suite
# fails one unrelated test and nothing in the output points back here.
#
# ⚠ Do not run this while an e2e suite is in flight, even so.
apply() { # <changed|unchanged> <message>
  if [ "$1" = "changed" ]; then
    echo "$2"
    restart_frontend
  else
    echo "$2 (already; nothing changed, frontend left alone)"
  fi
}

if [ "$MODE" = "restore" ]; then
  # `remove`, never `rm`: `oidc` and `replay` may share this file.
  apply "$(bash "$OVERLAY" remove "$FRONTEND_LOCAL" plausible)" \
    "==> analytics is OFF"
  exit 0
fi

require_docker
url="$(tunnel_url || true)"
[ -n "$url" ] || {
  echo "error: no Plausible tunnel running — scripts/up.sh first" >&2
  exit 1
}
load_secrets
domain="${PLAUSIBLE_SITE:-}"
[ -n "$domain" ] || {
  echo "error: no PLAUSIBLE_SITE in $SECRETS_FILE — run scripts/secrets.sh" >&2
  exit 1
}

# THE SCRIPT VARIANT IS TWO DECISIONS, and both are load-bearing.
#
# `local`  — the stock script REFUSES to send from a local address. Read out of
#            the served file, not the docs:
#              /localhost$|^127(\.[0-9]+){0,2}\.[0-9]+$|^\[::1?\]$/.test(location.hostname)
#            The dev app is http://localhost:8081, so without this variant
#            every page view is silently dropped by the browser — the most
#            expensive shape of failure there is, because everything looks
#            wired and nothing arrives.
# `manual` — the script otherwise sends a pageview by ITSELF, using
#            `location.href`. That URL is the one thing this integration must
#            never send (invite tokens, hackathon ids). Manual mode means every
#            pageview is one PlausibleAnalytics.svelte decided to send, with a
#            URL it built out of the route template.
#
# The file name's variant order does not matter (the instance serves every
# permutation); `local.manual` is written for readability.
script_url="$url/js/script.local.manual.js"

block=$(
  cat <<YAML
plausible:
  enabled: true
  scriptUrl: $script_url
  domain: $domain
YAML
)

if [ "$MODE" = "print" ]; then
  echo "$block"
  exit 0
fi

# Fail before writing a config that points at a script that is not there — a
# 404 on the tracker is invisible in the app (a failed <script> logs one line
# and the page is fine) and looks identical to "nobody visited".
#
# cfn_http_code, not a bare curl: with a NAMED hostname the check must fail on a
# broken TUNNEL and not on a broken RESOLVER, and those are distinguishable —
# it retries against the address Cloudflare's own DoH endpoint gives. The
# machine this was built on answers AAAA-only for these names with no IPv6 route
# out, so a bare curl reports 000 for a dashboard that is serving 200.
code="$(cfn_http_code "$script_url")"
[ "$code" = "200" ] || {
  echo "error: $script_url answered $code — is the tunnel healthy? (scripts/url.sh)" >&2
  exit 1
}

apply "$(printf '%s\n' "$block" | bash "$OVERLAY" set "$FRONTEND_LOCAL" plausible)" \
  "==> analytics is ON"
echo "    script   $script_url"
echo "    domain   $domain"
echo "    dashboard $url/$domain"
echo "    ⚠ page views from every visitor to the app are now counted."
echo "      No cookie is set and no URL is sent — the ROUTE TEMPLATE is"
echo "      (see components/frontend/src/lib/utils/analyticsRoute.ts), and"
echo "      docs/frontend/analytics.md states what Plausible does with the IP."
