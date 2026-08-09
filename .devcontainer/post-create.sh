#!/usr/bin/env bash
# Runs once after the devcontainer is created (cwd = workspace folder).
# Idempotent — safe to re-run. Plain-compose users run it manually:
#   docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
#     bash -c "cd /workspaces/hackagon && bash .devcontainer/post-create.sh"
set -euo pipefail

workspace="$(pwd)"
# docker exec does not set USER; Nix profile scripts silently no-op without it.
export USER="${USER:-$(whoami)}"

# The bind-mounted repo is owned by the host user.
git config --global --add safe.directory "${workspace}"

# Named-volume mountpoints are created root-owned; everything below runs as
# vscode, so hand them over. node_modules/.svelte-kit/.pnpm-store are volumes
# because small-file IO on the host bind mount is pathologically slow on
# Windows and macOS (see docker-compose.yml).
sudo chown "$(id -u):$(id -g)" \
    "${workspace}/.devenv" \
    "${workspace}/.direnv" \
    "${workspace}/.pnpm-store" \
    "${workspace}/components/frontend/node_modules" \
    "${workspace}/components/frontend/.svelte-kit"

# Make a manually installed (single-user) Nix visible to every shell. With the
# devcontainer Nix feature this file does not exist and these are no-ops.
if [ -e "$HOME/.nix-profile/etc/profile.d/nix.sh" ]; then
    # The USER guard matters: docker exec shells have no USER set, and
    # nix.sh silently no-ops without it.
    # shellcheck disable=SC2016  # literal on purpose: this line is APPENDED to
    # an rc file, so $USER and $HOME must expand when that shell runs, not now.
    line='export USER="${USER:-$(whoami)}"; . "$HOME/.nix-profile/etc/profile.d/nix.sh"'
    for rc in "$HOME/.bashrc" "$HOME/.bash_profile"; do
        grep -qs "nix-profile/etc/profile.d/nix.sh" "$rc" || echo "$line" >>"$rc"
    done
    . "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi

# Bootstrap tools needed to enter the Nix dev shell; everything else comes
# from the flake (tools/nix) once inside. socat serves host-bridge.sh.
for pkg in just direnv socat; do
    command -v "$pkg" >/dev/null 2>&1 && continue
    nix profile add "nixpkgs#$pkg" 2>/dev/null || nix profile install "nixpkgs#$pkg"
done

# shellcheck disable=SC2016  # literal on purpose: the substitution must run
# when .bashrc is sourced, not while this script writes it.
grep -qs 'direnv hook bash' "$HOME/.bashrc" ||
    echo 'eval "$(direnv hook bash)"' >>"$HOME/.bashrc"
direnv allow "${workspace}" || true

# Dev-only frontend secrets (gitignored) — without them the frontend
# returns 500 "Server Configuration Error" on every request.
secrets="${workspace}/components/frontend/data/test/config/secrets.yaml"
if [ ! -f "$secrets" ]; then
    printf 'oidc:\n  clientSecret: "%s"\n  authSecret: "%s"\n' \
        "$(openssl rand -base64 32)" "$(openssl rand -base64 32)" >"$secrets"
    echo "Generated dev secrets at ${secrets}."
fi

if [ "${HACKAGON_SKIP_BOOTSTRAP:-}" != "1" ]; then
    bash "${workspace}/.devcontainer/bootstrap.sh"
else
    echo "Skipped project bootstrap (HACKAGON_SKIP_BOOTSTRAP=1)."
fi

echo "Done. Enter the dev shell with 'just dev' (or let direnv load it)."
echo "Start all services with: just develop just deploy::up"
