# Frontend

A SvelteKit-based frontend for the Hackagon platform, using Skeleton UI and
Keycloak authentication.

## Overview

| Technology      | Purpose                               |
| --------------- | ------------------------------------- |
| SvelteKit       | Full-stack web framework              |
| Skeleton v3     | UI component library (Tailwind-based) |
| @auth/sveltekit | Authentication via Keycloak OIDC      |
| pnpm            | Package manager                       |
| Vite            | Build tool                            |

## Quick Start

### Prerequisites

- Nix development shell (`just dev` from repo root)
- Keycloak and the backend running (`just start` from repo root)
- Config files in `data/test/config/` (see Configuration below)

### Development

```bash
# From repo root - enter dev shell
just dev

# From components/frontend
just serve        # Start dev server at http://localhost:8081
just build        # Build for production
just lint         # Run ESLint + TypeScript check
just format       # Format with Prettier
just test         # Run Vitest tests
```

Note that `just start` from the repo root already serves the frontend on
**:8081** via process-compose, so `just serve` will clash on the port if the
stack is up — use the running instance, or `just down` first.

To run the checks exactly as CI does (from the repo root):

```bash
just check::lint -c frontend
just check::test -c frontend
just ci::all                  # everything CI runs, both components
```

`just format` is Prettier only. Formatting is enforced tree-wide by `treefmt`,
which also covers markdown, shell and Nix:

```bash
nix run ./tools/nix#treefmt -- <path>        # write
nix run ./tools/nix#treefmt -- <path> --ci   # check
```

### Configuration

Copy the example secrets file and fill in real values:

```bash
cp data/test/config/secrets.yaml.example data/test/config/secrets.yaml
```

Edit `data/test/config/secrets.yaml`:

```yaml
oidc:
  clientSecret: "$(openssl rand -base64 32)"
  authSecret: "$(openssl rand -base64 32)"
```

Configuration in `data/test/config/config.yaml` has been prepared for
development.
