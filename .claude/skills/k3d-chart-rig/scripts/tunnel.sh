#!/usr/bin/env bash
# Publish the k3d cluster on REAL hostnames with a REAL certificate, through a
# named Cloudflare tunnel — then put it back.
#
#   bash scripts/tunnel.sh up        # switch the release to https + start the tunnel
#   bash scripts/tunnel.sh down      # switch back to *.localhost, stop the tunnel
#   bash scripts/tunnel.sh destroy   # …and give the hostnames up (tunnel + DNS)
#   bash scripts/tunnel.sh status    # what is running, and what the DNS says
#
# WHY THIS EXISTS. The rig's default mode serves the app over plain http on
# `*.localhost`, on purpose: adapter-node's unconfigured guess for the public
# scheme is the literal string "https", so an https-everywhere rig agrees with a
# wrong guess by accident. That asymmetry found `frontend.protocolHeader`. This
# is the other half — the shape a deployment actually has, and the only one in
# which `__Secure-` cookies, a verified chain and a browser's real HTTPS rules
# are exercised at all.
#
#   browser ──https──▶ Cloudflare edge ──tunnel──▶ cloudflared ──http──▶
#                      ingress-nginx :8090 ──▶ frontend / Keycloak / the store
#
# TLS terminates at the edge. The origin is plain http and cloudflared is what
# adds `X-Forwarded-Proto: https`, which is exactly the header
# `frontend.protocolHeader` reads. Nothing in the cluster holds a certificate.
#
# WHAT IT DOES NOT TOUCH: the dev stack, the three tunnels that serve it
# (`cf-named-hackagon`, `-plausible`, `-openreplay`), and the rig's own
# `*.localhost` mode — `down` restores that exactly, and `verify.sh` is the
# check that it did.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# shellcheck source=../../lib/cf-named-tunnel.sh
. "$REPO_ROOT/.claude/skills/lib/cf-named-tunnel.sh"

# ── names ──────────────────────────────────────────────────────────────
# One tunnel, two hostnames, because the chart routes the app and Keycloak by
# HOST on two separate Ingresses. Path-muxing them onto one name (which is what
# the dev stack's caddy does) would need Keycloak on a relative path and would
# skip the chart's own keycloak Ingress — the object this rig found a bug in.
#
# BOTH NAMES ARE ONE LABEL DEEP, and that is not a style choice. Cloudflare's
# free Universal SSL covers the apex and one label and nothing below it:
# measured against the edge before anything was created, `auth.k3d-sdsc-…` (two
# labels) answers a TLS handshake with alert 40 while `k3d-auth-sdsc-…` (one)
# gets the zone's real certificate. `k3d-` says which cluster, and says it is
# the throwaway one.
TUNNEL_NAME="${RIG_TUNNEL_NAME:-hackagon-k3d}"
TUNNEL_NETWORK="k3d-$CLUSTER"
TUNNEL_ORIGIN="http://k3d-$CLUSTER-serverlb:$HTTP_PORT"
TUNNEL_VALUES="$STATE_DIR/values.tunnel.yaml"

load_hostnames() {
    cf_load || {
        say ""
        bad "no Cloudflare credentials — this mode needs a zone you own."
        cf_explain_unconfigured >&2
        exit 1
    }
    : "${CLOUDFLARE_ZONE:?}"
    # Read from the same gitignored .env the other three rigs read, so a
    # hostname lives in exactly one place and NO TRACKED FILE NAMES ONE. The
    # fallbacks are derived from the configured zone rather than written out,
    # for that reason: `k3d.<zone>` says which cluster without committing
    # anybody's domain to this repository.
    TUNNEL_APP_HOST="${K3D_HOSTNAME:-k3d.$CLOUDFLARE_ZONE}"
    TUNNEL_AUTH_HOST="${K3D_AUTH_HOSTNAME:-k3d-auth.$CLOUDFLARE_ZONE}"
    TUNNEL_APP_URL="https://$TUNNEL_APP_HOST"
    TUNNEL_AUTH_URL="https://$TUNNEL_AUTH_HOST"
}

