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

## Component READMEs

- [Frontend](components/frontend/README.md)
- [Backend](components/backend/README.md)
- [Keycloak](tools/configs/keycloak/README.md)

## CI/CD

See [.github/ci-cd.md](.github/ci-cd.md) for the pipeline design and how to
reproduce CI checks locally.
