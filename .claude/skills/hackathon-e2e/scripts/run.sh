#!/usr/bin/env bash
# One-command deterministic e2e run:
#   reset -> boot stack -> wait ready -> (seed) -> probe capabilities -> Playwright (Firefox)
#
# Usage: run.sh [smoke|journey|all|mobile|openreplay] [options]
#   smoke      (default) seed-fixture suite: what each persona can see and do
#   journey    full lifecycle recipe on an EMPTY database (acts 1-8)
#   all        smoke, then a fresh reset, then journey
#   openreplay session-replay privacy proof on the seed fixture. Self-skips
#              unless replay.enabled is true in the frontend config — wire it
#              with openreplay-stack/scripts/wire-frontend.sh first. NOT part
#              of `all`: it needs a live OpenReplay, which nothing else does.
#
# Options:
#   --no-reset   reuse the running stack + data (fast iteration; smoke only —
#                the journey always needs a fresh database)
#   --headed     run Firefox headed
#   --grep <p>   filter tests by title
#   --until-act <n>  journey only: play the story up to act <n> and leave the
#                stack frozen in that state for inspection (1..8)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

SUITE="smoke"
RESET=1
HEADED=0
GREP=""

while [ $# -gt 0 ]; do
  case "$1" in
    smoke | journey | all | mobile | openreplay) SUITE="$1" ;;
    --no-reset) RESET=0 ;;
    --headed) HEADED=1 ;;
    --grep)
      shift
      GREP="${1:?--grep needs a pattern}"
      ;;
    --until-act)
      shift
      export JOURNEY_UNTIL_ACT="${1:?--until-act needs an act number (1..8)}"
      ;;
    -h | --help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $1 (see --help)" >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$SUITE" = "all" ]; then
  # Two independent, fully deterministic runs: seeded smoke, then a clean
  # journey. Each does its own reset.
  args=()
  [ "$HEADED" -eq 1 ] && args+=(--headed)
  [ -n "$GREP" ] && args+=(--grep "$GREP")
  bash "${BASH_SOURCE[0]}" smoke "${args[@]+"${args[@]}"}"
  bash "${BASH_SOURCE[0]}" journey "${args[@]+"${args[@]}"}"
  exit 0
fi

if [ "$SUITE" = "journey" ] && [ "$RESET" -eq 0 ]; then
  echo "note: the journey suite requires a fresh database — ignoring --no-reset."
  RESET=1
fi

echo "════════════════════════════════════════════════════════════"
echo "  hackagon-e2e: $SUITE suite $([ "$RESET" -eq 1 ] && echo '(from scratch)' || echo '(reusing state)')"
echo "════════════════════════════════════════════════════════════"

# A live Cloudflare tunnel wired with --with-auth repoints the frontend and
# backend OIDC issuers at its public URL. Every persona here logs in over
# localhost, so those tokens would carry the wrong issuer and EVERY auth.setup
# test fails with a confusing "invalid issuer". Restoring is idempotent and a
# no-op when no tunnel is wired, so just always do it — remembering to is not
# a workable contract.
AUTH_WIRE="$ROOT_DIR/.claude/skills/cloudflare-tunnel/scripts/auth-wire.sh"
WIRED_URL=""

# NOTE: there is deliberately no prod-mode handling here any more. `up.sh
# --prod` used to park the adapter-node BUILD on :8081 in place of vite, so
# this script had to evict it for the run and restore it on exit — and during
# each of those two handovers nothing was listening on :8081, which is what
# caddy proxies for the tunnel. Every single suite run therefore answered the
# PUBLIC link with ~40s of 502 Bad Gateway. The built server has its own port
# (:8082) now and process-compose keeps :8081, so a run and the public link no
# longer contend at all. Do not reintroduce a guard here.

if [ -f "$AUTH_WIRE" ]; then
  # Remember whether a tunnel was wired BEFORE unwiring, and put it back when
  # the run ends. Restoring localhost is required for the suite, but leaving it
  # there silently breaks the public link every single time someone runs the
  # tests — which is exactly what kept happening: the URL still served pages,
  # so it looked fine until somebody tried to log in.
  # Read it out of the OVERLAY, not config.yaml: wiring writes the tunnel
  # issuer to the gitignored config.local.yaml precisely so the tracked file
  # never carries a hostname that dies with the tunnel. The file's absence is
  # the "no tunnel wired" signal — sed on a missing file is silenced below.
  FRONTEND_LOCAL="$ROOT_DIR/components/frontend/data/test/config/config.local.yaml"
  # Test -f FIRST. `2>/dev/null` hides sed's complaint but not its exit code,
  # and under `set -euo pipefail` a missing file made this assignment kill the
  # script before it printed a single word — which is every FRESH CLONE, since
  # config.local.yaml only exists once auth-wire.sh has written one. It went
  # unnoticed because every machine that had ever wired a tunnel had the file.
  WIRED_URL=""
  if [ -f "$FRONTEND_LOCAL" ]; then
    WIRED_URL="$(sed -n 's|^[[:space:]]*issuer:[[:space:]]*\(https://[^/]*\)/realms/.*|\1|p' "$FRONTEND_LOCAL" | head -1)"
  fi

  bash "$AUTH_WIRE" --restore ||
    echo "warn: could not restore OIDC issuers; logins may fail if a tunnel is wired" >&2

  if [ -n "$WIRED_URL" ]; then
    echo "note: tunnel auth was wired to $WIRED_URL — it will be re-wired when this run finishes"
  fi
fi

