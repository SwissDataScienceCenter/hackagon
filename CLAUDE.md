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

## Repo layout

```
api/proto/
├── <domain>/                     # hackathon, user, health
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
└── .claude/skills/               # frontend-dev, frontend-backend-wiring (read these first)
mydocs/docs/backend-tickets/      # known gaps, one file per issue (README inside)
tools/nix/                        # Nix flake + process-compose config (toolchain.nix)
tools/just/*.just                 # just modules — see Dev commands
justfile                          # root justfile, imports the modules above
```

The `_svc` suffix in proto folder paths is a buf workaround for path-segment
name collisions (buf rejects `hackathon/messages/hackathon/`); `_svc` means
"messages belonging to service X".

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
```

Formatting authority is `treefmt`, not any single component's formatter — CI
runs it with `--fail-on-change` over the whole tree, markdown and this file
included:

```bash
nix run ./tools/nix#treefmt -- <path>        # write
nix run ./tools/nix#treefmt -- <path> --ci   # check (0 = clean)
```

Dev users (Keycloak password for all is `aliceandbob`): `hackagon-admin` (global
admin), `alice` (organizer), `bob`, `charles`.

## Service implementation pattern

All seven services are implemented (see Current state); this is the pattern to
match when adding an RPC or a new service:

1. Create `components/backend/internal/service/<name>_service.go` following
   `user_service.go`:
   - `NewXService(dbClient *ent.Client, enf *mw.Enforcer) *XService` constructor
   - per-RPC permission check — prefer
     `s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Object, mw.Perm)`,
     which returns the gRPC error directly; raw `Enforce` only when you need the
     bool. Skip for public reads; see RBAC below.
   - ent query with `With*()` for eager-loading relations in `Get`
   - a private `entryFromEnt(*ent.X) *ents.X` mapper (shared across List/Get —
     server decides depth)
2. Register in `internal/service/server.go` (**not** `cmd/service/main.go` —
   `main.go` just calls `service.NewServer`):
   `hackathonSvc.RegisterXServiceServer(server, xService)`.
3. `just start` → `just rpc::as alice aliceandbob x.XService/List` to verify
   end-to-end.

Ent-to-proto mappers:

- Shared mappers (including `userEntryFromEnt`) live in
  `internal/service/mappers.go` — reuse them (same Go package).
- DB `Optional().Nillable()` → proto `optional` (pointer on the Go side).
- Timestamps → `timestamppb.New(t)` always; if nillable, `timestamppb.New(*t)`
  after nil-check.
- DB enums → write a short `enumFromEnt()` helper per enum.

## Conventions (already applied to proto, apply to handlers)

**Read path** — already decided:

- `List*Response` returns shallow entities (scalars + IDs only).
- `Get*Response` returns the full tree (embeds creator, modifier, related
  collections).
- `ListRequest` carries explicit filter fields (e.g.
  `string hackathon_id = 1;`), no generic filter blob.
- `HackathonStatus` is computed server-side from `starts_at`/`ends_at` (not in
  DB).
- `HackathonMember` unifies DB participation (`is_waiting`, `joined_at`) +
  casbin role in one row.
- Roles (`GlobalRole`, `HackathonRole`) are sourced from casbin, not the DB.
- Filter application: column-backed filters push down to SQL via `.Where()`
  (e.g. `visibility_filter`); computed filters (e.g. `status_filter` on
  `HackathonStatus`) stay post-query. For optional enum filters, `UNSPECIFIED`
  means "no filter". See `hackathon_service.go:List` for the pattern.

**Write path** — settled; the handlers have landed and these held:

- `Edit*Request`: every field `optional` (no FieldMask).
- `Create`/`Propose`: return `{id}` only (`hackathon_id`, `team_id`, `phase_id`,
  `track_id`, `page_id`, `project_id`).
- `Edit`: return the updated entity.
- `Delete`: return `{}`.
- `Add*`/`Remove*` on a relation (`AssignUser`, `RemoveUser`,
  `ApproveParticipant`, `RemoveParticipant`, `AddOwner`, `RemoveOwner`,
  `Approve`, `Disapprove`): return **`{}`**. The caller re-reads the parent.
  `UserService.AddRole` returning the user is the lone exception, not the rule.
- `SetCapabilities` / `SetCurrentPhase`: return the updated `HackathonState`.

## RBAC (casbin)

See `components/backend/internal/middleware/rbac.go` and `casbin_model.conf`.
Subject is the JWT `sub` claim (Keycloak ID, not DB UUID). Keycloak ID is used
because it is present directly in the JWT — using the DB UUID would require a DB
lookup on every request before casbin could check anything.

The casbin policy table has three row types (stored in generic `v0`–`v5`
columns; `v4`/`v5` are always null — the adapter schema is fixed regardless of
how many fields the model uses):

- `ptype=p` — permission rules: v0=role, v1=hackathon domain, v2=object type,
  v3=action
- `ptype=g` — per-hackathon role assignments: v0=Keycloak user ID, v1=role,
  v2=hackathon UUID
- `ptype=g2` — global role assignments: v0=Keycloak user ID, v1=global role

Role hierarchy:

- Per-hackathon roles (`g`): `Owner`, `Member`, scoped to a hackathon UUID.
- Global roles (`g2`): `Admin`, `HackathonOrganizer`.
- Admin always passes via the `g2(r.sub, "admin")` escape hatch in the matcher.
- **There is no role inheritance.** `Owner` does not imply `Member`. A policy
  granted to `Member` refuses an `Owner` who holds no `Member` row — this is a
  live source of surprising `PermissionDenied`s, not a theoretical concern.
- Roles are granted by: `HackathonService.Create` (`Owner`),
  `HackathonService.Join` (`Member`), `ProjectService.Propose` (`Owner`, scoped
  to the project), `TeamService.AssignUser` (`Member`, scoped to the team), and
  `UserService.AddRole`/`RemoveRole` (global roles).

**Auth middleware** (implemented in `middleware/auth.go`): a single interceptor
runs for all endpoints.

- No bearer token → anonymous claims `{sub: "anonymous"}` injected; request
  proceeds.
- Invalid/expired token → `Unauthenticated` error returned.
- Valid token → real Keycloak claims stored in context.

There are no per-endpoint skip or optional modes. Endpoints that serve anonymous
callers (e.g. `HackathonService.List`) work because casbin evaluates
`"anonymous"` as an unprivileged subject — it passes only wildcard rules. The
health endpoint works because it never reads claims at all.

**Access rules — backend is authoritative, frontend only translates errors:**

- `HackathonService.Get`: caller must appear in `h.Edges.Participants` with
  `!p.IsWaiting`, or have the `Admin` global role. Waitlisted users get
  `PermissionDenied`.
- `HackathonService.List`: public hackathons always visible; private hackathons
  filtered by casbin `Enforce` check (anonymous callers always fail, so they
  only see public ones).

## Phases and capabilities

Two mechanisms that share a vocabulary and are **not** wired to each other. Read
this before touching either — the naming strongly implies a link that isn't
there.

`Capability` (`api/proto/hackathon/entities/capability.proto`) enumerates six
participant-facing actions: `REGISTER`, `PROPOSE_PROJECTS`,
`SET_TEAM_PREFERENCES`, `CREATE_PROJECT_SUBMISSIONS`, `VOTE`, `VIEW_RESULTS`.

- **`HackathonState` is authoritative.** One row per hackathon, six booleans.
  `HackathonService.SetCapabilities` is the only writer, and it does two things
  per capability: flips the boolean **and** adds/removes the corresponding
  casbin `p` row. That second half is what actually grants permission — a
  handler gated on a capability is really gated on the policy row
  `SetCapabilities` wrote. Almost every grant targets the `Member` role (see the
  no-inheritance note in RBAC).
- **`Phase.capabilities` is decorative.** A JSON string array on the phase row.
  The schema comment says so outright: "Purely informational — does not
  auto-enable or disable any capability." `SetCurrentPhase` sets
  `current_phase_id` and nothing else; it never reads the phase's capabilities
  and never touches state or casbin. Advancing a phase changes what the UI
  displays, not what anyone may do.
- **`cmd/seed` creates no `HackathonState` row at all.** So seeded hackathons
  report no capabilities, and every capability-gated handler refuses. If a
  mutation mysteriously returns `PermissionDenied` in seeded data, check this
  first.

Known gaps here are written up in `mydocs/docs/backend-tickets/` — start with
`project-preferences-capability.md`, which traces the whole chain for
`SetPreference` and documents a partial-write bug in `SetCapabilities` when the
state row is missing.

## Current state

All seven services are registered in `internal/service/server.go:74-81` and
implemented — read _and_ write path. `ProjectStatus` is already an enum.

| Service     | RPCs                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Health`    | health check (no claims read)                                                                                                 |
| `User`      | List, Get, WhoAmI, Register, AddRole, RemoveRole                                                                              |
| `Hackathon` | List, Get, Create, Edit, Join, ApproveParticipant, RemoveParticipant, SetCapabilities, SetCurrentPhase                        |
| `Page`      | List, Get, Create, Edit, Delete, MoveUp, MoveDown, SetOrder                                                                   |
| `Phase`     | List, Get, Create, Edit, Delete                                                                                               |
| `Track`     | List, Get, Create, Edit, Delete                                                                                               |
| `Project`   | List, Get, Propose, Approve, Disapprove, Edit, Delete, SetPreference, GetPreference, RemovePreference, ExportPreferences      |
| `Team`      | List, Get, Create, Edit, Delete, AssignUser, RemoveUser, CreateSubmission, GetSubmission, ListSubmissions, FinalizeSubmission |

