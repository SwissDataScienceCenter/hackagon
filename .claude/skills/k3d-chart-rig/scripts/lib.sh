#!/usr/bin/env bash
# Shared settings and helpers for the k3d chart rig.
#
# Sourced by every script here. Nothing in this file starts anything.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$HERE/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
CHART_DIR="$REPO_ROOT/helm-chart"
STATE_DIR="$SKILL_DIR/.state"
BIN_DIR="$SKILL_DIR/bin"
MANIFEST_DIR="$SKILL_DIR/manifests"

# --- names ------------------------------------------------------------
# Release name is `hackagon` on purpose: helm-chart/values.yaml hard-codes
# `keycloak.realmImport.existingConfigMap: hackagon-realm`, and the ConfigMap
# the chart actually creates is `<fullname>-realm`. Those two only agree when
# the release is called hackagon.
CLUSTER="${RIG_CLUSTER:-hackagon}"
RELEASE="${RIG_RELEASE:-hackagon}"
NAMESPACE="${RIG_NAMESPACE:-hackagon}"
STORE_NS="${RIG_STORE_NAMESPACE:-hackagon-store}"

# --- the hostname ------------------------------------------------------
# `*.localhost`, not nip.io/sslip.io. Both of those were measured failing on
# this machine: the local resolver applies DNS-rebinding protection and refuses
# to hand back an answer inside 127.0.0.0/8, so `app.127.0.0.1.nip.io` does not
# resolve at all while `nslookup … 8.8.8.8` does. That is a property of whoever
# runs DNS for the developer, which is not something a test rig may depend on.
#
# `*.localhost` involves no resolver: curl (>= 7.77) and every Chromium, plus
# Firefox >= 84, map it to loopback themselves per RFC 6761. Nothing is written
# to /etc/hosts or the Windows hosts file. Scripts additionally pass --resolve
# so that an older curl works too.
BASE_DOMAIN="${RIG_BASE_DOMAIN:-hackagon.localhost}"
APP_HOST="app.$BASE_DOMAIN"
AUTH_HOST="auth.$BASE_DOMAIN"

# --- host ports this rig claims ---------------------------------------
# Deliberately clear of everything the dev stack publishes:
#   3000 backend · 8081 frontend (vite) · 8082 frontend (built) · 8180 keycloak
#   15432 postgres · 9000/9001 rustfs · 8010 plausible
HTTP_PORT="${RIG_HTTP_PORT:-8090}"    # ingress-nginx, http  — the app
HTTPS_PORT="${RIG_HTTPS_PORT:-8443}"  # ingress-nginx, https — Keycloak only
API_PORT="${RIG_API_PORT:-6551}"      # k3s apiserver

# THE APP IS ON PLAIN HTTP AND KEYCLOAK IS ON TLS, and the split is deliberate.
#
# Keycloak's AUTH_SESSION_ID / KC_RESTART cookies are in its FEDERATION scope,
# which is `SameSite=None` — and SameSite=None requires Secure, so Keycloak
# marks them Secure whatever scheme it is reached over. Measured on this rig
# before the split: over http it answered
# `Set-Cookie: AUTH_SESSION_ID=…;Secure;HttpOnly;SameSite=None`, curl dropped
# them per the cookie spec, and the login POST came back 400 "session expired,
# it may have been deleted or cookies are disabled". Nothing in the chart could
# have fixed that; it is Keycloak's rule.
#
# (A real browser would have completed it: `*.localhost` is a
# potentially-trustworthy origin, so Chrome and Firefox accept Secure cookies
# there over http. curl has no such exception, and a test that only passes in
# a browser is a test this rig cannot run.)
#
# Leaving the APP on http is not a shortcut either — it is the load-bearing
# half. The SvelteKit node adapter INFERS the public scheme, and its
# unconfigured guess is the literal string "https". An https-everywhere rig
# would agree with that guess by accident and prove nothing. On http, a
# frontend that guesses wrong advertises https callback URLs, issues
# `__Secure-` cookies the browser will not send back, and login dies while
# every page still answers 200. That is the failure `frontend.protocolHeader`
# was added for, and this is where it is observed.
APP_URL="http://$APP_HOST:$HTTP_PORT"
AUTH_URL="https://$AUTH_HOST:$HTTPS_PORT"

# --- pinned toolchain --------------------------------------------------
K3D_VERSION="${RIG_K3D_VERSION:-v5.8.3}"
HELM_VERSION="${RIG_HELM_VERSION:-v3.19.0}"
KUBECTL_VERSION="${RIG_KUBECTL_VERSION:-v1.31.5}"
# k3s image: must match the k3d default for the pinned k3d, or say so loudly.
K3S_IMAGE="${RIG_K3S_IMAGE:-rancher/k3s:v1.31.5-k3s1}"
INGRESS_NGINX_CHART_VERSION="${RIG_INGRESS_NGINX_VERSION:-4.13.3}"
MINIO_IMAGE="${RIG_MINIO_IMAGE:-quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z}"
MC_IMAGE="${RIG_MC_IMAGE:-quay.io/minio/mc:RELEASE.2025-04-16T18-13-26Z}"

