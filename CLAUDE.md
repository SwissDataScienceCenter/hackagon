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

**Frontend exception:** for `components/frontend/` work, skip steps 3 and 5 —
the user drives in small, single-focused steps (one change described at a
time), implement just that change, then stop; don't batch multiple asks
together or proactively continue to the next logical step. The user writes
and makes commits themselves — don't draft or propose a commit message for
frontend changes unless asked.

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

The justfile is split into modules (`just --list`, and `just <module> --list` for
each). Pick the entry point by what you changed:

```bash
just start              # sync deps + start keycloak, postgres, backend. The default.
just api-change         # regen proto stubs, then start. Use after editing *.proto
just schema-change      # use after editing db/schema/*.go
just down               # stop everything
just changes [ref]      # classify changes vs <ref> and suggest which of the above to run
just develop            # enter the Nix dev shell (alias: just dev)
```

Module commands (note the `::`):

```bash
just codegen::proto            # regen Go + TypeScript gRPC stubs
just codegen::db-schema        # regen Ent code + Schema.md
just db::seed                  # sample hackathons/tracks/projects/teams/users
just db::psql                  # psql shell
just db::summary               # what's currently in the DB
just rpc::as <user> <password> <method> [json]   # authed grpcurl
just rpc::unauth <method> [json]                 # unauthed grpcurl (health)
just check::lint -c backend    # also: test, format, build — all need -c <component>
just deploy::attach            # process-compose TUI, for logs
just clean::state              # wipe Postgres + Keycloak state, then just start
```

`just clean::all` destroys every gitignored file (`.devenv`, `node_modules`) —
don't reach for it casually.

Dev users (Keycloak password for all is `aliceandbob`): `hackagon-admin` (global
admin), `alice` (organizer), `bob`, `charles`. Alice owns at least one seeded
hackathon and is on two seeded teams — useful for owner-only flows without
touching Keycloak.

**Backend runs on `localhost:3000`** under process-compose. To rebuild and
restart just the backend after a Go change, without disturbing the rest of the
stack:

```bash
cd components/backend && GOWORK=off go build -o .output/build/bin/service ./cmd/service
kill $(lsof -tiTCP:3000 -sTCP:LISTEN)   # process-compose restarts it within seconds
```

The live binary is `components/backend/.output/build/bin/service` — *not* the
top-level `.output/backend/...`, which is an unrelated build path. Note that an
unrecovered panic in any gRPC handler kills the whole backend process, not just
that request; process-compose then restarts it, so repeated restarts in its log
usually mean a panicking handler rather than a startup problem.

## Service implementation pattern

Every service listed under Runtime status is already implemented — this is the
pattern to follow when adding a *new* service, or a new RPC to an existing one:

1. Create `components/backend/internal/service/<name>_service.go` following
   `user_service.go`:
   - `NewXService(db, enf)` constructor
   - per-RPC `enforcer.Enforce(ctx, hackathonID, object, perm)` check (skip for
     public reads; see RBAC below)
   - ent query with `With*()` for eager-loading relations in `Get`
   - a private `entryFromEnt(*ent.X) *ents.X` mapper (shared across List/Get —
     server decides depth)
2. Register in `internal/service/server.go` (not `main.go`):
   `x.RegisterXServiceServer(server, xService)`.
3. `just start` → `just rpc::as alice aliceandbob x.XService/List` to verify
   end-to-end.

Ent-to-proto mappers:

- Shared mappers (including `userEntryFromEnt`) live in
  `internal/service/mappers.go` — reuse them (same Go package).
- DB `Optional().Nillable()` → proto `optional` (pointer on the Go side).
- Timestamps → `timestamppb.New(t)` always; if nillable, `timestamppb.New(*t)`
  after nil-check.
- DB enums → write a short `enumFromEnt()` helper per enum.

## Conventions (applied across proto and handlers — match them)

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

**Write path** — settled; these are now applied across every service, match them:

- `Edit*Request`: every field `optional` (no FieldMask).
- `Create`/`Add`/`Propose`: return `{id}` only.
- `Edit`: return the updated entity.
- `Delete`: return `{}`.
- `Add*`/`Remove*` on a relation (e.g. `AssignUser`, `AddOwner`): return the
  mutated parent. Precedent: `AddRole` returns the user.

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
- Role granting is live — handlers call `enforcer.AddRole` at three points:
  `HackathonService.Create` grants the creator `Owner`
  (`hackathon_service.go:86`), `HackathonService.ApproveParticipant` grants
  `Member` (`hackathon_service.go:335`), and `TeamService.AssignUser` grants a
  team-scoped `Member` via `m.WithTeam(teamID)` (`team_service.go:368`) — that
  option is what produces the `/hackathon/*/team/*` domain the `Submission` and
  team-edit policies match on.

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

## Runtime status

**Verify before trusting this section.** It has understated reality more than
once — services were repeatedly found already registered and fully implemented
while these notes still called them missing. Check
`internal/service/server.go` and `grep -n "^func (s \*XService)"` on the handler
file, or run `grpcurl -plaintext localhost:3000 list` (needs the Nix shell).

Services are registered in `internal/service/server.go` (not `main.go`). As of
the last audit, all eight are registered and their handlers implemented:

| Service | Handlers |
| --- | --- |
| `HealthService` | health check (no claims read) |
| `UserService` | `List`, `Get`, `WhoAmI`, `Register` |
| `HackathonService` | `List`, `Get`, `Create`, `Edit`, `Join`, `ApproveParticipant`, `RemoveParticipant` |
| `PageService` | `List`, `Get`, `Create`, `Edit`, `Delete`, `MoveUp`, `MoveDown`, `SetOrder` |
| `PhaseService` | `List`, `Get`, `Create`, `Edit`, `Delete` |
| `TrackService` | `List`, `Get`, `Create`, `Edit`, `Delete` |
| `ProjectService` | `List`, `Get`, `Propose`, `Approve`, `Disapprove`, `Edit`, `Delete`, `SetPreference`, `ExportPreferences` |
| `TeamService` | `List`, `Get`, `Create`, `Edit`, `Delete`, `AssignUser`, `RemoveUser`, `CreateSubmission`, `FinalizeSubmission` |

Not implemented, and genuinely blocked:

- `VoteService` — no `Vote`/`VoteCategory` DB tables exist. Still deferred.
- No `SubmissionService`; submissions are reached through
  `TeamService.CreateSubmission`/`FinalizeSubmission`.

Data-model facts that are easy to get wrong:

- A `Team` belongs to a `Project`, not to a `Hackathon` — `TeamService.Create`
  takes `project_id` and there is no `hackathon_id` on it.
- Only hackathon `Owner`s can create teams (`Team.Create` has exactly one casbin
  grant). Members can only be assigned into existing teams.
- `HackathonService.Get` eager-loads `Members`, `Tracks`, `Projects`, `Pages`
  and `Phases`, all fully populated. Most per-hackathon pages need no second
  call — reuse it via `event.parent()`.
- There is **no pagination anywhere in the API** — no
  `page_size`/`page_token`/`limit`/`offset` on any message, and no handler calls
  `.Limit()`/`.Offset()`. Any pagination in the frontend slices an
  already-fully-fetched list.

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

## Frontend shells and navigation

Two shells, split at the route-group level:

- `(marketing)` — public. `NavBar` + `AppFooter` chrome. Landing page, the
  public `/hackathon/[slug]` page, signin/signout.
- `(app)` — authenticated. `AppSidebar` only, no header/footer. Contains three
  scopes: `(member)` participant pages, `(owner)` organizer tools under
  `/owner/hackathon/[slug]/*`, and `(admin)` platform pages.

**All sidebar entries live in `src/lib/navigation.ts`.** Nothing else builds nav
hrefs. It exports `memberNav(slug, pages)`, `manageNav(slug)`, `platformNav()`,
plus `activeNavId()` and `navModeFromRouteId()`. Add a nav entry there, not in a
component.

Rules that exist because breaking them broke the sidebar before:

- **`NavItem.id` is the key and the active-state handle — never the label.** Page
  titles are user-supplied, so two identically-titled pages keyed by label are a
  duplicate-key crash that takes down the whole `<aside>`.
- **Compute active state once, across every section.** `activeNavId(pathname,
  [...all items])` picks the longest match. Per-section computation let two
  sections highlight at the same time, since each only saw its own hrefs.
- **Derive view/manage mode from `$page.route.id`, not the pathname.** A slug or
  page title containing "owner" must not flip modes; the `(owner)` route group is
  the real boundary.
- **The `(app)` shell load must never throw.** It is chrome for every
  authenticated route, so a failed RPC has to degrade to an empty switcher —
  wrap the calls and fall back to `[]`. A throw there blanks the entire shell,
  logo and user footer included. Note the tradeoff: this means a dead backend
  shows up as "no hackathons" rather than an error.

The member/owner overlap is presented as one mode switch (`NavModeSwitch`, shown
to hackathon owners and global admins), not two simultaneous menus — one
hackathon section renders at a time. Platform nav is pinned outside the scrolling
`<nav>` because it is not scoped to the current hackathon. Owner routes live at
`/owner/hackathon/[slug]/*`.

The navigation is settled — treat this section as describing how it works, not as
an open design question.

## Don't

- Don't edit generated code: `components/backend/internal/proto/**`,
  `components/backend/ent/**`,
  `components/frontend/src/lib/server/grpc/generated/**`, `api/proto/API.md`.
  Regenerate via `just codegen::proto` or `just codegen::db-schema`.
- Don't run `just codegen::proto` outside the Nix shell — `buf` isn't in PATH.
  Enter it with `just develop`, or stage proto changes and ask the user to regen.
- Don't skip the casbin `Enforce` check on mutation handlers — follow the
  user_service.go pattern.
- Don't assume a backend service is missing because a doc says so — the status
  notes here have been wrong in that direction repeatedly. Check `server.go` and
  the handler file first.
- Don't treat a frontend gate as a security boundary. Nothing filters
  `members[].user.email` by caller role, so any confirmed participant already
  receives every other member's email in the raw response. Hiding a field
  client-side is UX, not enforcement.
- Don't run `pnpm format` expecting it to touch `.svelte` files —
  `.prettierrc.yaml` registers no `prettier-plugin-svelte`, so Prettier errors
  with "No parser could be inferred" on every Svelte file. Svelte formatting is
  hand-maintained (4-space indent) until that's fixed.
