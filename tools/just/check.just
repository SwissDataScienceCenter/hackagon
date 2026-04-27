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

# Run tests for a component. Usage: just check::test -c frontend
[group('checks')]
test *args:
    cd "{{root_dir}}" && just quitsh test "$@"

# Lint a component. Usage: just check::lint -c backend
[group('checks')]
lint *args:
    cd "{{root_dir}}" && just quitsh lint "$@"

# Format a component. Usage: just check::format -c frontend
[group('checks')]
format *args:
    cd "{{root_dir}}" && just quitsh format "$@"
