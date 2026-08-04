# Devcontainer

Docker-compose-based devcontainer for Hackagon. The container provides Nix;
everything else (Go, pnpm, buf, process-compose, Keycloak, Postgres, …) comes
from the repo's flake (`tools/nix`) exactly as on a native setup — so `just`
commands behave identically inside and outside the container.

## Usage

- **VS Code**: "Dev Containers: Reopen in Container". Nix is installed by the
  devcontainer feature and `post-create.sh` runs automatically.
- **CLI**: `devcontainer up --workspace-folder .`
- **Plain compose** (no devcontainer tooling):

  ```bash
  docker compose -f .devcontainer/docker-compose.yml up -d dev
  docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev bash
  # inside — install Nix once (the feature would normally do this):
  sudo mkdir -p /nix && sudo chown "$(id -u):$(id -g)" /nix
  sh <(curl -fsSL https://nixos.org/nix/install) --no-daemon
  printf 'experimental-features = nix-command flakes\nsandbox = false\n' \
    | tee -a ~/.config/nix/nix.conf >/dev/null
  cd /workspaces/hackagon && bash .devcontainer/post-create.sh
  ```

## Bootstrap (what post-create does)

`post-create.sh` is idempotent and does, in order: git `safe.directory`,
volume-mountpoint ownership, `just`/`direnv`/`socat` via `nix profile`,
generates the gitignored frontend dev secrets
(`components/frontend/data/test/config/secrets.yaml` — without it the frontend
answers 500), then runs `bootstrap.sh`:

1. `pnpm install` — provides the `ts_proto` plugin `buf` invokes from
   `node_modules`
2. `buf generate` — creates the gitignored `internal/proto`
3. ent codegen — creates the gitignored `ent/`
4. `go mod tidy` — resolves only once the generated packages exist

This order is load-bearing; the generated code is not committed, so every
fresh workspace needs it. Skip with `HACKAGON_SKIP_BOOTSTRAP=1` in
`.devcontainer/.env`. The first run downloads the full toolchain (multi-GB);
the `nix-store` volume caches it for every rebuild after that.

Start everything:

```bash
just develop just deploy::up   # keycloak + postgres + backend + frontend
```

Dev logins: `alice`, `bob`, `charles`, `hackagon-admin` — password
`aliceandbob`. Seed data: `just develop just db::seed`.

## Configuration

Copy `.env.example` to `.devcontainer/.env` (gitignored) and override what you
need — ports, base image, extra apt packages, timezone, restart policy,
network name, compose project name. The compose file uses `${VAR:-default}`
everywhere, so an empty `.env` (or none) gives the standard setup.

Optional features (docker-in-docker, …) can be enabled by uncommenting them in
`devcontainer.json`.

## Ports

| Port | Service        | Binds inside container |
| ---- | -------------- | ---------------------- |
| 3000 | backend (gRPC) | all interfaces         |
| 8081 | frontend       | `[::1]` (vite)         |
| 8180 | keycloak       | 0.0.0.0                |
| 5432 | postgres       | 127.0.0.1              |

With VS Code / the devcontainer CLI, all four are forwarded automatically
(loopback included). With **plain compose**, Docker's published ports only
reach services binding non-loopback addresses — run the bridge script once
after the services are up to cover the rest:

```bash
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
  bash /workspaces/hackagon/.devcontainer/host-bridge.sh
```

## Public URL (Cloudflare quick tunnel, optional)

An opt-in `tunnel` service (compose profile `tunnel`) exposes the running
frontend on a random `*.trycloudflare.com` URL — no Cloudflare account
needed. The bridge script must be running so the tunnel container can reach
Vite:

```bash
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
  bash /workspaces/hackagon/.devcontainer/host-bridge.sh
docker compose -f .devcontainer/docker-compose.yml --profile tunnel up -d tunnel
docker compose -f .devcontainer/docker-compose.yml logs tunnel | grep -o 'https://.*trycloudflare.com'
```

Anonymous browsing (public listing, event pages, News & Pages) works fully.
**Logging in through the tunnel does not**: the OIDC flow redirects to
Keycloak at `localhost:8180`, which only resolves on your machine. Exposing
auth would need a second tunnel plus per-URL issuer/redirect configuration —
out of scope for a quick share link. Stop with
`docker compose -f .devcontainer/docker-compose.yml --profile tunnel down tunnel`
(quick-tunnel URLs are ephemeral and change on every start).

## Volumes & network

Named volumes keep expensive state out of the (slow, host-bound) workspace
bind mount and survive container rebuilds:

- `nix-store` (`/nix`) — the Nix store / toolchain.
- `home-vscode` (`/home/vscode`) — nix profile symlinks, shell rc, caches;
  makes a manually installed Nix survive container recreation.
- `devenv-state` (`.devenv`) — devenv state, **including the Postgres data
  directory** (`.devenv/state/postgres`).
- `direnv-state` (`.direnv`) — direnv cache.

Volume names are prefixed with the compose project name, so parallel
checkouts don't collide as long as `COMPOSE_PROJECT_NAME` differs. The
network has an explicit name (`hackagon-dev`, override via
`HACKAGON_DEV_NETWORK`) so sidecars and ad-hoc containers can attach:
`docker run --network hackagon-dev …`.

Inspect / reset:

```bash
docker volume ls --filter name=devcontainer   # or your project name
docker compose -f .devcontainer/docker-compose.yml down            # keep state
docker compose -f .devcontainer/docker-compose.yml down --volumes  # full reset
```

Note: because `/nix` lives in a volume, updating the Nix *feature* in
`devcontainer.json` has no effect until the `nix-store` volume is removed.

Known wrinkle after recreating the container: Keycloak's H2 database (in
`devenv-state`) keeps a JGroups cluster-membership row for the previous
container's hostname, so its first boot can hang spamming
`failed sending message ... SocketTimeoutException`. One
`just develop just deploy::proc-comp process restart keycloak` fixes it —
the stale member ages out. The frontend also takes a few minutes on first
boot (pnpm install + svelte-kit sync before vite listens).

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
