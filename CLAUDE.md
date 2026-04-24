# Hackagon

A hackathon platform. Monorepo: Go+gRPC backend, SvelteKit frontend, Keycloak for auth, Postgres via ent ORM, casbin for per-hackathon RBAC. Built and run under a Nix dev shell via `just` and `process-compose`.

## Working style

Before making changes:
1. Think and analyze first.
2. Explain the plan with alternatives where relevant.
3. Wait for confirmation before editing.
4. Make focused, single-purpose commits.
5. Show the diff + commit message, wait for approval before committing.

## Repo layout

```
api/proto/
├── <domain>/                     # hackathon, user, health
│   ├── <name>_service.proto      # service definition (RPCs)
│   ├── entities/                 # nouns (domain types, enums)
│   └── messages/<svc>_svc/       # verbs (request/response payloads)
│       └── *_request/response.proto   # one message per file
components/backend/
├── cmd/service/main.go           # starts the gRPC server, registers services
├── cmd/seed/main.go              # populates DB with dev data (README inside)
├── ent/schema/*.go               # DB schema (source of truth)
├── internal/service/*.go         # gRPC handlers (one file per service)
├── internal/middleware/rbac.go   # casbin enforcer
├── internal/logx/logx.go         # slog setup + Fatal helper
└── Schema.md                     # human-readable DB reference (auto-generated)
components/frontend/              # SvelteKit; generated gRPC clients under src/lib/server/grpc/generated/
tools/nix/                        # Nix flake + process-compose config (toolchain.nix)
justfile                          # all common dev commands
```

The `_svc` suffix in proto folder paths is a buf workaround for path-segment name collisions (buf rejects `hackathon/messages/hackathon/`); `_svc` means "messages belonging to service X".

## Dev commands

```bash
just up                 # start keycloak + postgres + backend via process-compose
just down               # stop everything
just refresh            # wipe state + regen ent + regen proto + tidy + install deps
just seed               # populate dev hackathons, users, projects (see cmd/seed/README.md)
just generate-proto     # buf generate — wipes codegen dirs first (prevents stale shadowing)
just generate-db-schema # ent codegen + Schema.md
just rpc-as <user> <password> <method> [json]   # authed grpcurl
just rpc-unauth <method> [json]                 # unauthed grpcurl (health)
```

Dev users (Keycloak password for all is `aliceandbob`): `hackagon-admin` (global admin), `alice` (organizer), `bob`, `charles`.

## Service implementation pattern

Read path contracts and entities already exist (`Get`, `List` protos are shaped for every service). Handlers are what's missing. To add a service:

1. Create `components/backend/internal/service/<name>_service.go` following `user_service.go`:
   - `NewXService(db, enf)` constructor
   - per-RPC `enforcer.Enforce(ctx, hackathonID, object, perm)` check (skip for public reads; see RBAC below)
   - ent query with `With*()` for eager-loading relations in `Get`
   - a private `entryFromEnt(*ent.X) *ents.X` mapper (shared across List/Get — server decides depth)
2. Register in `cmd/service/main.go`: `x.RegisterXServiceServer(server, xService)`.
3. `just up` → `just rpc-as alice aliceandbob x.XService/List` to verify end-to-end.

Ent-to-proto mappers:
- `userEntryFromEnt` already lives in `user_service.go` — reuse it (same Go package).
- DB `Optional().Nillable()` → proto `optional` (pointer on the Go side).
- Timestamps → `timestamppb.New(t)` always; if nillable, `timestamppb.New(*t)` after nil-check.
- DB enums → write a short `enumFromEnt()` helper per enum.

## Conventions (already applied to proto, apply to handlers)

**Read path** — already decided:
- `List*Response` returns shallow entities (scalars + IDs only).
- `Get*Response` returns the full tree (embeds creator, modifier, related collections).
- `ListRequest` carries explicit filter fields (e.g. `string hackathon_id = 1;`), no generic filter blob.
- `HackathonStatus` is computed server-side from `starts_at`/`ends_at` (not in DB).
- `HackathonMember` unifies DB participation (`is_waiting`, `joined_at`) + casbin role in one row.
- Roles (`GlobalRole`, `HackathonRole`) are sourced from casbin, not the DB.
- Filter application: column-backed filters push down to SQL via `.Where()` (e.g. `visibility_filter`); computed filters (e.g. `status_filter` on `HackathonStatus`) stay post-query. For optional enum filters, `UNSPECIFIED` means "no filter". See `hackathon_service.go:List` for the pattern.

**Write path** — decide once when first write handler lands, then match across services:
- `Edit*Request`: every field `optional` (no FieldMask).
- `Create`/`Add`/`Propose`: return `{id}` only.
- `Edit`: return the updated entity.
- `Delete`: return `{}`.
- `Add*`/`Remove*` on a relation (e.g. `AssignUser`, `AddOwner`): return the mutated parent. Precedent: `AddRole` returns the user.

## RBAC (casbin)

See `components/backend/internal/middleware/rbac.go` and `casbin_model.conf`. Subject is the JWT `sub` claim (Keycloak ID, not DB UUID).

- Per-hackathon roles (`g`): `Owner`, `Member`, scoped to a hackathon ID.
- Global roles (`g2` or `g` with `hackathon_id = "*"`): `Admin`, `HackathonOrganizer`.
- Admin always passes via the `g2(r.sub, "admin")` escape hatch in the matcher.
- Role-granting code doesn't exist yet — `enforcer.AddRole` is wired up but no handler calls it. Until write-path handlers land, only the `hackagon-admin` user has non-zero roles.

For read endpoints during bootstrap, it's fine to skip casbin entirely and rely on JWT alone — add a `// TODO: casbin check once role-granting RPCs exist` comment.

## Priority order (from coworker)

Read path (Get/List) for every listed service, then mutations, then voting:

1. `UserService` — already implemented (`List`, `WhoAmI`, `Register`). Needs `Get`.
2. `HackathonService` — `List` implemented. Next: `Get`. Then `Create`, `Join`, `ApproveParticipant`.
3. `PageService` — full CRUD.
4. `PhaseService` — full CRUD.
5. `TrackService` — Get/List proto exists; Create/Edit/Delete protos don't yet.
6. `ProjectService` — mutation protos exist (`Propose`, `Approve`, `Edit`, `Delete`) but `status` is still a string — convert to `ProjectStatus` enum. Also add `SetPreference`, `ExportPreferences`.
7. `TeamService` — Create/AssignUser exist; add Edit, Delete, RemoveUser, CreateSubmission, FinalizeSubmission.
8. `VoteService` — only if DB has `Vote`/`VoteCategory` tables (currently doesn't). Defer until coworker returns.

## Runtime status

- `main.go` registers `HealthService`, `UserService`, `HackathonService`. Other `hackathon.*` services (Page/Phase/Project/Team/Track) have proto contracts but are UNIMPLEMENTED at runtime.

## Don't

- Don't edit generated code: `components/backend/internal/proto/**`, `components/backend/ent/*.go` (except under `ent/schema/`), `components/frontend/src/lib/server/grpc/generated/**`, `api/proto/API.md`. Regenerate via `just generate-proto` or `just generate-db-schema`.
- Don't run `just generate-proto` outside the Nix shell — `buf` isn't in PATH. Either run it yourself, or stage proto changes and ask the user to regen.
- Don't skip the casbin `Enforce` check on mutation handlers — follow the user_service.go pattern.
