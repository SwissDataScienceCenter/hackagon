#!/usr/bin/env bash
# One-command deterministic e2e run:
#   reset -> boot stack -> wait ready -> (seed) -> probe capabilities -> Playwright (Firefox)
#
# Usage: run.sh [smoke|journey|all|mobile] [options]
#   smoke      (default) seed-fixture suite: what each persona can see and do
#   journey    full lifecycle recipe on an EMPTY database (acts 1-8)
#   all        smoke, then a fresh reset, then journey
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
    smoke | journey | all | mobile) SUITE="$1" ;;
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
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
  FRONTEND_CFG="$ROOT_DIR/components/frontend/data/test/config/config.yaml"
  WIRED_URL="$(sed -n 's|^[[:space:]]*issuer:[[:space:]]*\(https://[^/]*\)/realms/.*|\1|p' "$FRONTEND_CFG" 2>/dev/null | head -1)"

  bash "$AUTH_WIRE" --restore ||
    echo "warn: could not restore OIDC issuers; logins may fail if a tunnel is wired" >&2

  if [ -n "$WIRED_URL" ]; then
    echo "note: tunnel auth was wired to $WIRED_URL — it will be re-wired when this run finishes"
  fi
fi

# EXIT, not a success path — a failed or interrupted run must not leave the
# public link logged-out either. auth-wire.sh also bounces the built server on
# :8082 when one is up, because it read the issuer out of config.yaml once at
# boot; that is why re-wiring restores logins through the tunnel and not just
# on localhost.
restore_public_link() {
  echo
  echo "==> Re-wiring tunnel auth to $WIRED_URL"
  bash "$AUTH_WIRE" "$WIRED_URL" >/dev/null 2>&1 ||
    echo "warn: re-wiring failed; run auth-wire.sh $WIRED_URL by hand" >&2
}
if [ -n "$WIRED_URL" ]; then
  trap restore_public_link EXIT
fi

if [ "$RESET" -eq 1 ]; then
  bash "$HERE/reset.sh"
fi

bash "$HERE/up.sh"
bash "$HERE/wait-ready.sh"

if [ "$SUITE" = "smoke" ]; then
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
