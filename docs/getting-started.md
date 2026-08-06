# Getting started

Two supported ways to get a working environment: the **devcontainer** (Docker
provides Nix, the flake provides everything else) or a **native Nix** setup. In
both cases every tool — Go, pnpm, buf, process-compose, Keycloak, Postgres,
grpcurl, psql — comes from the flake in `tools/nix`, so `just` commands behave
identically.

## Path A — devcontainer

`.devcontainer/docker-compose.yml` defines a single `dev` service; Keycloak,
Postgres, backend and frontend all run *inside* it via process-compose. Ports
3000, 5432, 8081 and 8180 are published/forwarded.

| How                    | Command                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| VS Code                | "Dev Containers: Reopen in Container" — the Nix feature and `post-create.sh` run automatically. |
| devcontainer CLI       | `devcontainer up --workspace-folder .`                                                       |
| Helper script          | `bash .claude/skills/devcontainer-up/scripts/up.sh`                                          |
| Plain compose          | `docker compose -f .devcontainer/docker-compose.yml up -d dev`, then install Nix manually and run `.devcontainer/post-create.sh` (see `.devcontainer/README.md`). |

### Helper scripts (`.claude/skills/devcontainer-up/scripts/`)

| Script                    | What it does                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `up.sh`                   | Idempotent "up and ready": prefers the `devcontainer` CLI when installed; otherwise plain compose + single-user Nix install + `post-create.sh`. Then warms the dev shell with `just develop true` (first run downloads the whole toolchain). |
| `exec.sh [cmd …]`         | Runs a command inside the container as `vscode` in `/workspaces/hackagon` through a login shell (so the Nix profile is loaded). No args → interactive shell. Example: `exec.sh just start`. |
| `e2e.sh smoke\|journey`   | Ensures readiness, then forwards to `.claude/skills/hackathon-e2e/scripts/run.sh` inside the container.                                     |
| `down.sh [--volumes]`     | Stops the stack. `--volumes` also deletes the `nix-store`/`devenv-state` volumes — the next start re-downloads the toolchain.               |

### What `post-create.sh` does

1. `git config --global --add safe.directory` for the bind-mounted workspace and
   fixes ownership of the `.devenv` / `.direnv` volume mountpoints.
2. Installs `just`, `direnv`, `socat` via `nix profile`; hooks direnv into bash
   and runs `direnv allow`.
3. **Generates the gitignored frontend dev secrets** (see below).
4. Runs `.devcontainer/bootstrap.sh` unless `HACKAGON_SKIP_BOOTSTRAP=1`.

`bootstrap.sh` runs, in this order (load-bearing — generated code is not
committed):

```
pnpm install --frozen-lockfile   # provides the ts_proto plugin buf invokes
just codegen::proto              # -> components/backend/internal/proto (gitignored)
just codegen::db-schema          # -> components/backend/ent (gitignored)
GOWORK=off go mod tidy           # only resolves once the generated packages exist
```

Knobs (ports, base image, compose project name, timezone, bootstrap skip) live
in `.devcontainer/.env`; copy `.devcontainer/.env.example` and override what you
need. With plain compose (no devcontainer tooling), loopback-bound services need
`.devcontainer/host-bridge.sh` to be reachable from the host.

## Path B — native Nix

Requires Nix with flakes. `.envrc` loads `./tools/nix#default`, so with direnv
installed the dev shell activates on `cd`. Otherwise:

```bash
just dev                 # alias for `just develop` -> nix develop tools/nix#default
just develop <cmd>       # run one command inside the shell, e.g. just develop just start
```

`just develop just <recipe>` is the general escape hatch when you are not
already inside the shell — every recipe below assumes the dev shell is active.

## Commands

Recipes live in the root `justfile` plus the modules in `tools/just/*.just`
(`just <module>::help` prints usage for most modules).

### Everyday

