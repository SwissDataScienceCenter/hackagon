set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Names the chart gives a release called `hackagon` (see helm-chart/templates).
namespace := "hackagon"
backend_deploy := "hackagon-backend"
backend_config := "hackagon-backend-config"
backend_db_secret := "hackagon-backend-db"
postgres_sts := "hackagon-postgresql"
# The Service in front of postgres_sts; the bitnami chart gives both the same name.
postgres_svc := "hackagon-postgresql"
app_db := "hackagon"
app_db_owner := "hackagon"

# Refuse any cluster whose ingress does not serve this domain, so a recipe
# pointed at the prod context by mistake stops before touching anything.
dev_domain := "hackagon-dev.dscompute.ch"

backup_dir := env("HOME") + "/hackagon-backups"
local_pg_port := "15432"

# Runs inside the postgres pod: finds the superuser password the bitnami image
# was started with (env var or mounted file) so it never leaves the pod.
pg_as_superuser := '''
pw="${POSTGRES_POSTGRES_PASSWORD:-${POSTGRES_PASSWORD:-}}"
if [ -z "$pw" ]; then
  f="${POSTGRES_POSTGRES_PASSWORD_FILE:-${POSTGRES_PASSWORD_FILE:-}}"
  [ -n "$f" ] && pw="$(cat "$f")"
fi
PGPASSWORD="$pw" exec "$@"
'''

default:
    just --list --unsorted -f "{{source_file()}}"

