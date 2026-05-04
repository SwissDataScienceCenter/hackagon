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

Single `ci.yml` workflow triggered on PR and push to `main`:

| #   | Stage                            | Command                                                                                                          | Purpose                                                                                                                                                                             |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Setup Nix + cache                | `cachix/install-nix-action` + `cachix/cachix-action`                                                             | Avoid rebuilding toolchains every run                                                                                                                                               |
| 2   | Verify generated code is in sync | `just ci::codegen-check`                                                                                         | Catch PRs that forgot to regenerate stubs; uses `default` shell (buf + codegen tools not in CI shell); pnpm install required because `protoc-gen-ts_proto` is a node_modules binary |
| 3   | Format check                     | `just ci::run just check::format`                                                                                | Backstop for developers who haven't opted into the githooks framework                                                                                                               |
| 4   | Lint                             | `just ci::run bash -c "just check::lint -c backend && just check::lint -c frontend"`                             | Delegates to quitsh → golangci-lint, eslint, svelte-check, typos, yamllint                                                                                                          |
| 5   | Build                            | `just ci::run bash -c "just build -c backend && just build -c frontend"`                                         | All components via quitsh; catches compilation errors before running tests                                                                                                          |
| 6   | Test                             | `just ci::run bash -c "just check::test -c backend && just check::test -c frontend"`                             | Go unit tests + Vitest; coverage upload per [codecov.yaml](../tools/configs/codecov/codecov.yaml)                                                                                   |
| 7   | Container images _(main only)_   | `nix build ./tools/nix#backend-service-dev` and `#frontend-service-dev`                                          | Reproducible OCI images                                                                                                                                                             |
| 8   | Publish _(tag/main only)_        | Push images to registry; attach image digests or registry references to the GitHub release via `gh release edit` | Gated behind release trigger; links the release to its artifacts                                                                                                                    |

Stages 2–6 are PR-blocking. Stage 7 runs on `main` only. Stage 8 only on tagged
releases.

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

This mirrors stages 2–6 exactly as they run on GitHub Actions (generate check →
format → lint → build → test). Works from a bare shell or from a direnv-managed
shell — `ci::all` handles the Nix shell itself, so do **not** call it from
inside `nix develop`.

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
just ci::run just build -c backend       # stage 5 (one component)
just ci::run just check::test -c backend # stage 6 (one component)
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
