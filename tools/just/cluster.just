set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Names the chart gives a release called `hackagon` (see helm-chart/templates).
backend_deploy := "hackagon-backend"
backend_config := "hackagon-backend-config"
# The variable through which backend-deployment.yaml hands the backend its
# database password from a Secret.
backend_db_password_env := "HACKAGON_DATABASE_PASSWORD"

backup_dir := env("HOME") + "/hackagon-backups"
local_pg_port := "15432"

# Dev and staging share one cluster, reached through the kubeconfig that
# HACKAGON_KUBECONFIG points at, and its current context. No default: where
# that file lives is each operator's business, and _guard refuses when unset.
kubeconfig := env("HACKAGON_KUBECONFIG", "")

# Pasted into every recipe: `resolve_instance <name>` sets the namespace and the
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

# Pasted into every recipe that touches the app database. The recipe must first
# set `kc`, the kubectl command for the instance's namespace.
#
# The chart's bundled postgres and an external one (dev and staging run
# CloudNativePG) differ in Service name, in which Secret holds the password, and
# in whether a superuser is reachable at all, so none of that is assumed here.
#
# Instead, where the database lives and how to log in is read from the running
# backend, and everything acts as the backend's own database user through a
# port-forward to the Service its config names: no `kubectl exec`, no superuser.
db_access := '''
# Sets db_host, db_port, db_name, db_user and db_svc from the backend's
# ConfigMap, and db_password from the Secret its Deployment reads it from.
resolve_db() {
  local deploy="$1" config="$2" password_env="$3" cfg secret key
  cfg="$("${kc[@]}" get cm "$config" -o jsonpath='{.data.config\.yaml}')"
  [ -n "$cfg" ] || { echo "✗ ConfigMap $config has no config.yaml." >&2; exit 1; }

  # `// ""` turns a missing key into an empty string rather than "null".
  db_host="$(yq '.database.host // ""' <<<"$cfg")"
  db_port="$(yq '.database.port // ""' <<<"$cfg")"
  db_name="$(yq '.database.dbname // ""' <<<"$cfg")"
  db_user="$(yq '.database.user // ""' <<<"$cfg")"
  [ -n "$db_host" ] && [ -n "$db_port" ] && [ -n "$db_name" ] && [ -n "$db_user" ] \
    || { echo "✗ $config lacks one of database.host, port, dbname, user." >&2; exit 1; }

  # The host is a Service in this namespace: `name`, or `name.<ns>…` written out.
  db_svc="${db_host%%.*}"
  case "$db_host" in
    "$db_svc" | "$db_svc.$ns" | "$db_svc.$ns".*) ;;
    *) echo "✗ Database host $db_host is not a Service in $ns." >&2; exit 1 ;;
  esac
  "${kc[@]}" get svc "$db_svc" >/dev/null 2>&1 \
    || { echo "✗ Database host $db_host is not a Service in $ns: only an in-cluster postgres can be reached." >&2; exit 1; }

  secret="$("${kc[@]}" get deploy "$deploy" -o jsonpath="{.spec.template.spec.containers[*].env[?(@.name==\"$password_env\")].valueFrom.secretKeyRef.name}")"
  key="$("${kc[@]}" get deploy "$deploy" -o jsonpath="{.spec.template.spec.containers[*].env[?(@.name==\"$password_env\")].valueFrom.secretKeyRef.key}")"
  [ -n "$secret" ] && [ -n "$key" ] \
    || { echo "✗ $deploy does not read $password_env from a Secret." >&2; exit 1; }
  db_password="$("${kc[@]}" get secret "$secret" -o jsonpath="{.data.${key//./\\.}}" | base64 -d)"
  [ -n "$db_password" ] || { echo "✗ Secret $secret has no key $key." >&2; exit 1; }

  echo "    database $db_name as $db_user on svc/$db_svc:$db_port, password from Secret $secret"
}

# Port-forwards db_svc to localhost:$1 and sets pf_pid and tunnel_port. The
# caller runs close_tunnel in its EXIT trap.
open_tunnel() {
  tunnel_port="$1"
  # Something already listening there would be talked to instead of the tunnel.
  ! nc -z 127.0.0.1 "$tunnel_port" 2>/dev/null \
    || { echo "✗ localhost:$tunnel_port is already in use." >&2; exit 1; }

  echo "==> Port-forwarding svc/$db_svc to localhost:$tunnel_port"
  pf_log="$(mktemp)"
  "${kc[@]}" port-forward "svc/$db_svc" "$tunnel_port:$db_port" >"$pf_log" &
  pf_pid=$!

  # Wait up to 10s for kubectl to say it is listening, rather than probing the
  # port: a probe would reach postgres as a connection that never logs in.
  for _ in $(seq 20); do
    grep -q "^Forwarding from 127.0.0.1:$tunnel_port " "$pf_log" && return 0
    kill -0 "$pf_pid" 2>/dev/null || break
    sleep 0.5
  done
  echo "✗ The port-forward to svc/$db_svc did not open (any kubectl error is above)." >&2
  exit 1
}

# Refuses unless the tunnel is still up. Called before the backend goes down,
# so a tunnel lost by then stops the run while nothing has changed yet.
require_tunnel() {
  kill -0 "$pf_pid" 2>/dev/null \
    || { echo "✗ The port-forward to svc/$db_svc has closed." >&2; exit 1; }
}

close_tunnel() {
  [ -n "${pf_log:-}" ] && rm -f "$pf_log"
  [ -z "${pf_pid:-}" ] && return 0
  kill "$pf_pid" 2>/dev/null || true
  wait "$pf_pid" 2>/dev/null || true
}

# Runs a postgres client ($1, then its own options) as the backend's user,
# through the tunnel.
#
# Without TLS, like the backend itself (config.go: sslmode=disable). Over TLS,
# postgres resets each connection as it closes, and kubectl then drops the whole
# tunnel ("lost connection to pod"). The tunnel is encrypted up to the pod anyway.
as_app_user() {
  local tool="$1"; shift
  PGSSLMODE=disable PGPASSWORD="$db_password" "$tool" -h 127.0.0.1 -p "$tunnel_port" \
    -U "$db_user" -d "$db_name" "$@"
}

# Counts the relations in the backend's schema; with `foreign`, only those its
# user does not own.
count_relations() {
  local owner_filter=""
  [ "${1:-}" = foreign ] && owner_filter="AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)"
  as_app_user psql -X -A -t -v ON_ERROR_STOP=1 -c "
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
    $owner_filter"
}

# Refuses unless the backend's user owns everything empty_db would drop. It runs
# before the confirmation, so a wipe that could not succeed never takes the
# backend down.
check_db_owned() {
  local foreign
  foreign="$(count_relations foreign)"
  [ "$foreign" = 0 ] \
    || { echo "✗ $foreign relation(s) in $db_name are not owned by $db_user, which could not drop them." >&2; exit 1; }
}

# pg_dump the app database into directory $1. The file is named .partial until
# pg_dump succeeds, so a .sql file without it is always a complete dump.
dump_db() {
  local dir="$1" out
  mkdir -p "$dir"
  out="$dir/$ns-$db_name-$(date +%Y%m%d-%H%M%S).sql"
  echo "==> Backing up database $db_name to $out"
  as_app_user pg_dump --file "$out.partial" || { rm -f "$out.partial"; exit 1; }
  mv "$out.partial" "$out"
  echo "✓ $(du -h "$out" | cut -f1) written"
}

# Drops everything in the backend's schema, in one transaction, and leaves the
# database, its owner and its grants in place. Not DROP DATABASE: that needs a
# superuser, and an operator such as CloudNativePG may be managing the database.
empty_db() {
  echo "==> Emptying database $db_name"
  as_app_user psql -X -q -v ON_ERROR_STOP=1 --single-transaction <<'SQL'
-- CASCADE reports every foreign key it drops along the way.
SET client_min_messages = warning;
SELECT format('DROP VIEW IF EXISTS %I.%I CASCADE', schemaname, viewname)
  FROM pg_views WHERE schemaname = current_schema() \gexec
SELECT format('DROP MATERIALIZED VIEW IF EXISTS %I.%I CASCADE', schemaname, matviewname)
  FROM pg_matviews WHERE schemaname = current_schema() \gexec
SELECT format('DROP TABLE IF EXISTS %I.%I CASCADE', schemaname, tablename)
  FROM pg_tables WHERE schemaname = current_schema() \gexec
SELECT format('DROP SEQUENCE IF EXISTS %I.%I CASCADE', schemaname, sequencename)
  FROM pg_sequences WHERE schemaname = current_schema() \gexec
SQL
  local left
  left="$(count_relations)"
  [ "$left" = 0 ] || { echo "✗ $left relation(s) left in $db_name after emptying it." >&2; exit 1; }
  echo "✓ Database $db_name is empty"
}
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
    echo -e "  ${dim}Act on a deployed instance — dev or staging, never prod — through the${reset}"
    echo -e "  ${dim}kubeconfig HACKAGON_KUBECONFIG points at.${reset}"
    echo -e "  ${dim}Every recipe refuses a namespace whose ingress does not serve that instance's host.${reset}"
    echo -e "  ${dim}They reach postgres as the backend's own user, found from its config and Secret.${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::backup${reset} <dev|staging>"
    echo -e "  ${dim}pg_dump the instance's app database to {{backup_dir}}${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::wipe${reset} <dev|staging>"
    echo -e "  ${dim}Back up, then empty the app database. Keycloak is untouched.${reset}"
    echo -e "  ${dim}The backend recreates the schema on startup, so the instance comes back empty.${reset}"
    echo ""
    echo -e "  ${cyan}just cluster::reseed${reset} <dev|staging>"
    echo -e "  ${dim}Back up, wipe, then run cmd/seed built from the code the instance serves —${reset}"
    echo -e "  ${dim}origin/main for dev, the newest origin/release/* for staging — whatever is checked out.${reset}"
    echo ""
    echo -e "  ${dim}e.g. just cluster::reseed staging${reset}"
    echo ""

# The public recipes run their private body inside the Nix shell, which brings
# pg_dump, psql and yq; kubectl still comes from the operator's own PATH.

# pg_dump the instance's app database to ~/hackagon-backups.
[group('cluster')]
backup instance:
    cd "{{root_dir}}" && just nix::develop default just -f "{{source_file()}}" _backup "{{instance}}"

# Back up, then empty the app database; the instance restarts empty.
[group('cluster')]
wipe instance:
    cd "{{root_dir}}" && just nix::develop default just -f "{{source_file()}}" _wipe "{{instance}}"

# Back up, wipe, then seed the dev fixture, built from the code the instance serves.
[group('cluster')]
reseed instance:
    cd "{{root_dir}}" && just nix::develop default just -f "{{source_file()}}" _reseed "{{instance}}"

[private]
_backup instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    {{db_access}}
    resolve_instance "{{instance}}"
    just -f "{{source_file()}}" _guard "{{instance}}"

    kc=(kubectl --kubeconfig "{{kubeconfig}}" -n "$ns")
    pf_pid=""
    trap close_tunnel EXIT

    resolve_db "{{backend_deploy}}" "{{backend_config}}" "{{backend_db_password_env}}"
    open_tunnel "{{local_pg_port}}"
    dump_db "{{backup_dir}}"

[private]
_wipe instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    {{db_access}}
    resolve_instance "{{instance}}"
    just -f "{{source_file()}}" _guard "{{instance}}"

    kc=(kubectl --kubeconfig "{{kubeconfig}}" -n "$ns")
    pf_pid=""
    backend_down=""

    restore_backend() {
        echo "==> Scaling backend back to $replicas (it recreates the schema on startup)"
        "${kc[@]}" scale "deploy/{{backend_deploy}}" --replicas="$replicas"
    }
    # However this ends: close the tunnel, and bring the backend back if it was
    # taken down, also when stopping it or emptying the database fails.
    cleanup() {
        close_tunnel
        [ -z "$backend_down" ] || restore_backend
    }
    trap cleanup EXIT

    # Everything that can fail without changing the cluster happens first.
    resolve_db "{{backend_deploy}}" "{{backend_config}}" "{{backend_db_password_env}}"
    open_tunnel "{{local_pg_port}}"
    check_db_owned

    # A backend found at 0 (e.g. left there by an interrupted run) comes back
    # at 1: both recipes promise a running instance, and wipe needs it to
    # recreate the schema.
    replicas="$("${kc[@]}" get "deploy/{{backend_deploy}}" -o jsonpath='{.spec.replicas}')"
    [ "${replicas:-0}" -gt 0 ] || replicas=1

    just -f "{{source_file()}}" _confirm "{{instance}}" "WIPE the app database"
    dump_db "{{backup_dir}}"

    # The backend must be off while its database is emptied.
    require_tunnel
    backend_down=yes
    just -f "{{source_file()}}" _backend-down "{{instance}}"
    empty_db

[private]
_reseed instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    {{db_access}}
    resolve_instance "{{instance}}"
    cd "{{root_dir}}"

    ref="$(just -f "{{source_file()}}" _seed-ref "{{instance}}")"
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
    # However this ends: close the tunnel, delete the temp dir and the worktree
    # in it, and bring the backend back if it was taken down.
    cleanup() {
        close_tunnel
        rm -rf "$tmp"
        git -C "{{root_dir}}" worktree prune
        [ -z "$backend_down" ] || restore_backend
    }
    trap cleanup EXIT

    # Everything that can fail without changing the cluster happens first, so
    # a failure here leaves the instance exactly as it was.
    # The seed runs the backend's handlers in-process and creates the schema, so
    # it is built from the code the instance serves, not from this checkout.
    echo "==> Building the seed from $ref"
    git worktree add --quiet --detach "$tmp/src" "$ref"
    (cd "$tmp/src/components/backend" && go build -o "$tmp/seed" ./cmd/seed/)

    echo "==> Fetching backend config and database credentials from the cluster"
    "${kc[@]}" get cm "{{backend_config}}" -o jsonpath='{.data.config\.yaml}' > "$tmp/config.yaml"
    resolve_db "{{backend_deploy}}" "{{backend_config}}" "{{backend_db_password_env}}"
    open_tunnel "{{local_pg_port}}"
    check_db_owned

    # As in wipe: a backend found at 0 comes back at 1.
    replicas="$("${kc[@]}" get "deploy/{{backend_deploy}}" -o jsonpath='{.spec.replicas}')"
    [ "${replicas:-0}" -gt 0 ] || replicas=1

    just -f "{{source_file()}}" _confirm "{{instance}}" "WIPE and RESEED the app database"
    dump_db "{{backup_dir}}"

    # The backend stays off until the seed is done: started on the empty
    # database it would create the tables at the same time as the seed, and it
    # would load its casbin policy before the seed has written any.
    require_tunnel
    backend_down=yes
    just -f "{{source_file()}}" _backend-down "{{instance}}"

    # Empty the app database, leaving keycloak untouched. The seed creates the schema.
    empty_db

    echo "==> Seeding"
    cd "$tmp/src/components/backend"
    HACKAGON_DATABASE_HOST=127.0.0.1 \
    HACKAGON_DATABASE_PORT="$tunnel_port" \
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

# Fetch and print the ref whose code the instance serves: dev follows
# origin/main, staging the newest origin/release/* branch.
[private]
_seed-ref instance:
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
    echo "$ref"

# Refuse unless the kubeconfig reaches a namespace whose ingress serves the instance's host.
[private]
_guard instance:
    #!/usr/bin/env bash
    set -euo pipefail
    {{instances}}
    resolve_instance "{{instance}}"
    [ -n "{{kubeconfig}}" ] \
        || { echo "✗ HACKAGON_KUBECONFIG is not set. Point it at the kubeconfig for dev and staging." >&2; exit 1; }
    [ -f "{{kubeconfig}}" ] \
        || { echo "✗ HACKAGON_KUBECONFIG points at {{kubeconfig}}, which is not a file." >&2; exit 1; }
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
