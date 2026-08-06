#!/usr/bin/env bash
# Bootstrap the development object store (the `rustfs` compose service):
# create the bucket(s) the platform uploads into, and — with --selftest —
# prove the endpoint really speaks S3 rather than merely being up.
#
#   docker compose -f .devcontainer/docker-compose.yml up -d rustfs
#   bash .devcontainer/rustfs-init.sh              # create buckets (idempotent)
#   bash .devcontainer/rustfs-init.sh --selftest   # PUT / GET / compare / list
#   bash .devcontainer/rustfs-init.sh --status     # what exists right now
#
# Idempotent: an existing bucket is detected and left alone, and even a bare
# re-create would succeed (see create_bucket). Safe to re-run any time.
#
# No S3 client required. The dev container ships neither `aws` nor `mc`, and
# baking one in would mean editing the image (which recreates `dev` and kills
# the process-compose stack inside it) or a permanent dev-shell change. So the
# ~40 lines below sign requests with SigV4 using curl + openssl, both of which
# are already there. Reach for `nix shell nixpkgs#awscli2 -c aws …` when you
# want a full-featured client for a one-off.
#
# Endpoint resolution, in order:
#   1. $RUSTFS_ENDPOINT, if set.
#   2. http://rustfs:9000 — the compose service name, when it resolves (i.e.
#      we are on the devcontainer network). This is what the backend uses.
#   3. http://localhost:9000 — the port compose publishes to the host. Also
#      where non-Linux shells land, since they have no `getent`.
set -euo pipefail

# --- configuration -----------------------------------------------------
# Defaults MUST match the `rustfs` service in docker-compose.yml. DEV-ONLY
# credentials; see the README before copying them anywhere real.
ACCESS_KEY="${HACKAGON_RUSTFS_ACCESS_KEY:-hackagon-dev}"
SECRET_KEY="${HACKAGON_RUSTFS_SECRET_KEY:-hackagon-dev-secret}"
REGION="${HACKAGON_RUSTFS_REGION:-us-east-1}"
BUCKETS="${HACKAGON_RUSTFS_BUCKET:-hackagon-dev}"

resolve_endpoint() {
    if [ -n "${RUSTFS_ENDPOINT:-}" ]; then
        echo "${RUSTFS_ENDPOINT%/}"
    # The in-container port is fixed at 9000 by RUSTFS_ADDRESS; only the
    # published host port is configurable, hence the asymmetry below.
    elif getent hosts rustfs >/dev/null 2>&1; then
        echo "http://rustfs:9000"
    else
        echo "http://localhost:${HACKAGON_RUSTFS_PORT:-9000}"
    fi
}
ENDPOINT="$(resolve_endpoint)"
HOST="${ENDPOINT#*://}"

for tool in curl openssl od; do
    command -v "$tool" >/dev/null || {
        echo "error: $tool not found (needed to sign S3 requests)" >&2
        exit 1
    }
done

# One scratch dir for the whole run, cleaned once. Per-function `trap … RETURN`
# would be tidier but bash keeps a RETURN trap installed after the function
# that set it returns, so it then fires in the caller against unset locals.
TMPDIR_RUN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_RUN"' EXIT
tmpfile() { mktemp "${TMPDIR_RUN}/XXXXXX"; }

# --- SigV4 -------------------------------------------------------------
# `od -v` matters: without it od collapses repeated input lines to '*' and
# silently corrupts the digest.
hex() { od -An -v -tx1 | tr -d ' \n'; }
sha256_hex() { openssl dgst -sha256 -binary | hex; }
# HMAC-SHA256 with a hex key, printing a hex digest — chains into itself, so
# the whole key-derivation ladder is four calls.
hmac_hex() { openssl dgst -sha256 -mac HMAC -macopt "hexkey:$1" -binary | hex; }

