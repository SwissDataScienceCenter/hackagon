#!/usr/bin/env bash
# Bring Plausible Community Edition up behind a Cloudflare quick tunnel.
#
#   doctor → fetch upstream → mint secrets → start the tunnel (learn the URL)
#          → point BASE_URL at it → start the databases and the app
#          → register the admin + the site → close registration again
#
# THE TUNNEL STARTS FIRST, and that ordering is not stylistic. Plausible reads
# BASE_URL at boot and uses it for link generation and for the LiveView
# origin/CSWSH check, so a dashboard booted against the wrong hostname serves
# HTML and then fails to connect its own websocket — which presents as a page
# that renders and never loads any numbers. Same trap as openreplay-stack's
# COMMON_DOMAIN_NAME, and the same consequence: a quick tunnel is a DEBUGGING
# tool here, because every fresh URL means rewriting the config again.
#
# Usage: up.sh [--skip-doctor] [--skip-signup] [--keep-registration-open] [--dry-run]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

DRY=0
SKIP_DOCTOR=0
SKIP_SIGNUP=0
KEEP_OPEN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-doctor) SKIP_DOCTOR=1 ;;
    --skip-signup) SKIP_SIGNUP=1 ;;
    --keep-registration-open) KEEP_OPEN=1 ;;
    -h | --help)
      sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

require_docker
[ "$SKIP_DOCTOR" -eq 1 ] || bash "$HERE/doctor.sh"
bash "$HERE/fetch-upstream.sh"
require_vendor
bash "$HERE/secrets.sh"
load_secrets

# ── vendor/.env — everything upstream's compose interpolates or passes through ─
# Rewritten on every run, from .secrets.env, because vendor/ is disposable
# (`fetch-upstream.sh --force` deletes it) while the secrets are not: rotating
# SECRET_KEY_BASE under a live database logs every session out.
env_set SECRET_KEY_BASE "$SECRET_KEY_BASE"
env_set TOTP_VAULT_KEY "$TOTP_VAULT_KEY"
env_set HTTP_PORT 8000
# No mailer is configured, so email verification would create accounts that can
# never be used. Upstream's default is already false; pinned because "the
# default is what I want" is a claim that expires.
env_set ENABLE_EMAIL_VERIFICATION false
# Placeholder so compose can interpolate ${BASE_URL} for the tunnel-only start
# below. Only the `plausible` service reads it, and that service is not running
# yet — the real value is written before it is.
[ -n "$(env_get BASE_URL)" ] || env_set BASE_URL "http://localhost:$LOCAL_PORT"

if [ "$DRY" -eq 1 ]; then
  echo ""
  echo "[dry-run] would start:"
  compose config --services | sed 's/^/    /'
  exit 0
fi

# ── phase 1: the tunnel alone, to learn the public URL ─────────────────────
# --no-deps: the overlay declares `tunnel → plausible`, and the point of this
# phase is that plausible must NOT start yet. cloudflared happily serves 502s
# until its origin exists; it re-resolves the name per connection.
echo "==> starting the quick tunnel…"
compose up -d --no-deps tunnel
url=""
for _ in $(seq 1 30); do
  url="$(tunnel_url || true)"
  [ -n "$url" ] && break
  sleep 2
done
[ -z "$url" ] && {
  echo "error: no tunnel URL after 60s — check: docker logs plausible-tunnel" >&2
  exit 1
}
echo "    $url"
echo "$url" >"$STATE/tunnel-url"

# ── phase 2: point the app at that URL, then start it ──────────────────────
# BASE_URL carries the SCHEME here (unlike OpenReplay's bare-hostname
# COMMON_DOMAIN_NAME + COMMON_PROTOCOL pair). https, because that is what the
# public URL is: Cloudflare terminates TLS at its edge and forwards plain http
# to the container, which is why HTTP_PORT is what the app listens on and no
# certificate is involved anywhere in here.
echo "==> pointing Plausible at $url"
env_set BASE_URL "$url"

