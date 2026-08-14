#!/usr/bin/env bash
# Bring OpenReplay up behind a Cloudflare quick tunnel.
#
#   doctor → fetch upstream → prepare env → start tunnel (get URL)
#          → point the stack at that URL → start everything
#
# The tunnel starts FIRST because the public hostname has to be known before
# the app boots: OpenReplay bakes it into its config, and a stale value means
# sessions silently never arrive. That is also why quick tunnels are a
# debugging tool here and not a deployment — every restart mints a new URL and
# this script has to rewrite the config again.
#
# Usage: up.sh [--skip-doctor] [--dry-run]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

DRY=0; SKIP_DOCTOR=0; MODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-doctor) SKIP_DOCTOR=1 ;;
    --named) MODE=named ;;
    --quick) MODE=quick ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

require_docker
[ "$SKIP_DOCTOR" -eq 1 ] || bash "$HERE/doctor.sh"
bash "$HERE/fetch-upstream.sh"
require_vendor

# ── prepare env, part A: secrets (URL-independent, done once) ──────────────
# Mirrors upstream install.sh, minus the prompts. NOTE the ordering trap:
# COMMON_DOMAIN_NAME's placeholder is `change_me_domain`, which also matches
# the secret pattern — randomize it and the domain is silently destroyed.
# Upstream substitutes the domain first; we simply exclude it here and set it
# in part B, once the tunnel URL is known.
ENV_FILE="$VENDOR/common.env"

# compose reads `.env` from the project directory for `${VAR}` interpolation,
# and upstream expects it to BE common.env. A symlink is the obvious way to say
# that and the one thing that does not work here: MSYS `ln -s` silently
# degrades to a copy on a Windows host, so `.env` froze at whatever common.env
# held when it was first created — `COMMON_DOMAIN_NAME=change_me_domain`. The
# stack then booted with correct secrets against a placeholder hostname, and
# chalice died on `ValueError: Invalid endpoint: https://change_me_domain`
# while everything else came up green. Copy explicitly, and re-copy after every
# edit to common.env.
sync_dotenv() { cp -f "$ENV_FILE" "$VENDOR/.env"; }

if [ ! -f "$STATE/env.prepared" ]; then
  echo "==> randomizing placeholder secrets in common.env"
  mapfile -t tokens < <(grep -oE 'change_me_[a-zA-Z0-9_]*' "$ENV_FILE" | sort -u | grep -v '^change_me_domain$' || true)
  for tok in "${tokens[@]}"; do
    sed -i "s|\\b$tok\\b|$(openssl rand -hex 10)|g" "$ENV_FILE"
  done
  echo "    ${#tokens[@]} secrets set"
  # Caddy serves plain HTTP on :80 for any Host — Cloudflare terminates TLS at
  # its edge, and ACME could never validate a trycloudflare hostname from here.
  # COMMON_PROTOCOL stays `https` because that is what the PUBLIC URL is.
  grep -q '^CADDY_DOMAIN=' "$ENV_FILE" \
    && sed -i 's|^CADDY_DOMAIN=.*|CADDY_DOMAIN=":80"|' "$ENV_FILE" \
    || echo 'CADDY_DOMAIN=":80"' >> "$ENV_FILE"
  touch "$STATE/env.prepared"
else
  echo "==> secrets already prepared (delete .state/env.prepared to redo)"
fi
sync_dotenv

if [ "$DRY" -eq 1 ]; then
  echo ""
  echo "[dry-run] would start:"
  compose config --services | sed 's/^/    /'
  exit 0
fi

# ── phase 1: learn the public URL ──────────────────────────────────────────
# NAMED MODE SKIPS THIS PHASE. The hostname is known before anything starts, so
# COMMON_DOMAIN_NAME is written once and never revisited — which is worth more
# here than anywhere else, because that value is baked into ~25 containers and
# changing it recreates the whole stack.
if [ "$MODE" = "named" ] && ! named_configured; then
  echo "error: --named needs Cloudflare credentials and OPENREPLAY_HOSTNAME." >&2
  cf_explain_unconfigured >&2
  exit 2
fi
[ -n "$MODE" ] || { named_configured && MODE=named || MODE=quick; }

