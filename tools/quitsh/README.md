# quitsh

`quitsh` is Hackagon's internal CI/CD orchestrator. It is a Go CLI tool built on
top of the upstream [`sdsc-ordes/quitsh`](https://github.com/sdsc-ordes/quitsh)
framework, extended with Hackagon-specific runners, commands, and configuration.

It serves as the single entry point for all pipeline operations — lint, build,
test, image — both locally and in CI. It understands the repository's component
model, resolves execution order via a DAG, and automatically dispatches commands
into the correct Nix devenv toolchain shell.

## Directory structure

```
tools/quitsh/
├── cmd/quitsh/
│   ├── main.go              # CLI entry point
│   └── cmd/
│       ├── all.go           # Registers all subcommands
│       ├── build/           # `quitsh build` command
│       ├── lint/            # `quitsh lint` command
│       ├── test/            # `quitsh test` command
│       ├── image/           # `quitsh image` command
│       ├── format/          # `quitsh format` command
│       ├── setup/           # `quitsh setup` command
│       ├── generate-schema/ # `quitsh generate-schema` command
│       └── nix/             # `quitsh nix` subcommands (cache, fix-hash)
├── pkg/
│   ├── config/              # Top-level Config struct (loaded from config.yaml)
│   ├── runner/              # All task runners, one subdirectory per runner
│   │   ├── go/              # Go lint (golangci-lint, go mod tidy, build constraints)
│   │   ├── pnpm/            # Node/pnpm build, test, lint
│   │   ├── nix/             # OCI image build via Nix
│   │   ├── containerfile/   # OCI image build via buildah + Containerfile
│   │   ├── trivy/           # Vulnerability scanning
│   │   ├── symlinks/        # Config symlink validation
│   │   ├── hackagon/        # Hackagon-specific lint rules
│   │   ├── coverage/        # Codecov upload
│   │   ├── doc-sphinx/      # Sphinx documentation build
│   │   ├── doc-mkdocs/      # MkDocs documentation build
│   │   ├── gitdiffrunner/   # Run tasks only on changed components
│   │   ├── config/          # Shared settings structs (build, lint, test, image, nix)
│   │   └── register.go      # Wires all runners into the CLI factory
│   ├── setup/               # `quitsh setup` logic (go.work, symlinks, git hooks)
│   ├── image/               # OCI image push helpers (digest, skopeo)
│   ├── coverage/            # Coverage upload helpers
│   ├── build/               # Version stamping
│   └── exec/                # Execution context helpers (nix, pnpm, container-mgr)
├── tools/nix/package/
│   └── default.nix          # Nix derivation that builds the quitsh binary
├── .component.yaml          # Declares quitsh as a component (manages itself)
├── justfile                 # Local dev tasks (build, run, test)
└── go.mod / go.sum
```

## Pipeline stages

Commands are organised into the following ordered stages:

```
lint → build → test → image → deploy
```

Each component in the repository declares which runners it uses per stage in its
`.component.yaml`. `quitsh` resolves cross-component dependencies and executes
targets in the correct order.

## Commands

| Command                            | Description                                                 |
| ---------------------------------- | ----------------------------------------------------------- |
| `quitsh setup`                     | One-time dev environment setup (see [Setup](#setup))        |
| `quitsh build -c <pattern>`        | Build components matching a glob pattern                    |
| `quitsh lint -c <pattern>`         | Lint components                                             |
| `quitsh test -c <pattern>`         | Test components                                             |
| `quitsh image -c <pattern>`        | Build and push OCI images                                   |
| `quitsh format`                    | Format source files via treefmt                             |
| `quitsh list`                      | List all known components and their targets                 |
| `quitsh nix fix-hash`              | Fix outdated Nix store hashes                               |
| `quitsh nix cache upload/download` | Interact with the Nix binary cache                          |
| `quitsh generate-schema`           | Generate JSON schemas from config structs                   |
| `quitsh config`                    | Print the resolved configuration                            |
| `quitsh exec-runner`               | Run a specific runner directly (used by toolchain dispatch) |

## Runners

Runners are the units of work that quitsh executes against a component. Each
runner is registered under a string ID (e.g. `hackagon::lint-go`) and maps to a
pipeline stage.

| Runner ID                       | Stage | What it does                                                      |
| ------------------------------- | ----- | ----------------------------------------------------------------- |
| `hackagon::lint-go`             | lint  | `golangci-lint`, `go mod tidy` check, build constraint validation |
| `hackagon::build-go`            | build | `go build` via the upstream quitsh Go runner                      |
| `hackagon::test-go`             | test  | `go test` via the upstream quitsh Go runner                       |
| `hackagon::lint-pnpm`           | lint  | pnpm lint                                                         |
| `hackagon::build-pnpm`          | build | pnpm build                                                        |
| `hackagon::test-pnpm`           | test  | pnpm test                                                         |
| `hackagon::image-nix`           | image | Build OCI image via `nix build`, push via `skopeo`                |
| `hackagon::image-containerfile` | image | Build OCI image via `buildah`, push via `skopeo`                  |
| `hackagon::lint-trivy`          | lint  | Vulnerability scan via Trivy                                      |
| `hackagon::lint-symlinks`       | lint  | Validates required config symlinks are present                    |
| `hackagon::lint-hackagon`       | lint  | Hackagon-specific structural lint rules                           |
| `hackagon::coverage-upload`     | test  | Upload coverage reports to Codecov                                |
| `hackagon::doc-sphinx`          | aux   | Build Sphinx docs                                                 |
| `hackagon::doc-mkdocs`          | aux   | Build MkDocs docs                                                 |
| `hackagon::git-diff`            | aux   | Filter execution to git-changed components only                   |

## Nix toolchain dispatch

`quitsh` integrates with the Nix devenv toolchain shells defined in `tools/nix`.
When a command is run outside the required toolchain shell, quitsh re-invokes
itself inside the correct shell automatically. For example,
`quitsh lint -c backend` will dispatch into the `lint-go` devenv shell if not
already running inside it.

This means you can run any quitsh command from the `default` shell or from CI
without manually entering individual toolchain shells first.

## Setup

`quitsh setup` (also aliased as `setup-development`) is run automatically the
first time you enter a devenv shell. It performs the following:

1. **Creates `go.work`** — scans all Go components and generates the workspace
   file inside the `build-go` toolchain shell.
2. **Symlinks config files** — links shared tool configs from `tools/configs/`
   to the repo root so tools like `golangci-lint`, `prettier`, and `typos` can
   find them at their expected paths:
   - `.typos.toml` → `tools/configs/typos/typos.toml`
   - `.prettierrc.yaml` → `tools/configs/prettier/prettierrc.yaml`
   - `.yamllint.yaml` → `tools/configs/yamllint/yamllint.yaml`
   - `.golangci.yaml` → `tools/configs/golangci-lint/golangci.yaml`
3. **Installs git hooks** — if [Githooks](https://github.com/gabyx/Githooks) is
   installed, runs `git hooks install`.

## Configuration

quitsh is configured via YAML files in `tools/configs/quitsh/`:

| File               | Used when                                   |
| ------------------ | ------------------------------------------- |
| `config.yaml`      | Local development (`default` shell)         |
| `config.user.yaml` | Optional per-user overrides (not committed) |
| `config-ci.yaml`   | CI pipeline (`ci` shell)                    |

The config schema covers build settings (build type, environment type,
coverage), lint settings (fix mode, extra args), image settings (registry,
tags), and Nix settings (flake directory, toolchain names).

## Building quitsh locally

Use the justfile recipes from within the `tools/quitsh/` directory:

```sh
# Build the binary to .output/bin/quitsh
just build

# Build and run immediately (passes all args to quitsh)
just run <args>

# Run unit tests
just test

# Run integration tests (requires a built binary)
just test-integration

# Build the Nix package
just package-nix

# Update the upstream sdsc-ordes/quitsh dependency
just update-deps
```

## Nix package

The binary is also packaged as a Nix derivation in
`tools/nix/package/default.nix` and exposed in the flake as
`pkgs.hackagon.quitsh`. This is what gets installed in the `ci` devenv shell.

## Self-management

`quitsh` manages itself as a component. Its `.component.yaml` declares the
following targets:

- **build** — `go` runner
- **lint** — `go` runner
- **test** — `go` runner + `go-bin` integration tests (with coverage
  instrumentation) + `coverage-upload`
