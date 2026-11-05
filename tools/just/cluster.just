set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Names the chart gives a release called `hackagon` (see helm-chart/templates).
backend_deploy := "hackagon-backend"
backend_config := "hackagon-backend-config"
backend_db_secret := "hackagon-backend-db"
postgres_sts := "hackagon-postgresql"
# The Service in front of postgres_sts; the bitnami chart gives both the same name.
postgres_svc := "hackagon-postgresql"
app_db := "hackagon"
app_db_owner := "hackagon"

backup_dir := env("HOME") + "/hackagon-backups"
local_pg_port := "15432"

# Dev and staging share one cluster, reached through this kubeconfig and its
# current context. Override with HACKAGON_KUBECONFIG.
kubeconfig := env("HACKAGON_KUBECONFIG", env("HOME") + "/.config/kube/sck-sit-dev")

# Sourced by every recipe: `resolve_instance <name>` sets the namespace and the
# host its ingress must serve. Only these two names exist, so a recipe can never
# be pointed at prod, and the host check catches a kubeconfig that reaches some
# other cluster.
instances := '''
resolve_instance() {
  case "$1" in
    dev)     ns=hackagon-dev;     host=hackagon-dev.sck-sit-dev.dscompute.ch ;;
    staging) ns=hackagon-staging; host=hackagon-staging.sck-sit-dev.dscompute.ch ;;
    *) echo "✗ Unknown instance '$1': expected dev or staging." >&2; exit 1 ;;
  esac
}
'''

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
    echo -e "  ${bold}Cluster Commands${reset}"
    echo -e "  ${dim}Act on a deployed instance — dev or staging, never prod — through${reset}"
    echo -e "  ${dim}{{kubeconfig}} (override with HACKAGON_KUBECONFIG).${reset}"
    echo -e "  ${dim}Every recipe refuses a namespace whose ingress does not serve that instance's host.${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::backup${reset} <dev|staging>"
    echo -e "  ${dim}pg_dumpall the instance's postgres to {{backup_dir}}${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::wipe${reset} <dev|staging>"
    echo -e "  ${dim}Back up, then drop and recreate the app database. Keycloak is untouched.${reset}"
    echo -e "  ${dim}The backend recreates the schema on startup, so the instance comes back empty.${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::reseed${reset} <dev|staging>"
    echo -e "  ${dim}Back up, wipe, then run cmd/seed. components/backend must match what the${reset}"
    echo -e "  ${dim}instance serves: origin/main for dev, the newest origin/release/* for staging.${reset}"
    echo ""
    echo -e "  ${dim}e.g. just cluster::reseed staging${reset}"
    echo ""

# pg_dumpall the instance's postgres (app and keycloak databases) to ~/hackagon-backups.
[group('cluster')]
backup instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"
    just -f "{{source_file()}}" _guard "{{instance}}"
    mkdir -p "{{backup_dir}}"
    out="{{backup_dir}}/$ns-$(date +%Y%m%d-%H%M%S).sql"

    discard_partial() { rm -f "$out.partial"; }
    trap discard_partial EXIT

    echo "==> Backing up to $out"
    kubectl --kubeconfig "{{kubeconfig}}" -n "$ns" exec "sts/{{postgres_sts}}" -- \
        sh -c '{{pg_as_superuser}}' sh pg_dumpall -h 127.0.0.1 -U postgres > "$out.partial"
    mv "$out.partial" "$out"
    echo "✓ $(du -h "$out" | cut -f1) written"

# Back up, then drop and recreate the app database; the instance restarts empty.
[group('cluster')]
wipe instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"
    just -f "{{source_file()}}" _confirm "{{instance}}" "WIPE the app database"
    just -f "{{source_file()}}" backup "{{instance}}"

    kc=(kubectl --kubeconfig "{{kubeconfig}}" -n "$ns")
    # A backend found at 0 (e.g. left there by an interrupted run) comes back
    # at 1: both recipes promise a running instance, and wipe needs it to
    # recreate the schema.
    replicas="$("${kc[@]}" get "deploy/{{backend_deploy}}" -o jsonpath='{.spec.replicas}')"
    [ "${replicas:-0}" -gt 0 ] || replicas=1

    restore_backend() {
        echo "==> Scaling backend back to $replicas (it recreates the schema on startup)"
        "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas="$replicas"
    }
    # The backend must be off while its database is replaced; bring it back
    # however this ends, including when stopping it or the wipe fails halfway.
    trap restore_backend EXIT

    just -f "{{source_file()}}" _backend-down "{{instance}}"
    just -f "{{source_file()}}" _wipe-db "{{instance}}"

