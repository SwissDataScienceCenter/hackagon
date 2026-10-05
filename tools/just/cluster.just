set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Names the chart gives a release called `hackagon` (see helm-chart/templates).
namespace := "hackagon"
backend_deploy := "hackagon-backend"
backend_config := "hackagon-backend-config"
backend_db_secret := "hackagon-backend-db"
postgres_sts := "hackagon-postgresql"
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
    echo "==> Backing up to $out"
    kubectl --context "{{context}}" -n "{{namespace}}" exec "sts/{{postgres_sts}}" -- \
        sh -c '{{pg_as_superuser}}' sh pg_dumpall -h 127.0.0.1 -U postgres > "$out"
    echo "✓ $(du -h "$out" | cut -f1) written"

# Back up, then drop and recreate the app database; dev restarts empty.
[group('cluster')]
wipe context:
    #!/usr/bin/env bash
    set -euo pipefail
    just -f "{{source_file()}}" _confirm "{{context}}" "WIPE the app database"
    just -f "{{source_file()}}" backup "{{context}}"
    just -f "{{source_file()}}" _wipe-db "{{context}}"

# Back up, wipe, then seed the dev fixture from this checkout.
[group('cluster')]
reseed context:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root_dir}}"

    # The seed migrates the schema before it writes anything, so its backend
    # code must be the code dev is serving — temporary/*:latest is built from
    # origin/main. Changes outside components/backend (these recipes, docs)
    # do not matter, so a branch that only touches those may seed.
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

    just -f "{{source_file()}}" _confirm "{{context}}" "WIPE and RESEED the app database"
    just -f "{{source_file()}}" backup "{{context}}"

    kc=(kubectl --context "{{context}}" -n "{{namespace}}")
    replicas="$("${kc[@]}" get "deploy/{{backend_deploy}}" -o jsonpath='{.spec.replicas}')"
    [ "${replicas:-0}" -gt 0 ] || replicas=1
    tmp="$(mktemp -d)"
    cleanup() {
        [ -n "${pf_pid:-}" ] && kill "$pf_pid" 2>/dev/null || true
        rm -rf "$tmp"
        # Starting fresh is also what loads the casbin rows the seed wrote.
        echo "==> Scaling backend back to $replicas"
        "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas="$replicas"
    }
    trap cleanup EXIT

    KEEP_BACKEND_DOWN=1 just -f "{{source_file()}}" _wipe-db "{{context}}"

    "${kc[@]}" get cm "{{backend_config}}" -o jsonpath='{.data.config\.yaml}' > "$tmp/config.yaml"

    echo "==> Port-forwarding postgres to localhost:{{local_pg_port}}"
    "${kc[@]}" port-forward "svc/{{postgres_sts}}" "{{local_pg_port}}:5432" >/dev/null &
    pf_pid=$!
    for _ in $(seq 20); do
        nc -z 127.0.0.1 "{{local_pg_port}}" 2>/dev/null && break
        sleep 0.5
    done

    echo "==> Seeding"
    cd components/backend
    HACKAGON_DATABASE_HOST=127.0.0.1 \
    HACKAGON_DATABASE_PORT="{{local_pg_port}}" \
    HACKAGON_DATABASE_PASSWORD="$("${kc[@]}" get secret "{{backend_db_secret}}" -o jsonpath='{.data.password}' | base64 -d)" \
        go run ./cmd/seed/ --config-dir "$tmp/"
    echo "✓ Seeded"

# Scale the backend down, drop and recreate the app database, scale it back up.
[private]
_wipe-db context:
    #!/usr/bin/env bash
    set -euo pipefail
    # [private] only hides a recipe from --list; it can still be called directly.
    just -f "{{source_file()}}" _guard "{{context}}"
    kc=(kubectl --context "{{context}}" -n "{{namespace}}")

    replicas="$("${kc[@]}" get "deploy/{{backend_deploy}}" -o jsonpath='{.spec.replicas}')"
    [ "${replicas:-0}" -gt 0 ] || replicas=1

    # Under reseed the caller scales the backend back up after seeding;
    # otherwise bring it back whether or not the wipe succeeded.
    if [ -z "${KEEP_BACKEND_DOWN:-}" ]; then
        trap 'echo "==> Scaling backend back to $replicas (it recreates the schema on startup)"
              "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas="$replicas"' EXIT
    fi

    echo "==> Scaling backend to 0"
    "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas=0
    while [ -n "$("${kc[@]}" get pods -o name | grep "{{backend_deploy}}-" || true)" ]; do
        sleep 2
    done

    echo "==> Recreating database {{app_db}}"
    "${kc[@]}" exec "sts/{{postgres_sts}}" -- sh -c '{{pg_as_superuser}}' sh \
        psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 \
        -c 'DROP DATABASE IF EXISTS {{app_db}} WITH (FORCE);' \
        -c 'CREATE DATABASE {{app_db}} OWNER {{app_db_owner}};'
    echo "✓ Database {{app_db}} is empty"

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
