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
REFRESH=0
FILES=()
while [ $# -gt 0 ]; do
    case "$1" in
    --dry-run) DRY=1 ;;
    --refresh) REFRESH=1 ;;
    -h | --help)
        sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
        exit 0
        ;;
    *) FILES+=("$1") ;;
    esac
    shift
done
[ ${#FILES[@]} -eq 0 ] && FILES=("$SKILL_DIR"/data/*.json)

for bin in grpcurl jq curl; do
    command -v "$bin" >/dev/null 2>&1 || {
        echo "error: $bin not found — run inside the Nix dev shell (just develop)" >&2
        exit 1
    }
done

TOKEN=$(curl -s -X POST "$KC/realms/hackagon/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d client_id="hackagon-backend" -d username="$ADMIN_USER" -d password="$ADMIN_PASS" \
    -d grant_type=password -d scope="openid profile" | jq -r .access_token)
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "error: could not get an admin token from $KC" >&2
    exit 1
fi

rpc() { grpcurl -plaintext -H "authorization: Bearer $TOKEN" -d "$2" "$GRPC" "$1"; }

# ── media ────────────────────────────────────────────────────────────────────
# Every edition shipped with `logo: ""` and ORD 2024's pages pointed at
# /images/hackathon-ord-2024/... — paths that resolve to nothing on this
# platform, so the archive rendered as text with four broken images. The files
# were on disk in static/ the whole time; what was missing was somewhere to put
# them. StorageService presigns a PUT, the browser (here: curl) uploads
# directly, and the DB stores the returned public path.

content_type_for() {
    case "${1##*.}" in
    webp) echo "image/webp" ;;
    png) echo "image/png" ;;
    jpg | jpeg) echo "image/jpeg" ;;
    gif) echo "image/gif" ;;
    *) echo "" ;; # unknown, and svg is refused on purpose — see below
    esac
}

# CreateUploadUrl returns a ROOT-RELATIVE url — right for a browser, which PUTs
# same-origin — so a CLI has to supply the host. Not just any host: SigV4 signs
# Host, and the backend signs for the object store, so the upload only verifies
# through a proxy that rewrites Host to it (vite's `changeOrigin` in dev,
# caddy's `header_up Host {upstream_hostport}` for the tunnel). Rather than
# guess which is live, try each and keep whichever the STORE accepts — a base
# that serves /objects but does not rewrite Host answers 403, and would be the
# wrong pick even though it is reachable.
OBJECTS_BASE="${HACKAGON_OBJECTS_BASE:-}"
tunnel_url() {
    bash "$ROOT_DIR/.claude/skills/cloudflare-tunnel/scripts/url.sh" 2>/dev/null |
        awk '{print $NF}' | grep -E '^https://' | tail -1
}
STORE_ENDPOINT="${HACKAGON_STORE_ENDPOINT:-http://rustfs:9000}"

candidate_bases() {
    [ -n "$OBJECTS_BASE" ] && {
        echo "$OBJECTS_BASE"
        return
    }
    # The store itself, first. `/objects` is a BROWSER-facing prefix — the backend
    # signs the request against the store's own host and path, so stripping the
    # prefix and going straight there is the one target that needs no proxy and
    # matches the signature exactly. It is also the only one that works
    # unattended: the vite proxy may be down, and the production server does not
    # proxy /objects at all — a PUT there hits SvelteKit's auth guard and comes
    # back 303, which is not obviously an upload failure when you read the log.
    echo "STORE"
    tunnel_url
    echo "http://localhost:8081"
    echo "http://localhost:8082"
}

# Where to PUT for a given base: the store wants the key without /objects,
# everything else is a same-origin proxy that expects the path as issued.
put_target() {
    local b="$1" url="$2"
    if [ "$b" = "STORE" ]; then echo "${STORE_ENDPOINT}${url#/objects}"; else echo "${b}${url}"; fi
}

