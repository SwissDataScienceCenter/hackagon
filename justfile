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

[private]
default:
    just --list --unsorted

# ─── General ─────────────────────────────────────────────────────────

# Stop all running services.
[group('general')]
down:
    just deploy::down

# Detect changes vs last commit, run generators if needed, then start services and attach.
# Usage: just start
[group('general')]
start *args:
    #!/usr/bin/env bash
    set -eu
    base="${ORIG_HEAD:-HEAD~1}"
    changed=$(git diff --name-only "$base" HEAD 2>/dev/null || true)

    need_proto=false
    need_deps=false

    if echo "$changed" | grep -qE '\.proto$'; then
        need_proto=true
    fi
    if echo "$changed" | grep -qE '(go\.mod|go\.sum|pnpm-lock\.yaml)'; then
        need_deps=true
    fi

    # ── Bail early on DB schema changes, before touching anything ────
    if echo "$changed" | grep -qE 'ent/schema/'; then
        echo ""
        echo "  ⚠️  DB schema changes detected (ent/schema/*.go)."
        echo "      Run 'just schema-change' to handle automatically."
        echo "      Note: if seed fails, update components/backend/cmd/seed/main.go first."
        echo ""
        exit 1
    fi

    # ── Report what we detected ──────────────────────────────────────
    echo ""
    echo "  Branch: $(git rev-parse --abbrev-ref HEAD)"
    echo "  Base:   $base ($(git log --oneline -1 $base 2>/dev/null | head -c 72 || echo 'unknown'))"
    echo ""

    if $need_proto || $need_deps; then
        echo "  Changes detected — running generators before starting:"
        $need_proto && echo "    • codegen::proto  (*.proto files changed)"  || true
        $need_deps  && echo "    • dep sync  (go.mod / pnpm-lock.yaml changed)" || true
        echo ""
    else
        echo "  No proto/dep changes detected — starting services directly."
        echo ""
    fi

    just deploy::down 2>/dev/null || true

    if $need_proto; then
        echo "==> Regenerating proto stubs..."
        just codegen::proto
    fi

    if $need_deps; then
        echo "==> Syncing Go modules..."
        (cd components/backend && GOWORK=off go mod tidy)
        echo "==> Syncing frontend deps..."
        (cd components/frontend && pnpm install --frozen-lockfile)
        echo "==> Ensuring go.work is up to date..."
        just _setup
    fi

    just deploy::up "$@"
    just deploy::attach

# Switch to a branch, checking for DB schema changes first, then start.
# Usage: just switch <branch>
#        just switch main
#        just switch feature/my-branch
[group('general')]
switch target:
    #!/usr/bin/env bash
    set -eu
    changed=$(git diff --name-only HEAD "{{target}}" 2>/dev/null || true)
    if echo "$changed" | grep -qE 'ent/schema/'; then
        echo ""
        echo "  ⚠️  DB schema changes detected (ent/schema/*.go)."
        echo "      Run 'just schema-change' to handle automatically."
        echo "      Note: if seed fails, update components/backend/cmd/seed/main.go first."
        echo ""
        exit 1
    fi
    git switch "{{target}}"
    just start

# Handle a DB schema change: regenerate, wipe state, restart and reseed.
# Run after changing ent/schema/*.go.
[group('general')]
schema-change:
    #!/usr/bin/env bash
    set -eu
    echo ""
    echo "  Running DB schema change flow..."
    echo ""

    echo "==> Regenerating Ent ORM code..."
    just codegen::db-schema

    echo "==> Wiping Postgres + Keycloak state..."
    just clean::state

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

    echo "==> Done! Attaching to TUI..."
    just deploy::attach

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
