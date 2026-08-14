#!/usr/bin/env bash
# Sign in through the PUBLIC https hostname with a real browser.
#
#   bash scripts/browser-check.sh            # alice
#   bash scripts/browser-check.sh bob hunter2
#
# Tunnel mode only — there is nothing here the *.localhost mode can answer, and
# it says so rather than passing vacuously.
#
# WHY A BROWSER AT ALL, when verify.sh already drives a login with curl: the
# property this mode adds is a COOKIE-PREFIX rule, and cookie prefixes live in
# the user agent. `__Secure-` means "a user agent must refuse to store this
# unless it arrived over a secure connection" — curl implements no such rule, so
# a green curl login is equally consistent with the prefix working and with it
# being ignored. See the header of browser-login.mjs.
#
# WHERE IT RUNS. Everything else in this rig runs on the HOST, because that is
# where docker and the pinned k3d/helm/kubectl live. This one runs inside the
# devcontainer, because that is where Playwright and its Firefox already are —
# installing a second 300 MB browser on the host to avoid a docker exec is the
# wrong trade, and the thing under test is a public URL that both can reach.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

USER_NAME="${1:-alice}"
USER_PASS="${2:-aliceandbob}"
DEV_CONTAINER="${RIG_DEV_CONTAINER:-devcontainer-dev-1}"
# Inside the container the repo is a bind mount at a different path than on the
# host, so the script is addressed by the container's view of it.
IN_CONTAINER_REPO="${RIG_CONTAINER_REPO:-/workspaces/hackagon}"

[ "$RIG_MODE" = "tunnel" ] || die "not in tunnel mode — run scripts/tunnel.sh up first (this check has no meaning on plain http)"
docker inspect "$DEV_CONTAINER" >/dev/null 2>&1 ||
    die "container '$DEV_CONTAINER' is not there — it carries Playwright and its Firefox (see devcontainer-up)"

# --- the address the browser will dial ---------------------------------
# Resolved over DoH on the HOST and handed in, because the container's own
# resolver is the thing that may be unable to answer. A pin is a routing choice,
# not a trust choice: SNI is still the real hostname and Firefox still verifies
# the chain, which is the whole point of this mode.
doh_a() { # <fqdn> -> first IPv4
    curl -sS --max-time 10 "https://1.1.1.1/dns-query?name=$1&type=A" \
        -H "accept: application/dns-json" 2>/dev/null |
        tr ',' '\n' | grep -oE '"data":"[0-9.]+"' | head -1 | sed 's/.*:"//;s/"//'
}
APP_IP="$(doh_a "$APP_HOST")"
AUTH_IP="$(doh_a "$AUTH_HOST")"
[ -n "$APP_IP" ] && [ -n "$AUTH_IP" ] ||
    die "could not resolve $APP_HOST / $AUTH_HOST over DoH — is the tunnel up?"
ok "edge $APP_IP for $APP_HOST · $AUTH_IP for $AUTH_HOST"

step "signing in as $USER_NAME through $APP_URL"

# The pin is written and REMOVED by the same shell, including on failure: a
# leftover hosts entry outlives the tunnel it names, and the next thing to look
# that name up would get a stale address with no clue where it came from.
#
# MSYS_NO_PATHCONV=1 is load-bearing on the Git Bash host and its absence is not
# subtle: `/workspaces/hackagon` is an argument that LOOKS like a path, so MSYS
# rewrites it to `C:/Program Files/Git/workspaces/hackagon` before docker sees
# it, and the container reports a directory it has never heard of. Same trap the
# kubectl/helm wrappers in lib.sh carry the flag for.
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' \
    docker exec -i "$DEV_CONTAINER" bash -s -- \
    "$APP_HOST" "$APP_IP" "$AUTH_HOST" "$AUTH_IP" "$APP_URL" \
    "$IN_CONTAINER_REPO" "$USER_NAME" "$USER_PASS" <<'REMOTE'
set -euo pipefail
APP_HOST="$1"; APP_IP="$2"; AUTH_HOST="$3"; AUTH_IP="$4"; APP_URL="$5"
REPO="$6"; U="$7"; P="$8"
MARK="# k3d-chart-rig browser-check"

unpin() { sed -i "/$MARK\$/d" /etc/hosts 2>/dev/null || true; }
trap unpin EXIT INT TERM
unpin
printf '%s %s %s\n%s %s %s\n' \
    "$APP_IP" "$APP_HOST" "$MARK" "$AUTH_IP" "$AUTH_HOST" "$MARK" >>/etc/hosts

export PATH="$REPO/.devenv/profile/bin:$PATH"
# Playwright's browsers were installed by the e2e suite as the `vscode` user;
# this exec runs as root, whose cache is empty. Point at the one that exists
# rather than downloading a second copy.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/home/vscode/.cache/ms-playwright}"
[ -d "$PLAYWRIGHT_BROWSERS_PATH" ] || {
    echo "error: no Playwright browsers at $PLAYWRIGHT_BROWSERS_PATH" >&2
    echo "       run the e2e suite once, or set PLAYWRIGHT_BROWSERS_PATH." >&2
    exit 1
}
export SHOT=/tmp/k3d-tunnel-login.png
cd "$REPO/.claude/skills/hackathon-e2e"
node "$REPO/.claude/skills/k3d-chart-rig/scripts/browser-login.mjs" \
    "$APP_URL" "$AUTH_HOST" "$U" "$P"
REMOTE
