# Hackagon

A hackathon management platform built with SvelteKit, Go/gRPC, and Keycloak.

## Overview

| Component                 | Description                                 |
| ------------------------- | ------------------------------------------- |
| `components/frontend/`    | SvelteKit frontend, Tailwind v4 + own theme |
| `components/backend/`     | Go gRPC backend service                     |
| `tools/configs/keycloak/` | Keycloak realm configuration                |

## Quick Start

### Prerequisites

- Nix (for development environment)

### Development Setup

```bash
# Enter Nix development shell
just dev

# Sync deps and start everything (Keycloak, Postgres, backend, frontend),
# then attach to the process-compose TUI
just start

# Stop all services
just down

# Re-attach to the process-compose TUI
just deploy::attach

# Seed the database with sample data (after services are up)
just db::seed

# Show a summary of current DB state
just db::summary
```

Recipes are grouped into namespaced modules (`tools/just/*.just`) addressed with
`::`. Run `just --list` for everything, or `just <module>::help` for a module.
After changing `*.proto` use `just api-change`; after changing `db/schema/*.go`
use `just schema-change`; `just changes` will tell you which you need.

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
