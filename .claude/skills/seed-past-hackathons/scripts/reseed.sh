#!/usr/bin/env bash
# Delete the editions in data/*.json from the running instance, then seed them
# again. Seeding is idempotent by NAME, so it skips anything already there —
# which is exactly wrong after a change to what seeding produces (media, cover,
# rewritten page paths). This is the "I changed the seeder, apply it" path.
#
# Deleting also exercises the delete-by-prefix purge: an edition's uploaded
# objects go with it, so a re-seed does not leave the previous run's images
# orphaned in the bucket.
#
# Usage: reseed.sh [--delete-only]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$HERE")"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
GRPC="${E2E_GRPC_ADDR:-localhost:3000}"
KC="${E2E_KEYCLOAK_URL:-http://localhost:8180}"
ADMIN_USER="${HACKAGON_ADMIN_USER:-hackagon-admin}"
ADMIN_PASS="${HACKAGON_ADMIN_PASS:-aliceandbob}"

DELETE_ONLY=0
[ "${1:-}" = "--delete-only" ] && DELETE_ONLY=1

TOKEN=$(curl -s -X POST "$KC/realms/hackagon/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d client_id="hackagon-backend" -d username="$ADMIN_USER" -d password="$ADMIN_PASS" \
    -d grant_type=password -d scope="openid profile" | jq -r .access_token)
[ -z "$TOKEN" ] || [ "$TOKEN" = "null" ] && {
    echo "error: no admin token from $KC" >&2
    exit 1
}

rpc() { grpcurl -plaintext -H "authorization: Bearer $TOKEN" -d "$2" "$GRPC" "$1"; }

list=$(rpc hackathon.HackathonService/List '{}')
deleted=0
for f in "$SKILL_DIR"/data/*.json; do
    name=$(jq -r .name "$f")
    # --arg, not string interpolation: these names carry em-dashes and colons,
    # and an earlier version of this loop built the jq filter by concatenation
    # and silently matched nothing at all — it reported success having deleted
    # zero rows.
    id=$(jq -r --arg n "$name" '.hackathons[]? | select(.name == $n) | .id' <<<"$list")
    [ -z "$id" ] && continue

    # Delete refuses while an event still has pages — "archive it instead", which
    # is the right default for a real event and merely in the way here. Clear them
    # first; the seeder recreates every page from the JSON anyway.
    pages=$(rpc hackathon.PageService/List "$(jq -nc --arg h "$id" '{hackathonId:$h}')" 2>/dev/null |
        jq -r '.pages[]?.id' || true)
    for p in $pages; do
        rpc hackathon.PageService/Delete "$(jq -nc --arg p "$p" '{pageId:$p}')" >/dev/null 2>&1 || true
    done

    if rpc hackathon.HackathonService/Delete "$(jq -nc --arg h "$id" '{hackathonId:$h}')" >/dev/null 2>&1; then
        echo "  [-] $name"
        deleted=$((deleted + 1))
    else
        echo "  ✕ could not delete $name" >&2
    fi
done
echo "deleted $deleted edition(s)"

[ "$DELETE_ONLY" -eq 1 ] && exit 0
exec bash "$HERE/seed.sh"
