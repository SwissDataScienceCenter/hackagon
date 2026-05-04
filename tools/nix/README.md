# Nix Setup

This directory contains the entire Nix infrastructure for the project. It is
built on [flake-parts] for modularity, [devenv] for development shells, and a
custom library (`hackagon lib`) that provides component discovery, build
support, and toolchain composition.

## Quick orientation

```
tools/nix/
├── flake.nix                  # Entry point: inputs, cache config, output wiring
├── flake.lock                 # Locked revisions for all inputs (do not edit by hand)
├── flake/                     # Foundation modules (systems, nixpkgs, devenv)
└── hackagon/
    ├── hackagon.parts.nix     # Declares the `hackagon` option namespace
    ├── lib/                   # Pure Nix library (no side effects, reusable)
    └── pkgs/                  # Per-system instantiation (.parts.nix modules)
```

---

## How outputs are assembled

`flake.nix` does not define outputs directly. Instead it uses [import-tree] to
**auto-discover every file matching `*.parts.*`** in this directory tree and
loads them as [flake-parts] modules. Adding a new `.parts.nix` file anywhere
under `tools/nix/` is enough to register it — no manual import list to maintain.

The `flake/` subdirectory holds the foundational modules that must exist before
anything else can work:

| File                      | Role                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `flake/systems.parts.nix` | Declares the four supported platforms (`x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin`) |
| `flake/nixpkgs.parts.nix` | Imports nixpkgs and injects `pkgs` as a `perSystem` module argument everywhere                             |
| `flake/devenv.parts.nix`  | Pulls in the devenv flake module so `devShells` can be defined using devenv's API                          |

---

## The `hackagon` option namespace

`hackagon/hackagon.parts.nix` declares a custom [flake-parts] option set under
`perSystem.hackagon`. All the `.parts.nix` files in `hackagon/pkgs/` write into
this namespace. At the end of evaluation, `hackagon.parts.nix` wires the
collected values into the real flake outputs:

```
hackagon.pkgs.*            → packages.*
hackagon.components.packages-flat.*  → packages.*
hackagon.shells.*          → devShells.*
```

The `legacyPackages.hackagon` attribute mirrors the full namespace and is useful
for inspection in `nix repl`.

---

## `hackagon/pkgs/` — Instantiation modules

Each file is a `perSystem` module that fills one slice of the `hackagon`
namespace. They are evaluated in dependency order by flake-parts (not file
order).

| File                  | Populates                             | Summary                                                                              |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| `lib.parts.nix`       | `hackagon.lib`                        | Instantiates the hackagon library with `rootDir` and the git-tracked fileset         |
| `quitsh.parts.nix`    | `hackagon.pkgs.quitsh`                | Builds the `quitsh` binary from source                                               |
| `build.parts.nix`     | `hackagon.build`                      | Pins tool versions (Go, Python, Node, pnpm, codecov-cli) and creates `buildGoModule` |
| `bootstrap.parts.nix` | `hackagon.pkgs.bootstrap`             | Minimal `buildEnv` for bootstrapping a new machine (`git`, `direnv`, `just`, …)      |
| `shells.parts.nix`    | `hackagon.shells`                     | Turns toolchain module lists into actual devenv shells                               |
| `comps.parts.nix`     | `hackagon.components`                 | Scans the repo for components and collects their packages                            |
| `treefmt.parts.nix`   | `hackagon.pkgs.treefmt` + `formatter` | Code formatter via [treefmt-nix]                                                     |
| `treefmt.nix`         | _(config, not a module)_              | Formatter configuration: `gofmt`, `prettier`, `nixfmt`, `buf`, `ruff`, `shfmt`, …    |

---

## `hackagon/lib/` — The Nix library

Pure functions with no per-system side effects. Exposed on `self.lib` (and
`self.lib.mkExtendedLib` for the root-aware variant used internally).

### Component discovery

Components are directories anywhere in the repo that contain a `.component.yaml`
file:

```yaml
name: my-service
language: go
```

`lib/component/query.nix` walks the directory tree recursively, collects every
such directory, and returns a map:

```nix
{
  my-service = {
    name    = "my-service";
    path    = /abs/path/to/my-service;
    pathRel = "components/my-service";
    config  = { name = "my-service"; language = "go"; ... };
  };
  ...
}
```

`lib/component/packages.nix` then imports `<compPath>/tools/nix/pkgs/` for each
component that has one, forwarding a standard `args` set so every component's
packages have access to `pkgs`, `cnLib`, etc.

### Toolchain composition (`lib/toolchain.nix`)

`createDevenvModules` returns a map of named **module lists**. Each module list
is a list of devenv modules (plain Nix attribute sets) that declare packages,
shell hooks, and `quitsh.toolchains` labels. Module lists compose via `++`:

```
default = ci ++ build-go ++ dev-go ++ build-node-pnpm ++ manifest-ytt ++ ...
backend = ci ++ build-go ++ dev-go ++ ...
frontend = ci ++ build-node-pnpm ++ ...
```

`shells.parts.nix` passes each list to `lib.shell.mkShell`, which calls
`quitsh.lib.mkShell` → `devenv`, producing the final derivation.

Available named shells / toolchains:

