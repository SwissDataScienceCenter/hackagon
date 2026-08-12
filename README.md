# Hackagon

A hackathon management platform built with SvelteKit, Go/gRPC, and Keycloak.

## Overview

| Component                 | Description                         |
| ------------------------- | ----------------------------------- |
| `components/frontend/`    | SvelteKit frontend with Skeleton UI |
| `components/backend/`     | Go gRPC backend service             |
| `tools/configs/keycloak/` | Keycloak realm configuration        |

## Quick Start

### Prerequisites

Exactly two things are required: **Nix** (with flakes) and **git**. Everything
else — Go, pnpm, buf, process-compose, Keycloak, Postgres, psql, grpcurl — comes
from the flake in `tools/nix`, and `just` itself is inside that shell.

Docker is **not** required to develop or run the app. It is only needed for the
optional pieces: the devcontainer (a convenience for Windows/macOS hosts, where
Nix cannot run natively), the `rustfs` object store, the Cloudflare tunnel and
the OpenReplay rig. See [.devcontainer/README.md](.devcontainer/README.md) for
what each one buys and what breaks without it.

### Development Setup

```bash
# One-time: generated code is not committed, so a fresh clone must produce it.
# `just develop <cmd>` runs one command inside the Nix dev shell.
just develop bash -c "cd components/frontend && pnpm install --frozen-lockfile"
just develop just codegen::proto        # -> components/backend/internal/proto
just develop just codegen::db-schema    # -> components/backend/ent
just develop bash -c "cd components/backend && GOWORK=off go mod tidy"

# One-time: the frontend refuses to serve without its dev secrets (gitignored).
printf 'oidc:\n  clientSecret: "%s"\n  authSecret: "%s"\n' \
    "$(openssl rand -base64 32)" "$(openssl rand -base64 32)" \
    > components/frontend/data/test/config/secrets.yaml

# Enter the Nix development shell (alias of `just develop`)
just dev

# Start Keycloak + Postgres + backend + frontend (process-compose)
just deploy::up

# Stop all services
just down

# Attach to the process-compose TUI
just deploy::attach

# Seed the database with sample data (after services are up)
just db::seed

# Show a summary of current DB state
just db::summary
```

`just start` bundles dependency syncing with `just deploy::up` and then attaches
to the TUI. `just --list` shows every recipe; module recipes are addressed as
`just <module>::<recipe>` (`deploy`, `db`, `rpc`, `codegen`, `clean`, `check`,
`ci`, `nix`). There are no bare `just up` / `just seed` / `just attach` recipes.

Full walkthrough, including the devcontainer path:
[docs/getting-started.md](docs/getting-started.md).

## Versioning

`VERSION` at the repo root holds the product version, and it is the only place
that version is declared. Releases are semver, tagged `v<x.y.z>`.

```bash
just version::show                  # declared version + what a build would stamp
just version::bump patch            # also: minor, major
just version::tag                   # tag HEAD with the version already in VERSION
```

`bump` refuses on a dirty tree, edits `VERSION`, keeps
`components/frontend/package.json` in step, commits as `chore(release): vX.Y.Z`
and creates the annotated tag. Neither `bump` nor `tag` pushes — they print the
`git push` you need.

The frontend stamps the version in at build time (`vite.config.ts` reads
`VERSION`, exposes it as `$lib/version`) and shows it in the footer:

| Build                              | Footer shows           |
| ---------------------------------- | ---------------------- |
| clean checkout on the matching tag | `v0.0.1`               |
| any other commit                   | `v0.0.1+4b87857`       |
| uncommitted changes                | `v0.0.1+4b87857-dirty` |

Only a release build claims to be the release, so a version quoted in a bug
report identifies the code that produced it. Reading `VERSION` from a file
rather than from `git describe` means a shallow clone or an unpacked tarball
still builds with a truthful version.

## Component READMEs

- [Frontend](components/frontend/README.md)
- [Backend](components/backend/README.md)
- [Keycloak](tools/configs/keycloak/README.md)

## CI/CD

See [.github/ci-cd.md](.github/ci-cd.md) for the pipeline design and how to
reproduce CI checks locally.
