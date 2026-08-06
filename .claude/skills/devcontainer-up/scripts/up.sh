#!/usr/bin/env bash
# Bring the Hackagon devcontainer up AND ready:
#   1. Start the compose stack (.devcontainer/docker-compose.yml, service `dev`).
#      Prefers the `devcontainer` CLI when installed (it applies the Nix
#      feature + post-create automatically); falls back to plain compose and
#      bootstraps Nix + post-create.sh itself.
#   2. Warm the Nix dev shell (first run downloads the whole toolchain —
#      this is the slow step; the nix-store volume caches it for next time).
#
# After this, everything runs inside the container, e.g.:
#   scripts/e2e.sh smoke        # hackathon-e2e suite in the container
#   scripts/exec.sh just start  # any repo command
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

require_docker

if command -v devcontainer >/dev/null 2>&1; then
  echo "==> Starting via the devcontainer CLI (Nix feature + post-create handled)..."
  devcontainer up --workspace-folder "$ROOT_DIR"
else
  echo "==> devcontainer CLI not found — using plain docker compose..."
  compose up -d --build "$SERVICE"

  if ! in_container 'command -v nix' >/dev/null 2>&1; then
    echo "==> Installing Nix (single-user) inside the container..."
    in_container 'curl -fsSL https://nixos.org/nix/install -o /tmp/install-nix && sh /tmp/install-nix --no-daemon'
    in_container 'mkdir -p ~/.config/nix && printf "experimental-features = nix-command flakes\nsandbox = false\n" > ~/.config/nix/nix.conf'
  fi

  echo "==> Running post-create bootstrap (idempotent)..."
  in_container 'bash .devcontainer/post-create.sh'
fi

echo "==> Warming the Nix dev shell (first run downloads the toolchain — grab a coffee)..."
in_container 'just develop true'

echo ""
echo "── Devcontainer ready ──────────────────────────────────────"
echo "  Run the e2e suites:   bash $SKILL_DIR/scripts/e2e.sh smoke"
echo "                        bash $SKILL_DIR/scripts/e2e.sh journey"
echo "  Run any command:      bash $SKILL_DIR/scripts/exec.sh just start"
echo "  Shell inside:         bash $SKILL_DIR/scripts/exec.sh bash"
echo "  Stop:                 bash $SKILL_DIR/scripts/down.sh"
