#!/usr/bin/env bash
# Rewire OIDC so login works through the quick tunnel's public hostname.
# Runs INSIDE the dev container (up.sh execs it there).
#
#   auth-wire.sh <https://X.trycloudflare.com>   wire issuers to the tunnel
#   auth-wire.sh --restore                       undo (back to localhost)
#
# What wiring does:
#   1. sanity-check Keycloak answers on the tunnel host with an https issuer
#      (requires proxy-headers=xforwarded — baked into toolchain.nix; needs a
#      one-time full stack restart after pulling that change)
#   2. allowlist the tunnel origin on the hackagon-frontend realm client
#      (runtime admin-API patch — the committed realm file stays untouched)
#   3. write frontend `oidc.issuer` and backend `oidc.issuerurl` into each
#      component's config.local.yaml, restart both processes — plus the
#      adapter-node build on :8082 when prod mode is up, since it reads its
#      config once into a module singleton at boot
# While wired, logins via plain http://localhost:8081 will FAIL backend
# validation (tokens carry the tunnel issuer) — use the tunnel URL, then
# --restore when done.
#
# NOTHING TRACKED IS EDITED. config.local.yaml sits beside config.yaml, is
# gitignored, and both loaders read it AFTER config.yaml and BEFORE the
# environment (components/backend/internal/config/config.go,
# components/frontend/src/lib/server/settings.ts).
# This used to be a `sed` over the two TRACKED config.yaml files with
# `.pretunnel` backups beside them: while wired, the working tree differed from
# HEAD, and a `git add -A` committed an issuer that dies with the tunnel. That
# happened — a dead hostname sat committed for several commits, and a fresh
# clone pointed at a tunnel that no longer existed.
#
# THIS SCRIPT OWNS EXACTLY ONE KEY IN THAT FILE: `oidc`. It is not the only
# writer any more — openreplay-stack/scripts/wire-frontend.sh owns `replay` in
# the same overlay — so --restore removes the `oidc` BLOCK rather than the
# file. It used to `rm` it, which was correct while there was one writer and is
# now a silent way to stop session replay recording: `hackathon-e2e/scripts/
# run.sh` calls `--restore` on the way into every suite run, so an `rm` there
# would delete the replay wiring before the openreplay suite could read it, and
# the suite would self-skip and report green having tested nothing.
# .claude/skills/lib/config-overlay.sh does the per-key surgery.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/../../../.." && pwd)"

FRONTEND_LOCAL="$ROOT_DIR/components/frontend/data/test/config/config.local.yaml"
BACKEND_LOCAL="$ROOT_DIR/components/backend/data/test/config/config.local.yaml"
OVERLAY="$ROOT_DIR/.claude/skills/lib/config-overlay.sh"
PROD_SERVE="$HERE/prod-serve.sh"
# The e2e harness's own :8081 server. Same staleness as :8082 — it reads the
# issuer once at boot — but it belongs to the other skill, so it is optional
# here: a machine without the e2e skill still restores correctly.
E2E_PROD_FRONTEND="$ROOT_DIR/.claude/skills/hackathon-e2e/scripts/prod-frontend.sh"
KC="http://localhost:8180"
REALM="hackagon"
CLIENT="hackagon-frontend"

# Toolchain (just, process-compose, grpcurl, jq) — re-exec in the Nix dev
# shell when invoked from a plain shell (same trick as the e2e skill).
if ! command -v process-compose >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    if [ -n "${HACKAGON_TUNNEL_NIX_WRAPPED:-}" ]; then
        echo "error: toolchain not found even inside the Nix dev shell" >&2
        exit 1
    fi
    export HACKAGON_TUNNEL_NIX_WRAPPED=1
    cd "$ROOT_DIR"
    exec just nix::develop default bash "$HERE/$(basename "${BASH_SOURCE[0]}")" "$@"
fi

wait_for() { # <name> <timeout_s> <cmd...>
    local name="$1" timeout="$2" start
    shift 2
    start=$(date +%s)
    printf "  waiting for %-16s " "$name"
    until "$@" >/dev/null 2>&1; do
        if [ $(($(date +%s) - start)) -ge "$timeout" ]; then
            echo "FAILED (timeout after ${timeout}s)"
            return 1
        fi
        printf "."
        sleep 2
    done
    echo "ok"
}

