#!/usr/bin/env bash
# AWS SigV4, query-string ("presigned") flavour — a line-for-line mirror of
# components/backend/internal/storage/sigv4.go and the PresignPut/PresignGet
# wrappers in client.go.
#
#   bash presign.sh put <key> <content-type> <size-bytes> [ttl-seconds]
#   bash presign.sh get <key> [ttl-seconds]
#   bash presign.sh put --direct <key> …      # absolute URL at the store
#
# `put` prints the ROOT-RELATIVE browser URL the backend would hand out —
# `<publicPrefix>/<bucket>/<key>?X-Amz-…` — because that is the value the whole
# /objects contract is about. `--direct` prints the absolute URL at the store
# instead, which is what the leg of the test that bypasses the ingress uses.
#
# WHY THIS EXISTS AT ALL, rather than calling StorageService.CreateUploadUrl:
# the published images (ghcr.io/…/backend-service:latest) predate the storage
# work on this branch — their binary contains no `internal/storage` package and
# no CreateUploadUrl — so there is no deployed handler to ask. Signing here is
# also the more honest test of the claim under examination: the claim is about
# what the INGRESS does to a signed request, and this makes the signature the
# known quantity.
#
# Mirrored exactly, because each of these is a way to be silently wrong:
#   * signed headers are host + content-type + content-length for PUT, host
#     alone for GET (client.go PresignPut/PresignGet);
#   * the payload hash is the literal UNSIGNED-PAYLOAD;
#   * `/` is left alone in the path and encoded in the query (uriEncode's
#     encodeSlash);
#   * the signed Host carries the PORT, and under virtual-hosted style the
#     bucket prefix — the same rule as `hackagon.storageSignHost` in the chart.
#
# Limitation, stated rather than discovered: uriEncode here is byte-wise over
# ASCII. Keys with non-ASCII characters would need the multi-byte loop that
# sigv4.go has; the rig only ever signs ASCII keys.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ALGORITHM="AWS4-HMAC-SHA256"
TERMINATOR="aws4_request"
S3SERVICE="s3"
UNSIGNED_PAYLOAD="UNSIGNED-PAYLOAD"

# --- configuration, same shape as config.StorageConfig -----------------
load_secrets
ACCESS_KEY="${STORAGE_ACCESS_KEY:?}"
SECRET_KEY="${STORAGE_SECRET_KEY:?}"
REGION="${RIG_STORAGE_REGION:-us-east-1}"
BUCKET="$STORE_BUCKET"
PUBLIC_PREFIX="${RIG_PUBLIC_PREFIX:-/objects}"
USE_PATH_STYLE="${RIG_USE_PATH_STYLE:-1}"

if [ "$USE_PATH_STYLE" = 1 ]; then
    SIGN_HOST="$STORE_HOST:$STORE_PORT"
else
    SIGN_HOST="$BUCKET.$STORE_HOST:$STORE_PORT"
fi
DIRECT_BASE="http://$SIGN_HOST"

# --- primitives --------------------------------------------------------
uriencode() { # value encode_slash(0|1)
    local s="$1" slash="${2:-0}" out="" i c
    local LC_ALL=C
    for ((i = 0; i < ${#s}; i++)); do
        c="${s:i:1}"
        case "$c" in
        [a-zA-Z0-9._~-]) out+="$c" ;;
        /) if [ "$slash" = 1 ]; then out+="%2F"; else out+="/"; fi ;;
        *) out+="$(printf '%%%02X' "'$c")" ;;
        esac
    done
    printf '%s' "$out"
}

