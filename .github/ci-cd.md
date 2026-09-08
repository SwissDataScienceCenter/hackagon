# CI/CD concept

## Goal

Give Hackagon a CI/CD pipeline where every check that runs in CI can be
reproduced bit-for-bit on a developer laptop. A failing CI job should never
require guessing — a developer should be able to copy the same command and
reproduce the failure locally.

## Core principle: one command, two environments

Every CI job is invoked via:

```sh
just ci::run <task>
```

`ci::run` is explicitly designed to reject execution inside an existing Nix
shell (it exits with an error if `IN_NIX_SHELL` is set) and handles the
`nix develop` invocation itself, entering the `ci` shell defined in
[tools/nix/hackagon/pkgs/shells.parts.nix](../tools/nix/hackagon/pkgs/shells.parts.nix).
This means the command is identical on CI and on a developer's machine — whether
called from a bare host or from inside a dev shell.

Tool versions (Go, pnpm, buf, golangci-lint, etc.) are pinned by the flake, so
there is no "works on my machine."

### Exception: codegen drift check (stage 2)

The codegen drift check uses `just ci::codegen-check` instead of `just ci::run`
because `buf` and `protoc-gen-ts_proto` live in the `default` shell, not the
`ci` shell. The recipe wraps the `nix::develop default` invocation so the
command is still identical locally and in CI — reproduce it with:

```sh
just ci::codegen-check
```

## Platform choice: GitHub Actions

The repo lives under `SwissDataScienceCenter/` on GitHub and no other CI system
is referenced. GitHub Actions is the natural fit. The stages below are
runner-agnostic — the `just ci::run` entry point translates directly to
Woodpecker, Drone, GitLab CI, etc.

## Pipeline stages

Single `ci.yml` workflow triggered on PR, push to `main`, and `v*` tags:

| #   | Stage                       | Command                                    | Purpose                                                                                    |
| --- | --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | Setup Nix + cache           | `install-nix-action` + `cachix-action`     | Avoid rebuilding toolchains every run                                                      |
| 2   | Codegen in sync             | `just ci::codegen-check`                   | Catch PRs that forgot to regenerate stubs; uses the `default` shell, where buf lives       |
| 3   | Format check                | `just ci::run just check::format`          | Backstop for developers who haven't opted into the githooks framework                      |
| 4   | Lint                        | `just ci::run just check::lint -c <comp>`  | golangci-lint, eslint, svelte-check, typos, yamllint                                       |
| 5   | Version consistency         | `just ci::run just version::check`         | `VERSION` of the app, both `.component.yaml` versions and `package.json` must agree        |
| 6   | Helm chart lint             | `just ci::run just helm::lint`             | `helm lint` plus a full render — the chart cannot render with its own defaults             |
| 7   | Chart version bumped _(PR)_ | `just ci::run just helm::check-bump`       | A chart change without a version bump can never reach a cluster                            |
| 8   | Build                       | `just ci::run just check::build -c <comp>` | All components via quitsh                                                                  |
| 9   | Test                        | `just ci::run just check::test -c <comp>`  | Go unit tests + Vitest; coverage per [codecov.yaml](../tools/configs/codecov/codecov.yaml) |
| 10  | Container images            | `quitsh image` (the `images` job)          | PR: build only. `main`: push to `temporary/`. Tag: push to `release/`                      |
| 11  | Publish chart               | `just helm::publish`                       | Pushes the chart when Chart.yaml holds an unpublished version; no-ops otherwise            |

Stages 2–9 are PR-blocking. Stage 10 builds on every PR and pushes on `main` and
on tags. Stage 11 runs on every push and does nothing unless the chart version
has moved.

## Two release trains

The app and the chart version are independent from each other: a chart fix with
no app change should not force an app release, and an app release should not
republish an unchanged chart.

**The app** is versioned by `VERSION` at the repo root. `just version::bump`
moves it along with `.component.yaml` versions and `package.json`, commits, and
tags. Pushing that `v*` tag builds and pushes:

```
ghcr.io/swissdatasciencecenter/hackagon/release/backend-service:X.Y.Z
ghcr.io/swissdatasciencecenter/hackagon/release/frontend-service:X.Y.Z
```

Stage 5 refuses a tree where those files disagree, because the component version
_is_ the image tag.

**The chart** is versioned by `helm-chart/Chart.yaml`, by hand:

- `version` — the chart's own release. Bump it whenever anything under
  `helm-chart/` changes; stage 7 fails the PR if you forget.
- `appVersion` — the app release this chart deploys. The deployment templates
  fall back to it for the image tag, so it decides what a cluster actually runs.

`just helm::publish` reads both from Chart.yaml and injects nothing. It pushes
to `oci://ghcr.io/swissdatasciencecenter/hackagon/charts/hackagon` and gives up
early in two cases, both reported and neither a failure:

