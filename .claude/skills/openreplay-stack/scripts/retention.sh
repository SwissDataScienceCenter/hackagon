#!/usr/bin/env bash
# Bound how long recorded sessions live.
#
# WHY THIS SCRIPT EXISTS AT ALL. OpenReplay's docker-compose distribution has
# no retention setting — checked, not assumed: `vendor/docker-envs/*.env` has
# nothing of the kind (`FS_CLEAN_HRS=24` is about scratch files on a
# container's own filesystem, not about stored sessions), and
# `vendor/migration-files/init_ch_schema.sql` gives `experimental.sessions`
# no TTL. Retention limits in the product are an EE feature. So a self-hosted
# rig keeps every recording of every visitor forever, which is not a defensible
# default for data collected under a consent banner that says "to find broken
# buttons".
#
# WHAT A SESSION IS MADE OF, and therefore what has to be deleted. Four stores,
# and deleting from one leaves the others holding the same visit:
#
#   object store   mobs/<session_id>/dom.mobs and /devtools.mob — THE RECORDING
#                  ITSELF, the DOM stream the replayer plays back
#   postgres       public.sessions plus ~20 event tables; every one of those is
#                  ON DELETE CASCADE off session_id, so the parent row is the
#                  only delete needed (verified against pg_constraint)
#   clickhouse     experimental.sessions (analytics), plus the by-session_id
#                  tables user_viewed_sessions / user_favorite_sessions and
#                  product_analytics.events
#   -              nothing in Hackagon. There is no session id on our side to
#                  clean up, by design (docs/frontend/session-replay.md).
#
# ORDER MATTERS AND IS NOT ARBITRARY. Postgres is where the expired ids are
# ENUMERATED, so it is deleted LAST. A run interrupted after the objects are
# gone leaves rows pointing at nothing — ugly, and fixed by the next run. The
# reverse order would leave orphaned recordings that nothing can enumerate any
# more: undeletable except by wiping the bucket.
#
# Usage:
#   retention.sh                      # dry run, 30 days — prints what it WOULD delete
#   retention.sh --days 7 --apply     # delete sessions older than 7 days
#   retention.sh --install-ttl        # also give ClickHouse a declarative TTL
#
# `--install-ttl` is the closest thing to a built-in setting: ClickHouse drops
# expired parts on its own schedule with no cron. It cannot replace this script
# — it reaches neither the object store nor Postgres, which is where the actual
# recording and the actual personal data live — but it does mean the analytics
# side stays bounded even if nobody ever runs the purge again.
#
# Scheduling: this is a debugging rig, so there is no daemon. Run it from cron
# or a scheduled task:
#   0 4 * * *  bash /path/to/.claude/skills/openreplay-stack/scripts/retention.sh --days 30 --apply
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

DAYS=30
APPLY=0
INSTALL_TTL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --days) DAYS="${2:?--days needs a number}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --install-ttl) INSTALL_TTL=1; shift ;;
    -h | --help) sed -n '2,50p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "error: unknown option $1" >&2; exit 2 ;;
  esac
done

case "$DAYS" in
  '' | *[!0-9]*) echo "error: --days must be a whole number of days" >&2; exit 2 ;;
esac

require_docker

# The containers are named, not compose-scaled, so address them directly —
# `compose exec` would need the vendor tree present and this script should work
# against a stack somebody else started.
pg() { docker exec -i postgres sh -lc 'PGPASSWORD="$POSTGRESQL_PASSWORD" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc "$(cat)"'; }
ch() { docker exec -i clickhouse sh -lc 'clickhouse-client --multiquery -q "$(cat)"'; }

for c in postgres clickhouse chalice minio; do
  docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true || {
    echo "error: container '$c' is not running — is the stack up? (scripts/up.sh)" >&2
    exit 1
  }
done

# The object purge, run inside `chalice` (it is the container that already has
# boto3 and the S3 credentials). Session ids arrive on STDIN, one per line, so
# no list is ever interpolated into a command line.
PURGE_OBJECTS='
import os, sys, boto3
s3 = boto3.client(
    "s3",
    endpoint_url="http://minio.db.svc.cluster.local:9000",
    aws_access_key_id=os.environ["S3_KEY"],
    aws_secret_access_key=os.environ["S3_SECRET"],
    region_name="us-east-1",
)
bucket = os.environ.get("sessions_bucket", "mobs")
removed = 0
for line in sys.stdin:
    sid = line.strip()
    if not sid:
        continue
    # Paginated: a long session can hold many canvas/image parts, and
    # list_objects_v2 caps at 1000 keys per call.
    token = None
    while True:
        kw = {"Bucket": bucket, "Prefix": sid + "/"}
        if token:
            kw["ContinuationToken"] = token
        page = s3.list_objects_v2(**kw)
        keys = [{"Key": o["Key"]} for o in page.get("Contents", [])]
        if keys:
            s3.delete_objects(Bucket=bucket, Delete={"Objects": keys})
            removed += len(keys)
        if not page.get("IsTruncated"):
            break
        token = page.get("NextContinuationToken")