# --- object store ------------------------------------------------------
# In its OWN namespace, reached by its cluster DNS name. That is what makes the
# chart render its ExternalName Service (claim 3): `storage.endpoint` names a
# host that is not a Service in the release namespace, so
# `storage.objects.ingress.service.name` stays empty and the chart supplies the
# adapter itself.
STORE_HOST="store.$STORE_NS.svc.cluster.local"
STORE_PORT=9000
STORE_ENDPOINT="http://$STORE_HOST:$STORE_PORT"
STORE_BUCKET="${RIG_BUCKET:-hackagon}"

# --- generated files ---------------------------------------------------
KUBECONFIG_FILE="$STATE_DIR/kubeconfig.yaml"
GEN_VALUES="$STATE_DIR/values.generated.yaml"
REALM_FILE="$STATE_DIR/realm-rewritten.json"
SECRETS_ENV="$STATE_DIR/secrets.env"
TLS_CERT="$STATE_DIR/auth-tls.crt"
TLS_KEY="$STATE_DIR/auth-tls.key"

mkdir -p "$STATE_DIR"

# --- output ------------------------------------------------------------
if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_BAD=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
    C_OK=''; C_BAD=''; C_DIM=''; C_OFF=''
fi
say()  { printf '%s\n' "$*" >&2; }
step() { printf '\n%s==> %s%s\n' "$C_DIM" "$*" "$C_OFF" >&2; }
ok()   { printf '%s  ok%s   %s\n' "$C_OK" "$C_OFF" "$*" >&2; }
bad()  { printf '%s  FAIL%s %s\n' "$C_BAD" "$C_OFF" "$*" >&2; }
die()  { bad "$*"; exit 1; }

# --- path translation --------------------------------------------------
# k3d.exe, helm.exe and kubectl.exe are WINDOWS binaries invoked from Git Bash.
# They do not understand /c/Users/... , and MSYS's automatic conversion only
# fires on arguments it recognises as paths — which it does not for
# `--set-file key=/c/...`. Convert explicitly wherever a path is passed.
#
# `cygpath -m` (mixed: `C:/Users/…`), NOT `cygpath -w` (`C:\Users\…`). Helm's
# --set-file value goes through its strvals parser, which treats `\` as an
# escape character: a Windows path arrives as `C:UsersKato…` and helm reports
# the file as missing. Forward slashes are accepted by every Windows binary
# here and survive the parser untouched.
if command -v cygpath >/dev/null 2>&1; then
    winpath() { cygpath -m "$1"; }
    IS_WINDOWS=1
else
    winpath() { printf '%s' "$1"; }
    IS_WINDOWS=0
fi

# --- tool wrappers -----------------------------------------------------
# Every wrapper points at the rig's OWN kubeconfig. The user's ~/.kube/config
# is never read and never written: k3d is called with
# --kubeconfig-update-default=false, so an existing cluster context on this
# machine keeps whatever it was pointing at.
#
# MSYS_NO_PATHCONV=1 throughout: every path these commands need is passed
# through winpath() deliberately, and MSYS's automatic conversion would corrupt
# the ones that only LOOK like paths — a JSON patch's "/spec/template/…", a
# jsonpath, `sh -c 'cat /proc/1/root/…'`. Off is the predictable setting.
k3d()     { MSYS_NO_PATHCONV=1 "$BIN_DIR/k3d" "$@"; }
kubectl() { MSYS_NO_PATHCONV=1 KUBECONFIG="$(winpath "$KUBECONFIG_FILE")" "$BIN_DIR/kubectl" "$@"; }
helm()    { MSYS_NO_PATHCONV=1 KUBECONFIG="$(winpath "$KUBECONFIG_FILE")" "$BIN_DIR/helm"    "$@"; }

# curl against the rig's ingress.
#   --resolve  belt and braces: modern curl maps *.localhost itself, older ones
#              do not.
#   -k         the Keycloak certificate is minted by up.sh and signed by
#              nothing. Scoped to this function so it can never leak into a
#              call that ought to be verifying a real chain.
rigcurl() {
    curl --resolve "$APP_HOST:$HTTP_PORT:127.0.0.1" \
         --resolve "$AUTH_HOST:$HTTPS_PORT:127.0.0.1" \
         --resolve "$APP_HOST:$HTTPS_PORT:127.0.0.1" \
         -k --max-time "${RIG_CURL_TIMEOUT:-30}" "$@"
}

cluster_exists() { k3d cluster list -o json 2>/dev/null | grep -q "\"name\":\"$CLUSTER\""; }

require_cluster() {
    cluster_exists || die "cluster '$CLUSTER' does not exist — run scripts/up.sh"
    [ -f "$KUBECONFIG_FILE" ] || die "no kubeconfig at $KUBECONFIG_FILE — run scripts/up.sh"
}

# Read a generated secret back out of .state/secrets.env.
load_secrets() {
    [ -f "$SECRETS_ENV" ] || die "no $SECRETS_ENV — run scripts/up.sh"
    # shellcheck disable=SC1090
    . "$SECRETS_ENV"
}
