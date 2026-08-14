#!/usr/bin/env bash
# One command from nothing to an installed, reachable Hackagon release on a
# throwaway Kubernetes cluster.
#
#   bash scripts/up.sh              # cluster + ingress-nginx + store + release
#   bash scripts/up.sh --recreate   # delete the cluster first
#   bash scripts/up.sh --no-realm   # skip the Keycloak realm import (see below)
#
# THE REALM IMPORT CARRIES DEV ACCOUNTS. tools/configs/keycloak/realm-hackagon.json
# is the development export: alice, bob, charles and hackagon-admin, all with
# the password `aliceandbob`, all with `emailVerified` and no password policy.
# It is imported here because the login round-trip in verify.sh has to sign
# SOMEBODY in, and inventing a second realm would test a realm nobody deploys.
# It is why this rig is opt-in, why it binds only 127.0.0.1, and why nothing it
# writes may ever be copied into a deployment. `--no-realm` leaves Keycloak with
# an empty realm; the login check then self-reports as skipped.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RECREATE=0
WITH_REALM=1
for arg in "$@"; do
    case "$arg" in
        --recreate) RECREATE=1 ;;
        --no-realm) WITH_REALM=0 ;;
        -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
        *) die "unknown flag $arg" ;;
    esac
done

# =====================================================================
step "toolchain"
# =====================================================================
bash "$HERE/tools.sh" >/dev/null 2>&1 || bash "$HERE/tools.sh"
ok "k3d $K3D_VERSION · helm $HELM_VERSION · kubectl $KUBECTL_VERSION in bin/"

# =====================================================================
step "cluster"
# =====================================================================
if [ "$RECREATE" = 1 ] && cluster_exists; then
    say "  deleting existing cluster"
    k3d cluster delete "$CLUSTER" >/dev/null
fi

if cluster_exists; then
    ok "cluster '$CLUSTER' already exists"
    k3d cluster start "$CLUSTER" >/dev/null 2>&1 || true
else
    # --disable=traefik is the whole reason this is not `k3d cluster create` with
    # defaults. k3d bundles Traefik, and every annotation the chart puts on its
    # /objects Ingress is ingress-nginx's; the Host rewrite in particular is not
    # expressible in a core Ingress object on Traefik at all. With the bundled
    # controller the one thing worth testing here cannot work.
    #
    # metrics-server is disabled purely to save ~150 MB of RAM; nothing reads it.
    k3d cluster create "$CLUSTER" \
        --servers 1 --agents 0 \
        --image "$K3S_IMAGE" \
        --api-port "127.0.0.1:$API_PORT" \
        --port "$HTTP_PORT:$HTTP_PORT@loadbalancer" \
        --port "$HTTPS_PORT:$HTTPS_PORT@loadbalancer" \
        --k3s-arg "--disable=traefik@server:*" \
        --k3s-arg "--disable=metrics-server@server:*" \
        --kubeconfig-update-default=false \
        --kubeconfig-switch-context=false \
        --wait --timeout 300s >&2
    ok "cluster created"
fi

# The rig's own kubeconfig, never ~/.kube/config: this machine has other
# clusters and other contexts, and a rig that repoints `kubectl` for everything
# else is a rig that breaks someone's day.
k3d kubeconfig get "$CLUSTER" > "$KUBECONFIG_FILE"
ok "kubeconfig -> $KUBECONFIG_FILE"

# =====================================================================
step "ingress-nginx"
# =====================================================================
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update ingress-nginx >/dev/null 2>&1 || true
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --version "$INGRESS_NGINX_CHART_VERSION" \
    --namespace ingress-nginx --create-namespace \
    -f "$(winpath "$MANIFEST_DIR/ingress-nginx-values.yaml")" \
    --wait --timeout 10m >/dev/null
INGRESS_IP="$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')"
ok "ingress-nginx $INGRESS_NGINX_CHART_VERSION on :$HTTP_PORT (ClusterIP $INGRESS_IP)"