print("    removed %d objects" % removed)
'

CUTOFF_MS=$(( ($(date -u +%s) - DAYS * 86400) * 1000 ))
echo "==> Retention: ${DAYS} days (sessions started before $(date -u -d "@$((CUTOFF_MS / 1000))" +%Y-%m-%dT%H:%M:%SZ))"
[ "$APPLY" -eq 1 ] || echo "    DRY RUN — nothing will be deleted. Add --apply."

# ---------------------------------------------------------------- enumerate --
IDS="$(printf 'SELECT session_id FROM public.sessions WHERE start_ts < %s ORDER BY session_id;' "$CUTOFF_MS" | pg)"
COUNT="$(printf '%s' "$IDS" | grep -c . || true)"
TOTAL="$(printf 'SELECT count(*) FROM public.sessions;' | pg)"
echo "==> ${COUNT} of ${TOTAL} recorded sessions are past the cutoff."

if [ "$COUNT" -eq 0 ]; then
  echo "    Nothing to purge."
else
  if [ "$APPLY" -eq 0 ]; then
    printf '%s\n' "$IDS" | head -20 | sed 's/^/    would delete session /'
    [ "$COUNT" -gt 20 ] && echo "    ... and $((COUNT - 20)) more"
  else
    # --------------------------------------------------- 1. the recordings --
    # boto3 lives in chalice and already holds the S3 credentials; the ids
    # arrive on stdin so no list is ever interpolated into a command line.
    echo "==> Deleting objects under mobs/<session_id>/ ..."
    # `python -c "$PURGE"` and NOT `python - <<PY`: a heredoc IS stdin, so it
    # would take the file descriptor the session ids arrive on and the loop
    # below would read nothing — deleting no objects while reporting success.
    printf '%s\n' "$IDS" | docker exec -i chalice python -c "$PURGE_OBJECTS"

    # ----------------------------------------------------- 2. the analytics --
    echo "==> Deleting ClickHouse rows ..."
    ch <<CH
ALTER TABLE experimental.sessions DELETE WHERE datetime < toDateTime(${CUTOFF_MS} / 1000);
ALTER TABLE experimental.ios_events DELETE WHERE datetime < toDateTime(${CUTOFF_MS} / 1000);
ALTER TABLE product_analytics.events DELETE WHERE created_at < toDateTime(${CUTOFF_MS} / 1000);
ALTER TABLE experimental.user_viewed_sessions DELETE WHERE session_id NOT IN (
  SELECT session_id FROM experimental.sessions
);
ALTER TABLE experimental.user_favorite_sessions DELETE WHERE session_id NOT IN (
  SELECT session_id FROM experimental.sessions
);
CH

    # ------------------------------------------------------ 3. the metadata --
    # Last, on purpose: this is the list the other two steps are derived from.
    echo "==> Deleting Postgres rows (events cascade) ..."
    printf 'DELETE FROM public.sessions WHERE start_ts < %s;' "$CUTOFF_MS" | pg >/dev/null
    echo "    ${COUNT} sessions purged."
  fi
fi

# ------------------------------------------------------------ declarative --
if [ "$INSTALL_TTL" -eq 1 ]; then
  if [ "$APPLY" -eq 0 ]; then
    echo "==> Would set a ${DAYS}-day TTL on experimental.sessions / ios_events / product_analytics.events"
  else
    echo "==> Installing ${DAYS}-day ClickHouse TTLs ..."
    ch <<CH
ALTER TABLE experimental.sessions MODIFY TTL datetime + INTERVAL ${DAYS} DAY;
ALTER TABLE experimental.ios_events MODIFY TTL datetime + INTERVAL ${DAYS} DAY;
ALTER TABLE product_analytics.events MODIFY TTL created_at + INTERVAL ${DAYS} DAY;
CH
    echo "    ClickHouse will now expire those tables on its own."
    echo "    NOTE: this does NOT cover the recordings themselves or Postgres."
    echo "    Keep running this script for those."
  fi
fi
