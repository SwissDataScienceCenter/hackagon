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

The tunnel targets `caddy`, which path-splits the one public hostname:
`/realms/*` + `/resources/*` reach Keycloak, everything else the frontend
(`Caddyfile.tunnel`). Anonymous browsing works out of the box; **login
through the tunnel** additionally needs the OIDC issuers rewired to the
(ephemeral) public URL — scripted as
`bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth`, undone by
the matching `down.sh`. Keycloak trusts forwarded headers for this
(`proxy-headers=xforwarded` in toolchain.nix); the admin console is not
routed through the tunnel. Stop with
`docker compose -f .devcontainer/docker-compose.yml --profile tunnel down tunnel caddy`
(quick-tunnel URLs are ephemeral and change on every start).

## Optional service containers (profile `services`)

By default Postgres and Keycloak run *inside* `dev`, as devenv/process-compose
processes. The compose file also defines them as real containers:

```bash
docker compose -f .devcontainer/docker-compose.yml --profile services up -d
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
    bash /workspaces/hackagon/.devcontainer/service-bridge.sh
```

Both carry healthchecks (`pg_isready`; Keycloak's `/health/ready` over bash's
`/dev/tcp`, since that image ships no curl) and named volumes, and Keycloak
imports the same checked-in realm export the Nix service uses. Their ports are
**not** published — `dev` reaches them by name on the compose network, and
publishing would collide with the ports `dev` already maps.

`service-bridge.sh` socat-forwards `localhost:5432` and `localhost:8180`
inside `dev` to those containers, so every checked-in config (backend
`config.yaml`, the frontend `oidc.issuer`, `just rpc-as`, the e2e skill) keeps
working unchanged. It is the mirror image of `host-bridge.sh`.

**They are opt-in because `just up` still starts devenv's own Postgres and
Keycloak, and the two sets would fight over ports.** The Nix shell has a
`withPostgres` flag but no `withKeycloak` one, so making these the default
needs a change in `tools/nix/hackagon/lib/toolchain.nix` first.

Note for `postgres:18+`: the data volume mounts at `/var/lib/postgresql`, not
`/var/lib/postgresql/data`. The older path makes the entrypoint abort with an
incompatible-data-directory error.

## Volumes & network

Named volumes keep expensive state out of the (slow, host-bound) workspace
bind mount and survive container rebuilds:

- `nix-store` (`/nix`) — the Nix store / toolchain.
- `home-vscode` (`/home/vscode`) — nix profile symlinks, shell rc, caches;
  makes a manually installed Nix survive container recreation.
- `devenv-state` (`.devenv`) — devenv state, **including the Postgres data
  directory** (`.devenv/state/postgres`).
- `direnv-state` (`.direnv`) — direnv cache.
- `frontend-node-modules` (`components/frontend/node_modules`),
  `frontend-svelte-kit` (`components/frontend/.svelte-kit`) and `pnpm-store`
  (`.pnpm-store`) — Node dependencies and build caches.

**Why node_modules must be a volume.** The workspace bind mount is a `9p`
filesystem on Windows (and osxfs/virtiofs on macOS); the volumes are native
`ext4`. `node_modules` is ~275 MB of small files, and every `stat()` across
that boundary is expensive. Measured on the bind mount, a single
`require("isomorphic-dompurify")` (which pulls in jsdom) took **52 seconds** —
past vite's 60 s SSR module-transport timeout, so every route returned 500.
The same require is fast from the volume. Confirm which side you are on with
`findmnt -no TARGET,FSTYPE | grep node_modules` — it must say `ext4`, not
`9p`.

The trade-off: the volume **masks** the host directory, so `node_modules` is
invisible from Windows (editors relying on it for IntelliSense should run
inside the container, which is the intended workflow) and starts **empty** on
first creation — `post-create.sh` chowns the mountpoints (they appear
root-owned) and `bootstrap.sh` repopulates them with `pnpm install`.

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
