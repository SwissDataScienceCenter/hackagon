#!/usr/bin/env bash
# OPTIONAL: fetch a couple of well-known Creative-Commons/public-domain files
# from Wikimedia Commons for realistic photo material (e.g. the future
# "photos published" act). The DEFAULT upload fixtures are the generated,
# fully offline files from helpers/files.ts — this script is garnish, never a
# test dependency, and is NOT called by run.sh.
#
# Determinism: remote files can change (re-uploads happen on Commons), so the
# first fetch records sha256 checksums in a lockfile; later fetches verify
# against it and fail loudly on drift (trust-on-first-use).
#
# LICENSING: verify and keep the attribution — ATTRIBUTION.md links each
# file's Commons page, which is authoritative for author and license.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

DEST="$STATE_DIR/uploads/cc"
LOCK="$DEST/checksums.sha256"
mkdir -p "$DEST"

# name|Special:FilePath URL (stable redirect to the current original)
ASSETS=(
  "example.jpg|https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg"
  "png-transparency-demo.png|https://commons.wikimedia.org/wiki/Special:FilePath/PNG_transparency_demonstration_1.png"
)

echo "==> Fetching Creative-Commons sample assets from Wikimedia Commons..."
for entry in "${ASSETS[@]}"; do
  name="${entry%%|*}"
  url="${entry#*|}"
  out="$DEST/$name"
  if [ -f "$out" ]; then
    echo "  [=] $name (already downloaded)"
  else
    echo "  [v] $name"
    curl -fsSL -A "hackagon-e2e/1.0 (dev test fixtures)" -o "$out" "$url"
  fi
done

cat >"$DEST/ATTRIBUTION.md" <<'EOF'
# Attribution — Wikimedia Commons sample assets

Downloaded by `scripts/fetch-cc-assets.sh` for local test fixtures only.
The Commons file pages below are authoritative for author and license —
verify them before using these files anywhere user-facing, and keep the
attribution with the files:

- `example.jpg` — https://commons.wikimedia.org/wiki/File:Example.jpg
- `png-transparency-demo.png` — https://commons.wikimedia.org/wiki/File:PNG_transparency_demonstration_1.png
EOF

if [ -f "$LOCK" ]; then
  echo "==> Verifying checksums against the lockfile..."
  (cd "$DEST" && sha256sum -c "$(basename "$LOCK")")
else
  echo "==> First fetch — recording checksums (trust-on-first-use)..."
  (cd "$DEST" && sha256sum ./*.jpg ./*.png >"$(basename "$LOCK")")
fi
echo "==> CC assets ready in $DEST (see ATTRIBUTION.md)."