# =====================================================================
step "in-cluster DNS for the public hostnames"
# =====================================================================
# The frontend pod fetches the OIDC discovery document from the SAME string the
# browser uses — Auth.js rejects a document whose `issuer` differs from the
# configured one, so there is no second, internal URL to fall back on. Inside
# the cluster `auth.hackagon.localhost` would otherwise resolve to nothing (or,
# with a nip.io-style name, to the pod's own loopback), so CoreDNS is taught to
# answer both names with the ingress controller's ClusterIP.
#
# `coredns-custom` is k3s's supported extension point: its Corefile ends with
# `import /etc/coredns/custom/*.override` INSIDE the `.:53` block, and the
# Deployment mounts the ConfigMap optionally. Editing the Corefile directly
# would work until k3s re-applied its bundled manifest.
#
# `rewrite`, not `hosts`. Two reasons, one of them measured: k3s's Corefile
# already contains `hosts /etc/coredns/NodeHosts`, and a second stanza makes
# CoreDNS refuse to start — "plugin/hosts: this plugin can only be used once
# per Server Block", CrashLoopBackOff, whole cluster's DNS down. `rewrite` is
# explicitly multi-instance. It is also the better answer: it names the ingress
# controller's SERVICE, so reinstalling ingress-nginx (new ClusterIP) does not
# leave a stale address baked into DNS. Plugin order in CoreDNS comes from the
# registry, not from the file, so an import at the end of the block still runs
# `rewrite` before `kubernetes`.
kubectl -n kube-system create configmap coredns-custom \
    --from-literal="hackagon.override=rewrite name $APP_HOST ingress-nginx-controller.ingress-nginx.svc.cluster.local
rewrite name $AUTH_HOST ingress-nginx-controller.ingress-nginx.svc.cluster.local" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n kube-system rollout restart deployment coredns >/dev/null
kubectl -n kube-system rollout status deployment coredns --timeout=120s >/dev/null
ok "$APP_HOST, $AUTH_HOST -> $INGRESS_IP inside the cluster"

# =====================================================================
step "generated credentials"
# =====================================================================
# Never in a tracked file, and never in values.yaml either — `helm get values`
# would print them back out. Hex only: the backend's env loader splits any value
# containing a SPACE into a list, so a credential with one would not arrive
# intact (helm-chart/values.yaml says so about the storage keys).
if [ ! -f "$SECRETS_ENV" ]; then
    umask 077
    cat >"$SECRETS_ENV" <<EOF
# Generated by scripts/up.sh — gitignored, throwaway, cluster-local.
POSTGRES_PASSWORD=$(openssl rand -hex 16)
KEYCLOAK_DB_PASSWORD=$(openssl rand -hex 16)
HACKAGON_DB_PASSWORD=$(openssl rand -hex 16)
STORAGE_ACCESS_KEY=rig$(openssl rand -hex 8)
STORAGE_SECRET_KEY=$(openssl rand -hex 24)
FRONTEND_CLIENT_SECRET=$(openssl rand -hex 24)
FRONTEND_AUTH_SECRET=$(openssl rand -hex 32)
EOF
    ok "minted $SECRETS_ENV"
else
    ok "reusing $SECRETS_ENV"
fi
load_secrets

# =====================================================================
step "object store (test-only, not part of the chart)"
# =====================================================================
kubectl create namespace "$STORE_NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$STORE_NS" create secret generic store-credentials \
    --from-literal=accessKey="$STORAGE_ACCESS_KEY" \
    --from-literal=secretKey="$STORAGE_SECRET_KEY" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
sed "s|MINIO_IMAGE_PLACEHOLDER|$MINIO_IMAGE|" "$MANIFEST_DIR/store.yaml" | kubectl apply -f - >/dev/null
kubectl -n "$STORE_NS" rollout status deployment store --timeout=300s >/dev/null
kubectl -n "$STORE_NS" delete job store-init --ignore-not-found >/dev/null
sed -e "s|MC_IMAGE_PLACEHOLDER|$MC_IMAGE|" -e "s|BUCKET_PLACEHOLDER|$STORE_BUCKET|g" \
    "$MANIFEST_DIR/store-init-job.yaml" | kubectl apply -f - >/dev/null
kubectl -n "$STORE_NS" wait --for=condition=complete job/store-init --timeout=180s >/dev/null
ok "store at $STORE_ENDPOINT, bucket '$STORE_BUCKET', hackathons|users|site public-read"

# =====================================================================
step "release namespace and secrets"
# =====================================================================
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
# The chart REFUSES to take storage credentials from values (see
# backend-deployment.yaml's `required`), which is the right call — this is the
# Secret it insists on.
kubectl -n "$NAMESPACE" create secret generic hackagon-storage \
    --from-literal=accessKey="$STORAGE_ACCESS_KEY" \
    --from-literal=secretKey="$STORAGE_SECRET_KEY" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
ok "Secret hackagon-storage created from generated values"

