# Frontend

A SvelteKit-based frontend for the Hackagon platform, using Skeleton UI and Keycloak authentication.

## Overview

| Technology | Purpose |
|------------|---------|
| SvelteKit | Full-stack web framework |
| Skeleton v3 | UI component library (Tailwind-based) |
| @auth/sveltekit | Authentication via Keycloak OIDC |
| pnpm | Package manager |
| Vite | Build tool |

## Quick Start

### Prerequisites
- Nix development shell (`just dev` from repo root)
- Keycloak running (`just up` from repo root)
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

### Configuration

Copy the example secrets file and fill in real values:
```bash
cp data/test/config/secrets.yaml.example data/test/config/secrets.yaml
```

Edit `data/test/config/secrets.yaml`:
```yaml
oidc:
  clientSecret: ""          # Empty for public clients
  authSecret: "$(openssl rand -base64 32)"
```

Configuration in `data/test/config/config.yaml` has been prepared for development.