# upload <hackathon-id> <file> <kind> → prints the public URL, or nothing.
upload() {
    local hid="$1" path="$2" kind="$3"
    local base ctype size req resp url pub code
    base="$(basename "$path")"
    ctype="$(content_type_for "$base")"

    if [ -z "$ctype" ]; then
        # image/svg+xml is excluded by the backend deliberately: /objects is served
        # from the app's own origin, so a stored SVG is script running as the
        # application. Skipping loudly beats a confusing InvalidArgument.
        echo "   [~] $base skipped — $([ "${base##*.}" = svg ] &&
            echo "SVG is refused on purpose (script on our own origin)" ||
            echo "unsupported type")" >&2
        return 0
    fi

    size=$(stat -c%s "$path")
    req=$(jq -nc --arg k "$kind" --arg o "$hid" --arg f "$base" --arg c "$ctype" \
        --argjson s "$size" '{kind:$k, ownerId:$o, filename:$f, contentType:$c, sizeBytes:$s}')
    resp=$(rpc storage.StorageService/CreateUploadUrl "$req" 2>/dev/null) || return 0
    url=$(jq -r '.uploadUrl // empty' <<<"$resp")
    pub=$(jq -r '.publicUrl // empty' <<<"$resp")
    [ -z "$url" ] && return 0

    # The declared content type is baked into the SIGNATURE, so sending a
    # different one here fails at the object store with SignatureDoesNotMatch.
    for b in $(candidate_bases); do
        code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
            -H "Content-Type: $ctype" --data-binary "@$path" "$(put_target "$b" "$url")")
        if [ "$code" = "200" ] || [ "$code" = "204" ]; then
            [ -z "$OBJECTS_BASE" ] && {
                OBJECTS_BASE="$b"
                echo "   [i] uploading via $b" >&2
            }
            echo "$pub"
            return 0
        fi
    done
    echo "   ✕ upload of $base failed (last HTTP $code) — no base both served /objects and rewrote Host" >&2
    return 0
}

existing=$(rpc hackathon.HackathonService/List '{}' | jq -r '.hackathons[]?.name' || true)

