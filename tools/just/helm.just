set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`
chart_dir := root_dir + "/helm-chart"
chart_file := chart_dir + "/Chart.yaml"
charts_dir := chart_dir + "/charts"
out_dir := root_dir + "/.output/helm"
lint_values := root_dir + "/tools/helm/lint-values.yaml"

registry := "ghcr.io/swissdatasciencecenter/hackagon"
chart_ref := registry + "/charts/hackagon"
oci_repo := "oci://" + registry + "/charts"

[private]
default:
    just --list --unsorted -f "{{ source_file() }}"

[group('helm')]
help:
    #!/usr/bin/env bash
    bold="\033[1m"
    dim="\033[2m"
    cyan="\033[36m"
    reset="\033[0m"

    echo ""
    echo -e "  ${bold}Helm Commands${reset}"
    echo ""
    echo -e "  ${cyan}just helm::lint${reset}"
    echo -e "  ${dim}Lint the chart and render it against tools/helm/lint-values.yaml${reset}"
    echo ""
    echo -e "  ${cyan}just helm::template${reset} [helm args...]"
    echo -e "  ${dim}Render the chart manifests to stdout${reset}"
    echo ""
    echo -e "  ${cyan}just helm::check-bump${reset} [base]"
    echo -e "  ${dim}Fail if helm-chart/ changed without a Chart.yaml version bump${reset}"
    echo ""
    echo -e "  ${cyan}just helm::publish${reset}"
    echo -e "  ${dim}Publish the chart if its version is not already in the registry${reset}"
    echo ""
    echo -e "  ${cyan}just helm::clean${reset}"
    echo -e "  ${dim}Remove fetched subchart archives and packaged charts${reset}"
    echo ""
    echo -e "  ${bold}Two versions, two purposes${reset} ${dim}(helm-chart/Chart.yaml)${reset}"
    echo -e "  ${dim}version    the chart's own release, bumped when the chart changes${reset}"
    echo -e "  ${dim}appVersion the app release the chart deploys${reset}"
    echo -e "  ${dim}Both are edited by hand. An app tag publishes images, never a chart.${reset}"
    echo ""
    echo -e "  ${dim}The chart cannot render with its own defaults — several values${reset}"
    echo -e "  ${dim}(admin id, passwords, hostnames) are intentionally empty.${reset}"
    echo ""

# Remove fetched subchart archives and packaged charts.
[group('helm')]
clean:
    rm -rf "{{ charts_dir }}" "{{ out_dir }}"

# Fetch the subchart archives the chart declares.
[private]
[group('helm')]
fetch-deps:
    #!/usr/bin/env bash
    set -eu

    # `--force-update` keeps this idempotent: a plain `repo add` fails on a name
    # that already exists.
    helm repo add bitnami https://charts.bitnami.com/bitnami --force-update
    helm repo add helmforge https://repo.helmforge.dev --force-update

    cd "{{ chart_dir }}"
    # `build`, not `update`: build obeys the committed Chart.lock, so CI resolves
    # the same subchart versions a developer does. `update` re-resolves the
    # `18.x`/`3.x` ranges and moves them silently.
    helm dependency build

# Lint the chart and render it against throwaway values.
[group('helm')]
lint: fetch-deps
    #!/usr/bin/env bash
    set -eu

    helm lint "{{ chart_dir }}" --values "{{ lint_values }}"

    # `lint` does not catch a template that fails to render, so render it too.
    helm template hackagon-lint "{{ chart_dir }}" --values "{{ lint_values }}" >/dev/null

# Render the chart manifests to stdout.
# Usage: just helm::template --values my-values.yaml
[group('helm')]
[no-cd]
template *args: fetch-deps
    #!/usr/bin/env bash
    set -eu
    helm template "$@" "{{ chart_dir }}"

# Fail if anything under helm-chart/ changed without a Chart.yaml version bump.
# The chart is published from whatever version Chart.yaml holds, so an unbumped
# change is one that can never reach a cluster.
[group('helm')]
check-bump base="origin/main":
    #!/usr/bin/env bash
    set -eu
    cd "{{ root_dir }}"

    if ! git rev-parse --verify -q "{{ base }}" >/dev/null; then
        echo "Unknown base ref '{{ base }}'. In CI the checkout needs full history" >&2
        echo "(fetch-depth: 0); locally try 'just helm::check-bump main'." >&2
        exit 1
    fi

    base=$(git merge-base "{{ base }}" HEAD)

    if [ -z "$(git diff --name-only "$base" HEAD -- helm-chart/)" ]; then
        echo "No chart changes against {{ base }}; nothing to check."
        exit 0
    fi

    read_version() { sed -n 's/^version: *//p' | head -1; }
    before=$(git show "$base:helm-chart/Chart.yaml" 2>/dev/null | read_version || true)
    now=$(read_version <"{{ chart_file }}")

    if [ -n "$before" ] && [ "$before" = "$now" ]; then
        echo "helm-chart/ changed but Chart.yaml still declares version $now." >&2
        echo "" >&2
        git diff --name-only "$base" HEAD -- helm-chart/ | sed 's/^/  /' >&2
        echo "" >&2
        echo "Bump 'version' in helm-chart/Chart.yaml. It is the chart's own" >&2
        echo "release number, not the app's — see just helm::help." >&2
        exit 1
    fi

    echo "Chart version $before -> $now."

# Publish the chart to GHCR as an OCI artifact, if it is not already there.
# Both versions come from Chart.yaml and nothing is injected, so an app release
# never publishes a chart on its own — someone has to bump the chart first.
# Assumes `helm registry login` and `skopeo login` have already happened.
[group('helm')]
publish:
    #!/usr/bin/env bash
    set -eu

    chart_v=$(sed -n 's/^version: *//p' "{{ chart_file }}" | head -1)
    app_v=$(sed -n 's/^appVersion: *"*\([^"]*\)"*/\1/p' "{{ chart_file }}" | head -1)

    if ! [[ "$chart_v" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        echo "Chart.yaml version '$chart_v' is not a semver." >&2
        exit 1
    fi
    if [ -z "$app_v" ]; then
        echo "Chart.yaml declares no appVersion." >&2
        exit 1
    fi

    exists() { skopeo inspect --raw "docker://$1" >/dev/null 2>&1; }

    if exists "{{ chart_ref }}:$chart_v"; then
        echo "Chart $chart_v is already published; nothing to do."
        echo "Bump 'version' in helm-chart/Chart.yaml to publish a new one."
        exit 0
    fi

    # A published chart must be installable. Its image tags default to
    # appVersion, so refuse to promise an app release that was never built.
    for comp in backend frontend; do
        ref="{{ registry }}/release/$comp-service:$app_v"
        if ! exists "$ref"; then
            echo "Not publishing chart $chart_v: appVersion $app_v has no images." >&2
            echo "  missing: $ref" >&2
            echo "Push the v$app_v tag first, or point appVersion at a released version." >&2
            exit 0
        fi
    done

    just helm::fetch-deps

    mkdir -p "{{ out_dir }}"
    helm package "{{ chart_dir }}" --destination "{{ out_dir }}"

    pkg="{{ out_dir }}/hackagon-${chart_v}.tgz"
    if [ ! -f "$pkg" ]; then
        echo "Expected package '$pkg' was not produced." >&2
        exit 1
    fi

    helm push "$pkg" "{{ oci_repo }}"

    echo ""
    echo "  chart      $chart_v"
    echo "  deploys    app $app_v"
    echo "  pushed     {{ chart_ref }}:$chart_v"
    echo ""
    echo "  Install with:"
    echo "    helm install hackagon {{ oci_repo }}/hackagon --version $chart_v \\"
    echo "      --set baseDomain=example.com --set-file realmJson=@path/to/realm.json"
    echo ""
