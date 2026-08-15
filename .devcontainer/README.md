# Devcontainer

Docker-compose-based devcontainer for Hackagon. The container provides Nix;
everything else (Go, pnpm, buf, process-compose, Keycloak, Postgres, …) comes
from the repo's flake (`tools/nix`) exactly as on a native setup — so `just`
commands behave identically inside and outside the container.

## Required vs optional — read this first

**Required to develop and run Hackagon: Nix (with flakes) and git. That is the
whole list.** Go, pnpm, buf, process-compose, Keycloak, Postgres, psql, grpcurl
and `just` itself all come out of `tools/nix`. Keycloak and Postgres run as
devenv **processes**, not containers (`tools/nix/hackagon/lib/toolchain.nix`),
and nothing in `justfile`, `tools/just/*.just` or `tools/deploy/` shells out to
Docker or Podman. So on Linux (or macOS) with Nix installed there is no
container runtime in the picture at all.

Everything below is **optional**, and here is what each piece buys you and what
you lose without it:

| Piece                                    | Buys you                                                                                                                 | Without it                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This devcontainer (Docker)               | A Linux box with Nix on a Windows/macOS host; pinned browser libs for e2e                                                | Nothing, if you are on Linux. On Windows you need _some_ Linux (WSL2 works) because Nix does not run natively there.                                                                                                                                                                                             |
| `rustfs` object store (Docker)           | File uploads: event logos, page media, submission attachments                                                            | The app still **boots and serves** (verified: backend `health.HealthService/Check` OK, frontend `/` 200). Uploads fail at use time and `/objects/*` answers **500**. Nothing warns you at boot.                                                                                                                  |
| Cloudflare tunnel (`tunnel`+`caddy`)     | A public URL with working OIDC login — a throwaway `*.trycloudflare.com` one, or a persistent hostname on a zone you own | Localhost only. No effect on anything else.                                                                                                                                                                                                                                                                      |
| Debug rigs: OpenReplay, Plausible        | Session replay; cookieless audience measurement. Each is its own compose project with its own tunnel                     | Nothing — both are **off unless** a `replay:` / `plausible:` block reaches the frontend config (`src/lib/schemas/config-schema.ts`); the rigs write theirs into the gitignored `config.local.yaml` overlay. Idle cost when you do run them: ~750 MB for Plausible, 8 GB of its own for OpenReplay. They coexist. |
| `services` compose profile               | Postgres + Keycloak as real containers instead of devenv processes                                                       | Nothing; the devenv copies are the default and the two sets fight over ports, which is why the profile is opt-in.                                                                                                                                                                                                |
| `.claude/` skills (e2e, tunnel, docs, …) | The Playwright suites, the recipe spec, the mutation manifest and quality report, the tunnel and docs tooling            | Nothing in the app's build, test or run path. Grep confirms: outside `.claude/` the only references to it are explanatory comments.                                                                                                                                                                              |

### Minimal path from a clean machine to a running app

Generated code is **not committed**, so a fresh clone must produce it before
anything compiles. This is the whole sequence:

```bash
git clone https://github.com/SwissDataScienceCenter/hackagon.git
cd hackagon

# codegen + deps (order is load-bearing: ts_proto comes from node_modules,
# and `go mod tidy` only resolves once the generated packages exist)
just develop bash -c "cd components/frontend && pnpm install --frozen-lockfile"
just develop just codegen::proto
just develop just codegen::db-schema
just develop bash -c "cd components/backend && GOWORK=off go mod tidy"

# dev secrets for the frontend (gitignored; without it every request 500s)
printf 'oidc:\n  clientSecret: "%s"\n  authSecret: "%s"\n' \
    "$(openssl rand -base64 32)" "$(openssl rand -base64 32)" \
    > components/frontend/data/test/config/secrets.yaml

just develop just deploy::up     # keycloak + postgres + backend + frontend
just develop just db::seed       # optional dev fixture
just develop just deploy::proc-comp process restart backend   # casbin reload
```

`.devcontainer/bootstrap.sh` is exactly those first four commands;
`post-create.sh` runs it and writes the secrets too. The backend restart after
seeding is not optional: casbin loads its policy once at startup and the seed
writes roles straight into Postgres.

Neither script prepares the object store — nothing in the app's own build path
knows it exists. If you are using the container, run
`bash .devcontainer/rustfs-init.sh` once (idempotent) or let
`.claude/skills/devcontainer-up/scripts/up.sh` do it for you; without it the
store is up but empty, which shows as three broken `<img>` frames on the
hackathon list and 404s under `/objects`.