| Command                | Effect                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just start`           | The default "run everything". Stops any running stack, `go mod tidy` in `components/backend` (with `GOWORK=off`), `pnpm install --frozen-lockfile` in `components/frontend`, `quitsh setup`, then `just deploy::up` and attaches to the process-compose TUI. Use after a code-only change. |
| `just api-change`      | `just codegen::proto`, then `just start`. Use after editing `*.proto`.                                                                                                                                   |
| `just schema-change`   | Full reset flow after editing `db/schema/*.go`: `codegen::proto` → `codegen::db-schema` → `clean::state` (wipes Postgres + Keycloak state) → `deploy::up` → wait for `pg_isready` → `db::seed` → attach.   |
| `just changes [ref]`   | Diffs `ref` (default `HEAD~1`) against HEAD and prints which of the three commands above to run.                                                                                                          |
| `just down`            | `just deploy::down` — kills process-compose/Keycloak and frees ports 8180 and 3000.                                                                                                                       |

### Stack control (`tools/just/deploy.just`)

| Command                                   | Effect                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `just deploy::up`                         | Starts the `test-services` process-compose stack (Keycloak, Postgres, backend, frontend), waiting for Keycloak. |
| `just deploy::attach`                     | Attaches to the process-compose TUI for logs.                                                          |
| `just deploy::proc-comp <args>`           | Sends a command to the running instance over its unix socket, e.g. `process restart backend`, `process list`. |
| `just deploy::down`                       | Stops everything.                                                                                      |
| `just deploy::save-keycloak`              | Exports the live realm back to `tools/configs/keycloak/realm-hackagon.json`.                            |

### Database (`tools/just/db.just`)

| Command                  | Effect                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `just db::seed`          | `go run ./cmd/seed/ --config-dir ./data/test/config/` in `components/backend` — populates the dev fixture.    |
| `just db::psql [args]`   | `psql -h 127.0.0.1 -p 5432 -U postgres -d hackagon`; args pass through, e.g. `just db::psql -c 'SELECT * FROM users;'`. |
| `just db::summary`       | Runs `tools/sql/db-summary.sql` against the same database for a formatted overview.                          |

### gRPC (`tools/just/rpc.just`)

| Command                                             | Effect                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `just rpc::as <user> <password> <method> [json]`    | Fetches an access token from Keycloak (password grant, client `hackagon-backend`, realm `hackagon`), then calls `grpcurl -plaintext -H "authorization: Bearer …" localhost:3000 <method>`. Default payload `{}`. |
| `just rpc::unauth <method> [json]`                  | Same call without a token — used for `health.HealthService/Check` and to check anonymous behaviour.                          |

```bash
just rpc::as bob aliceandbob user.UserService/WhoAmI
just rpc::as alice aliceandbob hackathon.HackathonService/List '{}'
just rpc::unauth health.HealthService/Check
```

Server reflection is enabled, so `grpcurl localhost:3000 list` works too.

### Codegen, cleaning, checks

| Command                                        | Effect                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `just codegen::proto`                          | Wipes the two generated dirs, then `buf generate` (Go, Go-gRPC, ts-proto, `api/proto/API.md`).      |
| `just codegen::db-schema`                      | Regenerates `components/backend/ent/**` and `components/backend/Schema.md` from `db/schema/*.go`.   |
| `just clean::state`                            | Deletes `.devenv/state/postgres` and `.devenv/state/keycloak` — clean database and realm next start.|
| `just clean::build`                            | Removes component build artifacts.                                                                 |
| `just clean::all`                              | Destroys **all** gitignored files (`.devenv`, `node_modules`, generated code). Prompts first.       |
| `just check::lint\|test\|format -c <component>`| Per-component lint/test/format; components are `backend` and `frontend`.                            |

## Dev users

All Keycloak users share the password `aliceandbob`
(`tools/configs/keycloak/README.md`, realm export
`tools/configs/keycloak/realm-hackagon.json`). The Keycloak admin console at
http://localhost:8180 uses `admin`/`admin`.

| Username         | Role in the dev data                         |
| ---------------- | ---------------------------------------------- |
| `hackagon-admin` | Global admin; creator of H2 and H3             |
| `alice`          | Organizer; creator of H1                       |
| `bob`            | Confirmed participant                          |
| `charles`        | Waitlisted viewer                              |

The backend also inserts a DB row for the admin on startup, keyed by
`server.adminkeycloakid` in `components/backend/data/test/config/config.yaml`.
Logging in works without seeding, but the users then have no hackathons,
teams or roles.

## Seeding

`just db::seed` runs `components/backend/cmd/seed` (full fixture description in
`components/backend/cmd/seed/README.md`). Timestamps are relative to
`time.Now()` at seed time, so re-seeding keeps the "ongoing" hackathon ongoing.
A re-run is a no-op once the sentinel hackathon `AI Innovation Challenge 2026`
exists.

| #   | Hackathon                    | Visibility | Timing   | Creator          | Teams |
| --- | ---------------------------- | ---------- | -------- | ---------------- | ----- |
| H1  | AI Innovation Challenge 2026 | public     | upcoming | `alice`          | 2     |
| H2  | Climate Tech Hackathon 2026  | public     | ongoing  | `hackagon-admin` | 1     |
| H3  | Internal Product Sprint      | private    | past     | `hackagon-admin` | 1     |

Each hackathon gets phases, tracks, projects (approved + proposed), pages and
submissions; the seed also writes casbin role rows (`Owner`/`Member`) directly
through the enforcer.

## Frontend dev secrets (required)

The frontend refuses to serve without
`components/frontend/data/test/config/secrets.yaml` — every request returns
`500 Server Configuration Error`. The file is gitignored;
`.devcontainer/post-create.sh` creates it if missing:

```bash
printf 'oidc:\n  clientSecret: "%s"\n  authSecret: "%s"\n' \
    "$(openssl rand -base64 32)" "$(openssl rand -base64 32)" \
    > components/frontend/data/test/config/secrets.yaml
```

`components/frontend/data/test/config/secrets.yaml.example` shows the shape.
Native-Nix users who never ran `post-create.sh` must create it by hand.

## Object store (optional today)

Uploaded files get an S3-compatible home in development: the `rustfs`
container, endpoint `http://rustfs:9000` from inside the devcontainer
(`http://localhost:9000` from the host), bucket `hackagon-dev`, dev-only keys
`hackagon-dev` / `hackagon-dev-secret`. It is configured under `storage:` in
`components/backend/data/test/config/config.yaml`, but **no handler reads it
yet** — the store is provisioned, the upload path is not built, so skipping
this changes nothing about the running app today.

```bash
docker compose -f .devcontainer/docker-compose.yml up -d rustfs
bash .devcontainer/rustfs-init.sh             # create the bucket (idempotent)
bash .devcontainer/rustfs-init.sh --selftest   # PUT/GET/compare/list proof
```

Full reference — reset, console URL, deployment differences — in
`.devcontainer/README.md`.

## Gotchas

- **Casbin does not reload after external seeding.** `NewRBACEnforcer`
  (`components/backend/internal/middleware/rbac.go`) calls `LoadPolicy()` once at
  startup and no watcher is installed, so roles that `just db::seed` writes
  straight into Postgres are invisible to a running backend — badges render
  wrong and private hackathons disappear. Restart it afterwards:

  ```bash
  just db::seed
  just deploy::proc-comp process restart backend
  # optional: wait until it is back
  just rpc::unauth health.HealthService/Check
  ```

  (This is exactly what `.claude/skills/hackathon-e2e/scripts/seed.sh` does.)
- **First boot is slow.** The first `just develop` downloads the whole flake
  toolchain (multi-GB); in the devcontainer the `nix-store` volume caches it.
  The frontend also needs a few minutes on first boot (`pnpm install` +
  `svelte-kit sync` before Vite listens).
- **`just start` attaches to the TUI.** Detach with the process-compose quit
  key; use `just down` to actually stop the stack.
- **Nix feature changes need the volume gone.** Because `/nix` is a named
  volume, editing the Nix feature in `.devcontainer/devcontainer.json` has no
  effect until `nix-store` is removed.
- **Keycloak may hang on first boot after recreating the container** with a
  stale JGroups member in its H2 database — one
  `just deploy::proc-comp process restart keycloak` clears it.

## See also

- [architecture.md](architecture.md) — what the processes you just started
  actually are.
- [testing.md](testing.md) — the suites to run once the stack is up.
- [TODO.md](TODO.md) — known bugs you may hit while poking at a fresh
  environment.
- [glossary.md](glossary.md) — terms used by the commands and dev data above.
