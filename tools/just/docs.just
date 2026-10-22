set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

default:
    just --list --unsorted -f "{{source_file()}}"

# Build the docs the way CI does; fails on any Sphinx warning, e.g. a broken link.
[group('docs')]
build:
    cd "{{root_dir}}" && just quitsh build -c docs

# Preview the docs while writing: rebuilds and reloads the browser on every save.
# Usage: just docs::serve [port]   (default 8090)
[group('docs')]
serve port="8090":
    cd "{{root_dir}}" && just nix::develop doc-sphinx bash -c \
        'cd docs && export UV_PROJECT_ENVIRONMENT=.venv && uv sync --locked && uv run sphinx-autobuild --port "$1" src ../.output/docs-serve' \
        _ "{{port}}"

# Retake screenshots of hackathon sidebar pages, only those named; ends by listing
# which changed. Needs the stack up (just start) with seeded data (just db::seed).
# Usage: just docs::screenshots manage-teams member-voting   |   just docs::screenshots --all
[group('docs')]
screenshots +pages:
    cd "{{root_dir}}" && just nix::develop doc-sphinx bash -c \
        'cd docs && export UV_PROJECT_ENVIRONMENT=.venv && uv sync --locked --group screenshots \
            && uv run --group screenshots playwright install chromium \
            && uv run --group screenshots python screenshots.py "$@"' \
        _ "$@"
