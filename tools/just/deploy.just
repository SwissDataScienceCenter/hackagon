set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`
pc_dir := root_dir + "/tools/deploy/process-compose"

default:
    just --list --unsorted -f "{{source_file()}}"

# Start Keycloak, Postgres, and the backend (via process-compose).
[group('deploy')]
up *args:
    cd "{{pc_dir}}" && just up "$@"

# Stop all running services.
[group('deploy')]
down *args:
    cd "{{pc_dir}}" && just down "$@"

# Attach to the process-compose TUI for log inspection.
[group('deploy')]
attach:
    cd "{{pc_dir}}" && just attach

# Send a command to the running process-compose instance.
[group('deploy')]
proc-comp *args:
    cd "{{pc_dir}}" && just proc-comp "$@"

# Save current Keycloak realm settings back to the JSON config file.
[group('deploy')]
save-keycloak:
    #!/usr/bin/env bash
    set -eu
    token=$(curl -s -X POST \
      "http://localhost:8180/realms/master/protocol/openid-connect/token" \
      -d "client_id=admin-cli" \
      -d "username=admin" \
      -d "password=admin" \
      -d "grant_type=password" | jq -r ".access_token")
    curl -s -H "Authorization: Bearer $token" \
      "http://localhost:8180/admin/realms/hackagon/partial-export?exportClients=true&exportGroupsAndRoles=true" \
      | jq > "{{root_dir}}/tools/configs/keycloak/realm-hackagon.json"
    echo "✓ Realm saved to tools/configs/keycloak/realm-hackagon.json"

# Show usage examples for deploy commands.
[group('deploy')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Deploy Commands${reset}"
    echo ""
    echo -e "  ${cyan}just deploy::up${reset}"
    echo -e "  ${dim}Start Keycloak, Postgres, and the backend${reset}"
    echo ""
    echo -e "  ${cyan}just deploy::down${reset}"
    echo -e "  ${dim}Stop all running services${reset}"
    echo ""
    echo -e "  ${cyan}just deploy::attach${reset}"
    echo -e "  ${dim}Attach to the process-compose TUI${reset}"
    echo ""
    echo -e "  ${cyan}just deploy::save-keycloak${reset}"
    echo -e "  ${dim}Export current Keycloak realm to tools/configs/keycloak/realm-hackagon.json${reset}"
    echo ""
