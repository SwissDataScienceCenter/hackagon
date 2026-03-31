#!/usr/bin/env bash

# This is currently needed for devenv to properly run in pure hermetic
# mode while still being able to run processes & services and modify
# (some parts) of the active shell.mkdir -p .devenv/state
# See: https://github.com/cachix/devenv/issues/1461
function set_devenv_root() {
    local root_dir="$1"
    cd "$root_dir" || {
        echo "Devenv root dir '$root_dir' does not exist." >&2
        exit 1
    }

    root_dir="$(pwd)"

    echo "Set devenv-root to '$root_dir'." >&2

    pwd_file="$root_dir/.devenv/state/pwd"
    mkdir -p "$(dirname "$pwd_file")" &&
        echo "$root_dir" >"$pwd_file" &&
        echo "$pwd_file"
}
