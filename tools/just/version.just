set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`
version_file := root_dir + "/VERSION"
pkg_file := root_dir + "/components/frontend/package.json"

[private]
default:
    just --list --unsorted -f "{{ source_file() }}"

[group('version')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Version Commands${reset}"
    echo ""
    echo -e "  ${cyan}just version::show${reset}"
    echo -e "  ${dim}Print the declared version and what a build stamps into the footer${reset}"
    echo ""
    echo -e "  ${cyan}just version::bump${reset} patch|minor|major"
    echo -e "  ${dim}Edit VERSION, commit it, and create the matching annotated tag${reset}"
    echo ""
    echo -e "  ${cyan}just version::tag${reset}"
    echo -e "  ${dim}Tag HEAD with the version already declared in VERSION${reset}"
    echo ""
    echo -e "  ${dim}VERSION at the repo root is the single source of truth. The${reset}"
    echo -e "  ${dim}frontend reads it at build time — see components/frontend/vite.config.ts.${reset}"
    echo ""

# Print the declared version and the string a build stamps into the footer.
[group('version')]
show:
    #!/usr/bin/env bash
    set -eu
    declared=$(tr -d '[:space:]' <"{{ version_file }}")
    commit=$(git -C "{{ root_dir }}" rev-parse --short=7 HEAD 2>/dev/null || echo "")
    dirty=""
    if [ -n "$(git -C "{{ root_dir }}" status --porcelain 2>/dev/null || true)" ]; then
        dirty="-dirty"
    fi

    # Mirrors the build-version logic in components/frontend/vite.config.ts: a
    # clean checkout sitting on the matching tag is a release and shows a bare
    # version; anything else carries the commit it was built from.
    if [ -z "$dirty" ] && git -C "{{ root_dir }}" tag --points-at HEAD 2>/dev/null |
        grep -qx "v$declared"; then
        build="v$declared"
    else
        build="v$declared"
        # `if`, not `&&`: under `set -e` a false test would abort the recipe.
        if [ -n "$commit" ]; then
            build="$build+$commit"
        fi
        build="$build$dirty"
    fi

    echo "declared  $declared"
    echo "build     $build"
    echo "tags      $(git -C "{{ root_dir }}" tag --list 'v*' | tr '\n' ' ' | sed 's/ $//' || true)"

# Bump VERSION, commit it, and create the matching annotated tag.
# Usage: just version::bump patch|minor|major
[group('version')]
bump part="patch":
    #!/usr/bin/env bash
    set -eu

    if [ -n "$(git -C "{{ root_dir }}" status --porcelain)" ]; then
        echo "Working tree is not clean — a release commit should carry only the" >&2
        echo "version bump. Commit or stash your changes first." >&2
        exit 1
    fi

    current=$(tr -d '[:space:]' <"{{ version_file }}")
    if ! [[ "$current" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "VERSION does not hold a semver x.y.z: '$current'" >&2
        exit 1
    fi

    IFS=. read -r major minor patch <<<"$current"
    case "{{ part }}" in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
        *)
            echo "Unknown part '{{ part }}' — expected major, minor or patch." >&2
            exit 1
            ;;
    esac
    next="$major.$minor.$patch"

    if git -C "{{ root_dir }}" rev-parse -q --verify "refs/tags/v$next" >/dev/null; then
        echo "Tag v$next already exists." >&2
        exit 1
    fi

    echo "$next" >"{{ version_file }}"

    # package.json is private and never published, but a stale version field
    # there is a trap for anyone who reads it as authoritative. Written without
    # `sed -i`, whose syntax differs between GNU and BSD.
    tmp=$(mktemp)
    sed "s/\"version\": \"$current\"/\"version\": \"$next\"/" "{{ pkg_file }}" >"$tmp"
    mv "$tmp" "{{ pkg_file }}"
    if ! grep -q "\"version\": \"$next\"" "{{ pkg_file }}"; then
        echo "Failed to update the version field in {{ pkg_file }}." >&2
        exit 1
    fi

    git -C "{{ root_dir }}" add "{{ version_file }}" "{{ pkg_file }}"
    git -C "{{ root_dir }}" commit -m "chore(release): v$next"
    git -C "{{ root_dir }}" tag -a "v$next" -m "v$next"

    echo ""
    echo "  VERSION  $current -> $next"
    echo "  commit   chore(release): v$next"
    echo "  tag      v$next (annotated)"
    echo ""
    echo "  Push with: git push && git push origin v$next"
    echo ""

# Tag HEAD with the version already declared in VERSION.
# Use this to lay down the first tag, or to tag a bump that was committed by hand.
[group('version')]
tag:
    #!/usr/bin/env bash
    set -eu
    declared=$(tr -d '[:space:]' <"{{ version_file }}")

    if git -C "{{ root_dir }}" rev-parse -q --verify "refs/tags/v$declared" >/dev/null; then
        echo "Tag v$declared already exists at $(git -C "{{ root_dir }}" rev-parse --short=7 "v$declared^{commit}")." >&2
        exit 1
    fi

    git -C "{{ root_dir }}" tag -a "v$declared" -m "v$declared"
    echo "  tag      v$declared (annotated) at $(git -C "{{ root_dir }}" rev-parse --short=7 HEAD)"
    echo "  Push with: git push origin v$declared"
