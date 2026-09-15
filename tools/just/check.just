[group('checks')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Check Commands${reset}"
    echo ""
    echo -e "  ${cyan}just check::lint${reset} -c <component>"
    echo -e "  ${dim}e.g. just check::lint -c backend${reset}"
    echo ""
    echo -e "  ${cyan}just check::test${reset} -c <component>"
    echo -e "  ${dim}e.g. just check::test -c frontend${reset}"
    echo ""
    echo -e "  ${cyan}just check::smoke${reset}"
    echo -e "  ${dim}Smoke-test a running stack (needs 'just deploy::up' + 'just db::seed')${reset}"
    echo ""
    echo -e "  ${cyan}just check::format${reset} -c <component>"
    echo -e "  ${dim}e.g. just check::format -c backend${reset}"
    echo ""
    echo -e "  ${dim}Available components: backend, frontend${reset}"
    echo ""

set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

default:
    just --list --unsorted -f "{{source_file()}}"

# Build a component. Usage: just check::build -c backend
[group('checks')]
build *args:
    cd "{{root_dir}}" && just quitsh build "$@"

# Run tests for a component. Usage: just check::test -c frontend
[group('checks')]
test *args:
    #!/usr/bin/env bash
    set -eu
    cd "{{root_dir}}"
    # Go coverage data accumulates in this directory across runs, and
    # `go tool covdata` merges every covmeta it finds there. Run the tests on
    # one branch and then on another, and the merged profile still names source
    # files that only existed on the first — at which point `go tool cover
    # -html` fails reading them and the whole test target goes red with every
    # spec passing. CI gets a fresh workspace, so this only ever bites locally,
    # after a branch switch. Dropping the directory costs nothing: the run
    # about to happen regenerates all of it.
    rm -rf .output/*/coverage/data
    just quitsh test "$@"

# Smoke-test a running stack. Needs `just deploy::up` and `just db::seed` first.
# Usage: just check::smoke
[group('checks')]
smoke *args:
    #!/usr/bin/env bash
    set -eu
    cd "{{root_dir}}/components/backend"
    # `-count=1` because Go's test cache keys on source and inputs, and knows
    # nothing about the stack these specs talk to. A cached PASS from a run
    # against a different deployment is worse than no result at all.
    go test -tags 'test integration' -count=1 -v ./test/smoke/ "$@"

# Lint a component. Usage: just check::lint -c backend
[group('checks')]
lint *args:
    cd "{{root_dir}}" && just quitsh lint "$@"

# Format a component. Usage: just check::format -c frontend
[group('checks')]
format *args:
    cd "{{root_dir}}" && just quitsh format "$@"
