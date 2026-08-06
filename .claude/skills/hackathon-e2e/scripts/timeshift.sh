#!/usr/bin/env bash
# Time travel for manual testing: shift a hackathon's start/end dates by N
# days (negative = into the past) via the Edit RPC as hackagon-admin. This is
# the deterministic alternative to faking the system clock: HackathonStatus is
# computed server-side from starts_at/ends_at, so moving the event moves it
# through its lifecycle (Upcoming -> Active -> Finished).
#
# Usage: timeshift.sh <hackathon-uuid> <days>
#   e.g. timeshift.sh 3f2a... -120     # pull the event 4 months into the past
#
# NOTE: phases have their own dates and PhaseService has no Edit yet — until
# then this shifts only the hackathon-level window (which is what drives the
# status badge and Join cutoffs).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

if [ $# -ne 2 ]; then
  echo "usage: $(basename "$0") <hackathon-uuid> <days (may be negative)>" >&2
  exit 2
fi
HACKATHON_ID="$1"
DAYS="$2"

TOKEN=$(keycloak_token "hackagon-admin" "aliceandbob")
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "error: could not get an admin token from Keycloak" >&2
  exit 1
fi

CURRENT=$(grpcurl -plaintext -H "authorization: Bearer $TOKEN" \
  -d "{\"hackathonId\":\"$HACKATHON_ID\"}" "$GRPC_ADDR" \
  hackathon.HackathonService/Get)
STARTS=$(echo "$CURRENT" | jq -r '.hackathon.startsAt')
ENDS=$(echo "$CURRENT" | jq -r '.hackathon.endsAt')

NEW_STARTS=$(date -u -d "$STARTS $DAYS days" +%Y-%m-%dT%H:%M:%SZ)
NEW_ENDS=$(date -u -d "$ENDS $DAYS days" +%Y-%m-%dT%H:%M:%SZ)

echo "==> Shifting hackathon $HACKATHON_ID by $DAYS day(s):"
echo "    starts_at: $STARTS -> $NEW_STARTS"
echo "    ends_at:   $ENDS -> $NEW_ENDS"

grpcurl -plaintext -H "authorization: Bearer $TOKEN" \
  -d "{\"hackathonId\":\"$HACKATHON_ID\",\"startsAt\":\"$NEW_STARTS\",\"endsAt\":\"$NEW_ENDS\"}" \
  "$GRPC_ADDR" hackathon.HackathonService/Edit >/dev/null

echo "==> Done."
