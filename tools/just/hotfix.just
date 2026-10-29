set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`
version_file := root_dir + "/VERSION"
chart_file := root_dir + "/helm-chart/Chart.yaml"
changelog_file := root_dir + "/CHANGELOG.md"
repo_url := "https://github.com/SwissDataScienceCenter/hackagon"

# Every file that carries a release's version numbers. A fix brought back to
# main must not move main's numbers, so to-main puts these back to main's.
release_files := "VERSION helm-chart/Chart.yaml components/backend/.component.yaml components/frontend/.component.yaml components/frontend/package.json"

[private]
default:
    just --list --unsorted -f "{{ source_file() }}"

[group('hotfix')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Hotfix Commands${reset}"
    echo ""
    echo -e "  ${cyan}just hotfix::start${reset} <name> [line]"
    echo -e "  ${dim}Branch hotfix/<name> from the newest origin/release/* (or release/<line>)${reset}"
    echo -e "  ${dim}and commit the chart bump for the next patch release${reset}"
    echo ""
    echo -e "  ${cyan}just hotfix::check${reset}"
    echo -e "  ${dim}On a release branch: fail unless it is ready for just version::bump patch${reset}"
    echo ""
    echo -e "  ${cyan}just hotfix::to-main${reset} <commit> <name>"
    echo -e "  ${dim}Branch fix/<name> from origin/main and cherry-pick the fix onto it,${reset}"
    echo -e "  ${dim}leaving main's version numbers and chart alone${reset}"
    echo ""
    echo -e "  ${dim}version::bump runs check by itself on a release branch, and refuses${reset}"
    echo -e "  ${dim}anything but a patch there. The whole protocol is in HOTFIX.md.${reset}"
    echo ""

# Branch hotfix/<name> from a release line and commit the chart bump the release
# will need. The chart has to be in the tagged commit — on a release branch only
# a tag publishes anything — so it goes in first, where it cannot be forgotten.
# Usage: just hotfix::start <name> [line], e.g. just hotfix::start results-500 0.12
[group('hotfix')]
start name line="":
    #!/usr/bin/env bash
    set -eu
    cd "{{ root_dir }}"

    if [ -n "$(git status --porcelain)" ]; then
        echo "Working tree is not clean. Commit or stash your changes first." >&2
        exit 1
    fi

    git fetch --quiet --tags origin

    line="{{ line }}"
    if [ -z "$line" ]; then
        # The newest line, which is the one prod runs unless somebody installed
        # an older chart on purpose.
        line=$(git for-each-ref --format='%(refname:lstrip=3)' 'refs/remotes/origin/release/*' |
            sed 's|^release/||' | sort -V | tail -1)
    fi
    base="release/${line#release/}"

    if ! git rev-parse -q --verify "refs/remotes/origin/$base" >/dev/null; then
        echo "There is no origin/$base to branch from." >&2
        exit 1
    fi

    branch="hotfix/{{ name }}"
    if git rev-parse -q --verify "refs/heads/$branch" >/dev/null ||
        git rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null; then
        echo "$branch already exists. Pick another name." >&2
        exit 1
    fi

    # --no-track: the branch is pushed under its own name, not into $base.
    git switch --quiet --no-track -c "$branch" "origin/$base"

    current=$(tr -d '[:space:]' <"{{ version_file }}")
    if ! [[ "$current" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "VERSION does not hold a semver x.y.z: '$current'" >&2
        exit 1
    fi
    IFS=. read -r major minor patch <<<"$current"
    next="$major.$minor.$((patch + 1))"

    chart_version=$(sed -n 's/^version: *//p' "{{ chart_file }}" | head -1)
    app_version=$(sed -n 's/^appVersion: *//p' "{{ chart_file }}" | head -1 | tr -d '"')

    if [ "$app_version" = "$next" ]; then
        # A fix merged before this one already bumped the chart for v$next, and
        # both fixes ship in that one release.
        chart_note="$chart_version, appVersion \"$next\" (already on $base)"
    else
        IFS=. read -r cmajor cminor cpatch <<<"$chart_version"
        next_chart="$cmajor.$cminor.$((cpatch + 1))"

        # Same approach as version::bump: `awk` because `sed -i` differs GNU/BSD
        # and cannot portably stop at the first match. Anchored at column 0, so
        # the dependencies' indented `version:` lines are left alone.
        replace_first() {
            local file="$1" pattern="$2" replacement="$3" tmp
            tmp=$(mktemp)
            awk -v pat="$pattern" -v rep="$replacement" '
                !done && $0 ~ pat { sub(pat, rep); done = 1 }
                { print }
            ' "$file" >"$tmp"
            mv "$tmp" "$file"
        }
        replace_first "{{ chart_file }}" "^version: .*" "version: $next_chart"
        replace_first "{{ chart_file }}" "^appVersion: .*" "appVersion: \"$next\""

        if ! grep -qx "version: $next_chart" "{{ chart_file }}" ||
            ! grep -qx "appVersion: \"$next\"" "{{ chart_file }}"; then
            echo "Failed to update helm-chart/Chart.yaml." >&2
            exit 1
        fi

        git add "{{ chart_file }}"
        git commit --quiet -m "release: update helm chart for app version $next"
        chart_note="$chart_version -> $next_chart, appVersion \"$next\" (committed)"
    fi

    echo ""
    echo "  branch   $branch, from origin/$base"
    echo "  chart    $chart_note"
    echo "  release  v$next, once this is merged"
    echo ""
    echo "  Next:"
    echo "    1. Fix it, with a line under [Unreleased] -> ### Fixed in CHANGELOG.md"
    echo "    2. git push -u origin $branch"
    echo "    3. Open the pull request against $base, not main:"
    echo "       {{ repo_url }}/compare/$base...$branch?expand=1"
    echo ""
    echo "  The rest is in HOTFIX.md."
    echo ""

# Fail unless the current release branch is ready for `just version::bump patch`:
# merged through pull requests and nothing else, the chart already pointing at
# the next patch, and release notes to ship. Lists every problem, not the first.
[group('hotfix')]
check:
    #!/usr/bin/env bash
    set -eu
    cd "{{ root_dir }}"

    branch=$(git symbolic-ref --short -q HEAD || true)
    case "$branch" in
        release/*) ;;
        *)
            echo "Not on a release branch (on '${branch:-a detached HEAD}')." >&2
            echo "A hotfix release is cut from release/X.Y — see HOTFIX.md." >&2
            exit 1
            ;;
    esac

    if ! git fetch --quiet --tags origin; then
        echo "Could not fetch origin, and every check below compares against it." >&2
        exit 1
    fi

    failed=0
    pass() { echo "  ok    $*"; }
    fail() {
        echo "  FAIL  $1" >&2
        shift
        for line in "$@"; do echo "        $line" >&2; done
        failed=1
    }

    current=$(tr -d '[:space:]' <"{{ version_file }}")
    if ! [[ "$current" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "VERSION does not hold a semver x.y.z: '$current'" >&2
        exit 1
    fi
    IFS=. read -r major minor patch <<<"$current"
    next="$major.$minor.$((patch + 1))"

    echo ""
    echo "  $branch, ready for v$next?"
    echo ""

    if [ -z "$(git status --porcelain)" ]; then
        pass "working tree clean"
    else
        fail "working tree not clean" "A release commit carries only the version bump."
    fi

    # The release is cut from what was merged, so the branch must be exactly
    # its remote. Diverged is the usual trap: a commit made here first and then
    # squash-merged through a pull request as a different commit.
    if ! git rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null; then
        fail "origin/$branch does not exist"
    else
        ahead=$(git rev-list --count "origin/$branch..HEAD")
        behind=$(git rev-list --count "HEAD..origin/$branch")
        if [ "$ahead" = 0 ] && [ "$behind" = 0 ]; then
            pass "same commit as origin/$branch"
        elif [ "$ahead" != 0 ] && [ "$behind" != 0 ]; then
            fail "diverged from origin/$branch ($ahead local, $behind remote commits)" \
                "Probably a local commit that was merged through a pull request as a" \
                "different one. Check nothing local is lost, then:" \
                "git reset --hard origin/$branch"
        elif [ "$ahead" != 0 ]; then
            fail "$ahead commit(s) not on origin/$branch" \
                "Everything in a release goes through a pull request into $branch."
        else
            fail "$behind commit(s) behind origin/$branch" "git pull"
        fi
    fi

    if git rev-parse -q --verify "refs/tags/v$next" >/dev/null; then
        fail "tag v$next already exists" \
            "A release image is never overwritten. If its pipeline failed, re-run it;" \
            "if the release itself is wrong, the fix is the next patch."
    else
        pass "tag v$next is free"
    fi

    chart_version=$(sed -n 's/^version: *//p' "{{ chart_file }}" | head -1)
    app_version=$(sed -n 's/^appVersion: *//p' "{{ chart_file }}" | head -1 | tr -d '"')

    if [ "$app_version" = "$next" ]; then
        pass "chart appVersion is $next"
    else
        fail "chart appVersion is \"$app_version\", not \"$next\"" \
            "The tag publishes the chart from the tagged commit, so the bump has to be" \
            "merged into $branch first. just hotfix::start <name> makes that branch."
    fi

    # A chart version is published once. Not newer than the last release's means
    # publish skips it and prod gets no chart for v$next.
    if git rev-parse -q --verify "refs/tags/v$current" >/dev/null; then
        released=$(git show "v$current:helm-chart/Chart.yaml" | sed -n 's/^version: *//p' | head -1)
        newest=$(printf '%s\n%s\n' "$released" "$chart_version" | sort -V | tail -1)
        if [ "$chart_version" != "$released" ] && [ "$newest" = "$chart_version" ]; then
            pass "chart version $chart_version is newer than v$current's $released"
        else
            fail "chart version $chart_version is not newer than v$current's $released" \
                "Bump 'version' in helm-chart/Chart.yaml one patch."
        fi
    else
        pass "no tag v$current to compare the chart version with; skipped"
    fi

    # main and a release line both publish charts, so they must never use the
    # same number — see RELEASING.md, Making a release deployable.
    main_chart=$(git show "origin/main:helm-chart/Chart.yaml" 2>/dev/null | sed -n 's/^version: *//p' | head -1 || true)
    if [ -n "$main_chart" ] && [ "$main_chart" = "$chart_version" ]; then
        fail "chart version $chart_version is also main's" \
            "Whichever publishes second is skipped. main moves to the next minor."
    else
        pass "chart version $chart_version is not main's"
    fi

    entries=$(awk '
        /^## \[Unreleased\]/ { inside = 1; next }
        inside && /^## \[/ { exit }
        inside && /^- / { n++ }
        END { print n + 0 }
    ' "{{ changelog_file }}")
    if [ "$entries" != 0 ]; then
        pass "CHANGELOG.md [Unreleased] has $entries entr$([ "$entries" = 1 ] && echo y || echo ies)"
    else
        fail "CHANGELOG.md [Unreleased] is empty" \
            "v$next would ship without release notes. The entry belongs in the fix's" \
            "pull request."
    fi

    echo ""
    if [ "$failed" != 0 ]; then
        echo "  Not ready for v$next." >&2
        echo "" >&2
        exit 1
    fi
    echo "  Ready: just version::bump patch"
    echo ""

# Bring a hotfix back to main: branch fix/<name> from origin/main and cherry-pick
# the fix onto it without committing. The version files and the chart are put
# back to main's — a release line's numbers must never reach main. Stops before
# the commit, so a CHANGELOG.md conflict is resolved by a person.
# Usage: just hotfix::to-main <commit> <name>, e.g. just hotfix::to-main 4555378760 results-500
[group('hotfix')]
to-main commit name:
    #!/usr/bin/env bash
    set -eu
    cd "{{ root_dir }}"

    if [ -n "$(git status --porcelain)" ]; then
        echo "Working tree is not clean. Commit or stash your changes first." >&2
        exit 1
    fi

    git fetch --quiet origin

    if ! sha=$(git rev-parse -q --verify "{{ commit }}^{commit}"); then
        echo "Unknown commit '{{ commit }}'." >&2
        exit 1
    fi
    short=$(git rev-parse --short "$sha")

    if [ "$(git rev-list --parents -n 1 "$sha" | wc -w)" -gt 2 ]; then
        echo "$short is a merge commit. Pick the fix commit it brought in." >&2
        exit 1
    fi
    case "$(git log -1 --format=%s "$sha")" in
        "chore(release): "*)
            echo "$short is a release commit. Pick the fix it was cut on top of." >&2
            exit 1
            ;;
    esac
    if git merge-base --is-ancestor "$sha" origin/main; then
        echo "origin/main already contains $short." >&2
        exit 1
    fi

    branch="fix/{{ name }}"
    if git rev-parse -q --verify "refs/heads/$branch" >/dev/null ||
        git rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null; then
        echo "$branch already exists. Pick another name." >&2
        exit 1
    fi

    previous=$(git symbolic-ref --short -q HEAD || git rev-parse HEAD)
    git switch --quiet --no-track -c "$branch" origin/main

    # A conflict is reported below rather than stopping here, so the version
    # files are put back either way.
    git cherry-pick --no-commit "$sha" >/dev/null 2>&1 || true
    git restore --source=origin/main --staged --worktree -- {{ release_files }}

    conflicts=$(git diff --name-only --diff-filter=U)
    if [ -z "$conflicts" ] && git diff --cached --quiet; then
        # Usually a cherry-pick that is already on main under another hash.
        git cherry-pick --abort >/dev/null 2>&1 || true
        git reset --quiet --hard origin/main
        git switch --quiet "$previous"
        git branch --quiet -D "$branch"
        echo "Nothing to bring: main already has every change in $short." >&2
        echo "Removed $branch again." >&2
        exit 1
    fi

    echo ""
    echo "  branch   $branch, from origin/main"
    echo "  picked   $short $(git log -1 --format=%s "$sha")"
    echo "  kept     main's VERSION, component versions and chart"
    echo ""
    if [ -n "$conflicts" ]; then
        echo "  Conflicts — resolve, then git add:"
        echo "$conflicts" | sed 's/^/    /'
        echo ""
        echo "  CHANGELOG.md: keep the entry, under main's own [Unreleased]."
        echo ""
    fi
    echo "  Next:"
    echo "    1. git diff --cached   (only the fix, nothing else)"
    echo "    2. git commit -c $short   (reuses the fix's message)"
    echo "    3. git push -u origin $branch"
    echo "    4. Open the pull request against main:"
    echo "       {{ repo_url }}/compare/main...$branch?expand=1"
    echo ""