⚠ **The bootstrap leaves the tree dirty.** `GOWORK=off go mod tidy` prunes
exactly 26 lines from the committed `components/backend/go.sum`, so your first
`git status` is not clean. The build is unaffected. `just ci::codegen-check`
runs the same command followed by `git diff --exit-code`, so this needs
resolving rather than ignoring. (Still true: re-run in this container on
2026-08-14 at `a5003590`, same 26 deletions.)

Nothing _else_ should be dirty. `git-lfs` is in the image as of 2026-08-13, so
the three LFS-tracked binaries (`components/frontend/static/favicon.png`,
`static/og-default.jpg`, the Keycloak theme's `favicon.ico`) no longer read as
permanently modified. They used to: the workspace is bind-mounted from a Windows
host that HAS git-lfs, so the worktree held real bytes while HEAD held a
129-byte pointer, and a container with no `filter.lfs` config compared the two
and reported ` M` forever. That was a filter that was never installed, not an
edit — and while it lasted, `git status` was not a signal anything could read.

**Budget the first run.** It downloads and partly _compiles_ the toolchain —
devenv's own Rust binaries build from source, because the flake declares its
caches under `extra-trusted-substituters` (permission to use) rather than
`extra-substituters` (actually use them). Measured here on a busy 48 GB machine:
bootstrap ≈ 12 minutes to a ~10 GB Nix store, then `deploy::up` ≈ 5 more minutes
before process-compose reports the stack started (Keycloak's `kc.sh build` runs
in that window), and the frontend needs a few minutes more before Vite listens.

**After that, entering the shell is cheap — and an earlier claim that it was not
was wrong.** Every `just develop …` (and therefore every service in the stack,
whose start commands are `just develop just run` / `just develop just serve`)
re-enters `nix develop`. Measured in this container on 2026-08-14 at `a5003590`,
`just nix::develop default true`:

|                                         | measured                                      |
| --------------------------------------- | --------------------------------------------- |
| steady state, tree clean                | **4.6–5.0 s**                                 |
| steady state, one tracked file modified | 4.7–5.0 s — **no difference**                 |
| first entry after a tree edit           | 4.7–10.6 s (one 36 s outlier, not reproduced) |
| against a _fixed_ devenv-root file      | 3.2–4.5 s                                     |

That last row is where the avoidable cost is: `tools/just/devenv.sh` rewrites
`.devenv/state/pwd` on **every** invocation, so the `devenv-root` flake input
gets a new `lastModified` and Nix's eval cache misses every single run — about
1.7 s of the 4.8 s, self-inflicted. Clean-versus-dirty is not the variable; the
"44 s floor on a permanently dirty worktree" written down previously was almost
certainly measured while `frontend` was crash-looping through one full
`nix develop` per round (see "When the stack starves itself" below), and
installing git-lfs — which does make the tree genuinely clean — moved the number
not at all. Keep git-lfs for the truthful `git status`, not for speed.

**On the native path.** These commands are what the container runs — the
container adds nothing but Nix — but the run behind this document was performed
in the devcontainer on a Windows host, where native Nix is not an option. The
"no container runtime" claim above is read off the configuration
(`toolchain.nix` runs Keycloak and Postgres as devenv processes; no recipe in
`justfile`, `tools/just/` or `tools/deploy/` invokes docker or podman), not off
an executed native Linux run.

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
  # mkdir first: the installer does not create ~/.config/nix, so `tee` into it
  # fails with "No such file or directory" and the flake settings never land.
  mkdir -p ~/.config/nix
  printf 'experimental-features = nix-command flakes\nsandbox = false\n' \
    | tee -a ~/.config/nix/nix.conf >/dev/null
  cd /workspaces/hackagon && bash .devcontainer/post-create.sh
  ```

  The installer writes its PATH line into `~/.profile` and `~/.zshrc`, not
  `~/.bashrc`; `post-create.sh` adds the `~/.bashrc` line itself. Scripted
  `docker compose exec` calls after this must therefore use a **login** shell
  (`bash -lc '…'`) or `just` will not be on `PATH`.

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

This order is load-bearing; the generated code is not committed, so every fresh
workspace needs it. Skip with `HACKAGON_SKIP_BOOTSTRAP=1` in
`.devcontainer/.env`. The first run downloads the full toolchain (multi-GB); the
`nix-store` volume caches it for every rebuild after that.

Start everything:

```bash
just develop just deploy::up   # keycloak + postgres + backend + frontend
```

Dev logins: `alice`, `bob`, `charles`, `hackagon-admin` — password
`aliceandbob`. Seed data: `just develop just db::seed`.

## Configuration

Copy `.env.example` to `.devcontainer/.env` (gitignored) and override what you
need — ports, base image, extra apt packages, timezone, restart policy, network
name, compose project name. The compose file uses `${VAR:-default}` everywhere,
so an empty `.env` (or none) gives the standard setup.

Optional features (docker-in-docker, …) can be enabled by uncommenting them in
`devcontainer.json`.

### Two checkouts at once

Nothing stops a second checkout running beside the first, and you do not have to
stop the first one — but the defaults collide on **three** axes: the compose
project name (which prefixes containers and volumes), the network name, and the
published host ports. Override all three in the second checkout's
`.devcontainer/.env`. The in-container ports never change (3000/8081/8180/5432
and `rustfs:9000`), so no checked-in config needs touching:

```ini
COMPOSE_PROJECT_NAME=hackagon-fresh
HACKAGON_DEV_NETWORK=hackagon-fresh
HACKAGON_BACKEND_PORT=13000
HACKAGON_FRONTEND_PORT=18081
HACKAGON_KEYCLOAK_PORT=18180
HACKAGON_POSTGRES_PORT=15433
HACKAGON_RUSTFS_PORT=19000
HACKAGON_RUSTFS_CONSOLE_PORT=19001
```

This was executed: two full stacks — each with its own Postgres, Keycloak,
backend, frontend and object store — served simultaneously from one host, and
the e2e suite ran in the second without touching the first. The cost is a second
Nix store (~10 GB): the `nix-store` volume is per project, so the new checkout
re-downloads the toolchain.

There is a **fourth** collision axis if both checkouts use named Cloudflare
tunnels and share one Cloudflare account: the tunnel names default to
`hackagon`, `hackagon-plausible`, `hackagon-openreplay`, so the second checkout
would reuse the first's tunnel and repoint its DNS. Set `HACKAGON_TUNNEL_NAME`
(and the Plausible/OpenReplay equivalents) in
`.claude/skills/cloudflare-tunnel/.env` — a different file from the
`.devcontainer/.env` above.

## Ports

| Port | Service                     | Where it binds                                         |
| ---- | --------------------------- | ------------------------------------------------------ |
| 3000 | backend (gRPC)              | inside `dev`, all interfaces                           |
| 8081 | frontend                    | inside `dev`, `[::1]` — vite, **or** the built server  |
| 8082 | frontend (production build) | inside `dev`, **not published** — caddy's first choice |
| 8180 | keycloak                    | inside `dev`, 0.0.0.0                                  |
| 5432 | postgres                    | inside `dev`, 127.0.0.1                                |
| 9000 | rustfs S3 API               | own container — see the object store                   |
| 9001 | rustfs console              | own container — subpath `/rustfs/console/`             |

**Two things can hold :8081.** `just up` starts `vite dev` there; the e2e
harness stops vite and parks the adapter-node production build on the same port
(`hackathon-e2e/scripts/prod-frontend.sh`), because after a codegen regeneration
vite's first SSR takes longer than any readiness probe will wait. :8081 is the
port to prefer for anything driving a browser — the realm export's
`hackagon-frontend` client allows exactly one redirect URI,
`http://localhost:8081/*`, so a login on :8082 dies with
`Invalid parameter: redirect_uri`. :8082 exists for the tunnel
(`cloudflare-tunnel/scripts/prod-serve.sh`), whose `Caddyfile.tunnel` tries
`dev:8082` first and falls back to `dev:8081`, so a public URL and a suite run
stop fighting over one port. It binds `HOST=::` (dual-stack) because caddy
reaches it as `dev:8082` on the container's eth0 while local checks use `::1` —
and it is deliberately not published, so nothing on the host can reach it and
mistake it for the app.

The `rustfs` ports need no bridging: it is its own container, published straight
to the host, and reached from `dev` as `rustfs:9000`. Note that 9000 is **also**
Keycloak's management port inside `dev` — unrelated listener, same number, which
is why the object store cannot be bridged onto `localhost:9000` there.

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

`rustfs-init.sh` applies a bucket policy on every run. Three prefixes are
readable with **no credentials at all**; nothing else is.

| Prefix          | Read access | Holds                                           |
| --------------- | ----------- | ----------------------------------------------- |
| `hackathons/*`  | public      | event covers, gallery photos                    |
| `users/*`       | public      | profile pictures                                |
| `site/*`        | public      | media pasted into platform pages (`SITE_MEDIA`) |
| everything else | private     | submission attachments, exports                 |

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
Run here on 2026-08-14:
`hackathons/* 200, users/* 200, site/* 200, teams/* 403`.

**The list has to track `storage_service.go`.** A kind the backend marks public
but this policy has no prefix for uploads perfectly and then answers 403 to
every read, because the handler returns a `publicUrl` it has no way to know is
unreadable. That is exactly what happened when `SITE_MEDIA` landed, which is why
`check_public_policy` now probes _every_ public prefix rather than a
representative one.

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

## Public URL (Cloudflare tunnel, optional)

Two modes, and the tooling picks between them.

**Quick tunnel — the zero-setup default.** An opt-in `tunnel` service (compose
profile `tunnel`) exposes the running frontend on a random `*.trycloudflare.com`
URL — no Cloudflare account needed, and a new hostname on every start. The
bridge script must be running so the tunnel container can reach Vite:

```bash
docker compose -f .devcontainer/docker-compose.yml exec -u vscode dev \
  bash /workspaces/hackagon/.devcontainer/host-bridge.sh
docker compose -f .devcontainer/docker-compose.yml --profile tunnel up -d tunnel
docker compose -f .devcontainer/docker-compose.yml logs tunnel | grep -o 'https://.*trycloudflare.com'
```

The tunnel targets `caddy`, which path-splits the one public hostname:
`/realms/*` + `/resources/*` reach Keycloak, `/objects/*` the object store,
everything else the frontend (`Caddyfile.tunnel`). Anonymous browsing works out
of the box; **login through the tunnel** additionally needs the OIDC issuers
rewired to the public URL — scripted as
`bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth`, undone by the
matching `down.sh`. Keycloak trusts forwarded headers for this
(`proxy-headers=xforwarded` in toolchain.nix); the admin console is not routed
through the tunnel. Stop with
`docker compose -f .devcontainer/docker-compose.yml --profile tunnel down tunnel caddy`.

**Named tunnel — a hostname that stops changing.** Most of the re-wiring above
exists only because a quick-tunnel hostname is thrown away on every restart. A
named tunnel is a persistent hostname on a zone you own, and there is one per
rig, driven by `.claude/skills/lib/cf-named-tunnel.sh` from a **gitignored**
`.claude/skills/cloudflare-tunnel/.env` (copy `.env.example` beside it):

| rig        | hostname variable     | tunnel                | origin                  |
| ---------- | --------------------- | --------------------- | ----------------------- |
| the app    | `HACKAGON_HOSTNAME`   | `hackagon`            | `http://caddy:80`       |
| Plausible  | `PLAUSIBLE_HOSTNAME`  | `hackagon-plausible`  | `http://plausible:8000` |
| OpenReplay | `OPENREPLAY_HOSTNAME` | `hackagon-openreplay` | `http://caddy:80`       |

```bash
bash .claude/skills/lib/cf-named-tunnel.sh check    # credentials + zone only
bash .claude/skills/lib/cf-named-tunnel.sh status   # which named tunnels run
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth           # auto-selects
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth --quick   # force ephemeral
```

`up.sh` chooses named when those credentials exist and quick otherwise, **prints
which mode it is in**, and stops the other mode's tunnel — the OIDC issuer names
exactly one hostname, so a second public URL would serve every page and fail
every login, which is the failure nobody notices until somebody signs in. Caddy
needed no change: `Caddyfile.tunnel` binds `:80` for any Host, so the path mux
applies identically. Nothing tracked ever carries the hostname; the issuer goes
into the gitignored `config.local.yaml` overlay, and a spec in
`components/backend/internal/config/config_test.go` asserts both tracked configs
still say `localhost`.

⚠ **A Cloudflare API token scopes to a ZONE, not to a hostname.** There is no
per-subdomain grant. The narrowest token that can do this job can edit **any DNS
record in the whole zone** — do not describe it as limited to the three
subdomains above, and use a zone you are willing to hand to a dev script. The
tooling supplies the guard Cloudflare cannot: `cf_dns_point` refuses to replace
a record that is not already a `*.cfargotunnel.com` CNAME (`CF_FORCE_DNS=1`
overrides).

**The token is a SETUP credential.** Once the tunnels exist, `cloudflared` runs
from a per-tunnel credentials file under `.state/named/<name>/` that can serve
that one tunnel and nothing else: it cannot touch DNS, cannot enumerate the zone
and cannot create anything. A machine that only _runs_ a tunnel should hold that
directory and no token at all.

⚠ **A named hostname can look dead from the Windows host and be perfectly
healthy.** On this LAN the resolver answers **AAAA-only** for these names on a
network with no IPv6 route out, so every lookup succeeds and every connection
fails in milliseconds — while the same URL works from inside the dev container.
The tooling detects this rather than reporting a broken tunnel:
`cf-named-tunnel.sh` retries against a DoH-resolved IPv4 edge and, when that
answers, says "the tunnel is fine, this machine's resolver is not";
`auth-wire.sh` pins the name in `/etc/hosts` inside the container, and tests
reachability rather than asking `getent hosts`, which says yes about a name
nothing can reach. The manual check:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  --resolve app.example.org:443:<a-cloudflare-ipv4> https://app.example.org/
```

## Object store (service `rustfs`)

An S3-compatible object store so the platform can **store uploaded files
locally** instead of only accepting links. It is [RustFS](https://rustfs.com) —
a single Rust binary, pinned to `rustfs/rustfs:1.0.0-beta.12` (multi-arch:
amd64 + arm64).

Unlike Postgres and Keycloak this is **not** behind a profile: there is no
devenv copy of it to fight over ports with, so it starts with the rest of the
stack. It is a plain sibling of `dev` with no `depends_on` in either direction —
adding one would alter `dev`'s compose config, and that recreates the container
and kills the process-compose stack inside it.

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

|                                                |                                             |
| ---------------------------------------------- | ------------------------------------------- |
| Endpoint **from `dev`** (and from the backend) | `http://rustfs:9000`                        |
| Endpoint **from the host**                     | `http://localhost:9000`                     |
| Bucket                                         | `hackagon-dev`                              |
| Access key / secret key                        | `hackagon-dev` / `hackagon-dev-secret`      |
| Region                                         | `us-east-1`                                 |
| Addressing                                     | **path-style only** (`endpoint/bucket/key`) |
| Web console                                    | `http://localhost:9001/rustfs/console/`     |
| Data                                           | named volume `rustfs-data` (→ `/data`)      |

**Why the backend addresses it by service name, not `localhost`.** Every other
checked-in config reaches its dependency on `localhost` (bridged by
`service-bridge.sh` when the service is containerised). That is impossible here:
inside `dev`, port 9000 is already **Keycloak's management port**, so there is
nothing to bridge onto. `rustfs:9000` resolves over the compose network instead.
Running the backend natively, outside the container? The published host port
covers it — `HACKAGON_STORAGE_ENDPOINT=http://localhost:9000`.

Mind the **console subpath**: `http://localhost:9001/` is still the S3 router
and answers `403 AccessDenied`. The UI is at `/rustfs/console/`.

**Credentials are dev-only.** They sit in `docker-compose.yml` and in
`components/backend/data/test/config/config.yaml` in plain sight, exactly like
`POSTGRES_PASSWORD: postgres` and the Keycloak `admin`/`admin` next to them —
committed so a fresh checkout works with zero setup, and worthless because
nothing but a laptop ever serves on that port. **They must never reach a
deployment.** Override per machine in `.devcontainer/.env`
(`HACKAGON_RUSTFS_ACCESS_KEY`, `HACKAGON_RUSTFS_SECRET_KEY`) and, for the
backend, via `HACKAGON_STORAGE_ACCESSKEY` / `HACKAGON_STORAGE_SECRETKEY` — koanf
maps `HACKAGON_STORAGE_*` onto the `storage.*` config keys, so nothing secret
has to live in a file.

### Backend configuration

`components/backend/internal/config/config.go` gained a `storage` section
(`endpoint`, `region`, `bucket`, `accesskey`, `secretkey`, `usepathstyle`),
declared the same way as the existing sections: struct + `yaml:` tags, defaults
in the `confmap` provider, overridable by `HACKAGON_*` env vars. Like the other
sections it carries **no hard validation** — `Load()` still only rejects a
missing `server.adminkeycloakid` — so an unconfigured store fails at first use,
not at boot.

`usepathstyle: true` is not optional: rustfs serves virtual-hosted-style
requests (`bucket.host/key`) only when `RUSTFS_SERVER_DOMAINS` is set, and there
is no wildcard DNS for `*.rustfs` on a compose network. Configure any S3 SDK
with `forcePathStyle` / `s3_use_path_style` accordingly.

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

Everything above is shaped for one laptop and none of it is production posture.
A deployment replaces the container with a managed bucket (S3, or MinIO/RustFS
run properly) and changes four things. **Credentials** stop being literals:
inject `HACKAGON_STORAGE_ACCESSKEY`/`SECRETKEY` from the platform's secret store
— better, drop static keys entirely for a workload identity (IRSA/instance role)
and scope the policy to `GetObject`/`PutObject`/ `DeleteObject` on
`arn:…:bucket/*` only, never `s3:*` and never bucket-level admin. **Bucket
policy** stays private — the dev bucket already denies unsigned reads (verified:
`403 AccessDenied`), and public objects should be served through the app or a
CDN with time-limited **presigned URLs** rather than by making a prefix
world-readable; block public access at the account level so a stray ACL cannot
undo it. **TLS** is mandatory: the endpoint becomes `https://`, since SigV4
authenticates a request but encrypts nothing, and presigned URLs handed to
browsers would otherwise leak in transit. **Lifecycle and durability** have no
dev equivalent at all: versioning + a noncurrent-version expiry so an overwrite
is recoverable, an abort-incomplete-multipart rule (7 days) so failed browser
uploads stop accruing cost, retention/expiry per prefix matching how long a
hackathon's media must outlive the event, and cross-region or at least cross-AZ
replication — the dev store runs a single drive with **zero parity** (it logs
`storage_class_zero_redundancy` on boot), which is fine for a laptop and
unacceptable for anything else. Also size it: uploads want a request-size cap
and a per-user quota enforced by the app before the bytes ever reach the bucket.

## Optional service containers (profile `services`)

By default Postgres and Keycloak run _inside_ `dev`, as devenv/process-compose
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

`service-bridge.sh` socat-forwards `localhost:5432` and `localhost:8180` inside
`dev` to those containers, so every checked-in config (backend `config.yaml`,
the frontend `oidc.issuer`, `just rpc-as`, the e2e skill) keeps working
unchanged. It is the mirror image of `host-bridge.sh`.

**They are opt-in because `just up` still starts devenv's own Postgres and
Keycloak, and the two sets would fight over ports.** The Nix shell has a
`withPostgres` flag but no `withKeycloak` one, so making these the default needs
a change in `tools/nix/hackagon/lib/toolchain.nix` first.

Note for `postgres:18+`: the data volume mounts at `/var/lib/postgresql`, not
`/var/lib/postgresql/data`. The older path makes the entrypoint abort with an
incompatible-data-directory error.

## Volumes & network

Named volumes keep expensive state out of the (slow, host-bound) workspace bind
mount and survive container rebuilds:

- `nix-store` (`/nix`) — the Nix store / toolchain.
- `home-vscode` (`/home/vscode`) — nix profile symlinks, shell rc, caches; makes
  a manually installed Nix survive container recreation.
- `devenv-state` (`.devenv`) — devenv state, **including the Postgres data
  directory** (`.devenv/state/postgres`).
- `direnv-state` (`.direnv`) — direnv cache.
- `frontend-node-modules` (`components/frontend/node_modules`),
  `frontend-svelte-kit` (`components/frontend/.svelte-kit`) and `pnpm-store`
  (`.pnpm-store`) — Node dependencies and build caches.
- `rustfs-data` (`/data` in the `rustfs` container) — uploaded objects. A volume
  rather than a workspace bind mount for the same small-file-IO reason as
  `node_modules` below; an object store is exactly that workload.

**Why node_modules must be a volume.** The workspace bind mount is a `9p`
filesystem on Windows (and osxfs/virtiofs on macOS); the volumes are native
`ext4`. `node_modules` is ~275 MB of small files, and every `stat()` across that
boundary is expensive. Measured on the bind mount, a single
`require("isomorphic-dompurify")` (which pulls in jsdom) took **52 seconds** —
past vite's 60 s SSR module-transport timeout, so every route returned 500. The
same require is fast from the volume. Confirm which side you are on with
`findmnt -no TARGET,FSTYPE | grep node_modules` — it must say `ext4`, not `9p`.

The trade-off: the volume **masks** the host directory, so `node_modules` is
invisible from Windows (editors relying on it for IntelliSense should run inside
the container, which is the intended workflow) and starts **empty** on first
creation — `post-create.sh` chowns the mountpoints (they appear root-owned) and
`bootstrap.sh` repopulates them with `pnpm install`.

Volume names are prefixed with the compose project name, so parallel checkouts
don't collide as long as `COMPOSE_PROJECT_NAME` differs. The network has an
explicit name (`hackagon-dev`, override via `HACKAGON_DEV_NETWORK`) so sidecars
and ad-hoc containers can attach: `docker run --network hackagon-dev …`.

Inspect / reset:

```bash
docker volume ls --filter name=devcontainer   # or your project name
docker compose -f .devcontainer/docker-compose.yml down            # keep state
docker compose -f .devcontainer/docker-compose.yml down --volumes  # full reset
```

Note: because `/nix` lives in a volume, updating the Nix _feature_ in
`devcontainer.json` has no effect until the `nix-store` volume is removed.

Known wrinkle after recreating the container: Keycloak's H2 database (in
`devenv-state`) keeps a JGroups cluster-membership row for the previous
container's hostname, so its first boot can hang spamming
`failed sending message ... SocketTimeoutException`. One
`just develop just deploy::proc-comp process restart keycloak` fixes it — the
stale member ages out. The frontend also takes a few minutes on first boot (pnpm
install + svelte-kit sync before vite listens).

