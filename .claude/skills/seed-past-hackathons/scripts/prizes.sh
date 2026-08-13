#!/usr/bin/env bash
# Give every seeded edition a prize table, each prize carrying a picture.
#
# The badges in static/_generated are DRAWN, not photographed — abstract marks
# with a numeral. That is deliberate: a synthetic photo of a trophy attached to
# a real event's award would be a fabricated record, which is the same reason
# the landing page stopped shipping invented winner cards.
#
# Usage: prizes.sh [--dry-run]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$HERE")"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
GRPC="${E2E_GRPC_ADDR:-localhost:3000}"
KC="${E2E_KEYCLOAK_URL:-http://localhost:8180}"
STORE_ENDPOINT="${HACKAGON_STORE_ENDPOINT:-http://rustfs:9000}"
ADMIN_USER="${HACKAGON_ADMIN_USER:-hackagon-admin}"
ADMIN_PASS="${HACKAGON_ADMIN_PASS:-aliceandbob}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

TOKEN=$(curl -s -X POST "$KC/realms/hackagon/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d client_id="hackagon-backend" -d username="$ADMIN_USER" -d password="$ADMIN_PASS" \
    -d grant_type=password -d scope="openid profile" | jq -r .access_token)
[ -z "$TOKEN" ] || [ "$TOKEN" = "null" ] && {
    echo "error: no admin token from $KC" >&2
    exit 1
}
rpc() { grpcurl -plaintext -H "authorization: Bearer $TOKEN" -d "$2" "$GRPC" "$1"; }

# Upload one badge for one hackathon; prints its public path.
badge() {
    local hid="$1" file="$2" path="$SKILL_DIR/static/_generated/$2"
    local size req resp url pub code
    [ -f "$path" ] || {
        echo ""
        return 0
    }
    size=$(stat -c%s "$path")
    req=$(jq -nc --arg o "$hid" --arg f "$file" --argjson s "$size" \
        '{kind:"UPLOAD_KIND_HACKATHON_MEDIA", ownerId:$o, filename:$f,
          contentType:"image/webp", sizeBytes:$s}')
    resp=$(rpc storage.StorageService/CreateUploadUrl "$req" 2>/dev/null) || {
        echo ""
        return 0
    }
    url=$(jq -r '.uploadUrl // empty' <<<"$resp")
    pub=$(jq -r '.publicUrl // empty' <<<"$resp")
    [ -z "$url" ] && {
        echo ""
        return 0
    }
    # Straight at the store: /objects is a browser-facing prefix, and the
    # signature is computed against the store's own host and path.
    code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Content-Type: image/webp" \
        --data-binary "@$path" "${STORE_ENDPOINT}${url#/objects}")
    if [ "$code" != "200" ] && [ "$code" != "204" ]; then
        echo ""
        return 0
    fi
    echo "$pub"
}

list=$(rpc hackathon.HackathonService/List '{}')
for f in "$SKILL_DIR"/data/*.json; do
    name=$(jq -r .name "$f")
    hid=$(jq -r --arg n "$name" '.hackathons[]? | select(.name == $n) | .id' <<<"$list")
    [ -z "$hid" ] && {
        echo "── $name — not seeded, skipping"
        continue
    }
    echo "── $name"
    if [ "$DRY" -eq 1 ]; then
        echo "   [dry-run] would set 4 prizes with images"
        continue
    fi

    g1=$(badge "$hid" prize-1.webp)
    g2=$(badge "$hid" prize-2.webp)
    g3=$(badge "$hid" prize-3.webp)
    gx=$(badge "$hid" prize-x.webp)

    # rank 0 is the discretionary/special prize — see entities/prize.proto.
    req=$(jq -nc --arg h "$hid" --arg a "$g1" --arg b "$g2" --arg c "$g3" --arg d "$gx" '{
    hackathonId: $h,
    prizes: [
      {rank: 1, title: "First place",        image: $a},
      {rank: 2, title: "Second place",       image: $b},
      {rank: 3, title: "Third place",        image: $c},
      {rank: 0, title: "Community Choice",   image: $d}
    ]
  }')
    if rpc hackathon.PrizeService/Set "$req" >/dev/null 2>&1; then
        echo "   [+] 4 prizes with images"
    else
        echo "   ✕ could not set prizes" >&2
    fi
done
