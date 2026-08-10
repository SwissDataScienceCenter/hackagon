#!/usr/bin/env bash
# Populate the DB with the deterministic dev fixture (idempotent — a re-run
# against an already-seeded DB is a no-op thanks to the sentinel hackathon).
# Used by the SMOKE suite only; the journey suite needs an empty database.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

wait_for "postgres" 60 pg_isready -h 127.0.0.1 -p 5432 -U postgres

echo "==> Seeding the database..."
(cd "$ROOT_DIR" && just db::seed)

# The backend's casbin enforcer loads the policy table at startup and never
# reloads: roles the seed writes straight to Postgres are invisible until the
# backend restarts (badges render wrong, private hackathons vanish).
echo "==> Restarting the backend to reload seeded casbin roles..."
(cd "$ROOT_DIR" && just deploy::proc-comp process restart backend >/dev/null)
wait_for "backend" 120 grpcurl -plaintext localhost:3000 health.HealthService/Check