## When the stack starves itself

Fixed 2026-08-13, and worth recognising because for several days it read as
product bugs in four different places rather than as an infrastructure fault.

Every process in the stack starts with `just develop just …`, so **entering the
Nix shell is inside every service's startup**, while process-compose's readiness
clock is already running. That is fine at ~5 s a go. It stops being fine when
something enters that shell in a loop.

What happened: `vite dev` binds `[::1]:8081`, and so does the adapter-node build
the e2e harness parks there. Whenever a previous run had left that server up —
the common case, since nothing stopped it between runs — vite could not bind,
exited 1 with `Error: Port 8081 is already in use`, and an **uncapped**
`restart: on_failure` sent it round again roughly every 55 seconds. Found live
at **54 restarts in 50 minutes**, each one a full `nix develop`.

Two lessons generalise past this instance:

- ⚠ **A readiness probe on a PORT cannot say which PROCESS holds it.**
  `process list` reported `frontend Running Ready` the entire time, because the
  probe is `curl http://localhost:8081` and the _other_ server was answering it.
  The `RESTARTS` column said 54 throughout and nothing read it.
- ⚠ **A SIGTERM that lands after the Go signal handler is up exits 0**, and
  `restart: on_failure` does not consider 0 a failure — so a backend killed by
  its own readiness budget stays down and is recorded as `Completed`,
  `exit_code=0`, which reads like a clean stop. The log line sequence is
  `grpc server listening` → `received shutdown signal` → nothing, forever.