# Percent-encode a path, leaving '/' and the RFC 3986 unreserved set alone.
uri_encode_path() {
    local s="$1" out="" c
    for ((i = 0; i < ${#s}; i++)); do
        c="${s:i:1}"
        case "$c" in
        [a-zA-Z0-9._~/-]) out+="$c" ;;
        *) out+="$(printf '%%%02X' "'$c")" ;;
        esac
    done
    printf '%s' "$out"
}

# s3_request <METHOD> <uri-path> <canonical-query> <payload-file> <out-file>
#
# The query string must already be sorted and encoded — every caller here uses
# either "" or a single fixed parameter, so a general encoder would be dead
# code. Prints the HTTP status; the body lands in <out-file>.
s3_request() {
    local method="$1" path="$2" query="${3:-}" payload="${4:-}" out="${5:-/dev/null}"

    local amzdate datestamp payload_hash canonical_uri
    amzdate="$(date -u +%Y%m%dT%H%M%SZ)"
    datestamp="${amzdate%%T*}"
    canonical_uri="$(uri_encode_path "$path")"

    if [ -n "$payload" ]; then
        payload_hash="$(sha256_hex <"$payload")"
    else
        payload_hash="$(printf '' | sha256_hex)"
    fi

    local signed_headers="host;x-amz-content-sha256;x-amz-date"
    local canonical_headers="host:${HOST}
x-amz-content-sha256:${payload_hash}
x-amz-date:${amzdate}
"
    local canonical_request="${method}
${canonical_uri}
${query}
${canonical_headers}
${signed_headers}
${payload_hash}"

    local scope="${datestamp}/${REGION}/s3/aws4_request"
    # Digest computed on its own line, not inlined into the assignment: with
    # `local x="$(…)"` the exit status is the one of `local`, so a failing
    # openssl would silently yield an empty digest (shellcheck SC2155).
    local request_hash string_to_sign
    request_hash="$(printf '%s' "$canonical_request" | sha256_hex)"
    string_to_sign="AWS4-HMAC-SHA256
${amzdate}
${scope}
${request_hash}"

    local k
    k="$(printf 'AWS4%s' "$SECRET_KEY" | hex)"
    k="$(printf '%s' "$datestamp" | hmac_hex "$k")"
    k="$(printf '%s' "$REGION" | hmac_hex "$k")"
    k="$(printf '%s' "s3" | hmac_hex "$k")"
    k="$(printf '%s' "aws4_request" | hmac_hex "$k")"
    local signature
    signature="$(printf '%s' "$string_to_sign" | hmac_hex "$k")"

    local auth="AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, \
SignedHeaders=${signed_headers}, Signature=${signature}"

    local url="${ENDPOINT}${canonical_uri}"
    [ -n "$query" ] && url="${url}?${query}"

    local args=(-sS -o "$out" -w '%{http_code}' --max-time 30
        -H "Authorization: ${auth}"
        -H "x-amz-content-sha256: ${payload_hash}"
        -H "x-amz-date: ${amzdate}")
    # `--head`, not `-X HEAD`: with -X curl still expects a response body and
    # blocks until the timeout, because the server correctly sends none.
    if [ "$method" = "HEAD" ]; then
        args+=(--head)
    else
        args+=(-X "$method")
    fi
    # Only PUT carries a body; adding --data-binary to a GET makes curl send
    # one, which changes the request the signature was computed over.
    [ -n "$payload" ] && args+=(--data-binary "@${payload}")

    curl "${args[@]}" "$url"
}

# --- commands ----------------------------------------------------------
wait_ready() {
    local tries="${1:-30}"
    for _ in $(seq "$tries"); do
        # Unauthenticated GET / answers 403 AccessDenied once the S3 router is
        # live; any HTTP status at all means "listening and speaking S3".
        curl -sS -o /dev/null --max-time 2 "${ENDPOINT}/" 2>/dev/null && return 0
        sleep 1
    done
    echo "error: no S3 endpoint at ${ENDPOINT} after ${tries}s." >&2
    echo "       start it with: docker compose -f .devcontainer/docker-compose.yml up -d rustfs" >&2
    return 1
}

create_bucket() {
    local bucket="$1" body status
    body="$(tmpfile)"

    # HEAD first purely for honest reporting. CreateBucket is already
    # idempotent here — in us-east-1 S3 answers 200 (not 409
    # BucketAlreadyOwnedByYou) when you re-create a bucket you own, and rustfs
    # matches that, so a bare PUT could never tell "created" from "existed".
    status="$(s3_request HEAD "/${bucket}" "" "" /dev/null)"
    if [ "$status" = "200" ]; then
        echo "  exists   ${bucket}"
        return 0
    fi

    status="$(s3_request PUT "/${bucket}" "" "" "$body")"
    case "$status" in
    200 | 204 | 409)
        echo "  created  ${bucket}"
        ;;
    *)
        echo "  FAILED   ${bucket} (HTTP ${status})" >&2
        sed 's/^/           /' "$body" >&2
        return 1
        ;;
    esac
}

