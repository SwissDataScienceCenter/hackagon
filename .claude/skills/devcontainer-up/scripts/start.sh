#!/usr/bin/env bash
# One command from nothing to a working public URL.
#
#   start.sh                 container + stack, reachable on localhost:8081
#   start.sh --tunnel        ... plus a Cloudflare quick tunnel with LOGIN
#   start.sh --replay        ... plus OpenReplay session replay, wired + PROVED
#   start.sh --tunnel --seed ... and the dev fixture loaded
#
# Exists because the chain has four steps in three skills, and the one people
# forget is the last: a tunnel that serves pages but was never auth-wired looks
# completely fine until somebody tries to sign in. This wires it and then
# PROVES a login round-trip before telling you it is ready. `--replay` gets the
# same treatment: it finishes by watching bytes reach the ingest endpoint,
# because "session replay is ready" from a script that never saw a byte is the
# exact claim this repo keeps catching.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
SKILLS="$ROOT_DIR/.claude/skills"

WITH_TUNNEL=0
WITH_SEED=0
WITH_REPLAY=0
for arg in "$@"; do
  case "$arg" in
    --tunnel) WITH_TUNNEL=1 ;;
    --seed) WITH_SEED=1 ;;
    --replay) WITH_REPLAY=1 ;;
    -h | --help)
      sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Dev container"
bash "$SKILLS/devcontainer-up/scripts/up.sh"

step "Stack (postgres, keycloak, backend, frontend)"
bash "$SKILLS/devcontainer-up/scripts/exec.sh" bash .claude/skills/hackathon-e2e/scripts/up.sh
bash "$SKILLS/devcontainer-up/scripts/exec.sh" bash .claude/skills/hackathon-e2e/scripts/wait-ready.sh

if [ "$WITH_SEED" -eq 1 ]; then
  step "Seed fixture"
  bash "$SKILLS/devcontainer-up/scripts/exec.sh" bash .claude/skills/hackathon-e2e/scripts/seed.sh
fi

# ── session replay ─────────────────────────────────────────────────────────
#
# OPT-IN, and it stays that way: this brings up 23 more containers and wants
# 8 GB of RAM on top of the dev stack (openreplay-stack/scripts/doctor.sh
# checks). Nobody who typed `start.sh` gets that by surprise.
#
# BEFORE the tunnel, deliberately. The proof below drives Playwright against
# http://localhost:8081 and its `setup` dependency logs every persona in
# through Keycloak; a wired tunnel repoints both OIDC issuers at the public
# hostname, so doing this afterwards would test the tunnel's auth wiring
# instead of the ingest path and fail for a reason that has nothing to do with
# replay. Both end up wired: they own different keys in the same
# config.local.yaml and neither can remove the other's.
REPLAY_URL=""
REPLAY_BYTES=""
if [ "$WITH_REPLAY" -eq 1 ]; then
  step "OpenReplay (23 services — first run pulls ~25 images)"
  # up.sh is idempotent and creates/reuses the admin account itself from the
  # gitignored .secrets.env; an account made by hand with an unrecorded
  # password has already cost one full volume wipe.
  bash "$SKILLS/openreplay-stack/scripts/up.sh"

  step "Pointing the app at it"
  # Writes the `replay` block into components/frontend/data/test/config/
  # config.local.yaml — the gitignored overlay, never the tracked config.yaml —
  # and bounces both possible :8081 servers, since each reads its config once
  # at boot.
  bash "$SKILLS/openreplay-stack/scripts/wire-frontend.sh"
  REPLAY_URL="$(bash "$SKILLS/openreplay-stack/scripts/url.sh" 2>/dev/null || true)"

  step "Proving a session is actually recorded"
  # The check that matters, and the reason this is not just three `up` calls in
  # a row. Everything up to here is configuration: a stack that answers, a
  # block written into a file, a frontend that restarted. None of it says a
  # single byte can travel from a browser to the ingest endpoint — a stale
  # ingestPoint, a dead quick tunnel or an unstarted tracker all leave every
  # one of those steps looking successful and the OpenReplay UI empty.
  #
  # So: run the consent spec's first test, which clears cookies, loads a page,
  # clicks the REAL "Allow recording" banner and counts the bytes the tracker
  # posts. Reused, not reinvented — tests/openreplay/capture.ts is the same
  # machinery masking.spec.ts greps for sentinels.
  CAPTURE="$ROOT_DIR/.claude/skills/hackathon-e2e/.artifacts/openreplay/consented.bin"
  rm -f "$CAPTURE"
  PROOF_LOG="$(mktemp)"
  PROOF='cd .claude/skills/hackathon-e2e
