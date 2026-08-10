#!/usr/bin/env bash
# ONE command for a public URL serving the whole application, with working
# logins. Idempotent, and it verifies rather than announces.
#
# Why this exists as its own script: getting here reliably means five things
# being true at once, and every one of them has broken on its own at least
# once during development —
#
#   1. postgres, keycloak and the backend running (a suite run leaves the
#      backend down often enough that "it worked yesterday" is not evidence);
#   2. a BUILT frontend on :8081 (vite is unusable after a codegen wipe — see
#      container trap 2b in .claude/CLAUDE.md);
#   3. the tunnel container up with a quick-tunnel hostname;
#   4. that hostname wired into BOTH OIDC issuers, or every login fails with
#      "invalid issuer" while every page still serves — the failure that is
#      invisible until somebody actually signs in;
#   5. a server whose ORIGIN matches the hostname it is reached on, or
#      SvelteKit rejects the login POST and the button silently does nothing.
#
# Each step is checked, repaired if it can be, and reported. The script ends by
# driving a REAL login round-trip: serving HTML proves nothing about OIDC.
#
# Usage: serve-public.sh [--seed]     (--seed also loads the SDSC archive)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS="$(cd "$HERE/../.." && pwd)"
ROOT_DIR="$(cd "$SKILLS/.." && pwd)"
E2E="$SKILLS/hackathon-e2e"

SEED=0
[ "${1:-}" = "--seed" ] && SEED=1

step() { echo; echo "── $* ─────────────────────────────────────────"; }
ok()   { echo "  ok    $*"; }
warn() { echo "  warn  $*" >&2; }

in_dev() { bash "$SKILLS/devcontainer-up/scripts/exec.sh" "$@"; }
nix()    { in_dev just nix::develop default bash -c "$1"; }

# ── 1. the stack ─────────────────────────────────────────────────────────────
step "Stack"
nix 'bash .claude/skills/hackathon-e2e/scripts/up.sh' >/dev/null 2>&1 || true

for svc in postgres keycloak; do
  case "$svc" in
    postgres) probe='pg_isready -h 127.0.0.1 -p 5432 -U postgres' ;;
    keycloak) probe='curl -fsS -o /dev/null --max-time 10 http://localhost:8180/realms/hackagon/.well-known/openid-configuration' ;;
  esac
  if nix "$probe" >/dev/null 2>&1; then ok "$svc"; else
    warn "$svc not ready — restarting"
    nix "just deploy::proc-comp process restart $svc" >/dev/null 2>&1 || true
  fi
done

# The backend is the one that is routinely down: `just deploy::down` and the
# suites both stop it, and nothing brings it back on its own.
if nix 'grpcurl -plaintext localhost:3000 health.HealthService/Check' >/dev/null 2>&1; then
  ok "backend"
else
  warn "backend not answering — restarting (it rebuilds, ~1 min)"
  nix 'just deploy::proc-comp process restart backend' >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do
    nix 'grpcurl -plaintext localhost:3000 health.HealthService/Check' >/dev/null 2>&1 && break
    sleep 3
  done
  nix 'grpcurl -plaintext localhost:3000 health.HealthService/Check' >/dev/null 2>&1 \
    && ok "backend" || { echo "error: backend will not start — see 'just deploy::proc-comp process logs backend'" >&2; exit 1; }
fi

# ── 2. the built frontend ────────────────────────────────────────────────────
# prod-frontend.sh already encodes the three traps in starting this by hand
# (HOST=:: collides with the socat bridge; 127.0.0.1 is not what localhost
# resolves to in this container; AUTH_URL must accompany ORIGIN).
step "Frontend"
nix 'bash .claude/skills/hackathon-e2e/scripts/prod-frontend.sh ensure' 2>&1 | sed 's/^/  /' || {
  echo "error: no frontend on :8081" >&2; exit 1; }

# ── 3+4. tunnel, wired ───────────────────────────────────────────────────────
step "Tunnel"
bash "$HERE/up.sh" --with-auth --prod 2>&1 | tail -5 | sed 's/^/  /'
URL="$(bash "$HERE/url.sh" 2>/dev/null | awk '{print $NF}' | grep -E '^https://' | tail -1)"
[ -n "$URL" ] || { echo "error: no public URL" >&2; exit 1; }

if [ "$SEED" -eq 1 ]; then
  step "Archive"
  nix "E2E_KEYCLOAK_URL=$URL bash .claude/skills/seed-past-hackathons/scripts/seed.sh" 2>&1 \
    | grep -cE '\[\+\] hackathon|\[=\]' | sed 's/^/  editions present: /'
  nix "E2E_KEYCLOAK_URL=$URL bash .claude/skills/seed-past-hackathons/scripts/prizes.sh" >/dev/null 2>&1 || true
fi

# ── 5. prove a login ─────────────────────────────────────────────────────────
# The whole point. Every step above can be green while signing in is broken,
# and that combination has happened repeatedly: the issuer, the ORIGIN and a
# stale server each produce it.
step "Proving a real login through $URL"
if in_dev env TUNNEL_BASE_URL="$URL" PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true \
     just nix::develop default bash -c \
     'cd .claude/skills/hackathon-e2e && pnpm exec playwright test --project=tunnel --grep "logs in"' \
     >/dev/null 2>&1; then
  ok "alice signed in and reached her dashboard"
else
  echo "error: pages serve but LOGIN FAILED — the one failure that hides." >&2
  echo "  Check: is the issuer wired? (config.local.yaml should hold an oidc block)" >&2
  echo "  Check: is a server with ORIGIN=$URL on :8082? (prod-serve.sh status)" >&2
  exit 1
fi

cat <<EOF

── Ready ───────────────────────────────────────────────────
  App        $URL
  Sign in    alice · bob · charles · hackagon-admin
  Password   aliceandbob   (dev only — never a real deployment)

  Keycloak admin console  $URL/admin/  (admin / admin)

  Stop the public link:  .claude/skills/cloudflare-tunnel/scripts/down.sh
  The quick-tunnel URL dies with the tunnel; re-run this to mint a new one.
EOF