# Every curl in this script carries --max-time: an unbounded request that
# never returns reads as a hang, not a failure (a single untimed attempt once
# blocked a wait loop for 15+ minutes with no output). 10s is generous for the
# local Keycloak admin API and still fails fast when it is wedged.
admin_token() {
    curl -s --max-time 10 -X POST "$KC/realms/master/protocol/openid-connect/token" \
        -d client_id=admin-cli -d username=admin -d password=admin \
        -d grant_type=password | jq -r ".access_token"
}

client_id() { # <token>
    curl -s --max-time 10 -H "Authorization: Bearer $1" \
        "$KC/admin/realms/$REALM/clients?clientId=$CLIENT" | jq -r ".[0].id"
}

# Replace the client's redirectUris/webOrigins wholesale (GET the full
# representation first — Keycloak's PUT nulls absent fields).
patch_client() { # <redirectUris-json> <webOrigins-json>
    local token cid rep
    token=$(admin_token)
    cid=$(client_id "$token")
    [ -n "$cid" ] && [ "$cid" != "null" ] || {
        echo "error: realm client '$CLIENT' not found" >&2
        return 1
    }
    rep=$(curl -s --max-time 10 -H "Authorization: Bearer $token" "$KC/admin/realms/$REALM/clients/$cid")
    echo "$rep" | jq ".redirectUris = $1 | .webOrigins = $2" |
        curl -s -f --max-time 10 -X PUT -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" -d @- \
            "$KC/admin/realms/$REALM/clients/$cid"
}

restart_and_wait() {
    echo "==> Restarting frontend + backend to load the new issuer..."
    (cd "$ROOT_DIR" && just deploy::proc-comp process restart frontend >/dev/null)
    (cd "$ROOT_DIR" && just deploy::proc-comp process restart backend >/dev/null)
    # Per-attempt bounds are load-bearing: wait_for checks its deadline BETWEEN
    # attempts, so one blocking probe (a cold vite holding :8081 has sat on a
    # single untimed curl for 15+ minutes) defeats the timeout entirely.
    wait_for "backend" 120 grpcurl -plaintext -max-time 10 localhost:3000 health.HealthService/Check
    # vite binds [::1] only; `localhost` hits 127.0.0.1 first in this container.
    wait_for "frontend" 120 curl -fsS --max-time 10 "http://[::1]:8081/"
}

# The two restarts above are process-compose's. The adapter-node build that the
# TUNNEL is actually served from lives on :8082 outside process-compose, and it
# read the issuer out of config.yaml once at boot — so a sed alone leaves the
# public URL on the OLD issuer and every login through it fails. Call AFTER the
# sed, never before.
#
# WIRE MODE ONLY, deliberately. --restore does NOT bounce it: restore is what a
# suite run does on its way IN, and a restart there is a hole in the public
# link at the exact moment `reset.sh` has vite down too. Leaving the built
# server on the in-memory tunnel issuer means the URL keeps SERVING for the
# whole run and only NEW logins fail — pages must never 502, and Keycloak has
# dropped the tunnel redirect URIs by then anyway.
restart_prod_server() { # <origin>
    local origin="$1"
    [ -f "$PROD_SERVE" ] || return 0
    # `origin` doubles as "is prod mode live?" — it exits 1 when it is not.
    bash "$PROD_SERVE" origin >/dev/null 2>&1 || return 0

    echo "==> Restarting the built server on :8082 (ORIGIN=$origin)..."
    # --no-build: only config on disk changed, the bundle is byte-identical.
    bash "$PROD_SERVE" start "$origin" --no-build >/dev/null ||
        echo "warn: could not restart the built server; the public URL is still on" \
            "the old issuer — run prod-serve.sh start $origin --no-build" >&2
}

# Does the RUNNING backend accept a token minted by the LOCALHOST issuer?
#
# The overlay says what the configuration intends; this says what the process is
# actually doing, and the two disagree whenever a process outlived the config it
# booted with. That is not a corner case: `run.sh` calls `--restore` on the way
# into every suite, so a backend started while a tunnel was wired reaches the
# tests still validating against the tunnel issuer — and the old code skipped
# the restart precisely BECAUSE the overlay was already clean, i.e. it was most
# likely to do nothing exactly when the repair was needed.
#
# Symptom when it happens: all four auth setups time out and every spec after
# them is "did not run", which reads like a broken product and is a stale
# process. It has cost three separate debugging sessions.
#
# Asking the far end, not reading the file, is the same lesson the replay suite
# learned: "the server accepted it" and "the server can use it" are different
# claims, and only one of them can be read off a config file.
backend_accepts_localhost() {
    local token
    token="$(curl -s --max-time 10 \
        -X POST "http://localhost:8180/realms/hackagon/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d client_id=hackagon-backend -d username=alice -d password=aliceandbob \
        -d grant_type=password -d scope="openid profile" 2>/dev/null |
        jq -r '.access_token // empty' 2>/dev/null)"

    # No token means Keycloak is down or unreachable, which is a different
    # problem: answer "fine" so this never restarts the backend for a reason that
    # has nothing to do with the issuer.
    if [ -z "$token" ]; then
        echo "note: could not mint a localhost token (is Keycloak up?) — skipping" \
            "the backend issuer check" >&2
        return 0
    fi

    grpcurl -plaintext -H "authorization: Bearer $token" -max-time 10 \
        localhost:3000 user.UserService/WhoAmI >/dev/null 2>&1
}