The fixes are in `tools/nix/hackagon/lib/toolchain.nix` and the harness, and
none of them is a rule anyone has to remember:

- frontend: `max_restarts = 3`, so a port conflict costs three shell entries
  rather than one an hour.
- backend: `restart = "always"` **plus `max_restarts = 3`**. `always` alone
  converts a permanent outage into an unbounded loop (measured with the budget
  scaled down to force it: 149 restarts in 151 seconds); the cap is what makes
  `always` safe. `failure_threshold` went 50 → 150 (~37 min) because a cold
  restart of that service — Nix shell, build quitsh, build the Go service, boot
  — was measured at 486 s on a quiet lock. A generous budget costs nothing when
  healthy, since probing stops at the first success, and the thing that should
  decide "the backend did not come up" is
  `hackathon-e2e/scripts/wait-ready.sh`'s own 300 s-per-service timeout, which
  names the service.
- `prod-frontend.sh ensure` calls `stop_vite` **unconditionally**. Its fast path
  ("the built frontend already serves :8081 — leaving it alone") used to return
  without touching process-compose, and that was the whole of how the loop
  survived. "Leaving it alone" is about _our_ server, never about vite.
- `wait-ready.sh` reads the restart counters back and warns, with the exit code,
  when any service is at ≥3.

## One writer for the frontend build

