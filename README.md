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

- Nix (for development environment)

### Development Setup

```bash
# Enter Nix development shell
just dev

# Start all services (Keycloak)
just up

# Stop all services
just down

# Attach to process-compose TUI
just attach
```

## Component READMEs

- [Frontend](components/frontend/README.md)
- [Backend](components/backend/README.md)
- [Keycloak](tools/configs/keycloak/README.md)
