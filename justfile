set positional-arguments
set shell := ["bash", "-cue"]
set dotenv-load := true
comp_dir := justfile_directory()
root_dir := `git rev-parse --show-toplevel`
flake_dir := "./tools/nix"

mod nix "./tools/just/nix.just"
mod ci "./tools/just/ci.just"

# Default target if you do not specify a target.
[private]
default:
    just --list --unsorted --list-submodules

# Enter a Nix development shell.
alias dev := develop
[no-cd]
[group('general')]
develop *args:
    just nix::develop default "$@"

# Run quitsh (by compiling it directly and executing it from the root).
alias q := quitsh
[group('general')]
quitsh *args:
    quitsh-direct "$@"

# Run quitsh (by compiling it directly and executing it from the current directory).
[no-cd]
[group('general')]
quitsh-nocd *args:
    quitsh-direct "$@"

# Cleans the whole repository and all untracked files (careful !)
[group('general')]
clean-all *args:
    #!/usr/bin/env bash
    set -eu
    if [ -d ".devenv/state/go" ]; then
        chmod -R +w .devenv/state/go
    fi
    git clean -dfX

# Clean cleans the components output folders.
[group('general')]
clean *args:
    just quitsh clean "$@"

# Format the whole repository.
[group('general')]
format *args:
    just quitsh format "$@"

# List components.
[group('general')]
list *args:
    just quitsh list "$@"

# Lint components by pattern `comppattern`.
[group('general')]
lint *args:
    just quitsh lint "$@" && \
    just quitsh nix fix-hash

# Build components by pattern `comppattern`.
[group('general')]
build *args:
    just quitsh build "$@"

# Test components by pattern `comppattern`.
[group('general')]
test *args:
    just quitsh test "$@"


## Miscellaneous ==============================================================
# Update dependencies to `quitsh`.
[group('aux')]
update-deps *args:
    #!/usr/bin/env bash
    set -eu
    (cd tools/quitsh && just update-deps "$@")

    (cd "{{flake_dir}}" &&
        nix flake update quitsh &&
        git add .)

    # Update go.mod tidy in all modules.
    readarray -t gomods < <(find "{{root_dir}}" -name "go.mod" \
        -and -not -ipath "*.devenv*" -and -not -ipath "*.old*")
    for gomod in "${gomods[@]}"; do
        echo "Update go mod in '$gomod'."
        (cd "$(dirname "$gomod")" && go mod tidy && git add go.mod go.sum)
    done

    quitsh nix fix-hash

# Run process-compose commands.
[group('general')]
proc-comp *args:
    cd ./tools/deploy/process-compose && just proc-comp "$@"

# Setup development files (default done in `devShell`).
[private]
setup *args:
    just quitsh setup "$@"
