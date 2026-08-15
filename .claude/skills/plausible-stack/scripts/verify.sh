#!/usr/bin/env bash
# Prove this rig works — end to end, from a real browser to Plausible's own
# query API and back.
#
# The claims, in the order they are checked, and why each is a SEPARATE claim:
#
#   1. every compose service has a running container
#        "the service exists" and "the service works" are different; a
#        container that was removed reads exactly like one that never ran.
#   2. the dashboard answers THROUGH THE TUNNEL, with a real login
#        a 200 on / proves a proxy is up. Logging in proves Postgres, the
#        session store and the app are all working from the outside.
#   3. registration is closed through the tunnel
#        the URL is unguessable, not private.
#   4. the app is wired, read from the MERGED config
#        a reader that looked only at the tracked config.yaml finds the key
#        absent on a perfectly wired machine, skips, and reports success.
#   5. the tracker script is fetchable and is the right VARIANT
#        the stock script silently refuses to send from localhost.
#   6. a real browser sends page views, carrying no id and no token
#        the privacy properties are properties of the bytes.
#   7. Plausible has them: its own Stats API returns the route templates
#        "the server accepted it" is not "the server can use it" — three days
#        of green replay specs were bought with that confusion.
#   8. nothing it stored contains an id, and no column could hold an IP
#        the positive control for 6 lives in 7, and this is the negative.
#   9. --restore removes ONE key from the shared overlay
#        checked on a COPY, so it costs no restart.
#
# Usage: verify.sh [--no-browser]
#   --no-browser  skip step 6 EXPLICITLY. Without the flag, an unavailable
#                 browser is a FAILURE, not a skip: a proof that quietly
#                 removes its own hardest step is how this repo has been
#                 lied to before.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"
CONFIG_DIR="$ROOT_DIR/components/frontend/data/test/config"
OVERLAY="$ROOT_DIR/.claude/skills/lib/config-overlay.sh"
APP_URL="${E2E_BASE_URL:-http://localhost:8081}"

BROWSER=1
[ "${1:-}" = "--no-browser" ] && BROWSER=0

fail=0
ok() { printf '  [x] %s\n' "$1"; }
bad() {
    printf '  ✕   %s\n' "$1"
    fail=1
}

require_docker
load_secrets

# ── 1. the stack ───────────────────────────────────────────────────────────
echo "── containers"
missing=""
running="$(compose ps --format '{{.Service}}' 2>/dev/null | sort -u)"
while IFS= read -r svc; do
    [ -n "$svc" ] || continue
    printf '%s\n' "$running" | grep -qx "$svc" || missing="$missing $svc"
done <<EOF
$(compose config --services 2>/dev/null | sort -u)
EOF
[ -z "$missing" ] && ok "every compose service is running" || bad "not running:$missing"

url="$(tunnel_url || true)"
[ -n "$url" ] || {
    echo "  ✕   no tunnel — scripts/up.sh first" >&2
    exit 1
}

# ── 2. the dashboard, through the tunnel, with a real login ────────────────
echo "── dashboard at $url"
jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT
login_html="$(curl -fsS -m 30 -c "$jar" "$url/login" 2>/dev/null || true)"
case "$login_html" in
*'name="_csrf_token"'*) ok "GET /login serves the form" ;;
*) bad "GET /login did not serve a login form" ;;
esac
csrf="$(printf '%s' "$login_html" |
    grep -oE 'name="_csrf_token"[^>]*value="[^"]+"' | sed 's/.*value="//;s/"//' | head -1)"
code="$(curl -fsS -m 30 -b "$jar" -c "$jar" -o "$CURL_DISCARD" -w '%{http_code}' -X POST "$url/login" \
    --data-urlencode "_csrf_token=$csrf" \
    --data-urlencode "email=${PLAUSIBLE_EMAIL:-}" \
    --data-urlencode "password=${PLAUSIBLE_PASSWORD:-}" 2>/dev/null || true)"
[ "$code" = "302" ] && ok "POST /login → 302 (session issued)" || bad "POST /login answered $code"
sites="$(curl -fsS -m 30 -b "$jar" "$url/sites" 2>/dev/null || true)"
case "$sites" in
*"${PLAUSIBLE_SITE:-__none__}"*) ok "/sites lists ${PLAUSIBLE_SITE:-}" ;;
*) bad "/sites does not list ${PLAUSIBLE_SITE:-} — the dashboard is not usable" ;;
esac

