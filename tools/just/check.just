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

# Run the browser tests (Playwright) against the running stack on :8081.
# Start it first with `just start`. Arguments go to `playwright test`,
# e.g. `just check::e2e --headed` or `just check::e2e --ui`.
[group('checks')]
e2e *args:
    #!/usr/bin/env bash
    set -eu
    cd "{{root_dir}}"
    if ! curl -sf -o /dev/null http://localhost:8081; then
        echo "Nothing answers on http://localhost:8081. Start the stack first: just start" >&2
        exit 1
    fi
    # Playwright refuses browsers built for another version, and the browsers
    # come from Nix. Say so plainly instead of its "Executable doesn't exist".
    just nix::develop test-e2e bash -c '
        set -eu
        cd components/frontend
        pinned=$(node -p "require(\"./package.json\").devDependencies[\"@playwright/test\"]")
        if [ "$pinned" != "$HACKAGON_PLAYWRIGHT_VERSION" ]; then
            echo "@playwright/test is $pinned, but Nix ships browsers for $HACKAGON_PLAYWRIGHT_VERSION." >&2
            echo "Pin it to exactly $HACKAGON_PLAYWRIGHT_VERSION in components/frontend/package.json." >&2
            exit 1
        fi
        pnpm install --frozen-lockfile
        pnpm exec playwright test "$@"
    ' _ "$@"

# Lint a component. Usage: just check::lint -c backend
[group('checks')]
lint *args:
    cd "{{root_dir}}" && just quitsh lint "$@"

# Format a component. Usage: just check::format -c frontend
[group('checks')]
format *args:
    cd "{{root_dir}}" && just quitsh format "$@"