# --- the Keycloak certificate ------------------------------------------
# Self-signed, 90 days, one hostname. It exists because Keycloak's federation
# cookies are `SameSite=None`, which forces `Secure`, which means no browser and
# no HTTP client will keep them over plain http — so the login round-trip is
# unreachable without TLS somewhere. See lib.sh for the measurement.
#
# The Secret name is the chart's OWN DEFAULT (`{releaseName}-keycloak-tls`), so
# this also exercises the default rather than routing around it.
if [ ! -f "$TLS_CERT" ] || ! openssl x509 -in "$TLS_CERT" -checkend 604800 >/dev/null 2>&1; then
    openssl req -x509 -newkey rsa:2048 -sha256 -days 90 -nodes \
        -keyout "$TLS_KEY" -out "$TLS_CERT" \
        -subj "//CN=$AUTH_HOST" \
        -addext "subjectAltName=DNS:$AUTH_HOST" >/dev/null 2>&1 \
        || die "openssl could not mint the Keycloak certificate"
    ok "minted a 90-day self-signed certificate for $AUTH_HOST"
else
    ok "reusing the certificate for $AUTH_HOST"
fi
# winpath both: the kubectl wrapper runs with MSYS_NO_PATHCONV=1, so a
# /c/Users/… path reaches kubectl.exe verbatim and it cannot open it.
kubectl -n "$NAMESPACE" create secret tls "$RELEASE-keycloak-tls" \
    --cert="$(winpath "$TLS_CERT")" --key="$(winpath "$TLS_KEY")" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null

cat >"$GEN_VALUES" <<EOF
# Generated by scripts/up.sh. Gitignored: every value below is a credential.
postgresql:
  auth:
    postgresPassword: "$POSTGRES_PASSWORD"
backend:
  config:
    database:
      postgresPassword: "$HACKAGON_DB_PASSWORD"
keycloak:
  database:
    external:
      password: "$KEYCLOAK_DB_PASSWORD"
frontendSecrets:
  clientSecret: "$FRONTEND_CLIENT_SECRET"
  authSecret: "$FRONTEND_AUTH_SECRET"
EOF

# =====================================================================
step "realm"
# =====================================================================
REALM_ARGS=()
if [ "$WITH_REALM" = 1 ]; then
    SRC_REALM="$REPO_ROOT/tools/configs/keycloak/realm-hackagon.json"
    [ -f "$SRC_REALM" ] || die "no realm export at $SRC_REALM"
    # Rewritten HERE rather than by the chart. keycloak-realm-configmap.yaml
    # rewrites `http://localhost:8081` to `https://app.{baseDomain}` — scheme
    # hard-coded, port dropped — which is right for a deployment on :443 and
    # wrong for anything else, this rig included. Doing the substitution first
    # makes the chart's own replaces no-ops rather than fighting them.
    sed "s|http://localhost:8081|$APP_URL|g" "$SRC_REALM" >"$REALM_FILE"
    REALM_ARGS=(--set-file "realmJson=$(winpath "$REALM_FILE")")
    say "  ⚠ importing the DEVELOPMENT realm: alice, bob, charles, hackagon-admin"
    say "  ⚠ all with the password 'aliceandbob'. Local, opt-in, throwaway only."
    ok "realm redirect URIs rewritten to $APP_URL"
else
    ok "no realm imported (--no-realm)"
fi

# =====================================================================
step "helm install"
# =====================================================================
helm upgrade --install "$RELEASE" "$(winpath "$CHART_DIR")" \
    --namespace "$NAMESPACE" \
    -f "$(winpath "$CHART_DIR/values.yaml")" \
    -f "$(winpath "$CHART_DIR/values.k3d.yaml")" \
    -f "$(winpath "$GEN_VALUES")" \
    "${REALM_ARGS[@]}" \
    --timeout 15m >&2
ok "release '$RELEASE' installed in namespace '$NAMESPACE'"

step "waiting for workloads"
for d in postgresql keycloak backend frontend; do
    name="$RELEASE-$d"
    kind=deployment
    kubectl -n "$NAMESPACE" get statefulset "$name" >/dev/null 2>&1 && kind=statefulset
    if kubectl -n "$NAMESPACE" rollout status "$kind/$name" --timeout=420s >/dev/null 2>&1; then
        ok "$kind/$name ready"
    else
        bad "$kind/$name did NOT become ready"
        kubectl -n "$NAMESPACE" get pods
    fi
done

step "up"
say "  frontend  $APP_URL"
say "  keycloak  $AUTH_URL"
say "  uploads   $APP_URL/objects/$STORE_BUCKET/…"
say ""
say "  kubectl:  KUBECONFIG=$KUBECONFIG_FILE $BIN_DIR/kubectl get pods -n $NAMESPACE"
say "  verify:   bash $HERE/verify.sh"
say "  down:     bash $HERE/down.sh"
