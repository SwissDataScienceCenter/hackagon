# Devcontainer

Docker-compose-based devcontainer for Hackagon. The container provides Nix;
everything else (Go, pnpm, buf, process-compose, Keycloak, Postgres, …) comes
from the repo's flake (`tools/nix`) exactly as on a native setup — so `just`
commands behave identically inside and outside the container.

## Usage

- **VS Code**: "Dev Containers: Reopen in Container".
- **CLI**: `devcontainer up --workspace-folder .`
- **Plain compose** (no devcontainer tooling):
  `docker compose -f .devcontainer/docker-compose.yml up -d dev`, then
  `docker compose -f .devcontainer/docker-compose.yml exec dev bash`
  (note: the Nix feature is only installed by devcontainer tooling; with plain
  compose you must install Nix yourself).

First start inside the container:

```bash
just dev      # enter the Nix dev shell (first run downloads the toolchain)
just start    # keycloak + postgres + backend + frontend via process-compose
```

## Configuration

Copy `.env.example` to `.devcontainer/.env` (gitignored) and override what you
need — base image, extra apt packages, timezone, published host ports, compose
project name. The compose file uses `${VAR:-default}` everywhere, so an empty
`.env` (or none) gives the standard setup.

Optional features (docker-in-docker, …) can be enabled by uncommenting them in
`devcontainer.json`.

## Ports

| Port | Service        | Binds        |
| ---- | -------------- | ------------ |
| 3000 | backend (gRPC) | localhost    |
| 8081 | frontend       | localhost    |
| 8180 | keycloak       | 0.0.0.0      |
| 5432 | postgres       | localhost    |

All four are forwarded by VS Code / the devcontainer CLI (works regardless of
bind address). The compose `ports:` mappings only reach services binding
`0.0.0.0` from the host — relevant for plain-compose usage only.

## Persistence

Named volumes keep expensive state out of the (slow, host-bound) workspace
mount:

- `nix-store` (`/nix`) — the Nix store; survives container rebuilds.
- `devenv-state` / `direnv-state` — devenv and direnv caches.

Reset everything:

```bash
docker compose -f .devcontainer/docker-compose.yml down --volumes
```

Note: because `/nix` lives in a volume, updating the Nix *feature* in
`devcontainer.json` has no effect until the `nix-store` volume is removed.

## Adding sidecar services

The default stack runs all services in-container via process-compose. If you
need an external service instead, add it to `docker-compose.yml` following the
same `${VAR:-default}` convention, e.g.:

```yaml
  mailpit:
    image: ${HACKAGON_MAILPIT_IMAGE:-axllent/mailpit:latest}
    ports:
      - "${HACKAGON_MAILPIT_PORT:-8025}:8025"
```