# Back up, wipe, then seed the dev fixture from this checkout.
[group('cluster')]
reseed instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"
    cd "{{root_dir}}"

    just -f "{{source_file()}}" _backend-matches "{{instance}}"
    just -f "{{source_file()}}" _guard "{{instance}}"

    kc=(kubectl --kubeconfig "{{kubeconfig}}" -n "$ns")
    tmp="$(mktemp -d)"
    pf_pid=""
    backend_down=""

    restore_backend() {
        # Starting fresh is also what loads the casbin rows the seed wrote.
        echo "==> Scaling backend back to $replicas"
        "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas="$replicas"
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
    # a failure here leaves the instance exactly as it was.
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

    just -f "{{source_file()}}" _confirm "{{instance}}" "WIPE and RESEED the app database"
    just -f "{{source_file()}}" backup "{{instance}}"

    # The backend stays off until the seed is done: started on the empty
    # database it would create the tables at the same time as the seed, and it
    # would load its casbin policy before the seed has written any.
    backend_down=yes
    just -f "{{source_file()}}" _backend-down "{{instance}}"

    # Wipe the app database, leaving keycloak untouched. The seed creates the schema.
    just -f "{{source_file()}}" _wipe-db "{{instance}}"

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
_backend-down instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"

    # Guard the instance, so a kubeconfig reaching the wrong cluster stops before touching anything.
    just -f "{{source_file()}}" _guard "{{instance}}"
    kc=(kubectl --kubeconfig "{{kubeconfig}}" -n "$ns")

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

# Drop and recreate the app database and run _backend-down first,
# so the backend does not try to connect to it while it is being replaced.
[private]
_wipe-db instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"

    # Guard the instance, so a kubeconfig reaching the wrong cluster stops before touching anything.
    just -f "{{source_file()}}" _guard "{{instance}}"
    kc=(kubectl --kubeconfig "{{kubeconfig}}" -n "$ns")

    echo "==> Recreating database {{app_db}}"
    "${kc[@]}" exec "sts/{{postgres_sts}}" -- sh -c '{{pg_as_superuser}}' sh \
        psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 \
        -c 'DROP DATABASE IF EXISTS {{app_db}} WITH (FORCE);' \
        -c 'CREATE DATABASE {{app_db}} OWNER {{app_db_owner}};'
    echo "✓ Database {{app_db}} is empty"

# Refuse unless this checkout's backend is the code the instance serves: dev
# follows origin/main, staging the newest origin/release/* branch.
[private]
_backend-matches instance:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{root_dir}}"
    case "{{instance}}" in
      dev)
        git fetch --quiet origin main
        ref=origin/main
        ;;
      staging)
        git fetch --quiet --prune origin '+refs/heads/release/*:refs/remotes/origin/release/*'
        ref="$(git for-each-ref --sort=-version:refname --count=1 \
            --format='%(refname:short)' refs/remotes/origin/release/)"
        [ -n "$ref" ] || { echo "✗ origin has no release/* branch." >&2; exit 1; }
        ;;
      *) echo "✗ Unknown instance '{{instance}}': expected dev or staging." >&2; exit 1 ;;
    esac

    if ! git merge-base --is-ancestor "$ref" HEAD; then
        echo "✗ This checkout is behind $ref. Check out or merge $ref first." >&2
        exit 1
    fi
    if ! git diff --quiet "$ref" -- components/backend; then
        echo "✗ components/backend differs from $ref, which {{instance}} is serving." >&2
        exit 1
    fi
    if [ -n "$(git status --porcelain components/backend)" ]; then
        echo "✗ components/backend has uncommitted changes." >&2
        exit 1
    fi
    echo "✓ components/backend matches $ref"

# Refuse unless the kubeconfig reaches a namespace whose ingress serves the instance's host.
[private]
_guard instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"
    [ -f "{{kubeconfig}}" ] \
        || { echo "✗ No kubeconfig at {{kubeconfig}}. Set HACKAGON_KUBECONFIG." >&2; exit 1; }
    hosts="$(kubectl --kubeconfig "{{kubeconfig}}" -n "$ns" get ingress \
        -o jsonpath='{.items[*].spec.rules[*].host}')"
    if [[ " $hosts " != *" $host "* ]]; then
        echo "✗ Namespace $ns via {{kubeconfig}} does not serve $host (found: ${hosts:-none})." >&2
        echo "  Refusing — this does not look like the {{instance}} instance." >&2
        exit 1
    fi

# Guard, then make the operator type the namespace back, which names the
# instance; dev and staging share a cluster.
[private]
_confirm instance action:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"
    just -f "{{source_file()}}" _guard "{{instance}}"
    echo "About to {{action}} in namespace $ns (via {{kubeconfig}})."
    echo "Everything in the app database is lost; a backup is taken first."
    read -r -p "Type the namespace to continue: " answer
    [ "$answer" = "$ns" ] || { echo "Aborted."; exit 1; }
