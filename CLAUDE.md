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
├── <domain>/                     # hackathon, user, health, vote, site
│   ├── <name>_service.proto      # service definition (RPCs)
│   ├── entities/                 # nouns (domain types, enums)
│   └── messages/<svc>_svc/       # verbs (request/response payloads)
│       └── *_request/response.proto   # one message per file
components/backend/
├── cmd/service/main.go           # starts the gRPC server, registers services
├── cmd/seed/main.go              # populates DB with dev data (README inside)
├── db/schema/*.go                # DB schema (source of truth — hand-written)
├── ent/**                        # generated ORM code (do not edit)
├── internal/service/*.go         # gRPC handlers (one file per service)
├── internal/middleware/rbac.go   # casbin enforcer
├── internal/logx/logx.go         # slog setup + Fatal helper
└── Schema.md                     # human-readable DB reference (auto-generated)
components/frontend/              # SvelteKit; generated gRPC clients under src/lib/server/grpc/generated/
tools/nix/                        # Nix flake + process-compose config (toolchain.nix)
justfile                          # all common dev commands
```

The `_svc` suffix in proto folder paths is a buf workaround for path-segment
name collisions (buf rejects `hackathon/messages/hackathon/`); `_svc` means
"messages belonging to service X".

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

Dev users (Keycloak password for all is `aliceandbob`): `hackagon-admin` (global
admin), `alice` (organizer), `bob`, `charles`.

## Service implementation pattern

Read path contracts and entities already exist (`Get`, `List` protos are shaped
for every service). Handlers are what's missing. To add a service:

1. Create `components/backend/internal/service/<name>_service.go` following
   `user_service.go`:
   - `NewXService(db, enf)` constructor
   - per-RPC `enforcer.Enforce(ctx, hackathonID, object, perm)` check (skip for
     public reads; see RBAC below)
   - ent query with `With*()` for eager-loading relations in `Get`
   - a private `entryFromEnt(*ent.X) *ents.X` mapper (shared across List/Get —
     server decides depth)
2. Register in `cmd/service/main.go`:
   `x.RegisterXServiceServer(server, xService)`.
3. `just up` → `just rpc-as alice aliceandbob x.XService/List` to verify
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

**Write path** — decide once when first write handler lands, then match across
services:

- `Edit*Request`: every field `optional` (no FieldMask).
- `Create`/`Add`/`Propose`: return `{id}` only.
- `Edit`: return the updated entity.
- `Delete`: return `{}`.
- `Add*`/`Remove*` on a relation (e.g. `AssignUser`, `AddOwner`): return the
  mutated parent. Precedent: `AddRole` returns the user.

## Platform pages vs hackathon pages

Two different things, easily confused:

- `hackathon.PageService` / `Page` — content **inside one event** (news,
  webinars, photos, the wrap-up blog). The hackathon edge is `Required()`, and
  casbin authorizes it in that hackathon's domain.
- `site.SitePageService` / `SitePage` — the **platform's own** pages (about,
  privacy, terms), addressed by a unique slug. They belong to no event, so
  there is no hackathon domain to scope them to: published pages are readable
  by everyone (the footer links reach them before login) and every mutation
  requires the global Admin role via `enforcer.RequireGlobalAdmin`. Drafts
  (`visible=false`) return `NotFound` to non-admins rather than
  `PermissionDenied`, so their existence stays private.

Frontend: `(public)/[slug=sitepage]` renders them — the `sitepage` param
matcher (`src/params/sitepage.ts`) lists which slugs resolve, and
`PUBLIC_ROUTE_PATTERNS` in `hooks.server.ts` must allow the same set or the
auth guard redirects visitors to login. Admin CRUD lives at `/manage/pages`.
Content is markdown and is parsed + sanitized before rendering — never feed it
to `{@html}` directly.

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
- Role-granting code doesn't exist yet — `enforcer.AddRole` is wired up but no
  handler calls it. Until write-path handlers land, only the `hackagon-admin`
  user has non-zero roles.

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

For read endpoints during bootstrap, it's fine to skip casbin entirely and rely
on JWT alone — add a `// TODO: casbin check once role-granting RPCs exist`
comment.

## Priority order (from coworker)

Read path (Get/List) for every listed service, then mutations, then voting:

1. `UserService` — already implemented (`List`, `WhoAmI`, `Register`). Needs
   `Get`.
2. `HackathonService` — `List` and `Get` implemented. Next: `Create`, `Join`,
   `ApproveParticipant`.
3. `PageService` — full CRUD.
4. `PhaseService` — full CRUD.
5. `TrackService` — Get/List proto exists; Create/Edit/Delete protos don't yet.
6. `ProjectService` — mutation protos exist (`Propose`, `Approve`, `Edit`,
   `Delete`) but `status` is still a string — convert to `ProjectStatus` enum.
   Also add `SetPreference`, `ExportPreferences`.
7. `TeamService` — Create/AssignUser exist; add Edit, Delete, RemoveUser,
   CreateSubmission, FinalizeSubmission.
8. `VoteService` — only if DB has `Vote`/`VoteCategory` tables (currently
   doesn't). Defer until coworker returns.

## Runtime status

- `main.go` registers `HealthService`, `UserService`, `HackathonService`
  (`List` + `Get` implemented). Other `hackathon.*` services
  (Page/Phase/Project/Team/Track) have proto contracts but are UNIMPLEMENTED at
  runtime.

## Frontend route → backend pattern

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
  Regenerate via `just generate-proto` or `just generate-db-schema`.
- Don't run `just generate-proto` outside the Nix shell — `buf` isn't in PATH.
  Either run it yourself, or stage proto changes and ask the user to regen.
- Don't skip the casbin `Enforce` check on mutation handlers — follow the
  user_service.go pattern.
