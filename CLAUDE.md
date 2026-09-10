# Hackagon

A hackathon platform. Monorepo: Go+gRPC backend, SvelteKit frontend, Keycloak
for auth, Postgres via ent ORM, casbin for per-hackathon RBAC. Built and run
under a Nix dev shell via `just` and `process-compose`.

## Working style

Before making changes:

1. Think and analyze first.
2. Explain the plan with alternatives where relevant.
3. Wait for confirmation before editing.
4. Make focused, single-purpose commits.
5. Show the diff + commit message, wait for approval before committing.

## Context budget

Every tool call re-bills the whole context window, so session cost is _number of
calls × window size_ — a chatty run of cheap commands costs far more than one
long file.

- **Batch.** Independent probes go in one assistant turn; a dependent sequence
  goes in one `&&` chain. One command per turn is the default failure mode, and
  it is the most expensive one. `just nix::develop default …` also pays shell
  startup per invocation — wrap once around a script.
- **Grep, don't read.** `grep -n` for the symbol, then `Read` with
  `offset`/`limit`. Generated trees (`ent/**`, `internal/proto/**`,
  `grpc/generated/**`, `API.md`) are grep-only.
- **Downscale screenshots** to ≤1000px before reading — a full-page retina PNG
  is ~500KB and is re-billed on every later call in the session.
- **Delegate noisy search to a subagent; `/clear` between unrelated tasks.**

## Skills — load the one that matches the work

Detailed guidance lives in skills, not here. This file is orientation only.

| Doing this                                                                                   | Skill                       |
| -------------------------------------------------------------------------------------------- | --------------------------- |
| Find what services/RPCs exist, what a request looks like, whether it works, call an endpoint | **backend-api-explore**     |
| Write or change a Go handler, proto, DB schema, RBAC rule                                    | **backend-service-dev**     |
| Add or change dev fixture data                                                               | **backend-seeding**         |
| Build UI — routes, components, Svelte 5                                                      | **frontend-dev**            |
| Style anything — colours, type, buttons/badges/cards                                         | **frontend-theme**          |
| Wire a route to a gRPC service, handle auth/errors                                           | **frontend-backend-wiring** |

Backend skills are at `.claude/skills/`; frontend skills at
`components/frontend/.claude/skills/` and apply to work under that directory.

## Repo layout

```
api/proto/
├── <domain>/                     # hackathon, user, vote
│   ├── <name>_service.proto      # service definition (RPCs)
│   ├── entities/                 # nouns (domain types, enums)
│   └── messages/<svc>_svc/       # verbs (request/response payloads)
│       └── *_request/response.proto   # one message per file
components/backend/
├── cmd/service/main.go           # entrypoint: config, migrate, service.NewServer
├── cmd/seed/main.go              # populates DB with dev data (README inside)
├── db/schema/*.go                # DB schema (source of truth — hand-written)
├── ent/**                        # generated ORM code (do not edit)
├── internal/service/server.go    # builds the gRPC server, REGISTERS all services
├── internal/service/*.go         # gRPC handlers (one file per service)
├── internal/middleware/rbac.go   # casbin enforcer
├── internal/logx/logx.go         # slog setup + Fatal helper
└── Schema.md                     # human-readable DB reference (auto-generated)
components/frontend/              # SvelteKit; generated gRPC clients under src/lib/server/grpc/generated/
helm-chart/                       # Helm chart; published as an OCI artifact on a v* tag
CHANGELOG.md                      # user-visible changes; the entry lands in the PR
RELEASING.md                      # branch model + how a change reaches a cluster
tools/helm/lint-values.yaml       # throwaway values so the chart can be rendered in CI
tools/nix/                        # Nix flake + process-compose config (toolchain.nix)
tools/just/*.just                 # just modules — see Dev commands
justfile                          # root justfile, imports the modules above
```

## Dev commands

Recipes are **namespaced modules** (`tools/just/*.just`), addressed with `::`.
`just --list` for the full set; each module has a `help` recipe.