# Show usage examples for cluster commands.
[group('cluster')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Dev Cluster Commands${reset}"
    echo -e "  ${dim}Act on the deployed dev instance. Every recipe takes the kube context${reset}"
    echo -e "  ${dim}explicitly and refuses a cluster not serving {{dev_domain}}.${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::backup${reset} <context>"
    echo -e "  ${dim}pg_dumpall the dev postgres to {{backup_dir}}${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::wipe${reset} <context>"
    echo -e "  ${dim}Back up, then drop and recreate the app database. Keycloak is untouched.${reset}"
    echo -e "  ${dim}The backend recreates the schema on startup, so dev comes back empty.${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::reseed${reset} <context>"
    echo -e "  ${dim}Back up, wipe, then run cmd/seed (backend code must match origin/main).${reset}"
    echo ""
    echo -e "  ${dim}e.g. just cluster::wipe sck-sit-dev${reset}"
    echo ""

# pg_dumpall the dev postgres (app and keycloak databases) to ~/hackagon-backups.
[group('cluster')]
backup context:
    #!/usr/bin/env bash
    set -euo pipefail
    just -f "{{source_file()}}" _guard "{{context}}"
    mkdir -p "{{backup_dir}}"
    out="{{backup_dir}}/{{context}}-$(date +%Y%m%d-%H%M%S).sql"

    discard_partial() { rm -f "$out.partial"; }
    trap discard_partial EXIT

    echo "==> Backing up to $out"
    kubectl --context "{{context}}" -n "{{namespace}}" exec "sts/{{postgres_sts}}" -- \
        sh -c '{{pg_as_superuser}}' sh pg_dumpall -h 127.0.0.1 -U postgres > "$out.partial"
    mv "$out.partial" "$out"
    echo "✓ $(du -h "$out" | cut -f1) written"

# Back up, then drop and recreate the app database; dev restarts empty.
[group('cluster')]
wipe context:
    #!/usr/bin/env bash
    set -euo pipefail
    just -f "{{source_file()}}" _confirm "{{context}}" "WIPE the app database"
    just -f "{{source_file()}}" backup "{{context}}"

    kc=(kubectl --context "{{context}}" -n "{{namespace}}")
    # A backend found at 0 (e.g. left there by an interrupted run) comes back
    # at 1: both recipes promise a running dev, and wipe needs it to recreate
    # the schema.
    replicas="$("${kc[@]}" get "deploy/{{backend_deploy}}" -o jsonpath='{.spec.replicas}')"
    [ "${replicas:-0}" -gt 0 ] || replicas=1

    restore_backend() {
        echo "==> Bringing the backend back (it recreates the schema on startup)"
        # An EXIT trap keeps the recipe's exit status unless it exits itself,
        # so a backend that does not come back would otherwise report success.
        just -f "{{source_file()}}" _backend-up "{{context}}" "$replicas" || exit 1
    }
    # The backend must be off while its database is replaced; bring it back
    # however this ends, including when stopping it or the wipe fails halfway.
    trap restore_backend EXIT

    just -f "{{source_file()}}" _backend-down "{{context}}"
    just -f "{{source_file()}}" _wipe-db "{{context}}"

# Back up, wipe, then seed the dev fixture from this checkout.
[group('cluster')]
reseed context:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root_dir}}"

    just -f "{{source_file()}}" _backend-matches-main
    just -f "{{source_file()}}" _guard "{{context}}"

    kc=(kubectl --context "{{context}}" -n "{{namespace}}")
    tmp="$(mktemp -d)"
    pf_pid=""
    backend_down=""

    restore_backend() {
        # Starting fresh is also what loads the casbin rows the seed wrote.
        echo "==> Bringing the backend back"
        # An EXIT trap keeps the recipe's exit status unless it exits itself,
        # so a backend that does not come back would otherwise report success.
        just -f "{{source_file()}}" _backend-up "{{context}}" "$replicas" || exit 1
    }
    # However this ends: close the tunnel, delete the temp dir, and bring the
    # backend back if it was taken down.
    cleanup() {
        [ -n "$pf_pid" ] && kill "$pf_pid" 2>/dev/null || true
        rm -rf "$tmp"
        [ -z "$backend_down" ] || restore_backend
    }
    trap cleanup EXIT

    # Everything that can fail without changing the cluster happens first, so
    # a failure here leaves dev exactly as it was.
    echo "==> Building the seed"
    (cd components/backend && go build -o "$tmp/seed" ./cmd/seed/)

    echo "==> Fetching backend config and database password from the cluster"
    "${kc[@]}" get cm "{{backend_config}}" -o jsonpath='{.data.config\.yaml}' > "$tmp/config.yaml"
    [ -s "$tmp/config.yaml" ] || { echo "✗ {{backend_config}} has no config.yaml." >&2; exit 1; }
    db_password="$("${kc[@]}" get secret "{{backend_db_secret}}" -o jsonpath='{.data.password}' | base64 -d)"
    [ -n "$db_password" ] || { echo "✗ {{backend_db_secret}} has no password." >&2; exit 1; }

    # As in wipe: a backend found at 0 comes back at 1.
    replicas="$("${kc[@]}" get "deploy/{{backend_deploy}}" -o jsonpath='{.spec.replicas}')"
    [ "${replicas:-0}" -gt 0 ] || replicas=1

    just -f "{{source_file()}}" _confirm "{{context}}" "WIPE and RESEED the app database"
    just -f "{{source_file()}}" backup "{{context}}"

    # The backend stays off until the seed is done: started on the empty
    # database it would create the tables at the same time as the seed, and it
    # would load its casbin policy before the seed has written any.
    backend_down=yes
    just -f "{{source_file()}}" _backend-down "{{context}}"

    # Wipe the app database, leaving keycloak untouched. The seed creates the schema.
    just -f "{{source_file()}}" _wipe-db "{{context}}"

    echo "==> Port-forwarding postgres to localhost:{{local_pg_port}}"
    "${kc[@]}" port-forward "svc/{{postgres_svc}}" "{{local_pg_port}}:5432" >/dev/null &
    pf_pid=$!

    # Wait up to 10s for the tunnel to open.
    for _ in $(seq 20); do
        nc -z 127.0.0.1 "{{local_pg_port}}" 2>/dev/null && break
        sleep 0.5
    done
    nc -z 127.0.0.1 "{{local_pg_port}}" 2>/dev/null \
        || { echo "✗ The port-forward to postgres did not open within 10s." >&2; exit 1; }

    echo "==> Seeding"
    cd components/backend
    HACKAGON_DATABASE_HOST=127.0.0.1 \
    HACKAGON_DATABASE_PORT="{{local_pg_port}}" \
    HACKAGON_DATABASE_PASSWORD="$db_password" \
        "$tmp/seed" --config-dir "$tmp/"
    echo "✓ Seeded"