- **the chart version is already published** — the normal case on most pushes
- **`appVersion` has no published images** — the chart would not be installable

The second is what makes "bump appVersion to an unreleased version" safe: the
chart waits, and the run that finally builds those images publishes it.

Two consequences worth knowing:

- **A new GHCR package is private by default.** The first `v*` tag creates
  `release/*`, and the first chart publish creates `charts/hackagon`; until
  someone sets those to public in the org's package settings, a cluster needs an
  `imagePullSecret`. The existing `temporary/*` packages are already public.
- **A release image is never overwritten.** quitsh refuses to push a release tag
  that already exists ([upload.go](../tools/quitsh/pkg/image/upload.go)), so
  re-tagging a version fails rather than replacing an artifact someone has
  deployed. Bump the version instead.

To deploy the head of `main` rather than a release, override the image
repository and tag to the `temporary/` package — see the Images note in

[helm-chart/values.yaml](../helm-chart/values.yaml).

## Parallelism

Three viable shapes, in order of complexity:

- **Single job, sequential** — simpler, same shell stays warm, easier to debug.
  Currently implemented.
- **Path-filtered steps** — lint always runs (it lints markdown and prose);
  heavier stages (generate check, format, build, test) are conditioned on
  changed paths using `dorny/paths-filter`. A pure docs commit skips build and
  test but still gets linted. Add this once the sequential pipeline is stable
  and the path patterns are well understood — path filters can cause false
  negatives if patterns drift.
- **Matrix by component** — `components/frontend` and `components/backend` run
  lint/test in parallel. Faster on large PRs, but each job pays Nix-setup cost
  separately.

Add path filtering once CI time on docs-only PRs becomes noticeable; split into
a matrix only if overall CI time becomes a bottleneck.

## Usage

Run the full CI pipeline locally from the repo root:

```sh
just ci::all
```

This mirrors stages 2–9 exactly as they run on GitHub Actions (generate check →
format → lint → version → helm → chart → build → test). Works from a bare shell
or from a direnv-managed shell — `ci::all` handles the Nix shell itself, so do
**not** call it from inside `nix develop`.

Before pushing: `just ci::all` → if it passes locally, CI passes.

### Component-level commands

The same checks can be run one at a time directly inside a component directory.
These commands are wired to the same underlying tooling, so results are
identical to the corresponding stage in `just ci::all`:

```sh
# From components/backend/ or components/frontend/
just format
just lint
just test
just build
```

Useful during active development when you want fast feedback on a single check
without running the full pipeline.

### Debugging CI failures

Individual stages can also be isolated from the repo root:

```sh
just ci::codegen-check                   # stage 2 — uses default shell
just ci::run just check::format          # stage 3
just ci::run just check::lint -c backend # stage 4 (one component)
just ci::run just version::check         # stage 5
just ci::run just helm::lint             # stage 6
just ci::run just helm::check-bump       # stage 7
just ci::run just build -c backend       # stage 8 (one component)
just ci::run just check::test -c backend # stage 9 (one component)
```

On CI failure: copy the failing command from the workflow YAML, run it locally,
reproduce.

## Caching strategy

Three layers, each meaningful:

1. **Nix store** — Cachix (`hackagon` cache). Cache name is not sensitive and is
   hardcoded in the workflow. Only `CACHIX_AUTH_TOKEN` is stored as a secret. On
   fork PRs the token is absent and cachix falls back to read-only mode
   automatically.
2. **Go module cache** — `actions/cache` on `~/go/pkg/mod` keyed by `go.sum`.
3. **pnpm store** — `actions/cache` on `~/.local/share/pnpm/store` keyed by
   `pnpm-lock.yaml`.

**`.devenv`**: the `nix::develop` recipe uses `devenv.sh` to set a devenv root,
so CI creates a `.devenv/` directory. Its `profile/` subtree is a symlink tree
into the Nix store and reconstructs cheaply when the Nix store is cached;
`state/` and the task DB are runtime artifacts that should not be cached. A
separate `.devenv` cache layer is not expected to be necessary, but actual CI
timing should confirm this.

Uncached runs: ~5–10 min Nix setup. Cached runs: <1 min.

## Action pinning

All third-party GitHub Actions are pinned to full commit SHAs (with the version
tag as a comment) to protect against supply-chain attacks like the March 2025
`tj-actions/changed-files` incident, where a compromised action exfiltrated CI
secrets from thousands of repositories.

To update a pin, resolve the new SHA with:

```sh
git ls-remote https://github.com/<owner>/<action> refs/tags/<version>
```

Then update both the SHA and the comment in `ci.yml`. Consider using
[`pinact`](https://github.com/suzuki-shunsuke/pinact) or
[Renovate](https://docs.renovatebot.com/) to automate this.