# Restart the e2e harness's :8081 built server, which reads its OIDC issuer
# ONCE at boot and is what every suite actually logs in through.
#
# `prod-frontend.sh ensure` deliberately leaves a running server alone, so a
# stale one survives any restart that does not stop it first — and
# `restart_and_wait` above restarts process-compose's services, which :8081 is
# not one of.
#
# This runs on BOTH restore paths, and the split is what made the first version
# of this fix wrong: repairing only the overlay-absent branch left the COMMON
# case — a wired tunnel being unwound at the start of every suite run — still
# handing the tests a server on the tunnel issuer. Symptom either way is four
# auth setups timing out on `page.waitForURL`.
bounce_e2e_frontend() {
    [ -x "$E2E_PROD_FRONTEND" ] || return 0
    bash "$E2E_PROD_FRONTEND" stop >/dev/null 2>&1 || true
    bash "$E2E_PROD_FRONTEND" ensure >/dev/null 2>&1 ||
        echo "warn: could not restart the :8081 built server; logins there may still" \
            "fail — run prod-frontend.sh stop && prod-frontend.sh ensure" >&2
}

if [ "${1:-}" = "--restore" ]; then
    # Drop any tunnel-hostname pin left in /etc/hosts (see wire mode below).
    sudo sed -i "/# hackagon-tunnel/d" /etc/hosts 2>/dev/null || true
    # Restore DROPS THE `oidc` KEY — not the file. With it gone both loaders fall
    # back to the tracked config.yaml on their next boot; nothing to diff, nothing
    # to reconcile, and no way for a stale backup to overwrite an edit somebody
    # made to config.yaml meanwhile. The helper deletes the file itself once
    # `oidc` was the last key in it, so an unwired machine still looks exactly
    # like a fresh clone — but a machine with session replay wired keeps its
    # `replay` block, which is the whole reason this is not an `rm`.
    restored=0
    for f in "$FRONTEND_LOCAL" "$BACKEND_LOCAL"; do
        if [ "$(bash "$OVERLAY" remove "$f" oidc)" = "changed" ]; then
            restored=1
        fi
    done
    if [ "$restored" = 1 ]; then
        patch_client '["http://localhost:8081/*"]' '["http://localhost:8081"]' ||
            echo "warn: could not reset realm client (is Keycloak up?)" >&2
        restart_and_wait
        # No restart_prod_server here — see the comment on it. The e2e harness's
        # :8081 server IS bounced: unlike :8082 it is what the suites log in
        # through, and it booted with the issuer we just removed.
        bounce_e2e_frontend
        echo "OIDC rewired back to localhost."
        echo "NOTE: a built server on :8082 keeps the tunnel issuer it booted with;"
        echo "stop it (prod-serve.sh stop) if you need it on localhost too."
    else
        # Note the wording: config.local.yaml may well still EXIST holding somebody
        # else's key (session replay writes `replay` into it). What matters here is
        # only that no `oidc` block was there to remove.
        #
        # And that says nothing about the PROCESSES. Ask one before claiming it.
        if backend_accepts_localhost; then
            echo "Nothing to restore (no oidc overlay, and the backend takes localhost tokens)."
        else
            echo "No oidc overlay, but the backend REJECTS a localhost token — it is"
            echo "still running with an issuer it booted with. Repairing:"
            # The realm client's redirect URIs are patched by wire mode and are just
            # as capable of outliving the overlay, so reset them on this path too.
            patch_client '["http://localhost:8081/*"]' '["http://localhost:8081"]' ||
                echo "warn: could not reset realm client (is Keycloak up?)" >&2
            restart_and_wait
            bounce_e2e_frontend
            if backend_accepts_localhost; then
                echo "OIDC repaired: the backend now takes localhost tokens."
            else
                echo "warn: the backend STILL rejects a localhost token after a restart." >&2
                echo "      Check components/backend/data/test/config/ for a stray issuer." >&2
            fi
        fi
    fi
    exit 0