**Never run a bare `pnpm build` in `components/frontend`.** Two independent
callers build _and serve_ the same `build/service` tree —
`hackathon-e2e/scripts/prod-frontend.sh` on :8081 and
`cloudflare-tunnel/scripts/prod-serve.sh` on :8082 — so they do not merely race
to build it, they race to replace it while the other is serving it. Symptoms
(three agents hit this in one day): `Unexpected end of JSON input`, then a
missing `build/service/server/index.js` at boot.

Both go through `.claude/skills/lib/frontend-build.sh`:

```bash
bash .claude/skills/lib/frontend-build.sh if-stale   # build only if src/ moved
bash .claude/skills/lib/frontend-build.sh build      # unconditional
bash .claude/skills/lib/frontend-build.sh stale      # exit 0 when a build is due
```

It closes two different holes. An exclusive `flock` stops two builds
interleaving, and re-checks staleness **inside** the lock, so the second caller
waits and then finds the first one's fresh output — checking staleness outside
the lock is how both callers decide to build. And it builds into a temp dir and
swaps atomically, so `build/service` only ever holds a complete tree; the lock
cannot help there, because an interrupted build's writer is gone rather than
concurrent, and what it had written so far stays behind looking like a build.

⚠ **A directory rename on the 9p bind mount intermittently answers `EPERM`**
(`mv: cannot move '…/build/service' to '…/build/.service-old-352884': Permission denied`),
with no open descriptors involved — the same rename succeeded a minute later
with the same servers running. The swap therefore retries and rolls the old tree
back if the second rename fails, so `build/service` is never left missing.
Anything else here that renames a directory on this mount needs the same
treatment.

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