sha256hex() { printf '%s' "$1" | openssl dgst -sha256 -r | awk '{print $1}'; }
tohex() { printf '%s' "$1" | od -An -tx1 | tr -d ' \n'; }
hmachex() { printf '%s' "$2" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$1" -r | awk '{print $1}'; }

signing_key() { # datestamp -> hex
    local k
    k="$(hmachex "$(tohex "AWS4$SECRET_KEY")" "$1")"
    k="$(hmachex "$k" "$REGION")"
    k="$(hmachex "$k" "$S3SERVICE")"
    hmachex "$k" "$TERMINATOR"
}

canonical_uri() { # key
    local key="$1"
    if [ "$USE_PATH_STYLE" = 1 ]; then
        if [ -z "$key" ]; then
            printf '/%s' "$(uriencode "$BUCKET" 0)"
        else printf '/%s/%s' "$(uriencode "$BUCKET" 0)" "$(uriencode "$key" 0)"; fi
    else
        if [ -z "$key" ]; then
            printf '/'
        else printf '/%s' "$(uriencode "$key" 0)"; fi
    fi
}

# presign METHOD KEY TTL SIGNED_HEADER_LINES...
# SIGNED_HEADER_LINES are "name:value" with the name already lowercased; `host`
# is added here because SigV4 requires it and because it is the one header a
# proxy in front of the store rewrites.
presign() {
    local method="$1" key="$2" ttl="$3"
    shift 3
    local amz_date datestamp scope uri raw_query
    amz_date="$(date -u +%Y%m%dT%H%M%SZ)"
    datestamp="$(date -u +%Y%m%d)"
    scope="$datestamp/$REGION/$S3SERVICE/$TERMINATOR"

    local lines=("$@" "host:$SIGN_HOST")
    # canonicalHeaders: sorted by name, "name:value\n" each, names ';'-joined.
    local sorted names="" block=""
    sorted="$(printf '%s\n' "${lines[@]}" | LC_ALL=C sort)"
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        names="${names:+$names;}${line%%:*}"
        block+="$line"$'\n'
    done <<<"$sorted"

    # canonicalQuery: names sorted, both halves encoded with '/' escaped. The
    # five parameters below already sort into this order.
    raw_query="X-Amz-Algorithm=$(uriencode "$ALGORITHM" 1)"
    raw_query+="&X-Amz-Credential=$(uriencode "$ACCESS_KEY/$scope" 1)"
    raw_query+="&X-Amz-Date=$amz_date"
    raw_query+="&X-Amz-Expires=$ttl"
    raw_query+="&X-Amz-SignedHeaders=$(uriencode "$names" 1)"

    uri="$(canonical_uri "$key")"

    local canonical_request string_to_sign signature
    canonical_request="$method"$'\n'"$uri"$'\n'"$raw_query"$'\n'"$block"$'\n'"$names"$'\n'"$UNSIGNED_PAYLOAD"
    string_to_sign="$ALGORITHM"$'\n'"$amz_date"$'\n'"$scope"$'\n'"$(sha256hex "$canonical_request")"
    signature="$(hmachex "$(signing_key "$datestamp")" "$string_to_sign")"

    PRESIGN_URI="$uri"
    PRESIGN_QUERY="$raw_query&X-Amz-Signature=$signature"
}

# --- CLI ---------------------------------------------------------------
main() {
    local direct=0
    local verb="${1:-}"
    shift || true
    if [ "${1:-}" = "--direct" ]; then
        direct=1
        shift
    fi

    case "$verb" in
    put)
        local key="$1" ctype="$2" size="$3" ttl="${4:-300}"
        presign PUT "$key" "$ttl" "content-type:$ctype" "content-length:$size"
        ;;
    get)
        local key="$1" ttl="${2:-300}"
        presign GET "$key" "$ttl"
        ;;
    *)
        say "usage: presign.sh put [--direct] <key> <content-type> <size> [ttl]"
        say "       presign.sh get [--direct] <key> [ttl]"
        exit 2
        ;;
    esac

    if [ "$direct" = 1 ]; then
        printf '%s%s?%s\n' "$DIRECT_BASE" "$PRESIGN_URI" "$PRESIGN_QUERY"
    else
        printf '%s%s?%s\n' "$PUBLIC_PREFIX" "$PRESIGN_URI" "$PRESIGN_QUERY"
    fi
}

# Only run the CLI when executed, so verify.sh can source this for presign().
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