# ── Keycloak's redirect URIs ───────────────────────────────────────────
# The realm is imported ONCE, when Keycloak first starts against an empty
# database, so a later `helm upgrade` cannot change the client's redirect URIs —
# the ConfigMap it renders is only ever read by an import that has already
# happened. Switching modes therefore has to talk to the running Keycloak.
#
# Both origins are allowed while the tunnel is up. A single-origin list would
# make the switch a cliff: the first person to sign in on the OTHER URL gets
# "Invalid parameter: redirect_uri" from Keycloak, which names nothing anyone
# can act on.
#
# The script goes to the pod on STDIN, never in argv. Two reasons and both have
# bitten this repo: the values are JSON, so they carry double quotes that a
# `sh -c "…$var…"` on this side would end the string on; and the admin password
# would otherwise be visible in `ps` on this machine for the life of the call
# (cf-api.sh feeds curl its bearer token the same way, for the same reason).
kc_sh() { # remote sh script on stdin
    kubectl -n "$NAMESPACE" exec -i "deploy/$RELEASE-keycloak" -c keycloak -- sh -s
}

# `'` inside a single-quoted shell word, spelled the only way that works.
sq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

kcadm_login() { # emits the login line for the remote script
    local u p
    u="$(kubectl -n "$NAMESPACE" get secret "$RELEASE-keycloak-admin" -o jsonpath='{.data.admin-username}' | base64 -d)"
    p="$(kubectl -n "$NAMESPACE" get secret "$RELEASE-keycloak-admin" -o jsonpath='{.data.admin-password}' | base64 -d)"
    # --config /tmp/…: $HOME here is /opt/keycloak and kcadm's default config
    # path under it is not reliably writable by uid 1000.
    printf 'set -e\nKC=/opt/keycloak/bin/kcadm.sh\n'
    printf '$KC config credentials --config /tmp/kcadm.json --server http://localhost:8080 --realm master --user %s --password %s >/dev/null 2>&1\n' \
        "$(sq "$u")" "$(sq "$p")"
}

set_redirect_uris() { # <origin…>
    local id uris="" origins="" o
    id="$({
        kcadm_login
        printf '$KC get clients -r hackagon -q clientId=hackagon-frontend --fields id --format csv --noquotes --config /tmp/kcadm.json\n'
    } | kc_sh | tr -d '\r' | grep -E '^[0-9a-f-]{36}$' | head -1)"
    [ -n "$id" ] || die "could not find the hackagon-frontend client in the realm"
    for o in "$@"; do
        uris="${uris:+$uris,}\"$o/*\""
        origins="${origins:+$origins,}\"$o\""
    done
    {
        kcadm_login
        printf '$KC update clients/%s -r hackagon -s %s -s %s --config /tmp/kcadm.json\n' \
            "$id" "$(sq "redirectUris=[$uris]")" "$(sq "webOrigins=[$origins]")"
    } | kc_sh >/dev/null
    ok "Keycloak accepts redirects to: $*"
}

# ── the controller has to pass the scheme through ──────────────────────
# ingress-nginx overwrites X-Forwarded-Proto with the scheme of the connection
# IT terminated unless `use-forwarded-headers` is on. Without it the frontend is
# told `http` on a request the browser made over https and login dies with every
# page answering 200 — see the comment in manifests/ingress-nginx-values.yaml.
#
# Applied by re-running the same `helm upgrade` up.sh uses, so the values file
# stays the single description of this controller. Skipped when it is already
# set, because that upgrade costs ~40 s.
ensure_forwarded_headers() {
    local cur
    cur="$(kubectl -n ingress-nginx get configmap ingress-nginx-controller \
        -o jsonpath='{.data.use-forwarded-headers}' 2>/dev/null || true)"
    if [ "$cur" = "true" ]; then
        ok "ingress-nginx already trusts X-Forwarded-Proto"
        return 0
    fi
    step "ingress-nginx: trusting X-Forwarded-Proto"
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --version "$INGRESS_NGINX_CHART_VERSION" \
        --namespace ingress-nginx --create-namespace \
        -f "$(winpath "$MANIFEST_DIR/ingress-nginx-values.yaml")" \
        --wait --timeout 10m >/dev/null
    ok "use-forwarded-headers=true (absent header still falls back to \$scheme)"
}