What's actually outstanding:

- `VoteService` — still nothing. The DB has no `Vote`/`VoteCategory` tables, so
  the `VOTE` and `VIEW_RESULTS` capabilities toggle policies nothing enforces.
  Deferred pending the coworker.
- The open items in `mydocs/docs/backend-tickets/`. Check that directory before
  concluding a broken flow is a new bug — and check the ticket against the code,
  since some have been partly fixed without the ticket being updated.

## Frontend route → backend pattern

> Working on `components/frontend/`? The skills in
> `components/frontend/.claude/skills/` (**frontend-dev**,
> **frontend-backend-wiring**) go deeper than this section — route groups,
> Svelte 5 runes, the `hooks.server.ts` lifecycle, form actions. This is the
> summary.

**The backend is authoritative for all access decisions.** The frontend never
duplicates permission logic — it only translates gRPC errors into HTTP
responses.

To wire a new frontend route to a backend gRPC service:

**1. Register the client** in
`components/frontend/src/lib/server/grpc/client.ts`:

- Import the service definition and client type from
  `generated/<domain>/<name>_service`
- Add the client to the `AuthorizedGrpc` interface
- Create it inside `createAuthorizedGrpc` with
  `factory.create(XServiceDefinition, channel)`
- For endpoints that serve anonymous callers (e.g. public listing), create a
  separate unauthenticated client outside `createAuthorizedGrpc` (see
  `publicHackathonClient` as the pattern).