list_bucket() { # <bucket> [prefix]
    local bucket="$1" prefix="${2:-}" body status query="list-type=2"
    [ -n "$prefix" ] && query="${query}&prefix=${prefix}"
    body="$(tmpfile)"

    status="$(s3_request GET "/${bucket}" "$query" "" "$body")"
    if [ "$status" != "200" ]; then
        echo "  list FAILED (HTTP ${status})" >&2
        sed 's/^/    /' "$body" >&2
        return 1
    fi
    # Good enough for a bootstrap script: the listing XML is flat and rustfs
    # emits one <Key> per object.
    grep -o '<Key>[^<]*</Key>' "$body" | sed -e 's/<[^>]*>//g' || true
}

# Public-read on the imagery prefixes, private everywhere else.
#
# Decided in docs/storage.md: event logos, gallery photos and avatars already
# render on pages that need no login, so serving them from a public prefix gives
# stable URLs that never expire and can be cached — which is also what lets them
# sit in the existing `logo` / `avatar_url` columns with no schema change.
#
# Everything NOT listed here (team submissions, exports) stays private and is
# reached through short-lived presigned GETs, minted only after casbin has
# approved the read. Verify both halves with --selftest.
put_public_policy() {
    local bucket="$1" body policy status
    body="$(tmpfile)"
    policy="$(tmpfile)"

    cat >"$policy" <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadEventImagery",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::${bucket}/hackathons/*",
        "arn:aws:s3:::${bucket}/users/*"
      ]
    }
  ]
}
POLICY

    # Query goes in its own argument: SigV4 signs the canonical query
    # string separately from the path, so folding "?policy=" into the path
    # signs a URI that does not exist and rustfs answers InvalidBucketName.
    status="$(s3_request PUT "/${bucket}" "policy=" "$policy" "$body")"
    case "$status" in
    200 | 204)
        echo "  policy   ${bucket} (public: hackathons/*, users/*)"
        ;;
    *)
        echo "  FAILED   ${bucket} policy (HTTP ${status})" >&2
        sed 's/^/           /' "$body" >&2
        return 1
        ;;
    esac
}

cmd_init() {
    echo "==> Object store ${ENDPOINT}"
    wait_ready
    echo "==> Buckets:"
    for bucket in $BUCKETS; do
        create_bucket "$bucket"
        put_public_policy "$bucket"
    done
    echo "Done. Endpoint ${ENDPOINT}, buckets: ${BUCKETS}"
}

cmd_status() {
    echo "==> Object store ${ENDPOINT}"
    wait_ready 3
    for bucket in $BUCKETS; do
        echo "--- ${bucket}"
        list_bucket "$bucket" | sed 's/^/    /'
    done
}