# ── the values overlay ─────────────────────────────────────────────────
write_values() {
    cat >"$TUNNEL_VALUES" <<YAML
# GENERATED by scripts/tunnel.sh — gitignored, and it carries the public
# hostname, which is why it is not a tracked file. Layered ON TOP of
# helm-chart/values.k3d.yaml, so everything not mentioned here is still the
# rig's normal test configuration.
#
# Read it as the diff between "a laptop on *.localhost" and "the same cluster
# behind a TLS-terminating proxy" — which is the diff between this rig and a
# deployment.

# The real zone. Only \`hackagon.frontendHost\` still derives from it (the realm
# ConfigMap), and up.sh has already rewritten the realm to the URL in use, so
# every host below is stated outright rather than derived.
baseDomain: "$CLOUDFLARE_ZONE"

frontend:
  config:
    cookies:
      # TRUE, and this is the property the localhost mode cannot test. Auth.js
      # names the session cookie \`__Secure-authjs.session-token\` when it
      # believes the connection is secure, and a browser refuses to store a
      # \`__Secure-\` cookie that did not arrive over https. On a real
      # certificate it does; that is the whole point of this mode.
      useSecure: true
    oidc:
      issuer: "$TUNNEL_AUTH_URL/realms/hackagon"
  # EMPTIED ON PURPOSE — values.k3d.yaml sets NODE_TLS_REJECT_UNAUTHORIZED=0 so
  # the frontend will accept the self-signed certificate up.sh mints for
  # Keycloak. There is no self-signed certificate on this path: the frontend pod
  # fetches the discovery document from the same public URL the browser uses,
  # over Cloudflare's certificate, verified by node's own trust store. A list
  # value replaces rather than merges, so [] really does remove it.
  extraEnv: []
  ingress:
    hosts:
      - host: "$TUNNEL_APP_HOST"
        paths:
          - path: /
            pathType: Prefix
    # No TLS block anywhere in this file. Cloudflare holds the certificate; the
    # cluster speaks plain http and would only be able to offer a self-signed
    # one. An empty list also keeps ingress-nginx's ssl-redirect off, which
    # matters: with a TLS block it would 308 the plain-http request the tunnel
    # makes, and the browser would bounce between the edge and the origin.
    tls: []

backend:
  config:
    oidc:
      # issuerurl is COMPARED against the \`iss\` claim, so it is the public URL.
      # jwksurl is FETCHED and stays on the in-cluster short path — inherited
      # from values.k3d.yaml, unchanged.
      issuerurl: "$TUNNEL_AUTH_URL/realms/hackagon"

keycloak:
  hostname:
    # No port: this one really is on 443. Keycloak 26 derives the public scheme
    # from this URL, and \`proxy.headers: xforwarded\` (values.k3d.yaml) makes it
    # believe the X-Forwarded-* headers cloudflared and nginx put on the request.
    hostname: "$TUNNEL_AUTH_URL"
  ingress:
    # The override this mode needed the chart to grow. \`auth.{baseDomain}\` would
    # be \`auth.$CLOUDFLARE_ZONE\` — a name that belongs to the zone rather than to
    # this throwaway cluster — and any \`k3d-\`-prefixed baseDomain would put
    # Keycloak two labels deep, where Universal SSL has no certificate for it.
    host: "$TUNNEL_AUTH_HOST"
    # Explicit null, not {}: helm deep-merges values files and an empty map
    # merges as "no change", so values.yaml's secret name would survive.
    tlsSecretName: null
YAML
}

install() { # <values-overlay…>
    local -a extra=()
    [ -f "$REALM_FILE" ] && extra=(--set-file "realmJson=$(winpath "$REALM_FILE")")
    local -a files=(-f "$(winpath "$CHART_DIR/values.yaml")"
        -f "$(winpath "$CHART_DIR/values.k3d.yaml")")
    local f
    for f in "$@"; do files+=(-f "$(winpath "$f")"); done
    files+=(-f "$(winpath "$GEN_VALUES")")
    helm upgrade --install "$RELEASE" "$(winpath "$CHART_DIR")" \
        --namespace "$NAMESPACE" "${files[@]}" "${extra[@]}" --timeout 15m >&2
}

wait_rollout() {
    local d
    for d in keycloak frontend backend; do
        kubectl -n "$NAMESPACE" rollout status "deployment/$RELEASE-$d" --timeout=300s >/dev/null &&
            ok "$d rolled out" || bad "$d did NOT roll out"
    done
}

