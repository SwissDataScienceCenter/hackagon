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
#   --reporter=<r>   passed straight to Playwright, as is anything after `--`
#
# On reporters: you almost certainly do not need one. playwright.config.ts
# already runs the json reporter and writes .artifacts/results.json on EVERY
# run, which is what scripts/embed-run-report.mjs reads. Do not do
# `run.sh journey --reporter=json > report.json`: everything in this container
# prints Nix/devenv/quitsh banners to stdout ahead of the test output, so the
# redirected file does not parse. If you want Playwright to write a second copy
# itself, set PLAYWRIGHT_JSON_OUTPUT_NAME and pass --reporter=json.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

SUITE="smoke"
RESET=1
HEADED=0
GREP=""
# extra flags forwarded verbatim to `playwright test`. --reporter used to hit
# the catch-all below and exit 2, so the documented "run.sh journey
# --reporter=json" failed before it started.
PW_EXTRA=()

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
    --reporter=*) PW_EXTRA+=("$1") ;;
    --reporter)
        shift
        PW_EXTRA+=("--reporter=${1:?--reporter needs a value}")
        ;;
    --)
        shift
        PW_EXTRA+=("$@")
        break
        ;;
    -h | --help)
        sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
    args+=("${PW_EXTRA[@]+"${PW_EXTRA[@]}"}")
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

# Session replay is NO LONGER BORROWED AWAY. Do not reintroduce that.
#
# It used to be: this script read the `replay` block out of the overlay for
# every suite but `openreplay` and wrote it back on exit, because the consent
# banner was `fixed bottom-0 z-[60]` with nothing reserving its space — it sat
# on top of whatever was at the bottom of the page and swallowed clicks aimed
# at it. `act0.about.publish` clicks the CMS `visible` checkbox, which landed
# exactly there; Playwright retried for the full 60s against
#
#   <div role="region" aria-label="Session recording" …> intercepts pointer events
#
# and the journey died on its 10th action with 338 not run.
#
# The banner reserves its own space in the document now (it is `sticky
# bottom-0`, so the last band of the page belongs to it and content scrolls
# clear), and `helpers/reflow.ts:expectConsentBannerClearsContent` asserts that
# at 8 widths across every route. With that fixed there is nothing to borrow:
# the tracker is consent-gated — the server withholds the ingest endpoint and
# the project key until a browser clicks "Allow recording", which no suite but
# `openreplay` ever does — so a wired `replay` block changes exactly ONE thing
# for the other suites: the ask is on screen, exactly as it is for every
# first-time visitor. Running against the chrome real people see is the point.
#
# The mobile suite needs the OPPOSITE guarantee. Its sweep asserts ABOUT the
# banner, and an assertion whose subject is absent verifies nothing — the
# failure mode this repo keeps finding. So when no rig has wired replay, that
# suite gets a block of its own: enough for the server to render the ask,
# pointing at a port where nothing listens, removed again on exit. Consent is
# never granted, so not one byte is ever addressed to it.
OVERLAY="$ROOT_DIR/.claude/skills/lib/config-overlay.sh"
FRONTEND_LOCAL="$ROOT_DIR/components/frontend/data/test/config/config.local.yaml"
REPLAY_STUBBED=0
if [ "$SUITE" = "mobile" ] && [ -f "$OVERLAY" ] &&
    ! bash "$OVERLAY" has "$FRONTEND_LOCAL" replay; then
    bash "$OVERLAY" set "$FRONTEND_LOCAL" replay >/dev/null <<'STUB'
replay:
  enabled: true
  # NOTHING LISTENS HERE, and nothing ever will. The tracker is only handed an
  # ingest endpoint and a project key once a browser has consented, and a
  # layout sweep never does — this block exists so the SERVER renders the
  # consent banner, which tests/mobile treats as part of the chrome.
  # Written by hackathon-e2e/scripts/run.sh, removed when the run ends.
  ingestPoint: http://127.0.0.1:9/ingest
  projectKey: mobile-sweep-never-ingests
  allowInsecureOrigin: true
STUB
    REPLAY_STUBBED=1
    echo 'note: no session replay wired — added a no-ingest `replay` block so the consent banner renders for this run'
    # The frontend reads its config once at boot, so the block is inert until it
    # restarts. Stop the built server here; wait-ready.sh starts a fresh one
    # below. (reset.sh does this too, but a --no-reset run would otherwise sweep
    # a server that never saw the block — and every banner assertion would fail
    # for want of a banner.)
    bash "$HERE/prod-frontend.sh" stop >/dev/null 2>&1 || true
fi

# EXIT, not a success path — a failed or interrupted run must not leave the
# public link logged-out either. auth-wire.sh also bounces the built server on
# :8082 when one is up, because it read the issuer out of config.yaml once at
# boot; that is why re-wiring restores logins through the tunnel and not just
# on localhost.
on_exit() {
    if [ "$REPLAY_STUBBED" -eq 1 ]; then
        echo
        echo '==> Removing the no-ingest `replay` block this run added'
        # `remove`, never `rm`: the overlay is shared, and this script has no
        # business deleting a key it did not write (see config-overlay.sh).
        bash "$OVERLAY" remove "$FRONTEND_LOCAL" replay >/dev/null
        # The frontend read the block once at boot, so it keeps rendering the ask
        # until it restarts. Bounce the built one — no docker needed, which matters
        # because this script runs INSIDE the dev container.
        bash "$HERE/prod-frontend.sh" stop >/dev/null 2>&1 &&
            bash "$HERE/prod-frontend.sh" ensure >/dev/null 2>&1 ||
            echo "warn: the replay block is gone but the frontend was not restarted;" \
                "run prod-frontend.sh stop && … ensure" >&2
    fi
    if [ -n "$WIRED_URL" ]; then
        echo
        echo "==> Re-wiring tunnel auth to $WIRED_URL"
        bash "$AUTH_WIRE" "$WIRED_URL" >/dev/null 2>&1 ||
            echo "warn: re-wiring failed; run auth-wire.sh $WIRED_URL by hand" >&2
    fi
}
if [ -n "$WIRED_URL" ] || [ "$REPLAY_STUBBED" -eq 1 ]; then
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
PW_ARGS+=("${PW_EXTRA[@]+"${PW_EXTRA[@]}"}")

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
