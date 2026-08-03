#!/usr/bin/env bash
# Runs once after the devcontainer is created (cwd = workspace folder).
set -euo pipefail

workspace="$(pwd)"

# The bind-mounted repo is owned by the host user.
git config --global --add safe.directory "${workspace}"

# Named-volume mountpoints (.devenv/.direnv) are created root-owned.
sudo chown "$(id -u):$(id -g)" "${workspace}/.devenv" "${workspace}/.direnv"

# Bootstrap tools needed to enter the Nix dev shell; everything else
# comes from the flake (tools/nix) once inside.
nix profile install nixpkgs#just nixpkgs#direnv

if ! grep -q 'direnv hook bash' ~/.bashrc; then
    echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
fi
direnv allow "${workspace}" || true

echo "Done. Enter the dev shell with 'just dev' (or let direnv load it), then 'just start'."
