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

| Port | Service        | Where it binds                       |
| ---- | -------------- | ------------------------------------ |
| 3000 | backend (gRPC) | inside `dev`, all interfaces         |
| 8081 | frontend       | inside `dev`, `[::1]` (vite)         |
| 8180 | keycloak       | inside `dev`, 0.0.0.0                |
| 5432 | postgres       | inside `dev`, 127.0.0.1              |
| 9000 | rustfs S3 API  | own container — see the object store |
| 9001 | rustfs console | own container — subpath `/rustfs/console/` |

The `rustfs` ports need no bridging: it is its own container, published
straight to the host, and reached from `dev` as `rustfs:9000`. Note that 9000
is **also** Keycloak's management port inside `dev` — unrelated listener, same
number, which is why the object store cannot be bridged onto `localhost:9000`
there.

For the four services that live inside `dev`: with VS Code / the devcontainer
CLI all of them are forwarded automatically (loopback included). With **plain
compose**, Docker's published ports only reach services binding non-loopback
addresses — run the bridge script once after the services are up to cover the
rest:

```bash
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
  bash /workspaces/hackagon/.devcontainer/host-bridge.sh
```

### Access: public imagery, private everything else

`rustfs-init.sh` applies a bucket policy on every run. Two prefixes are readable
with **no credentials at all**; nothing else is.

| Prefix | Read access | Holds |
| --- | --- | --- |
| `hackathons/*` | public | event covers, gallery photos |
| `users/*` | public | profile pictures |
| everything else | private | submission attachments, exports |

Public-read is a decision, not an accident (see `docs/storage.md`): these images
already render on pages that need no login, so a public prefix gives a stable
URL that never expires and can be cached — which is also what lets an uploaded
image sit in the existing `logo` / `avatar_url` columns with no schema change.
Private files are reached through short-lived presigned GETs, minted only after
casbin has approved the read.

`rustfs-init.sh --selftest` asserts **both halves**: it uploads a probe under
each prefix, reads them unsigned, and fails unless it sees 200 and 403
respectively. Getting this backwards is silent — signed callers keep working
while the private half is world-readable — so it is tested rather than assumed.

### Objects are served from the app's own origin

The database stores a **root-relative path**, never a hostname:

```
/objects/hackagon-dev/hackathons/seed/climate-tech-hackathon-2026/cover.webp
```

`http://localhost:9000/...` would render for the machine that wrote it and for
nobody else — not through the Cloudflare tunnel, not in a deployment. A
same-origin path resolves everywhere, and two routes make that true:

- **`vite dev`** — a `/objects` proxy in `components/frontend/vite.config.ts`.
- **the tunnel and the built server** — `handle_path /objects/*` in
  `.devcontainer/Caddyfile.tunnel`, which strips the prefix and proxies to
  `rustfs:9000`.

The bucket policy still decides what comes back: an unsigned read of `teams/*`
answers 403 through this route exactly as it does directly.

### Seeded event pictures

`rustfs-init.sh` (and `--seed-media` on its own) uploads a cover for each seeded
hackathon from the repo's own event photographs:

```
hackathons/seed/ai-innovation-challenge-2026/cover.webp
hackathons/seed/climate-tech-hackathon-2026/cover.webp
hackathons/seed/internal-product-sprint/cover.webp
```

Keyed by **slug, not id**: ids are new on every reseed and the pictures are not,
so `just db::seed` points each event at a cover that is already there instead of
leaving three broken image frames. Content-Type is set from the file extension —
curl otherwise stores `application/x-www-form-urlencoded`, the bytes upload
fine, and the browser then refuses to render them.

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

## Object store (service `rustfs`)