### Before you recreate `dev`: find what is only in the writable layer

Anything apt-installed at runtime dies with the container, and it dies silently
— the first symptom is a suite failing on a missing shared library some days
later. That is how Firefox's system libraries were lost once, and a check before
the 2026-08-13 recreate found **21 more Playwright packages** in the same
position (xvfb, libavcodec60, six font packages, and the usual X/cairo/pango
set). All of them are baked into `Dockerfile` now.

The recovery procedure is recorded in `Dockerfile`'s own comment above the
browser-deps block, and it is the thing to re-run after any Playwright bump or
before any deliberate recreate: install into a container, then **diff
`apt-mark showmanual` against the same list in a fresh container of this
image**. Anything the diff names is living in the writable layer. Add it to the
Dockerfile before recreating, not after.

When you do recreate, `up -d --no-deps dev` keeps compose from touching `caddy`
and the tunnel alongside it. Afterwards, restart the stack
(`hackathon-e2e/scripts/up.sh` + `wait-ready.sh`) before anything else.

## Two artefacts you would not guess were there

Neither is needed to build or run the app — nothing outside `.claude/`
references them — but both answer questions people ask about this repo, so they
are worth knowing about before someone re-derives them by hand.

**Mutation testing** (`.claude/skills/hackathon-e2e/mutations/`) turns "would
this test go red?" into something that runs. `manifest.jsonl` is a list of
deliberate, reversible breakages, each paired with the exact set of tests that
must notice; the runner applies one, runs them, and asserts exactly that set
failed. `NO REDS` **fails** the run — it means nothing in the suite holds the
property. Only an exact match passes.

