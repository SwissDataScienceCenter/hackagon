set positional-arguments
set shell := ["bash", "-cue"]

default:
    just --list --unsorted -f "{{source_file()}}"

# Verify generated code (proto stubs, db schema) is in sync with sources.
# Uses the `default` shell because buf and protoc-gen-ts_proto are not in the `ci` shell.
[no-cd]
[group('ci')]
codegen-check:
    #!/usr/bin/env bash
    set -eu
    root=$(git rev-parse --show-toplevel)
    just nix::develop default bash -c " \
        (cd '$root/components/frontend' && pnpm install --frozen-lockfile) && \
        just codegen::proto && \
        just codegen::db-schema && \
        (cd '$root/components/backend' && GOWORK=off go mod tidy) && \
        git diff --stat && \
        git diff --exit-code"

# Run all CI checks locally in sequence (stages 2–6).
# Can be called from inside a direnv-managed shell — direnv will be
# disabled automatically and re-enabled on exit.
[no-cd]
[group('ci')]
all:
    #!/usr/bin/env bash
    set -eu

    bold="\033[1m"
    green="\033[32m"
    red="\033[31m"
    cyan="\033[36m"
    dim="\033[2m"
    reset="\033[0m"

    tmpdir=$(mktemp -d)

    _direnv_was_active=0
    if command -v direnv &>/dev/null && [ -n "${DIRENV_DIR:-}" ]; then
        _direnv_was_active=1
    fi
    trap '
        rm -rf "$tmpdir"
        if [ "$_direnv_was_active" -eq 1 ]; then
            echo -e "${dim}ℹ️  Re-enabling direnv (output below is from your shell, not CI)...${reset}"
            direnv allow
        fi
    ' EXIT

    if [ "$_direnv_was_active" -eq 1 ]; then
        echo -e "${dim}ℹ️  Disabling direnv for CI run...${reset}"
        direnv deny
    fi

    unset IN_NIX_SHELL || true
    export DIRENV_LOG_FORMAT=""

    stages=(
        "codegen   | just ci::codegen-check"
        "format    | just ci::run just check::format"
        "lint      | just ci::run bash -c 'just check::lint -c backend && just check::lint -c frontend'"
        "build     | just ci::run bash -c 'just build -c backend && just build -c frontend'"
        "test      | just ci::run bash -c 'just check::test -c backend && just check::test -c frontend'"
    )

    results=()
    failed_names=()
    failed_digests=()
    failed=0

    for entry in "${stages[@]}"; do
        name="${entry%%|*}"
        name="${name// /}"
        cmd="${entry#*| }"
        logfile="$tmpdir/$name.log"

        echo ""
        echo -e "${bold}${cyan}┌─ stage: $name${reset}"

        { eval "$cmd"; } 2>&1 | tee "$logfile"
        stage_status=${PIPESTATUS[0]}

        if [ "$stage_status" -eq 0 ]; then
            echo -e "${bold}${green}└─ ✅  $name passed${reset}"
            results+=("${green}✅  $name${reset}")
        else
            echo -e "${bold}${red}└─ ❌  $name failed${reset}"
            results+=("${red}❌  $name${reset}")
            failed_names+=("$name")

            # Build error digest for the summary.
            # Priority 1: compiler/linter file:line:col errors (e.g. golangci-lint, tsc).
            digest=$(grep -E '^[^[:space:]].+\.[a-z]+:[0-9]+' "$logfile" \
                | grep -v '^#' \
                | grep -vE '^(INFO|WARN|DEBUG)' \
                | head -20 || true)

            # Priority 2: ERROR log lines, stripping quitsh infrastructure noise.
            if [ -z "$digest" ]; then
                digest=$(grep -E 'ERROR' "$logfile" \
                    | grep -vE 'Dispatching|Starting runner|Toolchain status|Find components|Components count|Define execution order|Execution Targets|Collected runners|runner=|step=|cwd:|env:|exit:|stderr:|not captured' \
                    | sed 's/^[0-9: ]*ERROR[[:space:]]*//' \
                    | head -20 || true)
            fi

            # Fallback: last 10 lines.
            if [ -z "$digest" ]; then
                digest=$(tail -10 "$logfile" || true)
            fi

            failed_digests+=("$digest")
            failed=1
        fi
    done

    echo ""
    echo -e "${bold}${cyan}── Summary ──────────────────────${reset}"
    for r in "${results[@]}"; do
        echo -e "   ${r}"
    done

    if [ "${#failed_names[@]}" -gt 0 ]; then
        echo ""
        echo -e "${bold}${cyan}── Errors ───────────────────────${reset}"
        for i in "${!failed_names[@]}"; do
            echo -e "   ${bold}${red}${failed_names[$i]}${reset}"
            while IFS= read -r line; do
                [ -n "$line" ] && echo -e "   ${dim}  $line${reset}"
            done <<< "${failed_digests[$i]}"
            echo ""
        done
    fi

    echo -e "${bold}${cyan}─────────────────────────────────${reset}"
    echo ""

    if [ "$failed" -eq 1 ]; then
        echo -e "${bold}${red}CI failed. See above for details.${reset}"
        exit 1
    else
        echo -e "${bold}${green}All stages passed. ✅${reset}"
    fi

# Enter the CI Nix development shell and execute the command `"$@"`.
[no-cd]
[group('ci')]
run *args:
    #!/usr/bin/env bash
    set -eu
    if [ -n "${IN_NIX_SHELL:-}" ]; then
        {
            echo "You seem to be in a Nix shell. You should NOT run the CI Nix shell"
            echo "inside another one! Please deactivate it, or use 'just ci::all'"
            echo "which handles this automatically."
        } >&2
        exit 1
    fi
    just nix::develop "ci" "$@"