# Scale the backend to 0 and wait until its pods are gone. Scaling it back up is
# the caller's job, in an EXIT trap set before calling, so it happens even when
# this or a later step fails halfway.
[private]
_backend-down context:
    #!/usr/bin/env bash
    set -euo pipefail

    # Guard the context, so a recipe pointed at the prod context by mistake stops before touching anything.
    just -f "{{source_file()}}" _guard "{{context}}"
    kc=(kubectl --context "{{context}}" -n "{{namespace}}")

    backend_pods() { "${kc[@]}" get pods -o name | grep "{{backend_deploy}}-" || true; }

    echo "==> Scaling backend to 0"
    "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas=0

    # Wait up to 2 minutes for its pods to be gone.
    for _ in $(seq 60); do
        [ -z "$(backend_pods)" ] && break
        sleep 2
    done
    [ -z "$(backend_pods)" ] \
        || { echo "✗ Backend pods still running after 2 minutes." >&2; exit 1; }

# Scale the backend to `replicas` and wait until it is serving again, so a
# recipe only reports success once dev is actually back.
[private]
_backend-up context replicas:
    #!/usr/bin/env bash
    set -euo pipefail

    # Guard the context, so a recipe pointed at the prod context by mistake stops before touching anything.
    just -f "{{source_file()}}" _guard "{{context}}"
    kc=(kubectl --context "{{context}}" -n "{{namespace}}")

    echo "==> Scaling backend to {{replicas}}"
    "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas="{{replicas}}"

    echo "==> Waiting up to 3 minutes for the backend to be ready"
    "${kc[@]}" rollout status "deploy/{{backend_deploy}}" --timeout=180s \
        || { echo "✗ Backend not ready; see: kubectl logs deploy/{{backend_deploy}}" >&2; exit 1; }

# Drop and recreate the app database and run _backend-down first,
# so the backend does not try to connect to it while it is being replaced.
[private]
_wipe-db context:
    #!/usr/bin/env bash
    set -euo pipefail

    # Guard the context, so a recipe pointed at the prod context by mistake stops before touching anything.
    just -f "{{source_file()}}" _guard "{{context}}"
    kc=(kubectl --context "{{context}}" -n "{{namespace}}")

    echo "==> Recreating database {{app_db}}"
    "${kc[@]}" exec "sts/{{postgres_sts}}" -- sh -c '{{pg_as_superuser}}' sh \
        psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 \
        -c 'DROP DATABASE IF EXISTS {{app_db}} WITH (FORCE);' \
        -c 'CREATE DATABASE {{app_db}} OWNER {{app_db_owner}};'
    echo "✓ Database {{app_db}} is empty"

# Refuse unless this checkout's backend is the code dev serves.
[private]
_backend-matches-main:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root_dir}}"
    git fetch --quiet origin main
    if ! git merge-base --is-ancestor origin/main HEAD; then
        echo "✗ This checkout is behind origin/main. Rebase or merge main first." >&2
        exit 1
    fi
    if ! git diff --quiet origin/main -- components/backend; then
        echo "✗ components/backend differs from origin/main, which dev is serving." >&2
        exit 1
    fi
    if [ -n "$(git status --porcelain components/backend)" ]; then
        echo "✗ components/backend has uncommitted changes." >&2
        exit 1
    fi
    echo "✓ components/backend matches origin/main"

# Refuse a context whose hackagon ingress does not serve the dev domain.
[private]
_guard context:
    #!/usr/bin/env bash
    set -euo pipefail
    hosts="$(kubectl --context "{{context}}" -n "{{namespace}}" get ingress \
        -o jsonpath='{.items[*].spec.rules[*].host}')"
    if [[ " $hosts " != *"{{dev_domain}}"* ]]; then
        echo "✗ Context '{{context}}' does not serve {{dev_domain}} (found: ${hosts:-none})." >&2
        echo "  Refusing — this does not look like the dev instance." >&2
        exit 1
    fi

# Guard, then make the operator type the context name back.
[private]
_confirm context action:
    #!/usr/bin/env bash
    set -euo pipefail
    just -f "{{source_file()}}" _guard "{{context}}"
    echo "About to {{action}} on context '{{context}}' (namespace {{namespace}})."
    echo "Everything in the app database is lost; a backup is taken first."
    read -r -p "Type the context name to continue: " answer
    [ "$answer" = "{{context}}" ] || { echo "Aborted."; exit 1; }