**2. Load data server-side** in `+page.server.ts`:

```ts
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { myService } = requireGrpc(event.locals.grpc)
  const result = await myService.list({})
  return { items: result.items }
}
```

- `event.locals.grpc` is populated by `hooks.server.ts` for protected routes
- `event.locals.platformUser` holds the logged-in user (DB UUID in `.id`)
- Use `Promise.all([...])` for parallel requests

**3. Translate gRPC errors** in layout/page server files — catch `ClientError`
from `nice-grpc-common` and map to SvelteKit HTTP errors:

```ts
import { ClientError, Status } from "nice-grpc-common"
import { error } from "@sveltejs/kit"

try {
  result = await myService.get({ id })
} catch (e) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
    error(403, "Access denied")
  if (e instanceof ClientError && e.code === Status.NOT_FOUND)
    error(404, "Not found")
  throw e // let unexpected errors surface
}
```

**4. Pass data to the component** via `+page.svelte` props; the load return is
typed automatically by SvelteKit.

**5. Status/enum display helpers** — don't inline lookup tables in components.
Put them in `src/lib/utils/<domain>.ts` so any component can import them. Use
`Partial<Record<number, string>>` (not `Record<number, string>`) so TypeScript
correctly types the lookup as `string | undefined` for unrecognized enum values.
**Do not import generated types from `$lib/server/grpc/generated/` inside Svelte
components** — `$lib/server/` is server-only; use raw numbers with
`Partial<Record<...>>` instead.

**6. Prototype** — `src/lib/components/hackathon/HackathonRow.svelte` is the
reference for a list-row component. Keep `badge`/`badgePreset` as generic string
props so the row works for any badge text, not just status labels.

## Don't

- Don't edit generated code: `components/backend/internal/proto/**`,
  `components/backend/ent/**`,
  `components/frontend/src/lib/server/grpc/generated/**`, `api/proto/API.md`.
  Regenerate via `just codegen::proto` or `just codegen::db-schema`.
- Don't run `just codegen::proto` outside the Nix shell — `buf` isn't in PATH.
  Either run it yourself, or stage proto changes and ask the user to regen.
- Don't skip the casbin permission check on mutation handlers — follow the
  user_service.go pattern.
- Don't assume a phase controls what participants may do — see Phases and
  capabilities.
