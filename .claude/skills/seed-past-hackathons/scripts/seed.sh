#!/usr/bin/env bash
# Populate the running platform with SDSC's past hackathons from data/*.json.
# Idempotent: an edition whose name already exists is skipped.
#
# Usage: seed.sh [--dry-run] [file.json ...]     (default: every data/*.json)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$HERE")"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
GRPC="${E2E_GRPC_ADDR:-localhost:3000}"
KC="${E2E_KEYCLOAK_URL:-http://localhost:8180}"
ADMIN_USER="${HACKAGON_ADMIN_USER:-hackagon-admin}"
ADMIN_PASS="${HACKAGON_ADMIN_PASS:-aliceandbob}"

DRY=0
FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) FILES+=("$1") ;;
  esac
  shift
done
[ ${#FILES[@]} -eq 0 ] && FILES=("$SKILL_DIR"/data/*.json)

for bin in grpcurl jq curl; do
  command -v "$bin" >/dev/null 2>&1 || { echo "error: $bin not found — run inside the Nix dev shell (just develop)" >&2; exit 1; }
done

TOKEN=$(curl -s -X POST "$KC/realms/hackagon/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d client_id="hackagon-backend" -d username="$ADMIN_USER" -d password="$ADMIN_PASS" \
  -d grant_type=password -d scope="openid profile" | jq -r .access_token)
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "error: could not get an admin token from $KC" >&2; exit 1
fi

rpc() { grpcurl -plaintext -H "authorization: Bearer $TOKEN" -d "$2" "$GRPC" "$1"; }

existing=$(rpc hackathon.HackathonService/List '{}' | jq -r '.hackathons[]?.name' || true)

for f in "${FILES[@]}"; do
  name=$(jq -r .name "$f")
  echo "── $(basename "$f") — $name"

  if grep -Fxq "$name" <<<"$existing"; then
    echo "   [=] already present, skipping"
    continue
  fi
  if [ "$DRY" -eq 1 ]; then
    echo "   [dry-run] would create: $(jq -r '"\(.tracks|length) tracks, \(.phases|length) phases, \(.pages|length) pages, \(.media.images|length) images"' "$f")"
    continue
  fi

  payload=$(jq -c '{name, description, visibility, startsAt, endsAt, logo}' "$f")
  hid=$(rpc hackathon.HackathonService/Create "$payload" | jq -r .hackathonId)
  [ -z "$hid" ] || [ "$hid" = "null" ] && { echo "   ✕ create failed" >&2; exit 1; }
  echo "   [+] hackathon $hid"

  # tracks
  n=$(jq '.tracks|length' "$f")
  for i in $(seq 0 $((n - 1))); do
    [ "$n" -eq 0 ] && break
    t=$(jq -c --arg h "$hid" ".tracks[$i] | {hackathonId:\$h, name, description}" "$f")
    rpc hackathon.TrackService/Create "$t" >/dev/null && echo "   [+] track $(jq -r ".tracks[$i].name" "$f")"
  done

  # phases (Create drops dates — bug B4 — so Edit them in afterwards)
  n=$(jq '.phases|length' "$f")
  for i in $(seq 0 $((n - 1))); do
    [ "$n" -eq 0 ] && break
    p=$(jq -c --arg h "$hid" ".phases[$i] | {hackathonId:\$h, name, description}" "$f")
    pid=$(rpc hackathon.PhaseService/Create "$p" | jq -r '.phaseId // .phase.id // empty')
    if [ -n "$pid" ]; then
      dates=$(jq -c --arg id "$pid" ".phases[$i] | {phaseId:\$id, startsAt, endsAt}" "$f")
      rpc hackathon.PhaseService/Edit "$dates" >/dev/null 2>&1 || true
    fi
    echo "   [+] phase $(jq -r ".phases[$i].name" "$f")"
  done

  # pages (content is markdown; images are referenced by path)
  n=$(jq '.pages|length' "$f")
  for i in $(seq 0 $((n - 1))); do
    [ "$n" -eq 0 ] && break
    pg=$(jq -c --arg h "$hid" ".pages[$i] | {hackathonId:\$h, title, content, visible}" "$f")
    rpc hackathon.PageService/Create "$pg" >/dev/null && echo "   [+] page $(jq -r ".pages[$i].title" "$f")"
  done

  echo "   ✓ done — status will render as Finished (dates are in the past)"
done

echo ""
echo "Seeded. Browse them at http://localhost:8081"
