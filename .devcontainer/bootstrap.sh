#!/usr/bin/env bash
# One-shot project bootstrap for a fresh workspace. Idempotent.
#
# Order matters:
#   1. pnpm install       — provides the ts_proto plugin that buf invokes from
#                           components/frontend/node_modules/.bin
#   2. buf generate       — creates the gitignored components/backend/internal/proto
#   3. ent codegen        — creates the gitignored components/backend/ent
#   4. go mod tidy        — only resolves once the generated packages exist;
#                           without them Go tries to fetch the (private) repo.
#
# The first `just develop` downloads the whole flake toolchain — expect the
# initial run to take a while; the Nix store volume caches it for rebuilds.
set -euo pipefail

workspace="$(git rev-parse --show-toplevel)"
export USER="${USER:-$(whoami)}"
[ -e "$HOME/.nix-profile/etc/profile.d/nix.sh" ] && . "$HOME/.nix-profile/etc/profile.d/nix.sh"

cd "${workspace}"

echo "==> Installing frontend deps (provides buf's ts_proto plugin)..."
just develop bash -c "cd components/frontend && pnpm install --frozen-lockfile"

echo "==> Generating gRPC stubs (buf)..."
just develop just codegen::proto

echo "==> Generating Ent ORM code..."
just develop just codegen::db-schema

echo "==> Syncing backend Go modules..."
just develop bash -c "cd components/backend && GOWORK=off go mod tidy"

echo "Bootstrap complete. Start everything with: just develop just deploy::up"
