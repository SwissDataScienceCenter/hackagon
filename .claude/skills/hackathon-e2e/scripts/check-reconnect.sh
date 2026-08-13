#!/usr/bin/env bash
# THE regression test for "the frontend cannot see the seed data".
#
#   Restart the backend under a running :8081, then assert the browse page still
#   lists its events.
#
# Why this is a test of its own rather than a Playwright spec: the subject is a
# process-level fact (one module-scope gRPC channel in the built server, outliving
# a backend restart), it needs to STOP a service the rest of the suite depends on,
# and the assertion is a count in HTML — no browser adds anything. Running it
# inside smoke would perturb 140 tests to check one.
#
# WHAT WENT WRONG, so the shape of the check is not mysterious. On 2026-08-13 the
# browse page rendered ZERO events while grpcurl returned eight from the same
# database. Two independent causes, both fixed, both regressions worth catching:
#
#   1. lib/server/grpc/client.ts creates ONE channel at module load. grpc-js
#      reconnects on its own but on a backoff that doubles to a 120s cap, and
#      every RPC issued while it waits fails immediately. Measured with a 7-minute
#      outage: the page was still wrong 51 SECONDS after the backend was
#      demonstrably healthy, and the lag grows with the outage toward that cap.
#      The channel now caps the backoff at 2s; the same measurement is 0s.
#   2. The page's load turned any error into `hackathons: []`, which renders "No
#      hackathons have been published yet." — so "the database is empty" and "I
#      cannot reach the backend" were the same page. It now carries
#      `listUnavailable` and says which.
#
# The check asserts BOTH: the count comes back, and while the backend is down the
# page says unavailable rather than empty. The second half is the one that would
# have saved the hours — without it, half of this script's assertions pass on a
# page that is lying.
#
# Usage: check-reconnect.sh          (needs a stack up, seeded, and :8081 serving)
set -euo pipefail
trap 'echo "check-reconnect.sh: aborted at line $LINENO (status $?)" >&2' ERR
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
ensure_toolchain "${BASH_SOURCE[0]}" "$@"

PC_SOCKET_FILE="$ROOT_DIR/tools/deploy/process-compose/.socket-path-test-services"
SOCK="$(cat "$PC_SOCKET_FILE" 2>/dev/null || true)"
BROWSE="$FRONTEND_URL/hackathon"
FAILED=0

pc() { process-compose --unix-socket "$SOCK" "$@" >/dev/null 2>&1; }

# One <a href="/hackathon/{uuid}"> per listed event.
page_html() { curl -fsS --max-time 15 "$BROWSE" 2>/dev/null || true; }
page_count() {
  page_html | grep -oE 'href="/hackathon/[0-9a-f-]{36}"' | sort -u | wc -l | tr -d ' '
}
# jq, not a grep for `"id"`. Every hackathon in this response also carries
# nested ids (capability modifiers, creator, …), so a naive count reported 16 for
# 8 events — and an indentation-anchored grep reported 0, which this script's own
# guard would have read as "nothing to test" and exited cleanly having tested
# nothing. Ask the structure.
rpc_count() {
  grpcurl -plaintext -d '{"visibility_filter":1}' "$GRPC_ADDR" \
    hackathon.HackathonService/List 2>/dev/null |
    jq -r '.hackathons | length' 2>/dev/null || echo 0
}

fail() {
  echo "  ✗ $1" >&2
  FAILED=1
}

if [ -z "$SOCK" ] || [ ! -S "$SOCK" ]; then
  echo "error: no process-compose socket — start the stack first (scripts/up.sh)." >&2
  exit 1
fi

echo "==> Baseline"
BEFORE_RPC="$(rpc_count)"
BEFORE_PAGE="$(page_count)"
echo "     gRPC lists $BEFORE_RPC public events; the browse page renders $BEFORE_PAGE"
if [ "$BEFORE_RPC" -eq 0 ]; then
  echo "error: no public hackathons to check against — seed the instance first." >&2
  echo "       (An assertion whose subject is absent verifies nothing.)" >&2
  exit 1
fi
[ "$BEFORE_PAGE" -eq "$BEFORE_RPC" ] ||
  fail "before any restart the page already disagrees with gRPC ($BEFORE_PAGE vs $BEFORE_RPC)"

echo "==> Stopping the backend"
pc process stop backend
for _ in $(seq 1 15); do
  [ "$(rpc_count)" -eq 0 ] && break
  sleep 1
done

echo "==> While the backend is down the page must say UNAVAILABLE, not EMPTY"
DOWN_HTML="$(page_html)"
if echo "$DOWN_HTML" | grep -q 'data-testid="listUnavailable"'; then
  echo "     ✓ the page reports the outage"
else
  if echo "$DOWN_HTML" | grep -q "No hackathons have been published yet"; then
    fail "the page claims an EMPTY PLATFORM while the backend is down — this is the bug"
  elif [ -z "$DOWN_HTML" ]; then
    fail "the page did not render at all while the backend was down (it used to degrade)"
  else
    fail "the page neither reported the outage nor rendered the empty state"
  fi
fi

echo "==> Starting the backend"
pc process start backend
S=$(date +%s)
while :; do
  [ "$(rpc_count)" -gt 0 ] && break
  if [ $(($(date +%s) - S)) -gt 600 ]; then
    echo "error: the backend did not come back within 600s — not a channel problem." >&2
    exit 1
  fi
  sleep 5
done
HEALTHY_AT=$(date +%s)
echo "     gRPC answers again after $((HEALTHY_AT - S))s"

# THE assertion. The lag allowed here is a channel reconnect, not a boot: the
# capped backoff is 2s, so 60s is ~30x headroom and still an order of magnitude
# below the 120s default that caused the incident. If this ever needs raising,
# the channel options in client.ts regressed — raise those, not this.
echo "==> The page must agree with gRPC again"
LAG=-1
for _ in $(seq 1 20); do
  if [ "$(page_count)" -eq "$(rpc_count)" ] && [ "$(page_count)" -gt 0 ]; then
    LAG=$(($(date +%s) - HEALTHY_AT))
    break
  fi
  sleep 3
done
if [ "$LAG" -lt 0 ]; then
  fail "the page still disagrees with gRPC 60s after the backend was healthy (page=$(page_count) grpc=$(rpc_count)) — the channel did not reconnect"
else
  echo "     ✓ the page recovered ${LAG}s after the backend was healthy"
fi

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "FAILED — a backend restart is visible to users of :8081." >&2
  exit 1
fi
echo ""
echo "PASSED — a backend restart heals itself, and an outage never reads as an empty platform."