# ── 3. registration closed ─────────────────────────────────────────────────
reg="$(curl -fsS -m 30 "$url/register" 2>/dev/null || true)"
case "$reg" in
*password_confirmation*) bad "/register still offers signup on a PUBLIC url" ;;
*) ok "/register does not offer signup" ;;
esac

# ── 4. the app's wiring, from the MERGED view ──────────────────────────────
# config.yaml < config.local.yaml, which is what
# components/frontend/src/lib/server/settings.ts does. Reading only the tracked
# file is the trap: wiring never writes there, so the key is always absent and
# a reader that stopped there would report "not wired" on a wired machine — the
# exact shape that made the replay suite pass while testing nothing.
echo "── app wiring (merged config)"
base_block="$(bash "$OVERLAY" get "$CONFIG_DIR/config.yaml" plausible 2>/dev/null || true)"
over_block="$(bash "$OVERLAY" get "$CONFIG_DIR/config.local.yaml" plausible 2>/dev/null || true)"
if [ -n "$base_block" ] && [ -n "$over_block" ]; then
    # The only case where "prefer the overlay's block" differs from a deep merge.
    # Single quotes: backticks inside a double-quoted string are a command
    # substitution, so this line would have tried to RUN `plausible`.
    echo '  !   both config.yaml and config.local.yaml define "plausible" — the'
    echo "      loader deep-merges them; this check reads the overlay's block only."
fi
block="${over_block:-$base_block}"
script_url="$(printf '%s\n' "$block" | sed -n 's/^[[:space:]]*scriptUrl:[[:space:]]*//p')"
domain="$(printf '%s\n' "$block" | sed -n 's/^[[:space:]]*domain:[[:space:]]*//p')"
case "$block" in
*"enabled: true"*) ok "plausible.enabled: true" ;;
*) bad "the app is not wired — scripts/wire-frontend.sh" ;;
esac
[ -n "$script_url" ] && ok "scriptUrl $script_url" || bad "no scriptUrl in the merged config"
[ "$domain" = "${PLAUSIBLE_SITE:-}" ] &&
    ok "domain $domain matches the registered site" ||
    bad "domain '$domain' ≠ registered site '${PLAUSIBLE_SITE:-}' — events would be dropped"

# The tracked file must NEVER carry a tunnel hostname. There is a Go spec for
# the same property on the OIDC issuer (internal/config/config_test.go);
# this is the one for ours, and it is cheap enough to run every time.
if grep -q 'trycloudflare' "$CONFIG_DIR/config.yaml" 2>/dev/null; then
    bad "$CONFIG_DIR/config.yaml contains a tunnel hostname — it must stay on localhost"
else
    ok "the TRACKED config.yaml has no tunnel hostname"
fi

# ── 5. the tracker script, and the right variant ───────────────────────────
echo "── tracker script"
js="$(curl -fsS -m 30 "$script_url" 2>/dev/null || true)"
[ -n "$js" ] && ok "fetchable through the tunnel" || bad "$script_url is not fetchable"
case "$js" in
*"localhost\$|^127"*)
    bad "this is the NON-local variant: it silently refuses to send from localhost"
    ;;
*) ok "no localhost guard (the .local variant)" ;;
esac
# `manual`: the script must not count anything by itself. The auto-tracking
# variants call the sender on load and on history changes; the manual one only
# installs the queue. Checked by the absence of the pushState patch.
case "$js" in
*pushState*) bad "this variant tracks navigations ITSELF — it would send location.href" ;;
*) ok "manual variant (every pageview is one the app decided to send)" ;;
esac

# ── 6. a real browser ──────────────────────────────────────────────────────
if [ "$BROWSER" -eq 1 ]; then
    echo "── browser"
    hackathon_id="$(curl -fsS -m 20 "$APP_URL/" 2>/dev/null |
        grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
    # Firefox and playwright live in the sibling e2e skill, inside the dev
    # container. No container ⇒ FAIL, never skip.
    cname="$(docker ps --format '{{.Names}}' | grep -E '^devcontainer-dev-1$' | head -1)"
    if [ -z "$cname" ]; then
        bad "the dev container is not running, so no browser can be driven (--no-browser to accept that)"
    else
        out="$(docker exec -u vscode "$cname" \
            /workspaces/hackagon/.devenv/profile/bin/node \
            /workspaces/hackagon/.claude/skills/plausible-stack/scripts/pageview.mjs \
            "$APP_URL" "$url" "$hackathon_id" /tmp/plausible-pageview.json 2>&1)"
        rc=$?
        printf '%s\n' "$out" | sed 's/^/      /'
        [ "$rc" -eq 0 ] && ok "a real browser sent page views, with no id and no token on the wire" ||
            bad "the browser proof failed (above)"
    fi