fi

URL="${1:?usage: auth-wire.sh <public-url> | --restore}"
URL="${URL%/}"
case "$URL" in https://*) ;; *)
    echo "error: expected an https:// tunnel URL, got '$URL'" >&2
    exit 1
    ;;
esac
URL_HTTP="http://${URL#https://}"
HOST="${URL#https://}"

# Fresh trycloudflare hostnames routinely lose the DNS race: the first lookup
# lands before propagation and the local resolver negative-caches NXDOMAIN,
# which would break both this script's checks and the frontend's server-side
# token exchange. Resolve via DNS-over-HTTPS straight at Cloudflare and pin
# the hostname in /etc/hosts (real edge IP + real TLS cert — traffic still
# flows through the tunnel). --restore removes the pin.
if ! getent hosts "$HOST" >/dev/null 2>&1; then
    echo "==> Local DNS has not caught up with '$HOST' — pinning via /etc/hosts..."
    ip=$(curl -s --max-time 10 "https://1.1.1.1/dns-query?name=$HOST&type=A" \
        -H "accept: application/dns-json" |
        jq -r '[.Answer[]? | select(.type == 1) | .data][0] // empty')
    if [ -n "$ip" ]; then
        sudo sed -i "/# hackagon-tunnel/d" /etc/hosts 2>/dev/null || true
        echo "$ip $HOST # hackagon-tunnel" | sudo tee -a /etc/hosts >/dev/null
    else
        echo "warn: DoH could not resolve $HOST yet; relying on DNS to propagate" >&2
    fi
fi

echo "==> Checking Keycloak answers on the tunnel host (issuer must be https)..."
issuer=""
for _ in $( # trycloudflare DNS can take ~30s to propagate
    seq 1 45
); do
    issuer=$(curl -fsS --max-time 5 "$URL/realms/$REALM/.well-known/openid-configuration" 2>/dev/null | jq -r ".issuer" || true)
    [ "$issuer" = "$URL/realms/$REALM" ] && break
    sleep 2
done
if [ "$issuer" != "$URL/realms/$REALM" ]; then
    echo "error: tunnel well-known reports issuer '$issuer'," >&2
    echo "       expected '$URL/realms/$REALM'." >&2
    echo "If the issuer is http:// or localhost-based, Keycloak is running without" >&2
    echo "proxy-headers=xforwarded (added in toolchain.nix) — restart the stack once:" >&2
    echo "  just down && just up" >&2
    exit 1
fi

echo "==> Allowlisting the tunnel origin on the '$CLIENT' realm client..."
# Keep localhost so direct logins still pass Keycloak's redirect check; the
# http:// variant covers SvelteKit deriving an http origin behind the proxy.
patch_client \
    "[\"http://localhost:8081/*\", \"$URL/*\", \"$URL_HTTP/*\"]" \
    '["+"]'

echo "==> Pointing frontend/backend issuers at the tunnel (config.local.yaml)..."
# Each overlay carries ONE key. Both loaders merge it into config.yaml key by
# key, so everything else — the frontend's clientId/audience, the backend's
# jwksurl and algorithm — comes from the tracked file unchanged.
#
# jwksurl deliberately stays on localhost: the signing keys are
# host-independent and the internal fetch avoids a hairpin through Cloudflare
# on every token validation.
#
# Written through config-overlay.sh, which replaces the `oidc` BLOCK and leaves
# every other top-level key alone — `replay`, when session replay is wired into
# the same overlay, is somebody else's and must survive a re-wire.
write_overlay() { # <path> <yaml-body>
    bash "$OVERLAY" set "$1" oidc >/dev/null <<EOF
$2
  # Tunnel: $URL — removed by \`auth-wire.sh --restore\`, which down.sh calls
  # for you. A quick-tunnel hostname is this machine's for the next few hours
  # and belongs nowhere near a tracked file.
EOF
}
write_overlay "$FRONTEND_LOCAL" "oidc:
  issuer: $URL/realms/$REALM"
write_overlay "$BACKEND_LOCAL" "oidc:
  issuerurl: \"$URL/realms/$REALM\""

restart_and_wait
restart_prod_server "$URL"

echo
echo "Login-capable tunnel ready: $URL"
echo "NOTE: while wired, log in via the tunnel URL (localhost logins carry the"
echo "wrong issuer). Undo with: auth-wire.sh --restore (or the skill's down.sh)."