for f in "${FILES[@]}"; do
    name=$(jq -r .name "$f")
    echo "── $(basename "$f") — $name"

    # --refresh re-applies media and pages to an edition that already exists.
    # Plain seeding is idempotent by NAME, which is right for "run it twice" and
    # exactly wrong after the seeder itself changes: the events were created
    # before it uploaded anything, so skipping them left every cover empty
    # forever. Deleting and re-seeding is not the alternative — phases and tracks
    # hold foreign keys, so Delete answers "archive it instead".
    hid=""
    FRESH=1
    if grep -Fxq "$name" <<<"$existing"; then
        if [ "$REFRESH" -eq 0 ]; then
            echo "   [=] already present, skipping (use --refresh to re-apply media and pages)"
            continue
        fi
        hid=$(rpc hackathon.HackathonService/List '{}' |
            jq -r --arg n "$name" '.hackathons[]? | select(.name == $n) | .id')
        [ -z "$hid" ] && {
            echo "   ✕ present but not findable by name" >&2
            continue
        }
        FRESH=0
        echo "   [~] refreshing $hid"
        # Pages are recreated from the JSON below, so clear them first rather than
        # ending up with two of each.
        for p in $(rpc hackathon.PageService/List "$(jq -nc --arg h "$hid" '{hackathonId:$h}')" 2>/dev/null |
            jq -r '.pages[]?.id'); do
            rpc hackathon.PageService/Delete "$(jq -nc --arg p "$p" '{pageId:$p}')" >/dev/null 2>&1 || true
        done
    fi
    if [ "$DRY" -eq 1 ]; then
        echo "   [dry-run] would create: $(jq -r '"\(.tracks|length) tracks, \(.phases|length) phases, \(.pages|length) pages, \(.media.images|length) images"' "$f")"
        continue
    fi

    if [ -z "$hid" ]; then
        payload=$(jq -c '{name, description, visibility, startsAt, endsAt, logo}' "$f")
        hid=$(rpc hackathon.HackathonService/Create "$payload" | jq -r .hackathonId)
        [ -z "$hid" ] || [ "$hid" = "null" ] && {
            echo "   ✕ create failed" >&2
            exit 1
        }
        echo "   [+] hackathon $hid"
    fi

    # media — after Create, because the upload key is derived from the hackathon
    # id and casbin authorises the presign against it.
    slug=$(jq -r .slug "$f")
    MEDIA_DIR="$SKILL_DIR/static/$slug"
    declare -A PUBLIC=()
    cover=""
    n=$(jq '.media.images | length' "$f")
    for i in $(seq 0 $((n - 1))); do
        [ "$n" -eq 0 ] && break
        file=$(jq -r ".media.images[$i].file" "$f")
        cat_=$(jq -r ".media.images[$i].category // \"\"" "$f")
        src="$MEDIA_DIR/$file"
        [ -f "$src" ] || {
            echo "   [~] $file missing from static/$slug — run fetch-media.sh" >&2
            continue
        }

        # The banner is the event's face, so it becomes the logo; everything else is
        # gallery media. First image wins if nothing is marked.
        if [ -z "$cover" ] && { [ "$cat_" = "banner" ] || [ "$cat_" = "cover" ] || [ "$i" = "0" ]; }; then
            kind="UPLOAD_KIND_HACKATHON_LOGO"
        else
            kind="UPLOAD_KIND_HACKATHON_MEDIA"
        fi

        pub=$(upload "$hid" "$src" "$kind") || true
        [ -z "$pub" ] && continue
        PUBLIC["$file"]="$pub"
        [ "$kind" = "UPLOAD_KIND_HACKATHON_LOGO" ] && [ -z "$cover" ] && cover="$pub"
        echo "   [↑] $file → $pub"
    done

    if [ -n "$cover" ]; then
        rpc hackathon.HackathonService/Edit \
            "$(jq -nc --arg h "$hid" --arg l "$cover" '{hackathonId:$h, logo:$l}')" >/dev/null &&
            echo "   [+] cover set"
    fi

    # tracks — first create only; a refresh would duplicate them (there is no
    # natural key to match on, and Create does not dedupe).
    n=0
    [ "${FRESH:-1}" -eq 1 ] && n=$(jq '.tracks|length' "$f")
    for i in $(seq 0 $((n - 1))); do
        [ "$n" -eq 0 ] && break
        t=$(jq -c --arg h "$hid" ".tracks[$i] | {hackathonId:\$h, name, description}" "$f")
        rpc hackathon.TrackService/Create "$t" >/dev/null && echo "   [+] track $(jq -r ".tracks[$i].name" "$f")"
    done

    # phases (Create drops dates — bug B4 — so Edit them in afterwards).
    # First create only, same reason as tracks.
    n=0
    [ "${FRESH:-1}" -eq 1 ] && n=$(jq '.phases|length' "$f")
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

    # pages — markdown, with every image path repointed at what we just uploaded.
    # The paths in the JSON are the OLD platform's (/images/hackathon-ord-2024/…)
    # and resolve to nothing here, so without this rewrite the archive's photo
    # pages render as four broken images. Matched on basename: the old tree had a
    # category folder per image that this platform has no equivalent for.
    n=$(jq '.pages|length' "$f")
    for i in $(seq 0 $((n - 1))); do
        [ "$n" -eq 0 ] && break
        content=$(jq -r ".pages[$i].content" "$f")
        for file in "${!PUBLIC[@]}"; do
            content=${content//"/images/"*"/$file"/${PUBLIC[$file]}}
            content=${content//"$file"/${PUBLIC[$file]}}
        done
        pg=$(jq -nc --arg h "$hid" --arg t "$(jq -r ".pages[$i].title" "$f")" \
            --arg c "$content" --argjson v "$(jq ".pages[$i].visible" "$f")" \
            '{hackathonId:$h, title:$t, content:$c, visible:$v}')
        rpc hackathon.PageService/Create "$pg" >/dev/null && echo "   [+] page $(jq -r ".pages[$i].title" "$f")"
    done

    # A gallery page for editions whose photos were never referenced by any page —
    # uploading them and leaving them unreachable would be the same "exists but
    # nothing links to it" bug the reachability audits keep finding.
    gallery=""
    for file in "${!PUBLIC[@]}"; do
        [ "${PUBLIC[$file]}" = "$cover" ] && continue
        grep -q "$file" <<<"$(jq -r '.pages[]?.content' "$f")" && continue
        cap=$(jq -r --arg fl "$file" '.media.images[] | select(.file==$fl) | .caption // ""' "$f")
        gallery+="![${cap}](${PUBLIC[$file]})

*${cap}*

"
    done
    if [ -n "$gallery" ]; then
        rpc hackathon.PageService/Create \
            "$(jq -nc --arg h "$hid" --arg c "## Photos

$gallery" '{hackathonId:$h, title:"Photos", content:$c, visible:true}')" >/dev/null &&
            echo "   [+] page Photos (generated from unreferenced media)"
    fi
    unset PUBLIC

    echo "   ✓ done — status will render as Finished (dates are in the past)"
done

echo ""
echo "Seeded. Browse them at http://localhost:8081"