# Registration has to be OPEN for the admin to be created at all — CE seeds no
# account and the first person to register owns the instance. It is closed
# again at the end of this script, which matters here more than it does on a
# laptop: this dashboard is on a PUBLIC URL for as long as the tunnel lives.
[ "$SKIP_SIGNUP" -eq 1 ] || env_set DISABLE_REGISTRATION false

echo "==> starting Plausible (first run pulls 3 images and migrates — a few minutes)…"
compose up -d

# ── phase 3: wait for the app, not for the container ───────────────────────
# `compose up -d` returns when the containers were CREATED. Plausible then
# creates its database and runs migrations; /api/health is the first thing that
# is true only once it can actually serve.
echo "==> waiting for /api/health…"
health=""
deadline=$(($(date +%s) + 600))
while :; do
  health="$(curl -fsS -m 5 "$(local_url)/api/health" 2>/dev/null || true)"
  case "$health" in *'"ok"'* | *'"clickhouse"'*) break ;; esac

  # A crash loop is not slowness, and waiting 600s to say so is the single
  # least useful thing this script could do. `restart: always` on a container
  # that dies during config evaluation looks exactly like a slow boot from the
  # outside — the port simply never answers. Ask the container instead, and
  # print the line that names the cause.
  state="$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' \
    "$(compose ps -q plausible 2>/dev/null)" 2>/dev/null || true)"
  case "$state" in
    restarting\ [3-9]* | restarting\ [1-9][0-9]* | exited*)
      echo "error: the plausible container is not staying up ($state)" >&2
      compose logs --tail 200 plausible 2>/dev/null |
        grep -E '\*\* \(|ERROR!' | head -5 | sed 's/^/       /' >&2
      echo "       full log: docker compose -p $PROJECT logs plausible" >&2
      exit 1
      ;;
  esac

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "error: $(local_url)/api/health did not answer within 600s" >&2
    echo "       logs: docker compose -p $PROJECT logs plausible" >&2
    exit 1
  fi
  sleep 5
done
echo "    $health"

# ── phase 4: the admin account and the site ────────────────────────────────
if [ "$SKIP_SIGNUP" -eq 0 ]; then
  bash "$HERE/signup.sh"

  # ── phase 5: close registration behind us ────────────────────────────────
  # A quick tunnel URL is unguessable but public, and an open /register on it
  # is an invitation. Closing it is one env var and a container recreate; the
  # verification below is the part that matters, because "the variable is set"
  # and "the route refuses" are different claims.
  if [ "$KEEP_OPEN" -eq 0 ]; then
    echo "==> closing registration"
    env_set DISABLE_REGISTRATION true
    # An env change is only picked up when the container is RE-CREATED — a
    # restart re-runs the same process with the same baked environment. `up -d`
    # notices the difference and recreates just this service.
    compose up -d plausible >/dev/null
    for _ in $(seq 1 60); do
      curl -fsS -m 5 "$(local_url)/api/health" >/dev/null 2>&1 && break
      sleep 2
    done
    if curl -fsS -m 10 "$(local_url)/register" 2>/dev/null | grep -qi 'password_confirmation'; then
      echo "    ⚠ /register still serves a signup form — anyone with the tunnel URL can register." >&2
    else
      echo "    /register no longer offers signup"
    fi
  fi
fi

load_secrets
echo ""
echo "── Plausible Community Edition ────────────────────────────"
echo "  Public   $url"
echo "  Local    $(local_url)          (loopback only)"
echo "  Login    $url/login            ${PLAUSIBLE_EMAIL:-} / see .secrets.env"
echo "  Site     ${PLAUSIBLE_SITE:-}   (the tracker's data-domain must match this exactly)"
echo "  Logs     docker compose -p $PROJECT logs -f plausible"
echo "  Stop     bash $HERE/down.sh"
echo ""
echo "  Wire the app at it:  bash $HERE/wire-frontend.sh"
echo "  Prove it works:      bash $HERE/verify.sh"
echo ""
echo "  ⚠ This URL dies with the tunnel. Re-running up.sh mints a new one and"
echo "    rewrites BASE_URL — fine for debugging, not for anything lasting."
