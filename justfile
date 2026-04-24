set positional-arguments
set shell := ["bash", "-cue"]
set dotenv-load := true
comp_dir := justfile_directory()
root_dir := `git rev-parse --show-toplevel`
flake_dir := "./tools/nix"

mod nix "./tools/just/nix.just"
mod ci "./tools/just/ci.just"

[private]
default:
    just --list --unsorted --list-submodules

# ─── Services & State ────────────────────────────────────────────────

# Start Keycloak, Postgres, and the backend (via process-compose).
[group('general')]
up *args:
    cd ./tools/deploy/process-compose && just up "$@"

# Stop all running services.
[group('general')]
down *args:
    cd ./tools/deploy/process-compose && just down "$@"

# Attach to the process-compose TUI for log inspection.
[group('general')]
attach:
    cd ./tools/deploy/process-compose && just attach

# Wipe DB + Keycloak data. Run 'just refresh' next, or 'just up' if code is current.
[group('general')]
reset:
    #!/usr/bin/env bash
    set -eu
    just down 2>/dev/null || true
    just _wipe-state
    echo "✓ Reset complete. Run 'just refresh' to regenerate code, or 'just up' if code is current."

# Reset data + regenerate all code + sync deps. Run 'just up' to start services.
[group('general')]
refresh:
    #!/usr/bin/env bash
    set -eu
    just down 2>/dev/null || true
    just _wipe-state

    echo "==> Regenerating database schema (Ent)..."
    just generate-db-schema

    echo "==> Regenerating proto stubs (Go + TypeScript)..."
    just generate-proto

    echo "==> Tidying Go modules..."
    (cd components/backend && GOWORK=off go mod tidy)

    echo "==> Syncing frontend dependencies..."
    (cd components/frontend && pnpm install --frozen-lockfile)

    echo "==> Ensuring go.work is up to date..."
    just _setup

    echo "✓ Refresh complete. Run 'just up' to start fresh services."

# Seed the test database with sample hackathons, tracks, projects, teams, and users.
[group('general')]
seed:
    cd components/backend && go run ./cmd/seed/ --config-dir ./data/test/config/

# Send a command to the running process-compose instance.
[group('general')]
proc-comp *args:
    cd ./tools/deploy/process-compose && just proc-comp "$@"

# Open a psql shell to the local Hackagon database.
[group('general')]
db *args:
    psql -h 127.0.0.1 -p 5432 -U postgres -d hackagon "$@"

# Show a formatted summary of what is currently in the database.
[group('general')]
db-summary:
    psql -h 127.0.0.1 -p 5432 -U postgres -d hackagon -f tools/sql/db-summary.sql

# Call a gRPC method authed as a specific user.
# Usage: just rpc-as bob aliceandbob user.UserService/WhoAmI
[group('general')]
rpc-as user password method data="{}":
    #!/usr/bin/env bash
    set -eu
    token=$(cd tools/deploy/process-compose && just get-access-token "{{user}}" "{{password}}")
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        echo "failed to get access token for {{user}} (check user/password in Keycloak)" >&2
        exit 1
    fi
    grpcurl -plaintext -H "authorization: Bearer $token" -d '{{data}}' localhost:3000 '{{method}}'

# Call a gRPC method without auth (e.g. health probes).
# Usage: just rpc-unauth health.HealthService/Check
[group('general')]
rpc-unauth method data="{}":
    grpcurl -plaintext -d '{{data}}' localhost:3000 '{{method}}'

# ─── Development ─────────────────────────────────────────────────────

# Enter a Nix development shell.
alias dev := develop
[no-cd]
[group('general')]
develop *args:
    just nix::develop default "$@"

# Build components (accepts a component pattern).
[group('general')]
build *args:
    just quitsh build "$@"

# List all known components.
[group('general')]
list *args:
    just quitsh list "$@"

# ─── Code Quality ───────────────────────────────────────────────────

# Format all code in the repository.
[group('checks')]
format *args:
    just quitsh format "$@"

# Lint components (accepts a component pattern).
[group('checks')]
lint *args:
    just quitsh lint "$@" && \
    just quitsh nix fix-hash

# Run tests for components (accepts a component pattern).
[group('checks')]
test *args:
    just quitsh test "$@"

# ─── Code Generation & Cleanup ──────────────────────────────────────

# DANGER: destroy ALL gitignored files (.devenv, node_modules, etc.).
[group('aux')]
[confirm("This will delete everything gitignored including .devenv and node_modules. Continue?")]
clean-all *args:
    #!/usr/bin/env bash
    set -eu
    just down 2>/dev/null || true
    if [ -d ".devenv/state/go" ]; then
        chmod -R +w .devenv/state/go
    fi
    git clean -dfX

# Regenerate Go + TypeScript gRPC stubs from api/proto/*.proto.
[group('aux')]
generate-proto *args:
    #!/usr/bin/env bash
    set -eu

    # Wipe codegen output dirs first — buf generate does not prune stale files,
    # which silently shadows new output (e.g. Node resolving a stale user.ts
    # over the new user/ directory). API.md is rewritten in place by
    # protoc-gen-doc, so api/proto is not wiped.
    rm -rf components/backend/internal/proto
    rm -rf components/frontend/src/lib/server/grpc/generated

    buf generate

    echo "All protos processed."

# Regenerate Ent ORM code + Schema.md from ent/schema/*.go.
[group('aux')]
generate-db-schema *args:
    just quitsh generate-schema
    just format components/backend/Schema.md

# Remove component build artifacts (.build, .output).
[group('aux')]
clean *args:
    just quitsh clean "$@"

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

# ─── Quitsh ─────────────────────────────────────────────────────────

# Run a quitsh command from the repo root.
alias q := quitsh
[group('aux')]
quitsh *args:
    quitsh-direct "$@"

# Run a quitsh command from the current directory.
[no-cd]
[group('aux')]
quitsh-nocd *args:
    quitsh-direct "$@"

# ─── Private helpers ─────────────────────────────────────────────────

[private]
_wipe-state:
    #!/usr/bin/env bash
    set -eu
    echo "==> Wiping Postgres and Keycloak state..."
    if [ -d ".devenv/state/postgres" ]; then
        chmod -R +w .devenv/state/postgres 2>/dev/null || true
        rm -rf .devenv/state/postgres
    fi
    rm -rf .devenv/state/keycloak

[private]
_setup *args:
    just quitsh setup "$@"