An S3-compatible object store so the platform can **store uploaded files
locally** instead of only accepting links. It is
[RustFS](https://rustfs.com) — a single Rust binary, pinned to
`rustfs/rustfs:1.0.0-beta.12` (multi-arch: amd64 + arm64).

Unlike Postgres and Keycloak this is **not** behind a profile: there is no
devenv copy of it to fight over ports with, so it starts with the rest of the
stack. It is a plain sibling of `dev` with no `depends_on` in either
direction — adding one would alter `dev`'s compose config, and that recreates
the container and kills the process-compose stack inside it.

```bash
# start it (safe on a running stack — only this service is touched)
docker compose -f .devcontainer/docker-compose.yml up -d rustfs

# create the bucket — idempotent, re-run whenever
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
    bash /workspaces/hackagon/.devcontainer/rustfs-init.sh

# prove it: PUT an object, GET it back, compare bytes, list, delete
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
    bash /workspaces/hackagon/.devcontainer/rustfs-init.sh --selftest
```

| | |
| --- | --- |
| Endpoint **from `dev`** (and from the backend) | `http://rustfs:9000` |
| Endpoint **from the host** | `http://localhost:9000` |
| Bucket | `hackagon-dev` |
| Access key / secret key | `hackagon-dev` / `hackagon-dev-secret` |
| Region | `us-east-1` |
| Addressing | **path-style only** (`endpoint/bucket/key`) |
| Web console | `http://localhost:9001/rustfs/console/` |
| Data | named volume `rustfs-data` (→ `/data`) |

**Why the backend addresses it by service name, not `localhost`.** Every other
checked-in config reaches its dependency on `localhost` (bridged by
`service-bridge.sh` when the service is containerised). That is impossible
here: inside `dev`, port 9000 is already **Keycloak's management port**, so
there is nothing to bridge onto. `rustfs:9000` resolves over the compose
network instead. Running the backend natively, outside the container? The
published host port covers it —
`HACKAGON_STORAGE_ENDPOINT=http://localhost:9000`.

Mind the **console subpath**: `http://localhost:9001/` is still the S3 router
and answers `403 AccessDenied`. The UI is at `/rustfs/console/`.

**Credentials are dev-only.** They sit in `docker-compose.yml` and in
`components/backend/data/test/config/config.yaml` in plain sight, exactly like
`POSTGRES_PASSWORD: postgres` and the Keycloak `admin`/`admin` next to them —
committed so a fresh checkout works with zero setup, and worthless because
nothing but a laptop ever serves on that port. **They must never reach a
deployment.** Override per machine in `.devcontainer/.env`
(`HACKAGON_RUSTFS_ACCESS_KEY`, `HACKAGON_RUSTFS_SECRET_KEY`) and, for the
backend, via `HACKAGON_STORAGE_ACCESSKEY` / `HACKAGON_STORAGE_SECRETKEY` —
koanf maps `HACKAGON_STORAGE_*` onto the `storage.*` config keys, so nothing
secret has to live in a file.

### Backend configuration

`components/backend/internal/config/config.go` gained a `storage` section
(`endpoint`, `region`, `bucket`, `accesskey`, `secretkey`, `usepathstyle`),
declared the same way as the existing sections: struct + `yaml:` tags,
defaults in the `confmap` provider, overridable by `HACKAGON_*` env vars. Like
the other sections it carries **no hard validation** — `Load()` still only
rejects a missing `server.adminkeycloakid` — so an unconfigured store fails at
first use, not at boot.

`usepathstyle: true` is not optional: rustfs serves virtual-hosted-style
requests (`bucket.host/key`) only when `RUSTFS_SERVER_DOMAINS` is set, and
there is no wildcard DNS for `*.rustfs` on a compose network. Configure any S3
SDK with `forcePathStyle` / `s3_use_path_style` accordingly.

### Reset

The store is a named volume, so resetting it is a volume operation — never
`rm -rf` on the workspace (nothing of it lives there):

```bash
docker compose -f .devcontainer/docker-compose.yml stop rustfs
docker compose -f .devcontainer/docker-compose.yml rm -f rustfs
docker volume rm devcontainer_rustfs-data     # prefix = COMPOSE_PROJECT_NAME
docker compose -f .devcontainer/docker-compose.yml up -d rustfs
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
    bash /workspaces/hackagon/.devcontainer/rustfs-init.sh
```

`rustfs-init.sh --status` lists what is currently in the bucket.

### No S3 client is installed, and that is deliberate

The dev container ships neither `aws` nor `mc`. Adding one would mean editing
the Dockerfile (which recreates `dev` and kills the stack inside it) or a
permanent dev-shell change, so `rustfs-init.sh` signs its own SigV4 requests
with `curl` + `openssl`, both already present. For a full-featured client,
borrow one for the duration of a command:

```bash
nix shell nixpkgs#awscli2 -c env \
  AWS_ACCESS_KEY_ID=hackagon-dev AWS_SECRET_ACCESS_KEY=hackagon-dev-secret \
  AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true \
  aws --endpoint-url=http://rustfs:9000 s3 ls s3://hackagon-dev/ --recursive
```

### What changes for a real deployment

Everything above is shaped for one laptop and none of it is production
posture. A deployment replaces the container with a managed bucket (S3, or
MinIO/RustFS run properly) and changes four things. **Credentials** stop being
literals: inject `HACKAGON_STORAGE_ACCESSKEY`/`SECRETKEY` from the platform's
secret store — better, drop static keys entirely for a workload identity
(IRSA/instance role) and scope the policy to `GetObject`/`PutObject`/
`DeleteObject` on `arn:…:bucket/*` only, never `s3:*` and never bucket-level
admin. **Bucket policy** stays private — the dev bucket already denies
unsigned reads (verified: `403 AccessDenied`), and public objects should be
served through the app or a CDN with time-limited **presigned URLs** rather
than by making a prefix world-readable; block public access at the account
level so a stray ACL cannot undo it. **TLS** is mandatory: the endpoint
becomes `https://`, since SigV4 authenticates a request but encrypts nothing,
and presigned URLs handed to browsers would otherwise leak in transit.
**Lifecycle and durability** have no dev equivalent at all: versioning +
a noncurrent-version expiry so an overwrite is recoverable, an
abort-incomplete-multipart rule (7 days) so failed browser uploads stop
accruing cost, retention/expiry per prefix matching how long a hackathon's
media must outlive the event, and cross-region or at least cross-AZ
replication — the dev store runs a single drive with **zero parity** (it logs
`storage_class_zero_redundancy` on boot), which is fine for a laptop and
unacceptable for anything else. Also size it: uploads want a request-size cap
and a per-user quota enforced by the app before the bytes ever reach the
bucket.

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
- `rustfs-data` (`/data` in the `rustfs` container) — uploaded objects. A
  volume rather than a workspace bind mount for the same small-file-IO reason
  as `node_modules` below; an object store is exactly that workload.

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

The app itself (backend, frontend, Keycloak, Postgres) runs in-container via
process-compose; `rustfs` is the one dependency that is a real container by
default. If you need another external service, add it to `docker-compose.yml`
following the same `${VAR:-default}` convention, e.g.:

```yaml
  mailpit:
    image: ${HACKAGON_MAILPIT_IMAGE:-axllent/mailpit:latest}
    ports:
      - "${HACKAGON_MAILPIT_PORT:-8025}:8025"
```

Two rules, both learned the hard way (the `rustfs` service follows them):

- **Add it as a sibling — never touch `dev`'s own definition.** Any change to
  `dev`'s compose config recreates that container, which kills the
  process-compose stack running inside it (Postgres, Keycloak, backend,
  frontend) and wipes anything apt-installed at runtime. That rules out a new
  `depends_on` or environment entry on `dev`.
- **Never gate a sidecar on `dev`'s health.** `dev` only reports healthy once
  someone runs `just up`, which compose does not manage, so
  `depends_on: {dev: {condition: service_healthy}}` deadlocks.

Pin the image tag (never `latest`) and put persistent state in a named volume,
not the workspace bind mount.
