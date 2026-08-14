#!/usr/bin/env bash
# Provision the extras crowd (cast.json) into the dev Keycloak realm via the
# admin REST API. Idempotent: existing users are left untouched, so re-runs
# are no-ops and the checked-in realm export stays the source of truth for the
# four principals. Requires Keycloak up (run after wait-ready.sh).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

CAST="$SKILL_DIR/cast.json"
REALM="hackagon"

# Dev master-realm credentials (see tools/configs/keycloak/README.md).
ADMIN_TOKEN=$(curl -s -X POST \
    "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=admin" \
    -d "grant_type=password" | jq -r ".access_token")
if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    echo "error: could not get a Keycloak master admin token (admin/admin)" >&2
    exit 1
fi

PASSWORD=$(jq -r '.password' "$CAST")
COUNT=$(jq -r '.extras | length' "$CAST")

echo "==> Ensuring $COUNT extra participants exist in realm '$REALM'..."
created=0
for i in $(seq 0 $((COUNT - 1))); do
    username=$(jq -r ".extras[$i].username" "$CAST")

    existing=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$username&exact=true" | jq 'length')
    if [ "$existing" -gt 0 ]; then
        echo "  [=] $username (exists)"
        continue
    fi

    payload=$(jq -c --arg pw "$PASSWORD" ".extras[$i] | {
      username: .username,
      firstName: .firstName,
      lastName: .lastName,
      email: .email,
      enabled: true,
      emailVerified: true,
      credentials: [{type: \"password\", value: \$pw, temporary: false}]
    }" "$CAST")

    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$KEYCLOAK_URL/admin/realms/$REALM/users")
    if [ "$http_code" != "201" ] && [ "$http_code" != "409" ]; then
        echo "error: creating $username failed (HTTP $http_code)" >&2
        exit 1
    fi
    echo "  [+] $username (created)"
    created=$((created + 1))
done
echo "==> Roster ready ($created created, $((COUNT - created)) already present)."