# =====================================================================
cmd_up() {
    require_cluster
    load_secrets
    load_hostnames

    step "hostnames"
    say "  app       $TUNNEL_APP_URL"
    say "  keycloak  $TUNNEL_AUTH_URL"
    say "  origin    $TUNNEL_ORIGIN on docker network $TUNNEL_NETWORK"

    ensure_forwarded_headers

    step "release → public https"
    write_values
    install "$TUNNEL_VALUES"
    wait_rollout

    step "Keycloak redirect URIs"
    set_redirect_uris "$TUNNEL_APP_URL" "$LOCAL_APP_URL"

    step "the tunnel"
    cfn_up "$TUNNEL_NAME" "$TUNNEL_APP_HOST" "$TUNNEL_NETWORK" "$TUNNEL_ORIGIN" \
        "$TUNNEL_AUTH_HOST"

    # Written LAST. Every script here reads this file to decide which URLs it is
    # talking about, so writing it before the release is actually serving them
    # would make a failed switch look like a successful one.
    cat >"$MODE_ENV" <<EOF
# Written by scripts/tunnel.sh — the mode the RELEASE is installed in.
RIG_MODE=tunnel
RIG_APP_HOST=$TUNNEL_APP_HOST
RIG_AUTH_HOST=$TUNNEL_AUTH_HOST
EOF

    step "up"
    say "  app       $TUNNEL_APP_URL"
    say "  keycloak  $TUNNEL_AUTH_URL"
    say "  uploads   $TUNNEL_APP_URL/objects/$STORE_BUCKET/…"
    say "  loopback  $LOCAL_APP_URL   (still served — no X-Forwarded-Proto, see verify.sh)"
    say ""
    say "  verify:   bash $HERE/verify.sh"
    say "  back:     bash $HERE/tunnel.sh down"
    say "  give up:  bash $HERE/tunnel.sh destroy   (deletes the DNS records too)"
}

cmd_down() {
    load_hostnames
    step "stopping the tunnel"
    cfn_stop "$TUNNEL_NAME"

    if cluster_exists && [ -f "$KUBECONFIG_FILE" ]; then
        load_secrets
        step "release → *.localhost"
        install
        wait_rollout
        step "Keycloak redirect URIs"
        set_redirect_uris "$LOCAL_APP_URL"
    else
        say "  (no cluster — nothing to put back)"
    fi
    rm -f "$MODE_ENV"

    step "what is left on Cloudflare"
    say "  The tunnel '$TUNNEL_NAME' and these DNS records still EXIST:"
    say "    $TUNNEL_APP_HOST"
    say "    $TUNNEL_AUTH_HOST"
    say "  Nothing serves them now, so they answer Cloudflare's 1033 (\"tunnel not"
    say "  found\") — which is honest, and is why the container is stopped rather"
    say "  than left pointing at a cluster that may be gone."
    say ""
    say "  Give the names up:  bash $HERE/tunnel.sh destroy"
}

cmd_destroy() {
    load_hostnames
    step "destroying the tunnel and its DNS records"
    cfn_destroy "$TUNNEL_NAME" "$TUNNEL_APP_HOST" "$TUNNEL_AUTH_HOST"
    rm -f "$MODE_ENV" "$TUNNEL_VALUES"
    ok "tunnel, credentials file and both CNAMEs are gone"
    say ""
    say "  The RELEASE is still configured for those hostnames if it was up when"
    say "  this ran. Put it back with:  bash $HERE/tunnel.sh down"
}

cmd_status() {
    load_hostnames
    say "  mode      $RIG_MODE   (from $MODE_ENV)"
    say "  app       $TUNNEL_APP_URL"
    say "  keycloak  $TUNNEL_AUTH_URL"
    if cfn_running "$TUNNEL_NAME"; then
        ok "cloudflared $(cfn_container "$TUNNEL_NAME") is running"
    else
        bad "cloudflared $(cfn_container "$TUNNEL_NAME") is NOT running"
    fi
    local h
    for h in "$TUNNEL_APP_HOST" "$TUNNEL_AUTH_HOST"; do
        say "  https://$h -> $(cfn_http_code "https://$h/")"
    done
}

case "${1:-}" in
    up) cmd_up ;;
    down) cmd_down ;;
    destroy) cmd_destroy ;;
    status) cmd_status ;;
    -h | --help | "") sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//' ;;
    *) die "unknown command '$1' (up | down | destroy | status)" ;;
esac