```bash
just start              # sync deps + start the whole stack, then attach
just down               # stop everything
just api-change         # regen proto stubs, then start   (after *.proto edits)
just schema-change      # regen ent + Schema.md, then start (after db/schema edits)
just changes [ref]      # classify a diff and tell you which of the three to run

just codegen::proto     # buf generate — wipes codegen dirs first (prevents stale shadowing)
just codegen::db-schema # ent codegen + Schema.md
just db::seed           # populate dev hackathons, users, projects (see cmd/seed/README.md)
just db::psql / db::summary
just clean::state       # wipe postgres + keycloak state

just rpc::as <user> <password> <method> [json]  # authed grpcurl
just rpc::unauth <method> [json]                # unauthed grpcurl (health)

just check::lint -c backend     # also: build, test, format; -c frontend
just ci::all                    # everything CI runs, locally

just version::show              # declared version + what a build stamps in the footer
just version::check             # fail if a component version has drifted from VERSION
just version::bump patch|minor|major   # edit VERSION everywhere, commit, annotated tag

just helm::lint                 # helm lint + full render against tools/helm/lint-values.yaml
just helm::template [args]      # render the chart to stdout
just helm::check-bump           # fail if helm-chart/ changed without a version bump
just helm::publish              # push the chart if Chart.yaml's version is unpublished
```

Backend listens on **:3000**, frontend on **:8081**. Dev users (Keycloak
password for all is `aliceandbob`): `hackagon-admin` (global admin), `alice`
(organizer), `bob`, `charles`.

Tooling (`grpcurl`, `buf`, …) is only on PATH inside the Nix shell. From a plain
shell, wrap: `just nix::develop default <command...>`.

Formatting authority is `treefmt`, not any single component's formatter — CI
runs it with `--fail-on-change` over the whole tree, markdown and this file
included:

```bash
nix run ./tools/nix#treefmt -- <path>        # write
nix run ./tools/nix#treefmt -- <path> --ci   # check (0 = clean)
```

## Invariants

These hold across the whole codebase; the skills explain the mechanisms.

- **The backend is authoritative for every access decision.** The frontend never
  duplicates permission logic — it calls the RPC and translates the gRPC error
  into an HTTP response. Frontend-side checks only decide whether to _offer_ an
  action.
- **Casbin has no role inheritance.** `Owner` does not imply `Member`. A policy
  granted to `Member` refuses an `Owner` holding no `Member` row — a live source
  of surprising `PermissionDenied`.
- **A phase does not control what participants may do.** `Phase.capabilities` is
  informational; `HackathonState` plus its casbin rows is what actually gates
  anything, and `SetCurrentPhase` does not touch either. `cmd/seed` writes both
  halves (`seedCapabilities`) with a **different capability set per hackathon**,
  so a refused mutation in seeded data means that capability is off _there_ —
  not that the fixture is unusable. Details in **backend-service-dev**;
  diagnosis in **backend-api-explore**.
- **Don't trust written status.** Determine what's implemented by asking the
  running server — see **backend-api-explore**. Any inventory committed to a
  markdown file is a snapshot that starts rotting immediately, this one
  included.
- **`VERSION` at the repo root is the app's only declared version.** Bump it
  with `just version::bump`, never by hand — the recipe moves `VERSION`, both
  `components/*/.component.yaml` versions and `components/frontend/package.json`
  together, rolls `CHANGELOG.md`'s `[Unreleased]` section into a heading for the
  new version, then commits and tags. A component version _is_ its published
  image tag, so `just version::check` (a CI stage) fails where these disagree.
  The frontend reads `VERSION` at build time (`vite.config.ts` → `$lib/version`
  → the footer) and displays it.
- **`main` is the only long-lived branch, and merging to it reaches the running
  app.** One focused pull request per change, each carrying its `CHANGELOG.md`
  entry. Every push to `main` moves `temporary/*:latest`, and a deployment at
  running https://app.hackagon.dev.renku.ch/ that tag with
  `imagePullPolicy: Always` picks it up on _any_ container restart. This
  deployment is just temporary. The real deployment happens via Chart where an
  `appVersion` is pinned. Charts have there own decoupled Chart version. See
  `RELEASING.md`.
- **The chart versions itself; `VERSION` never touches it.**
  `helm-chart/Chart.yaml` holds two hand-edited numbers: `version` is the
  chart's own release, `appVersion` is the app release it deploys.
  `just helm::publish` reads both and injects nothing, so a chart is published
  only when its own `version` changes — never as a side effect of an app
  release. It skips without failing when that version is already published, or
  when `appVersion` has no images yet.

## Don't

- Don't edit generated code: `components/backend/internal/proto/**`,
  `components/backend/ent/**`,
  `components/frontend/src/lib/server/grpc/generated/**`, `api/proto/API.md`.
  Regenerate via `just codegen::proto` or `just codegen::db-schema`.
- Don't run `just codegen::proto` outside the Nix shell — `buf` isn't in PATH.
  Either run it yourself, or stage proto changes and ask the user to regen.
- Don't skip the casbin permission check on mutation handlers.
- Don't import from `$lib/server/` (including generated types) in a `.svelte`
  file — it's server-only.