[ -d node_modules ] || pnpm install
pnpm exec playwright install firefox >/dev/null 2>&1 || true
pnpm exec playwright test --project=openreplay --grep "records nothing until the banner is answered"'

  if ! bash "$SKILLS/devcontainer-up/scripts/exec.sh" \
    env PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true \
    just nix::develop default bash -c "$PROOF" >"$PROOF_LOG" 2>&1; then
    echo
    echo "error: the session-replay proof FAILED — recording does not work." >&2
    tail -40 "$PROOF_LOG" >&2
    exit 1
  fi

  # A SKIP IS A FAILURE HERE. Every spec under tests/openreplay self-skips when
  # it cannot see `replay.enabled: true`, and a skipped Playwright run exits 0 —
  # so without this check a broken wire-up would print "ready" and mean
  # "nothing ran". That is not hypothetical: the config moved from config.yaml
  # to the config.local.yaml overlay, and until capture.ts learned to read the
  # merged view, this suite skipped itself on a correctly wired machine.
  # Matched against Playwright's own summary line ("  1 skipped"), not the word
  # anywhere in the log: `pnpm install` above prints "skipped" of its own accord
  # and would fail this check for nothing.
  if grep -qE "^[[:space:]]*[0-9]+ skipped" "$PROOF_LOG"; then
    echo
    echo "error: the session-replay proof SELF-SKIPPED, so nothing was verified." >&2
    echo "       tests/openreplay could not see replay.enabled — check the merged" >&2
    echo "       config: components/frontend/data/test/config/config.local.yaml" >&2
    tail -20 "$PROOF_LOG" >&2
    exit 1
  fi

  # ...and the bytes themselves, on disk. The spec writes what it captured; an
  # empty file would mean it passed for some reason other than a recording.
  REPLAY_BYTES="$(wc -c <"$CAPTURE" 2>/dev/null || echo 0)"
  if [ "${REPLAY_BYTES:-0}" -le 0 ]; then
    echo
    echo "error: the proof reported success but captured 0 bytes ($CAPTURE)." >&2
    exit 1
  fi
  rm -f "$PROOF_LOG"
  echo "  $REPLAY_BYTES bytes reached the ingest endpoint (see $CAPTURE)"
fi

# ── the public URL ─────────────────────────────────────────────────────────
URL=""
if [ "$WITH_TUNNEL" -eq 1 ]; then
  step "Cloudflare quick tunnel with login"
  bash "$SKILLS/cloudflare-tunnel/scripts/up.sh" --with-auth

  URL="$(bash "$SKILLS/cloudflare-tunnel/scripts/url.sh" | awk '{print $NF}' | tail -1)"
  if [ -z "$URL" ]; then
    echo "error: tunnel is up but no public URL was found" >&2
    exit 1
  fi

  step "Proving a login round-trip through $URL"
  # The check that matters. Serving HTML proves nothing about OIDC: the failure
  # mode this guards against is a tunnel whose issuers still point at localhost,
  # where every page loads and only signing in is broken.
  if ! bash "$SKILLS/devcontainer-up/scripts/exec.sh" \
    env TUNNEL_BASE_URL="$URL" PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true \
    just nix::develop default bash -c \
    'cd .claude/skills/hackathon-e2e && pnpm exec playwright test --project=tunnel --grep "logs in"' \
    >/dev/null 2>&1; then
    echo
    echo "warn: the tunnel serves pages but the login round-trip FAILED." >&2
    echo "      Re-wire with: cloudflare-tunnel/scripts/auth-wire.sh $URL" >&2
    exit 1
  fi
fi

step "Ready"
if [ -n "$URL" ]; then
  echo "  App          $URL"
  echo "               sign in as alice / aliceandbob — login verified through the tunnel"
  echo "               (while the tunnel is wired, localhost logins carry the wrong issuer)"
else
  echo "  App          http://localhost:8081"
  echo "               sign in as alice / aliceandbob"
fi

if [ "$WITH_REPLAY" -eq 1 ]; then
  email="$(sed -n 's/^OPENREPLAY_EMAIL=//p' "$SKILLS/openreplay-stack/.secrets.env" 2>/dev/null | head -1)"
  echo
  echo "  OpenReplay   ${REPLAY_URL:-<no tunnel URL>}"
  echo "               sign in as ${email:-<see .secrets.env>} — the password is in"
  echo "               .claude/skills/openreplay-stack/.secrets.env (gitignored)"
  echo "               $REPLAY_BYTES bytes were recorded just now, so ingest works."
  echo
  echo "  ⚠ RECORDING IS CONSENT-GATED. Every visitor is ASKED, and nothing is"
  echo "    recorded until they click \"Allow recording\" — so an OpenReplay UI"
  echo "    with no sessions in it is the CORRECT default, not a broken ingest."
  echo "    Withdraw at /account. What is recorded is masked by default-deny;"
  echo "    see docs/frontend/session-replay.md."
  echo
  echo "  Turn it off  openreplay-stack/scripts/wire-frontend.sh --restore"
  echo "               openreplay-stack/scripts/down.sh   (keeps recordings)"
fi
