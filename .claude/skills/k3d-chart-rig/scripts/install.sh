#!/usr/bin/env bash
# Re-run just the `helm upgrade` against an already-running cluster.
#
#   bash scripts/install.sh            # upgrade in place
#   bash scripts/install.sh --restart  # …and roll the app pods afterwards
#
# The point of splitting this out of up.sh: iterating on helm-chart/ costs
# seconds this way, and ~4 minutes if the cluster is rebuilt each time.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RESTART=0
[ "${1:-}" = "--restart" ] && RESTART=1

require_cluster
load_secrets
[ -f "$GEN_VALUES" ] || die "no $GEN_VALUES — run scripts/up.sh"

REALM_ARGS=()
[ -f "$REALM_FILE" ] && REALM_ARGS=(--set-file "realmJson=$(winpath "$REALM_FILE")")

step "helm upgrade"
helm upgrade --install "$RELEASE" "$(winpath "$CHART_DIR")" \
    --namespace "$NAMESPACE" \
    -f "$(winpath "$CHART_DIR/values.yaml")" \
    -f "$(winpath "$CHART_DIR/values.k3d.yaml")" \
    -f "$(winpath "$GEN_VALUES")" \
    "${REALM_ARGS[@]}" \
    --timeout 15m >&2

if [ "$RESTART" = 1 ]; then
    step "rolling app pods"
    kubectl -n "$NAMESPACE" rollout restart deployment "$RELEASE-backend" "$RELEASE-frontend" >/dev/null
fi

step "waiting"
for d in backend frontend; do
    if kubectl -n "$NAMESPACE" rollout status "deployment/$RELEASE-$d" --timeout=300s >/dev/null 2>&1; then
        ok "$RELEASE-$d ready"
    else
        bad "$RELEASE-$d did NOT become ready"
        kubectl -n "$NAMESPACE" get pods
        kubectl -n "$NAMESPACE" logs "deployment/$RELEASE-$d" --tail=30 || true
    fi
done
