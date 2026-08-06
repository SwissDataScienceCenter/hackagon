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

DRY=0; SKIP_DOCTOR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-doctor) SKIP_DOCTOR=1 ;;
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
  [ -e "$VENDOR/.env" ] || ln -s common.env "$VENDOR/.env"
  touch "$STATE/env.prepared"
else
  echo "==> secrets already prepared (delete .state/env.prepared to redo)"
fi

if [ "$DRY" -eq 1 ]; then
  echo ""
  echo "[dry-run] would start:"
  compose config --services | sed 's/^/    /'
  exit 0
fi

# ── phase 1: tunnel only, to learn the public URL ──────────────────────────
echo "==> starting the quick tunnel…"
compose up -d --no-deps tunnel
url=""
for _ in $(seq 1 30); do
  url="$(tunnel_url || true)"
  [ -n "$url" ] && break
  sleep 2
done
[ -z "$url" ] && { echo "error: no tunnel URL after 60s — check: docker logs openreplay-tunnel" >&2; exit 1; }
host="${url#https://}"
echo "    $url"
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

# ── phase 3: everything (migration profile creates schemas on first run) ───
echo "==> starting OpenReplay (first run pulls ~25 images — this takes a while)…"
COMPOSE_PROFILES=migration compose up -d

echo ""
echo "── OpenReplay ─────────────────────────────────────────────"
echo "  URL      $url"
echo "  Sign up  $url/signup      (first account becomes the admin)"
echo "  Logs     docker compose -p $PROJECT logs -f <service>"
echo "  Stop     bash $HERE/down.sh"
echo ""
echo "  Tracker config for the SvelteKit app:"
echo "    ingestPoint: \"$url/ingest\""
echo "    projectKey:  <from the OpenReplay UI after signup>"
echo ""
echo "  ⚠ This URL dies with the tunnel. Re-running up.sh mints a new one and"
echo "    rewrites the config — fine for debugging, not for anything lasting."