if [ "$MODE" = "named" ]; then
  url="https://$OPENREPLAY_HOSTNAME"
  echo "==> Mode: NAMED — $url (persistent)"
  # One COMMON_DOMAIN_NAME, one hostname. A second tunnel onto the same caddy
  # would serve a UI whose API calls all address the other host.
  if [ -n "$(compose ps -q tunnel 2>/dev/null)" ]; then
    echo "    stopping the quick tunnel (named mode owns COMMON_DOMAIN_NAME)"
    compose rm -sf tunnel >/dev/null 2>&1 || true
  fi
else
  echo "==> Mode: QUICK — starting the quick tunnel to learn its hostname…"
  if cfn_running "$NAMED_TUNNEL"; then
    echo "    stopping the named tunnel (one COMMON_DOMAIN_NAME, one hostname)"
    cfn_stop "$NAMED_TUNNEL"
  fi
  compose up -d --no-deps tunnel
  url=""
  for _ in $(seq 1 30); do
    url="$(tunnel_url || true)"
    [ -n "$url" ] && break
    sleep 2
  done
  [ -z "$url" ] && { echo "error: no tunnel URL after 60s — check: docker logs openreplay-tunnel" >&2; exit 1; }
  echo "    $url"
fi
host="${url#https://}"
echo "$url" > "$STATE/tunnel-url"

# ── prepare env, part B: the domain (changes on every tunnel restart) ──────
# COMMON_DOMAIN_NAME is a BARE HOSTNAME — the scheme lives in COMMON_PROTOCOL.
echo "==> pointing the stack at $host"
if grep -q '^COMMON_DOMAIN_NAME=' "$ENV_FILE"; then
  sed -i "s|^COMMON_DOMAIN_NAME=.*|COMMON_DOMAIN_NAME=$host|" "$ENV_FILE"
else
  echo "COMMON_DOMAIN_NAME=$host" >> "$ENV_FILE"
fi
grep -qE '^COMMON_PROTOCOL=https' "$ENV_FILE" || sed -i 's|^COMMON_PROTOCOL=.*|COMMON_PROTOCOL=https|' "$ENV_FILE"
sync_dotenv

# ── phase 3: everything (migration profile creates schemas on first run) ───
echo "==> starting OpenReplay (first run pulls ~25 images — this takes a while)…"
if [ "$MODE" = "named" ]; then
  # Every service EXCEPT the quick tunnel, named explicitly — a bare `up -d`
  # would start it and mint a hostname nothing uses.
  # shellcheck disable=SC2046
  COMPOSE_PROFILES=migration compose up -d \
    $(COMPOSE_PROFILES=migration compose config --services | grep -v '^tunnel$' | tr '\n' ' ')
else
  COMPOSE_PROFILES=migration compose up -d
fi

# ── phase 3b: the named tunnel, once caddy exists to point it at ───────────
if [ "$MODE" = "named" ]; then
  cfn_up "$NAMED_TUNNEL" "$OPENREPLAY_HOSTNAME" "$(rig_network caddy)" \
    "http://caddy:80" || {
    echo "error: the named tunnel did not come up — OpenReplay is local-only," >&2
    echo "       which means the tracker cannot reach /ingest from a browser." >&2
    exit 1
  }
fi

# ── phase 4: the admin account, from .secrets.env ──────────────────────────
# The stack has no seeded account and the first signup becomes the admin; an
# account created by hand with an unrecorded password has already cost one
# full volume wipe. signup.sh is idempotent: it waits for /api/signup, signs
# up only while it reports tenants:false, and only says so when it skips.
bash "$HERE/signup.sh"

echo ""
echo "── OpenReplay ─────────────────────────────────────────────"
echo "  URL      $url"
echo "  Login    $url/login       (credentials: .secrets.env — see above)"
echo "  Logs     docker compose -p $PROJECT logs -f <service>"
echo "  Stop     bash $HERE/down.sh"
echo ""
echo "  Tracker config for the SvelteKit app:"
echo "    ingestPoint: \"$url/ingest\""
echo "    projectKey:  printed above, or: bash $HERE/wire-frontend.sh --print"
echo ""
if [ "$MODE" = "named" ]; then
  echo "  Mode: NAMED — this hostname persists. COMMON_DOMAIN_NAME and any"
  echo "  wiring done against it stay correct across restarts, so the ~25"
  echo "  containers do not have to be recreated for a new URL."
else
  echo "  ⚠ This URL dies with the tunnel. Re-running up.sh mints a new one and"
  echo "    rewrites the config — fine for debugging, not for anything lasting."
  echo "    A named hostname removes that churn: see SKILL.md, 'Named tunnels'."
fi
