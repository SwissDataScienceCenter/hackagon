#!/usr/bin/env bash
# Download / copy every image referenced by data/*.json into static/<slug>/,
# so the skill folder is self-contained (debug hosting — a real image service
# replaces this later; only media[].source changes).
#
#   source: "https://…"   → downloaded
#   source: "repo:path"   → copied from the repo
#
# The stored artefacts are WebP, so a source that is still JPEG/PNG upstream is
# re-encoded on arrival (media[].file ends in .webp, media[].source keeps the
# real provenance URL). That needs cwebp; it is not in the dev shell, so get it
# with `nix shell nixpkgs#libwebp -c bash scripts/fetch-media.sh`.
#
# Checksums are recorded in static/checksums.sha256 (trust-on-first-use): a
# later fetch verifies and fails loudly if a remote file changed.
#
# Usage: fetch-media.sh [--force] [file.json ...]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$HERE")"
ROOT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
STATIC="$SKILL_DIR/static"
LOCK="$STATIC/checksums.sha256"

FORCE=0
FILES=()
while [ $# -gt 0 ]; do
    case "$1" in
    --force) FORCE=1 ;;
    -h | --help)
        sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
        exit 0
        ;;
    *) FILES+=("$1") ;;
    esac
    shift
done
[ ${#FILES[@]} -eq 0 ] && FILES=("$SKILL_DIR"/data/*.json)

command -v jq >/dev/null || {
    echo "error: jq not found (run inside the Nix dev shell)" >&2
    exit 1
}

# Put $1 at $2, re-encoding to WebP when the destination says .webp and the
# bytes are not WebP already. Refuses rather than storing, say, JPEG bytes under
# a .webp name: everything downstream trusts the extension.
place() {
    local from="$1" to="$2"
    if [ "${to##*.}" = "webp" ] && [ "$(head -c4 "$from")" != "RIFF" ]; then
        command -v cwebp >/dev/null || {
            echo "error: $(basename "$to") must be WebP but the source is not; cwebp not found." >&2
            echo "       retry as: nix shell nixpkgs#libwebp -c bash ${BASH_SOURCE[0]}" >&2
            return 1
        }
        cwebp -quiet -q 80 -m 6 -metadata none "$from" -o "$to"
    else
        cp "$from" "$to"
    fi
}
mkdir -p "$STATIC"
got=0
skipped=0
failed=0

for f in "${FILES[@]}"; do
    slug=$(jq -r .slug "$f")
    n=$(jq '.media.images | length' "$f")
    [ "$n" -eq 0 ] && {
        echo "── $slug: no images"
        continue
    }
    echo "── $slug ($n)"
    mkdir -p "$STATIC/$slug"

    for i in $(seq 0 $((n - 1))); do
        file=$(jq -r ".media.images[$i].file" "$f")
        src=$(jq -r ".media.images[$i].source" "$f")
        dest="$STATIC/$slug/$file"

        if [ -f "$dest" ] && [ "$FORCE" -eq 0 ]; then
            echo "   [=] $file"
            skipped=$((skipped + 1))
            continue
        fi

        case "$src" in
        repo:*)
            srcpath="$ROOT_DIR/${src#repo:}"
            if [ -f "$srcpath" ] && place "$srcpath" "$dest"; then
                echo "   [c] $file  ← repo"
            else
                echo "   ✕ missing or unconvertible repo file: $srcpath"
                failed=$((failed + 1))
                continue
            fi
            ;;
        http*)
            tmp=$(mktemp)
            if curl -fsSL -A "hackagon-seed/1.0 (SDSC archive)" -o "$tmp" "$src" && place "$tmp" "$dest"; then
                echo "   [v] $file  ($(du -h "$dest" | cut -f1))"
                rm -f "$tmp"
            else
                echo "   ✕ download failed: $src"
                failed=$((failed + 1))
                rm -f "$tmp" "$dest"
                continue
            fi
            ;;
        *)
            echo "   ✕ unknown source scheme: $src"
            failed=$((failed + 1))
            continue
            ;;
        esac
        got=$((got + 1))
    done
done

# checksums: verify against the lockfile if present, otherwise record.
cd "$STATIC"
if [ -f "$LOCK" ] && [ "$FORCE" -eq 0 ]; then
    echo ""
    echo "── verifying checksums"
    if sha256sum -c --quiet "$(basename "$LOCK")" 2>/dev/null; then
        echo "   all files match the lockfile"
    else
        echo "   ! some files differ from the lockfile (re-run with --force to accept)"
    fi
else
    find . -type f ! -name "checksums.sha256" -print0 | sort -z | xargs -0 sha256sum >"$(basename "$LOCK")"
    echo ""
    echo "── recorded $(wc -l <"$(basename "$LOCK")") checksums"
fi

echo ""
echo "fetched $got · skipped $skipped · failed $failed → $STATIC"
[ "$failed" -eq 0 ]
