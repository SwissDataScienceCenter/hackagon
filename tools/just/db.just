set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

default:
    just --list --unsorted -f "{{source_file()}}"

# Show usage examples for db commands.
[group('db')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Database Commands${reset}"
    echo -e "  ${dim}Postgres must be running locally (start with 'just start')${reset}"
    echo ""
    echo -e "  ${cyan}just db::psql${reset} [args]"
    echo -e "  ${dim}Open a psql shell to the local Hackagon database${reset}"
    echo -e "  ${dim}e.g. just db::psql${reset}"
    echo -e "  ${dim}     just db::psql -c 'SELECT * FROM users;'${reset}"
    echo ""
    echo -e "  ${cyan}just db::summary${reset}"
    echo -e "  ${dim}Show a formatted summary of what is in the database${reset}"
    echo -e "  ${dim}e.g. just db::summary${reset}"
    echo ""
    echo -e "  ${cyan}just db::seed${reset}"
    echo -e "  ${dim}Seed the database with sample hackathons, tracks, projects, teams and users${reset}"
    echo -e "  ${dim}e.g. just db::seed${reset}"
    echo ""

# Open a psql shell to the local Hackagon database.
[group('db')]
psql *args:
    psql -h 127.0.0.1 -p 5432 -U postgres -d hackagon "$@"

# Show a formatted summary of what is currently in the database.
[group('db')]
summary:
    psql -h 127.0.0.1 -p 5432 -U postgres -d hackagon -f "{{root_dir}}/tools/sql/db-summary.sql"

# Seed the test database with sample hackathons, tracks, projects, teams, and users.
[group('db')]
seed:
    cd "{{root_dir}}/components/backend" && go run ./cmd/seed/ --config-dir ./data/test/config/
