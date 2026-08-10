set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

default:
    just --list --unsorted -f "{{source_file()}}"

# Show usage examples for rpc commands.
[group('rpc')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}gRPC Commands${reset}"
    echo -e "  ${dim}Backend must be running locally (start with 'just start')${reset}"
    echo ""
    echo -e "  ${cyan}just rpc::as${reset} <user> <password> <method> [data]"
    echo -e "  ${dim}Call a gRPC method as an authenticated user${reset}"
    echo -e "  ${dim}e.g. just rpc::as bob aliceandbob user.UserService/WhoAmI${reset}"
    echo ""
    echo -e "  ${cyan}just rpc::unauth${reset} <method> [data]"
    echo -e "  ${dim}Call a gRPC method without authentication${reset}"
    echo -e "  ${dim}e.g. just rpc::unauth grpc.health.v1.Health/Check${reset}"
    echo ""

# Call a gRPC method with an access token for a given user.
[group('rpc')]
as user password method data="{}":
    #!/usr/bin/env bash
    set -eu
    token=$(cd "{{root_dir}}/tools/deploy/process-compose" && just get-access-token "{{user}}" "{{password}}")
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        echo "failed to get access token for {{user}} (check user/password in Keycloak)" >&2
        exit 1
    fi
    grpcurl -plaintext -H "authorization: Bearer $token" -d '{{data}}' localhost:3000 '{{method}}'

# Call a gRPC method without authentication (for testing unauthenticated endpoints).
[group('rpc')]
unauth method data="{}":
    grpcurl -plaintext -d '{{data}}' localhost:3000 '{{method}}'