# Round-trip proof: PUT an object, GET it back, compare BYTES (not just the
# status code), list the bucket, then delete. Being up is not the same as
# being an object store.
# Proves the POLICY, not just the plumbing: an object under a public prefix must
# be readable with no credentials at all, and one under a private prefix must
# not be. Getting this backwards is silent — everything keeps working for
# signed callers while the private half is world-readable — so it is asserted
# rather than assumed.
check_public_policy() {
    local bucket="$1" pub priv pub_code priv_code
    pub="hackathons/_selftest/public-probe.txt"
    priv="teams/_selftest/private-probe.txt"

    echo "==> Policy: unsigned reads"

    # Real files, not process substitution: the payload is read TWICE — once to
    # hash it for the signature, once by curl to send it — and a pipe is empty
    # the second time, which uploads nothing and then 404s on read.
    local pub_body priv_body
    pub_body="$(tmpfile)"
    priv_body="$(tmpfile)"
    printf 'public
' >"$pub_body"
    printf 'private
' >"$priv_body"

    s3_request PUT "/${bucket}/${pub}" "" "$pub_body" /dev/null >/dev/null
    s3_request PUT "/${bucket}/${priv}" "" "$priv_body" /dev/null >/dev/null

    pub_code="$(curl -s -o /dev/null -w '%{http_code}' "${ENDPOINT}/${bucket}/${pub}")"
    priv_code="$(curl -s -o /dev/null -w '%{http_code}' "${ENDPOINT}/${bucket}/${priv}")"

    s3_request DELETE "/${bucket}/${pub}" "" "" /dev/null >/dev/null
    s3_request DELETE "/${bucket}/${priv}" "" "" /dev/null >/dev/null

    echo "  hackathons/* unsigned -> ${pub_code} (want 200)"
    echo "  teams/*      unsigned -> ${priv_code} (want 403)"
    if [ "$pub_code" != "200" ] || [ "$priv_code" = "200" ]; then
        echo "FAIL — the public/private split is not what docs/storage.md says" >&2
        return 1
    fi
}

cmd_selftest() {
    cmd_init
    local bucket key src dst status
    bucket="${BUCKETS%% *}"
    key="_selftest/$(date -u +%Y%m%dT%H%M%SZ)-$$.bin"
    src="$(tmpfile)"
    dst="$(tmpfile)"

    # Binary, not text: catches any encoding/chunking mangling in the path.
    head -c 65536 /dev/urandom >"$src"
    echo
    echo "==> PUT ${bucket}/${key} ($(wc -c <"$src") bytes)"
    status="$(s3_request PUT "/${bucket}/${key}" "" "$src" /dev/null)"
    [ "$status" = "200" ] || {
        echo "  PUT failed (HTTP ${status})" >&2
        return 1
    }
    echo "  HTTP ${status}  sha256=$(sha256_hex <"$src")"

    echo "==> GET ${bucket}/${key}"
    status="$(s3_request GET "/${bucket}/${key}" "" "" "$dst")"
    [ "$status" = "200" ] || {
        echo "  GET failed (HTTP ${status})" >&2
        return 1
    }
    echo "  HTTP ${status}  sha256=$(sha256_hex <"$dst")"

    echo "==> Compare bytes"
    if cmp -s "$src" "$dst"; then
        echo "  OK  $(wc -c <"$dst") bytes identical"
    else
        echo "  MISMATCH — the object came back different" >&2
        return 1
    fi

    echo "==> LIST ${bucket}"
    list_bucket "$bucket" | sed 's/^/  /'

    echo "==> DELETE ${bucket}/${key}"
    status="$(s3_request DELETE "/${bucket}/${key}" "" "" /dev/null)"
    echo "  HTTP ${status}"

    echo
    check_public_policy "$bucket"

    echo "PASS — ${ENDPOINT} round-trips objects over S3 SigV4."
}

case "${1:---init}" in
--init | init | "") cmd_init ;;
--selftest | selftest) cmd_selftest ;;
--status | status) cmd_status ;;
-h | --help)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    ;;
*)
    echo "unknown argument: $1 (try --help)" >&2
    exit 2
    ;;
esac
