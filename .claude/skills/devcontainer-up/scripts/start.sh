#!/usr/bin/env bash
# One command from nothing to a working public URL.
#
#   start.sh                 container + stack, reachable on localhost:8081
#   start.sh --tunnel        ... plus a Cloudflare quick tunnel with LOGIN
#   start.sh --tunnel --seed ... and the dev fixture loaded
#
# Exists because the chain has four steps in three skills, and the one people
# forget is the last: a tunnel that serves pages but was never auth-wired looks
# completely fine until somebody tries to sign in. This wires it and then
# PROVES a login round-trip before telling you it is ready.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
SKILLS="$ROOT_DIR/.claude/skills"

WITH_TUNNEL=0
WITH_SEED=0
for arg in "$@"; do
  case "$arg" in
    --tunnel) WITH_TUNNEL=1 ;;
    --seed) WITH_SEED=1 ;;
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

if [ "$WITH_TUNNEL" -eq 0 ]; then
  step "Ready"
  echo "  http://localhost:8081    (sign in as alice / aliceandbob)"
  exit 0
fi

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
if bash "$SKILLS/devcontainer-up/scripts/exec.sh" \
  env TUNNEL_BASE_URL="$URL" PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true \
  just nix::develop default bash -c \
  'cd .claude/skills/hackathon-e2e && pnpm exec playwright test --project=tunnel --grep "logs in"' \
  >/dev/null 2>&1; then
  step "Ready"
  echo "  $URL    (sign in as alice / aliceandbob — login verified)"
else
  echo
  echo "warn: the tunnel serves pages but the login round-trip FAILED." >&2
  echo "      Re-wire with: cloudflare-tunnel/scripts/auth-wire.sh $URL" >&2
  exit 1
fi
