# Backend Service

<!--toc:start-->

- [Backend Service](#backend-service)
  - [Features](#features)
  - [Usage](#usage)
  - [Database Schema](#database-schema)
  - [Development](#development) - [Prerequisites](#prerequisites) -
  [Building](#building) - [Running Tests](#running-tests)
  <!--toc:end-->

A gRPC-based microservice for Hackagon.

## Services

gRPC services live in `internal/service/` and are registered in
[server.go](internal/service/server.go). Rather than keeping an inventory here
that goes stale, ask the running server — reflection is enabled:

```bash
just start                                       # from the repo root
grpcurl -plaintext localhost:3000 list           # services
grpcurl -plaintext localhost:3000 list hackathon.ProjectService   # its RPCs
grpcurl -plaintext localhost:3000 describe hackathon.ProjectService.SetPreference
```

## Usage

Normally you run the whole stack with `just start` from the repo root. To run
just this service directly:

```bash
# --config-dir is required: server.adminkeycloakid has no default
go run ./cmd/service/ --config-dir ./data/test/config/

# Health check (grpcurl is only on PATH inside the Nix shell)
grpcurl -plaintext localhost:3000 health.HealthService/Check
```

Config precedence is defaults → `config.yaml` → environment. Env vars use the
`HACKAGON_` prefix with `_` as the separator, e.g. `HACKAGON_SERVER_PORT=3000`
(the default port is already 3000).

## Database Schema

We use [ent](https://entgo.io/) as an ORM. `db/schema/*.go` is the hand-written
source of truth; run `just codegen::db-schema` to regenerate `ent/**` and
[Schema.md](./Schema.md), which is the readable overview. Or
`just schema-change` to regenerate and restart in one step.

## Test Data

`just db::seed` populates the database with 3 hackathons
(upcoming/ongoing/past), a mix of tracks, projects, teams, and submissions, and
4 users (admin, alice, bob, charles). Seeding runs in a single transaction and
is idempotent — re-running is a no-op if the seed hackathon already exists. See
[cmd/seed/README.md](cmd/seed/README.md) for a full breakdown with timeline and
user-involvement diagrams.

`just db::summary` prints entity counts and per-hackathon/per-user detail. Use
it to sanity-check the DB after seeding or migrations. `just db::psql` opens a
psql shell.

`just clean::state` wipes all Postgres and Keycloak state; re-seed with
`just db::seed` afterwards. Because seeding is idempotent, this is also how you
pick up changes you made to the seed itself.

## Development

### Prerequisites

Everything comes from the Nix dev shell — `direnv allow`, or `just dev` from the
repo root. Go and `buf` (proto codegen; we don't invoke `protoc` directly) are
only on PATH inside it. From a plain shell, wrap a command with
`just nix::develop default <command...>`.

### Building and testing

Prefer the `just` recipes — they are what CI runs, so a green local run means a
green pipeline:

```bash
just check::build -c backend
just check::test -c backend
just check::lint -c backend
just ci::all                  # everything CI runs, both components
```

The plain Go equivalents still work inside the dev shell:

```bash
go build -o backend ./cmd/service/
go test ./...
```

Formatting is enforced tree-wide by `treefmt`, not `gofmt` alone:

```bash
nix run ./tools/nix#treefmt -- <path>        # write
nix run ./tools/nix#treefmt -- <path> --ci   # check
```
