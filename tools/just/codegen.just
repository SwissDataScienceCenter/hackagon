set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

default:
    just --list --unsorted -f "{{source_file()}}"

# Regenerate Go + TypeScript gRPC stubs from api/proto/*.proto.
[group('codegen')]
proto *args:
    #!/usr/bin/env bash
    set -eu
    cd "{{root_dir}}"

    # Wipe codegen output dirs first — buf generate does not prune stale files,
    # which silently shadows new output (e.g. Node resolving a stale user.ts
    # over the new user/ directory). API.md is rewritten in place by
    # protoc-gen-doc, so api/proto is not wiped.
    rm -rf components/backend/internal/proto
    rm -rf components/frontend/src/lib/server/grpc/generated

    buf generate

    echo "All protos processed."

# Regenerate Ent ORM code + Schema.md from db/schema/*.go.
[group('codegen')]
db-schema *args:
    cd "{{root_dir}}" && just quitsh generate-schema "$@"

# Show usage examples for codegen commands.
[group('codegen')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Codegen Commands${reset}"
    echo -e "  ${dim}Run after changing .proto files or db/schema/*.go${reset}"
    echo ""
    echo -e "  ${cyan}just codegen::proto${reset}"
    echo -e "  ${dim}Regenerate Go + TypeScript gRPC stubs from api/proto/*.proto${reset}"
    echo ""
    echo -e "  ${cyan}just codegen::db-schema${reset}"
    echo -e "  ${dim}Regenerate Ent ORM code + Schema.md from db/schema/*.go${reset}"
    echo ""