| Name                        | Purpose                                                                      |
| --------------------------- | ---------------------------------------------------------------------------- |
| `default`                   | Full local development (Go, Node, manifests, tooling)                        |
| `backend`                   | Go backend development                                                       |
| `frontend`                  | Node/pnpm frontend development                                               |
| `ci`                        | Minimal CI shell (quitsh, bootstrap tools, podman)                           |
| `build-go`                  | Go compiler + git                                                            |
| `build-node-pnpm`           | Node 22 + pnpm 10                                                            |
| `lint-go`                   | golangci-lint                                                                |
| `lint-trivy`                | Container image scanning                                                     |
| `lint-jsonschema`           | JSON Schema validation                                                       |
| `image-nix`                 | Nix-based image builds (skopeo)                                              |
| `image-containerfile`       | Containerfile-based builds (buildah, skopeo)                                 |
| `manifest-ytt`              | Kubernetes manifest templating (ytt, kbld, helm, sops, …)                    |
| `doc-sphinx` / `doc-mkdocs` | Documentation builds (Python + uv)                                           |
| `run-python`                | Generic Python toolchain                                                     |
| `coverage-upload`           | codecov-cli                                                                  |
| `test-services`             | Full local stack (Keycloak, Postgres, backend, frontend via process-compose) |

### Go builds (`lib/build/go/build-module.nix`)

A custom `buildGoModule`-style function that wraps `quitsh exec-target` for the
actual compilation and test steps. Usage:

```nix
# In a component's tools/nix/pkgs/default.nix:
{ pkgs, cnLib, ... }:
{
  my-service = cnLib.build.buildGoModule {
    compName    = "my-service";
    pname       = "my-service";
    version     = cnLib.component.readVersion "my-service";
    src         = cnLib.fileset.toSource [ "my-service" ];
    vendorHash  = "sha256-...";
  };
}
```

When `vendorHash` is set, a fixed-output derivation downloads and caches the Go
module proxy content. Set `vendorHash = null` to use a checked-in `vendor/`
directory instead.

The build phase calls:

```
quitsh exec-target --skip-toolchain-dispatch <compName>::build-nix
```

The check phase calls:

```
quitsh exec-target --skip-toolchain-dispatch <compName>::test-nix
```

### Other library modules

| Module            | Purpose                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `lib/attrset.nix` | `filterEmpty`, `flatten`, `flattenDrvs` — attribute set utilities                                                |
| `lib/yaml.nix`    | `readSimple` (fast, no IFD) and `read` (full YAML→Nix via IFD + remarshal)                                       |
| `lib/fileset.nix` | Per-component filesets; `toSource` unions them and intersects with git-tracked files to keep store paths minimal |
| `lib/nixpkgs.nix` | nixpkgs import wrapper; respects `USE_LIBC_MUSL=true` for musl builds                                            |
| `lib/shell.nix`   | Thin wrapper over `quitsh.lib.mkShell`                                                                           |

---

## Binary caches

`flake.nix` configures three substituters:

- `https://nix-community.cachix.org` — community packages
- `https://devenv.cachix.org` — devenv and its dependencies
- `ssh://nix-ssh@nix-cache.swisscustodian.ch` — private project cache

These are `extra-trusted-substituters`, so they only take effect if the local
Nix configuration trusts them (set in `/etc/nix/nix.conf` or
`~/.config/nix/nix.conf`).

---

## Pinned versions

Tool versions are pinned in `hackagon/pkgs/build.parts.nix`:

```nix
pkgsPinned = {
  go      = pkgs.go_1_25;
  python  = pkgs.python314;
  nodejs  = pkgs.nodejs_22;
  pnpm    = pkgs.pnpm_10.override { nodejs = pkgs.nodejs_22; };
  codecov-cli = ...;  # pinned to a specific nixpkgs commit
};
```

To update a pinned version: change the attribute name here, run
`nix flake check`, and update `flake.lock` if needed with
`nix flake update <input>`.

`codecov-cli` is pinned to a separate nixpkgs commit (`nixpkgs-codecov` input)
due to a known upstream issue — see the comment in `flake.nix`.

---

## Common tasks

**Enter the default dev shell**

```sh
nix develop
# or, with direnv configured:
direnv allow
```

**Enter a specific shell**

```sh
nix develop .#backend
nix develop .#frontend
nix develop .#ci
```

**Build a component package**

```sh
nix build .#my-service
```

**Format the entire repo**

```sh
nix fmt
```

**Inspect the full hackagon namespace**

```sh
nix repl
> :lf .
> outputs.legacyPackages.x86_64-linux.hackagon
```

**Update all flake inputs**

```sh
nix flake update
```

**Update a single input**

```sh
nix flake update nixpkgs
```

---

## Adding a new component

1. Create a `.component.yaml` in your component directory.
2. Optionally create `<compDir>/tools/nix/pkgs/default.nix` returning an
   attribute set of derivations — these are auto-discovered and exposed as flake
   packages.
3. No changes to `tools/nix/` are needed unless you require a new build function
   or toolchain.

## Adding a new dev shell / toolchain

1. Add a new module list in `lib/toolchain.nix` inside `createDevenvModules`.
2. It will automatically appear as a `devShells.<name>` output and as a
   `nix develop .#<name>` target.

---

[flake-parts]: https://flake.parts
[devenv]: https://devenv.sh
[import-tree]: https://github.com/vic/import-tree
[treefmt-nix]: https://github.com/numtide/treefmt-nix
