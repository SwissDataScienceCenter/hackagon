set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

default:
    just --list --unsorted -f "{{source_file()}}"

# Wipe Postgres and Keycloak state. Run 'just start' afterward.
[group('clean')]
state:
    #!/usr/bin/env bash
    set -eu
    cd "{{root_dir}}"
    just deploy::down 2>/dev/null || true
    echo "==> Wiping Postgres and Keycloak state..."
    if [ -d ".devenv/state/postgres" ]; then
        chmod -R +w .devenv/state/postgres 2>/dev/null || true
        rm -rf .devenv/state/postgres
    fi
    rm -rf .devenv/state/keycloak
    echo "✓ State wiped. Run 'just start' to restart with a clean slate."

# Remove component build artifacts (.build, .output).
[group('clean')]
build *args:
    cd "{{root_dir}}" && just quitsh clean "$@"

# DANGER: destroy ALL gitignored files (.devenv, node_modules, etc.).
[group('clean')]
[confirm("This will delete everything gitignored including .devenv and node_modules. Continue?")]
all:
    #!/usr/bin/env bash
    set -eu
    cd "{{root_dir}}"
    just deploy::down 2>/dev/null || true
    if [ -d ".devenv/state/go" ]; then
        chmod -R +w .devenv/state/go
    fi
    git clean -dfX

# Show usage examples for clean commands.
[group('clean')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Clean Commands${reset}"
    echo ""
    echo -e "  ${cyan}just clean::state${reset}"
    echo -e "  ${dim}Wipe Postgres + Keycloak state. Use when DB schema or Keycloak config changed.${reset}"
    echo -e "  ${dim}Run 'just start' afterward.${reset}"
    echo ""
    echo -e "  ${cyan}just clean::build${reset}"
    echo -e "  ${dim}Remove component build artifacts (.build, .output).${reset}"
    echo ""
    echo -e "  ${cyan}just clean::all${reset}"
    echo -e "  ${dim}DANGER: destroy ALL gitignored files including .devenv and node_modules.${reset}"
    echo ""