# Session replay, borrowed for the duration of the run — same contract as the
# tunnel above, for the same reason.
#
# The tracker is only wanted by the `openreplay` suite. For every other suite
# it is not merely irrelevant, it BREAKS them: the consent banner is
# `fixed bottom-0 z-[60]`, so it sits on top of whatever is at the bottom of
# the page and swallows clicks aimed at it. `act0.about.publish` clicks the
# CMS's `visible` checkbox, which lands exactly there — Playwright retried for
# the full 60s against
#
#   <div role="region" aria-label="Session recording" …> intercepts pointer events
#
# and the journey died on its 10th action with 338 not run. Smoke passed the
# same wiring, which is what makes this worth automating rather than
# remembering: whether a suite trips over the banner depends on where its
# controls happen to sit.
#
# Borrowed, not switched off: the block is read out first and written back on
# EXIT. A run that silently unwired the replay somebody set up on purpose would
# be the tunnel's old bug in a new place — the UI keeps working, and only the
# thing you were trying to record stops happening.
OVERLAY="$ROOT_DIR/.claude/skills/lib/config-overlay.sh"
FRONTEND_LOCAL="$ROOT_DIR/components/frontend/data/test/config/config.local.yaml"
REPLAY_BLOCK=""
if [ "$SUITE" != "openreplay" ] && [ -f "$OVERLAY" ]; then
  REPLAY_BLOCK="$(bash "$OVERLAY" get "$FRONTEND_LOCAL" replay)"
  if [ -n "$REPLAY_BLOCK" ]; then
    bash "$OVERLAY" remove "$FRONTEND_LOCAL" replay >/dev/null
    echo "note: session replay was wired — off for this run, restored when it finishes"
  fi
fi

# EXIT, not a success path — a failed or interrupted run must not leave the
# public link logged-out either. auth-wire.sh also bounces the built server on
# :8082 when one is up, because it read the issuer out of config.yaml once at
# boot; that is why re-wiring restores logins through the tunnel and not just
# on localhost.
on_exit() {
  if [ -n "$REPLAY_BLOCK" ]; then
    echo
    echo "==> Re-wiring session replay"
    printf '%s\n' "$REPLAY_BLOCK" | bash "$OVERLAY" set "$FRONTEND_LOCAL" replay >/dev/null
    # The frontend reads its config once at boot, so putting the block back is
    # inert until the server restarts. Bounce the built one — no docker needed,
    # which matters because this script runs INSIDE the dev container.
    bash "$HERE/prod-frontend.sh" stop >/dev/null 2>&1 &&
      bash "$HERE/prod-frontend.sh" ensure >/dev/null 2>&1 ||
      echo "warn: replay is wired again but the frontend was not restarted;" \
        "run prod-frontend.sh stop && … ensure" >&2
  fi
  if [ -n "$WIRED_URL" ]; then
    echo
    echo "==> Re-wiring tunnel auth to $WIRED_URL"
    bash "$AUTH_WIRE" "$WIRED_URL" >/dev/null 2>&1 ||
      echo "warn: re-wiring failed; run auth-wire.sh $WIRED_URL by hand" >&2
  fi
}
if [ -n "$WIRED_URL" ] || [ -n "$REPLAY_BLOCK" ]; then
  trap on_exit EXIT
fi

if [ "$RESET" -eq 1 ]; then
  bash "$HERE/reset.sh"
fi

bash "$HERE/up.sh"
bash "$HERE/wait-ready.sh"

# The openreplay suite asserts against the seed fixture (it gives h1 a
# registration form and types into it), so it seeds exactly like smoke.
if [ "$SUITE" = "smoke" ] || [ "$SUITE" = "openreplay" ]; then
  bash "$HERE/seed.sh"
elif [ "$SUITE" = "mobile" ]; then
  # Fresh mobile runs use the seeded fixture; --no-reset runs the battery
  # over whatever world is live (e.g. a journey frozen at some act) without
  # polluting it with the fixture.
  if [ "$RESET" -eq 1 ]; then bash "$HERE/seed.sh"; fi
else
  # The journey's extras crowd (cast.json) must exist in Keycloak.
  bash "$HERE/roster.sh"
fi

bash "$HERE/probe.sh"

cd "$SKILL_DIR"

if [ ! -d node_modules ]; then
  echo "==> Installing test dependencies (pnpm)..."
  pnpm install
fi

# Idempotent: returns quickly when browser + libs are already present.
# --with-deps first: a plain install "succeeds" without the system libraries
# and Firefox then fails at LAUNCH time, which the fallback cannot catch.
echo "==> Ensuring Playwright Firefox is installed..."
pnpm exec playwright install --with-deps firefox 2>/dev/null ||
  pnpm exec playwright install firefox

PW_ARGS=(test --project="$SUITE")
[ "$HEADED" -eq 1 ] && PW_ARGS+=(--headed)
[ -n "$GREP" ] && PW_ARGS+=(--grep "$GREP")

# Inside the Nix dev shell, ldd is Nix's glibc ldd whose linker does not
# search /usr/lib — Playwright's host validation then reports every system
# library as missing even though Firefox launches fine. Skip the check.
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

echo "==> Running Playwright ($SUITE, Firefox)..."
STATUS=0
pnpm exec playwright "${PW_ARGS[@]}" || STATUS=$?

echo ""
echo "── Done ────────────────────────────────────────────────────"
echo "  HTML report:  pnpm --dir '$SKILL_DIR' run report"
echo "  Stack is left running — stop it with: just down"
exit "$STATUS"
