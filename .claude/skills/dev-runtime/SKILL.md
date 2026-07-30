---
name: dev-runtime
description:
  Running, inspecting and debugging hackagon's local stack — process-compose,
  seeding and querying Postgres, calling RPCs with grpcurl, rebuilding just the
  backend, DB schema changes, and dev user credentials. Use when the stack is
  misbehaving, when you need to verify an RPC or inspect data, or when changing
  db/schema/*.go.
---

## Entry points

```bash
just start              # sync deps + start keycloak, postgres, backend. The default.
just api-change         # regen proto stubs, then start. After editing *.proto
just schema-change      # after editing db/schema/*.go
just down               # stop everything
just changes [ref]      # classify your diff and suggest which of the above to run
just develop            # enter the Nix dev shell (alias: just dev)
```

The justfile is split into modules — `just --list`, and `just --list <module>` for
each. Note the `::` separator.

```bash
just db::seed                  # sample hackathons/tracks/projects/teams/users
just db::psql                  # psql shell
just db::summary               # formatted view of what's currently in the DB
just rpc::as <user> <password> <method> [json]   # authed grpcurl
just rpc::unauth <method> [json]                 # unauthed grpcurl (health)
just codegen::proto            # regen Go + TS gRPC stubs
just codegen::db-schema        # regen Ent code + Schema.md
just check::lint -c frontend   # also test, format, build — all need -c <component>
just deploy::attach            # process-compose TUI, for logs
just clean::state              # wipe Postgres + Keycloak state, then just start
```

`just clean::all` destroys every gitignored file (`.devenv`, `node_modules`) —
not a casual command.

`grpcurl`, `buf` and `psql` are only on PATH inside the Nix shell (`just develop`),
though they exist under `/nix/store/...` regardless.

## Dev users

Keycloak password for all: `aliceandbob`.

| User | Role |
|---|---|
| `hackagon-admin` | global Admin (granted by `defaultPolicies()` on every enforcer start, not by seed) |
| `alice` | organizer — owns at least one seeded hackathon, on two seeded teams. Best account for owner-only flows without touching Keycloak |
| `bob`, `charles` | plain members |

## Rebuilding just the backend

Backend listens on **`localhost:3000`** under process-compose. To pick up a Go
change without disturbing the rest of the stack:

```bash
cd components/backend && GOWORK=off go build -o .output/build/bin/service ./cmd/service
kill $(lsof -tiTCP:3000 -sTCP:LISTEN)   # process-compose restarts it in seconds
```

The live binary is `components/backend/.output/build/bin/service` — **not** the
top-level `.output/backend/...`, which is an unrelated build path.

## Reading backend instability

**There is no panic-recovery interceptor** — the chain is `auth → validation`
(`internal/service/server.go`), and the only `recover()` in the backend is in
`cmd/seed`. So an unrecovered panic in *any* handler kills the entire backend
process for every user, and process-compose restarts it.

Practical consequence: repeated restarts with exit code 1 in the process-compose
log usually mean a **panicking handler**, not a startup or config problem. The
usual cause is a mapper dereferencing an edge that wasn't eager-loaded — see the
`backend-services` skill.

Process-compose log location varies per run; `just deploy::attach` is the reliable
way to read logs. The state dir is `.devenv/state/` (Postgres and Keycloak).

## DB schema

`components/backend/db/schema/*.go` is the hand-written source of truth. `ent/**`
is generated — never edit it. `Schema.md` is a generated human-readable reference,
useful for checking a column or edge without reading the schema Go.

After editing schema: `just schema-change`. If migrations get tangled locally,
`just clean::state` then `just start` and `just db::seed` is the reset path.
