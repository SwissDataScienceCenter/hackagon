set positional-arguments
set shell := ["bash", "-cue"]
set dotenv-load := true
comp_dir := justfile_directory()
root_dir := `git rev-parse --show-toplevel`
flake_dir := "./tools/nix"

mod nix "./tools/just/nix.just"
mod ci "./tools/just/ci.just"
mod rpc "./tools/just/rpc.just"
mod db "./tools/just/db.just"
mod check "./tools/just/check.just"
mod deploy "./tools/just/deploy.just"
mod codegen "./tools/just/codegen.just"
mod clean "./tools/just/clean.just"
mod version "./tools/just/version.just"
mod hotfix "./tools/just/hotfix.just"
mod helm "./tools/just/helm.just"
mod cluster "./tools/just/cluster.just"
mod docs "./tools/just/docs.just"

[private]
default:
    just --list --unsorted

# ─── General ─────────────────────────────────────────────────────────

# Stop all running services.
[group('general')]
down:
    just deploy::down

# Sync deps and start all services. Use after a code-only change.
# For proto changes use 'just api-change'. For DB schema changes use 'just schema-change'.
# Usage: just start
[group('general')]
start *args:
    #!/usr/bin/env bash
    set -eu
    just deploy::down 2>/dev/null || true
    just _sync-deps
    just deploy::up "$@"
    just deploy::attach

# Start over from an empty database: sync deps, wipe Postgres + Keycloak, start,
# seed, and restart so the backend loads the seeded roles. Use after switching
# to a branch with a different DB schema (main <-> release/X.Y): migrations only
# ever add, so a database another branch migrated can break this one.
[group('general')]
fresh:
    #!/usr/bin/env bash
    set -eu

    echo "==> Wiping Postgres + Keycloak state..."
    just clean::state

    just _sync-deps

    echo "==> Starting services..."
    just deploy::up

    echo "==> Waiting for Postgres to be ready..."
    until pg_isready -h 127.0.0.1 -p 5432 -U postgres 2>/dev/null; do
        echo "    Postgres not ready yet, waiting..."
        sleep 2
    done
    echo "    Postgres ready."

    echo "==> Seeding database..."
    just db::seed

    # The backend loads its casbin policy once at startup, so it has not seen
    # the roles the seed just wrote. See cmd/seed/README.md.
    echo "==> Restarting services so the backend loads the seeded policy..."
    just deploy::down
    just deploy::up

    echo "==> Done! Attaching to TUI..."
    just deploy::attach

# Regenerate proto stubs then start. Use after changing *.proto files.
[group('general')]
api-change *args:
    #!/usr/bin/env bash
    set -eu
    echo "==> Regenerating proto stubs..."
    just codegen::proto
    just start "$@"

# Classify changes between <ref> and HEAD and suggest which 'just' command to run.
# Usage: just changes          (defaults to HEAD~1)
#        just changes main
#        just changes abc1234
[group('general')]
changes ref="HEAD~1":
    #!/usr/bin/env bash
    set -eu
    changed=$(git diff --name-only "{{ref}}" HEAD 2>/dev/null || true)
    if [ -z "$changed" ]; then
        echo "No changes detected vs {{ref}}."
        exit 0
    fi
    echo "Changes vs {{ref}}:"
    echo "$changed" | sed 's/^/  /'
    echo ""
    if echo "$changed" | grep -qE 'db/schema/'; then
        echo "  DB schema change detected  →  just schema-change"
    elif echo "$changed" | grep -qE '\.proto$'; then
        echo "  Proto change detected       →  just api-change"
    else
        echo "  Code/dep change only        →  just start"
    fi
    if echo "$changed" | grep -qE 'cmd/seed/'; then
        echo ""
        echo "  Seed script changed — if dev data needs refreshing: just fresh"
    fi


# Handle a DB schema change: regenerate proto + ent, then start over with 'just fresh'.
# Run after changing db/schema/*.go (also safe to run after *.proto changes).
[group('general')]
schema-change:
    #!/usr/bin/env bash
    set -eu
    echo ""
    echo "  Running DB schema change flow..."
    echo ""

    echo "==> Regenerating proto stubs..."
    just codegen::proto

    echo "==> Regenerating Ent ORM code..."
    just codegen::db-schema

    just fresh

# ─── Development ─────────────────────────────────────────────────────

# Enter a Nix development shell.
alias dev := develop
[no-cd]
[group('aux')]
develop *args:
    just nix::develop default "$@"

# Update quitsh and all Go/Nix dependencies.
[group('aux')]
update-deps *args:
    #!/usr/bin/env bash
    set -eu
    (cd tools/quitsh && just update-deps "$@")

    (cd "{{flake_dir}}" &&
        nix flake update quitsh &&
        git add .)

    readarray -t gomods < <(find "{{root_dir}}" -name "go.mod" \
        -and -not -ipath "*.devenv*" -and -not -ipath "*.old*")
    for gomod in "${gomods[@]}"; do
        echo "Update go mod in '$gomod'."
        (cd "$(dirname "$gomod")" && go mod tidy && git add go.mod go.sum)
    done

    quitsh nix fix-hash

# ─── Private helpers ─────────────────────────────────────────────────

[private]
build *args:
    just quitsh build "$@"

[private]
list *args:
    just quitsh list "$@"

[private]
format:
    just quitsh format

[private]
alias q := quitsh
quitsh *args:
    quitsh-direct "$@"

[private]
[no-cd]
quitsh-nocd *args:
    quitsh-direct "$@"

[private]
_setup *args:
    just quitsh setup "$@"

# Bring Go modules, frontend deps and go.work in line with the checkout.
[private]
_sync-deps:
    #!/usr/bin/env bash
    set -eu
    echo "==> Syncing Go modules..."
    (cd components/backend && GOWORK=off go mod tidy)
    echo "==> Syncing frontend deps..."
    (cd components/frontend && pnpm install --frozen-lockfile)
    echo "==> Ensuring go.work is up to date..."
    just _setup
