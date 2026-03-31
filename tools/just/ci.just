set positional-arguments
set shell := ["bash", "-cue"]

default:
    just --list --unsorted -f "{{source_file()}}"

# Enter the CI Nix development shell and execute the command `"$@"`.
[no-cd]
[group('ci')]
run *args:
    #!/usr/bin/env bash
    set -eu

    if [ -n "${IN_NIX_SHELL:-}" ]; then
        {
            echo "You seem to be in a Nix shell. You should NOT run the CI Nix shell"
            echo "inside another one! Please deactivate it."
        } >&2
        exit 1
    fi

    just nix::develop "ci" "$@"
