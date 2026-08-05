# Frontend

A SvelteKit-based frontend for the Hackagon platform, using Keycloak
authentication and its own Tailwind-based theme layer.

## Overview

| Technology      | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| SvelteKit       | Full-stack web framework                              |
| Tailwind v4     | Utilities over the theme in `src/themes/hackagon.css` |
| @auth/sveltekit | Authentication via Keycloak OIDC                      |
| pnpm            | Package manager                                       |
| Vite            | Build tool                                            |

## Theme

The visual system is defined in `src/themes/hackagon.css`: semantic colour
tokens that flip with `data-mode`, the mono/sans type roles, and the
`.btn`/`.badge`/`.card`/`.field`/`.chip` component classes. There is no UI
framework underneath it. See the `frontend-theme` skill for how to use it and
the reasoning behind it.

`scripts/migrate-skeleton-classes.mjs` rewrites the Skeleton classes this app
used before that theme existed. It is only needed on branches cut before the
migration; run `--dry` first and read the diff, since `preset-*` classes are
context-dependent. Delete the script once no such branch is left.

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