fi

# ── 7. what Plausible actually stored ──────────────────────────────────────
echo "── read-back (Plausible's own Stats API)"
if [ -z "${PLAUSIBLE_API_KEY:-}" ]; then
    bad "no PLAUSIBLE_API_KEY in $SECRETS_FILE — run scripts/signup.sh"
else
    q="$(curl -fsS -m 30 -X POST "$url/api/v2/query" \
        -H "Authorization: Bearer $PLAUSIBLE_API_KEY" -H 'Content-Type: application/json' \
        -d "{\"site_id\":\"$domain\",\"metrics\":[\"visitors\",\"pageviews\"],\"date_range\":\"day\",\"dimensions\":[\"event:page\"]}" 2>/dev/null || true)"
    # Only the `results` array. The response ECHOES the query back under "query",
    # dimensions and all, so a grep over the whole body reports `event:page` as a
    # page that was visited — a fake row in a list whose whole job is to be read
    # for what is and is not in it.
    pages="$(printf '%s' "${q%%\"meta\"*}" | grep -oE '"dimensions":\["[^"]*"\]' | sed 's/.*\["//;s/"\]//')"
    if [ -z "$pages" ]; then
        bad "Plausible has no page views for $domain today — the browser's 202s went nowhere"
    else
        ok "pages stored today: $(printf '%s' "$pages" | tr '\n' ' ')"
        # The positive control: the deep route must be one of them. Without it,
        # "no id was stored" is satisfied by an empty database.
        case "$pages" in
        */hackathon/\[id\]*) ok "the deep route landed as its TEMPLATE, /hackathon/[id]" ;;
        *) [ "$BROWSER" -eq 1 ] && bad "no /hackathon/[id] row — the deep-route pageview did not land" ;;
        esac
        # …and the negative: nothing stored may look like an id.
        if printf '%s' "$pages" | grep -qE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'; then
            bad "a UUID is stored in Plausible's page list"
        else
            ok "no UUID in anything Plausible stored"
        fi
    fi
fi

# ── 8. the schema cannot hold an IP ────────────────────────────────────────
# The privacy claim in docs/frontend/analytics.md, asked of the database rather
# than of the vendor.
ch="$(compose exec -T plausible_events_db clickhouse-client -q \
    "SELECT count() FROM system.columns WHERE database='plausible_events_db' AND table IN ('events_v2','sessions_v2') AND (name ILIKE '%ip%' OR name ILIKE '%user_agent%')" 2>/dev/null | tr -d '\r\n ')"
if [ "$ch" = "0" ]; then
    ok "events_v2/sessions_v2 have no IP or user-agent column"
elif [ -n "$ch" ]; then
    bad "$ch column(s) in events_v2/sessions_v2 look like they hold an IP or user agent"
else
    echo "  !   could not query ClickHouse for the column check"
fi

# ── 9. --restore takes exactly one key ─────────────────────────────────────
# On a COPY: the real thing would restart three servers, and this is a claim
# about config-overlay.sh, not about the running app.
echo "── unwiring (simulated on a copy)"
live="$CONFIG_DIR/config.local.yaml"
if [ -f "$live" ]; then
    tmp="$(mktemp -d)/config.local.yaml"
    cp "$live" "$tmp"
    before="$(bash "$OVERLAY" keys "$tmp" | sort | tr '\n' ' ')"
    bash "$OVERLAY" remove "$tmp" plausible >/dev/null
    after="$(bash "$OVERLAY" keys "$tmp" 2>/dev/null | sort | tr '\n' ' ')"
    expect="$(bash "$OVERLAY" keys "$live" | grep -vx plausible | sort | tr '\n' ' ')"
    if [ "$after" = "$expect" ]; then
        ok "removes 'plausible' and keeps [ ${after:-—}] (was [ $before])"
    else
        bad "removal changed the wrong keys: [$after] ≠ [$expect]"
    fi
    rm -rf "$(dirname "$tmp")"
else
    echo "  !   no config.local.yaml — nothing to unwire"
fi

echo ""
if [ "$fail" -eq 0 ]; then
    echo "VERIFIED$([ "$BROWSER" -eq 0 ] && echo " (browser step skipped ON PURPOSE — the end-to-end claim is NOT proven)")"
else
    echo "FAILED — see the ✕ lines."
    exit 1
fi
