#!/usr/bin/env bash
# Validate every data/*.json: JSON well-formed, required fields present, dates
# parseable and in the past, media entries complete, and every referenced file
# present in the skill's own static/ folder (run fetch-media.sh first).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$HERE")"
STATIC="$SKILL_DIR/static"
fail=0

for f in "$SKILL_DIR"/data/*.json; do
    echo "── $(basename "$f")"
    jq empty "$f" 2>/dev/null || {
        echo "   ✕ invalid JSON"
        fail=1
        continue
    }

    slug=$(jq -r '.slug // empty' "$f")
    for field in slug name visibility startsAt endsAt description; do
        v=$(jq -r --arg k "$field" '.[$k] // empty' "$f")
        [ -z "$v" ] && {
            echo "   ✕ missing required field: $field"
            fail=1
        }
    done

    s=$(jq -r .startsAt "$f")
    e=$(jq -r .endsAt "$f")
    if ! date -d "$s" >/dev/null 2>&1 || ! date -d "$e" >/dev/null 2>&1; then
        echo "   ✕ unparseable dates: $s / $e"
        fail=1
    elif [ "$(date -d "$e" +%s)" -ge "$(date +%s)" ]; then
        echo "   ! endsAt is not in the past — will not render as Finished"
    fi

    # media: every entry needs file+source, and the file must be fetched
    n=$(jq '.media.images | length' "$f")
    for i in $(seq 0 $((n - 1))); do
        [ "$n" -eq 0 ] && break
        file=$(jq -r ".media.images[$i].file // empty" "$f")
        src=$(jq -r ".media.images[$i].source // empty" "$f")
        if [ -z "$file" ] || [ -z "$src" ]; then
            echo "   ✕ media[$i] needs both 'file' and 'source'"
            fail=1
            continue
        fi
        if [ -f "$STATIC/$slug/$file" ]; then
            echo "   [x] $slug/$file ($(du -h "$STATIC/$slug/$file" | cut -f1))"
        else
            echo "   ✕ not fetched: static/$slug/$file — run scripts/fetch-media.sh"
            fail=1
        fi
    done

    echo "   $(jq -r '"\(.tracks|length) tracks · \(.phases|length) phases · \(.pages|length) pages · \(.media.images|length) images"' "$f")"
done

echo ""
if [ "$fail" -eq 0 ]; then echo "All editions valid."; else
    echo "Validation failed."
    exit 1
fi