```bash
bash .claude/skills/devcontainer-up/scripts/mutate.sh check   # anchors still match source
bash .claude/skills/devcontainer-up/scripts/mutate.sh list
bash .claude/skills/devcontainer-up/scripts/mutate.sh run     # fast tier: go + vitest
bash .claude/skills/devcontainer-up/scripts/mutate.sh restore # after a run was killed
```

The fast tier drives `go test` and `vitest` straight from source and needs the
container but **no running stack**. `check` is cheap enough for every commit and
is the one to run after touching backend or frontend source: it verifies each
mutation's anchor still matches its file, and an anchor that has drifted is the
same disease as a test that has stopped asserting. Run here on 2026-08-14:
`all 38 mutations still anchor`.

**The quality report** (`.claude/skills/hackathon-e2e/quality-report.html`) is a
single self-contained page: what is tested, how well, what is not, what is
known-broken. Nothing in it is hand-typed — every figure is read from a file at
build time and then read back out of the finished HTML and re-derived by a
second code path before the build is allowed to succeed. Rebuild it after
changing the recipe, the manifest or a run report:

```bash
bash .claude/skills/devcontainer-up/scripts/exec.sh \
  just develop node .claude/skills/hackathon-e2e/scripts/build-quality-report.mjs
```

(`node` is not on the login shell's `PATH` — it comes from the dev shell, or
from `.devenv/profile/bin` if you would rather not enter one.) The build prints
every claim it re-derived and refuses to write a page it could not verify; a run
on 2026-08-14 reported `205 figures re-derived … and matched`. Its animated
sibling, `recipe-player.html`, is rebuilt separately — same shell, same
directory, with `node .claude/skills/hackathon-e2e/scripts/splice-player.mjs` —
and that rebuild is required rather than cosmetic after any recipe edit.
