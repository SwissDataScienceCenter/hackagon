---
name: backend-service-dev
description:
  Implementing Go/gRPC handlers in the Hackagon backend — proto layout and the
  _svc convention, the service handler pattern, read/write path response
  conventions, ent→proto mappers, casbin RBAC (policy table, roles, no
  inheritance), and how capabilities gate mutations. Use when adding or changing
  an RPC, writing a handler, editing api/proto or db/schema, registering a
  service, or debugging a PermissionDenied from the backend. To discover what
  exists or call an endpoint, see backend-api-explore; for dev data, see
  backend-seeding.
---

# Backend service development

Go + gRPC, Postgres via **ent**, **casbin** for per-hackathon RBAC. Handlers
live in `components/backend/internal/service/`, one file per service.

This skill is the write-it side. To find out what already exists, what a request
looks like, or whether something is implemented, use **backend-api-explore** —
don't assume, and don't rely on any written inventory. For dev fixture data, use
**backend-seeding**.

## Proto layout

```
api/proto/<domain>/              # hackathon, user, vote
├── <name>_service.proto         # service definition (RPCs)
├── entities/                    # nouns (domain types, enums)
└── messages/<svc>_svc/          # verbs (request/response payloads)
    └── *_request.proto / *_response.proto   # one message per file
```

The `_svc` suffix is a **buf workaround** for path-segment name collisions (buf
rejects `hackathon/messages/hackathon/`); it means "messages belonging to
service X". Don't try to tidy it away.

Fully-qualified names come from the proto `package`, not the folder — `user.*`,
`vote.*`, everything else `hackathon.*`.

## Add or change a handler

1. Edit/create `internal/service/<name>_service.go`, following
   `user_service.go`:
   - `NewXService(dbClient *ent.Client, enf *mw.Enforcer) *XService` constructor
   - per-RPC permission check — prefer
     `s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Object, mw.Perm)`,
     which returns the gRPC error directly; raw `Enforce` only when you need the
     bool. Skip only for genuinely public reads.
   - ent query with `With*()` to eager-load relations in `Get`
   - a private `entryFromEnt(*ent.X) *ents.X` mapper, shared across List/Get —
     the server decides depth, not the mapper
2. Register in **`internal/service/server.go`** (`:74-81`) — _not_
   `cmd/service/main.go`, which only calls `service.NewServer`:
   `hackathonSvc.RegisterXServiceServer(server, xService)`
3. `just api-change` if you touched protos, else `just start`. Then verify over
   the wire — see **backend-api-explore**. Chain the rebuild and the verifying
   call into one tool call (`just api-change && just rpc::as …`); the
   intermediate build output isn't worth a second full context re-read.

## Ent-to-proto mappers

- Shared mappers (including `userEntryFromEnt`) live in
  `internal/service/mappers.go` — reuse them, same Go package.
- DB `Optional().Nillable()` → proto `optional` (pointer on the Go side).
- Timestamps → `timestamppb.New(t)` always; if nillable, `timestamppb.New(*t)`
  after a nil-check.
- DB enums → a short `enumFromEnt()` helper per enum.

## Response conventions

**Read path:**

- `List*Response` returns **shallow** entities (scalars + IDs only).
- `Get*Response` returns the **full tree** (embeds creator, modifier, related
  collections).
- `ListRequest` carries explicit filter fields (e.g. `string hackathon_id = 1;`)
  — no generic filter blob.
- Column-backed filters push down to SQL via `.Where()` (e.g.
  `visibility_filter`); **computed** filters stay post-query (e.g.
  `status_filter` on `HackathonStatus`, which is derived from
  `starts_at`/`ends_at` and is not a column). For optional enum filters,
  `UNSPECIFIED` means "no filter". Pattern: `hackathon_service.go:List`.
- `HackathonMember` unifies DB participation (`is_waiting`, `joined_at`) with
  the casbin role in one row.
- Roles (`GlobalRole`, `HackathonRole`) come from **casbin, not the DB**.

**Write path** — settled across all services; match it:

- `Edit*Request`: every field `optional` (no FieldMask).
- `Create` / `Propose`: return `{id}` only — `hackathon_id`, `team_id`,
  `phase_id`, `track_id`, `page_id`, `project_id`.
- `Edit`: return the updated entity.
- `Delete`: return `{}`.
- `Add*` / `Remove*` on a relation (`AssignUser`, `RemoveUser`,
  `ApproveParticipant`, `RemoveParticipant`, `AddOwner`, `RemoveOwner`,
  `Approve`, `Disapprove`): return **`{}`**; the caller re-reads the parent.
  `UserService.AddRole` returning the user is the lone exception, not the rule.
- `SetCapabilities` / `SetCurrentPhase`: return the updated `HackathonState`.

## RBAC (casbin)

`internal/middleware/rbac.go` + `casbin_model.conf`. The subject is the JWT
`sub` claim — the **Keycloak ID, not the DB UUID** — because it's present
directly in the token; using the DB UUID would force a DB lookup on every
request before casbin could decide anything.

Policy table row types (stored in generic `v0`–`v5` columns; `v4`/`v5` are
always null — the adapter schema is fixed regardless of how many fields the
model uses):

| ptype | meaning            | columns                                            |
| ----- | ------------------ | -------------------------------------------------- |
| `p`   | permission rule    | v0=role, v1=hackathon domain, v2=object, v3=action |
| `g`   | per-hackathon role | v0=Keycloak user ID, v1=role, v2=hackathon UUID    |
| `g2`  | global role        | v0=Keycloak user ID, v1=global role                |

- Per-hackathon roles (`g`): `Owner`, `Member`, scoped to a hackathon UUID.
- Global roles (`g2`): `Admin`, `HackathonOrganizer`.
- `Admin` always passes, via the `g2(r.sub, "admin")` escape hatch in the
  matcher.
- **No role inheritance.** `Owner` does not imply `Member`. A policy granted to
  `Member` refuses an `Owner` holding no `Member` row. This is a live source of
  surprising `PermissionDenied`, not a theoretical concern.
- Granted by: `HackathonService.Create` (`Owner`), `HackathonService.Join`
  (`Member`), `ProjectService.Propose` (`Owner`, project-scoped),
  `TeamService.AssignUser` (`Member`, team-scoped), and
  `UserService.AddRole`/`RemoveRole` (global).

**Auth middleware** (`middleware/auth.go`) — one interceptor for all endpoints,
no per-endpoint skip or optional modes:

- No bearer token → anonymous claims `{sub: "anonymous"}`; request proceeds.
- Invalid/expired token → `Unauthenticated`.
- Valid token → real Keycloak claims in context.

Endpoints serving anonymous callers (e.g. `HackathonService.List`) work because
casbin evaluates `"anonymous"` as an unprivileged subject that passes only
wildcard rules. Health works because it never reads claims.

Access rules worth knowing:

- `HackathonService.Get` — caller must appear in `h.Edges.Participants` with
  `!p.IsWaiting`, or hold global `Admin`. Waitlisted users get
  `PermissionDenied`.
- `HackathonService.List` — public hackathons always visible; private ones
  filtered by an `Enforce` check, so anonymous callers see only public.

## Phases and capabilities

Two mechanisms sharing a vocabulary, **not wired to each other**. The naming
strongly implies a link that does not exist.

`Capability` (`api/proto/hackathon/entities/capability.proto`) enumerates six
participant-facing actions: `REGISTER`, `PROPOSE_PROJECTS`,
`SET_TEAM_PREFERENCES`, `CREATE_PROJECT_SUBMISSIONS`, `VOTE`, `VIEW_RESULTS`.

**`HackathonState` is authoritative.** One row per hackathon, six booleans.
`HackathonService.SetCapabilities` is the only writer and does two things per
capability: flips the boolean **and** adds/removes the corresponding casbin `p`
row. That second half is the part that actually grants permission — a handler
"gated on a capability" is really gated on the policy row `SetCapabilities`
wrote. Almost every grant targets `Member`, which collides with the
no-inheritance rule above: an owner is refused where a member succeeds.

**`Phase.capabilities` is decorative.** A JSON string array on the phase row.
The schema comment says so outright: _"Purely informational — does not
auto-enable or disable any capability."_ `SetCurrentPhase` sets
`current_phase_id` and nothing else — it never reads the phase's capabilities
and never touches state or casbin. Advancing a phase changes what the UI
displays, not what anyone may do.

**`cmd/seed` creates no `HackathonState` row at all.** Seeded hackathons
therefore report no capabilities and every capability-gated handler refuses. If
a mutation returns `PermissionDenied` in seeded data, check this before
suspecting your code.

Known gaps are written up in `mydocs/docs/backend-tickets/` — start with
`project-preferences-capability.md`, which traces the whole chain for
`SetPreference` and documents a partial-write bug in `SetCapabilities` when the
state row is missing. Check tickets against the code before acting on them; some
have been partly fixed without the ticket being updated.

## Don't

- Don't edit generated code: `internal/proto/**`, `ent/**`, `api/proto/API.md`.
  Regenerate with `just codegen::proto` / `just codegen::db-schema`.
- Don't **read** generated code either — `ent/**`, `internal/proto/**` and the
  ~5k-line `API.md` are enormous, and anything you pull into the window is
  re-billed on every later call in the session. `grep -n` for the symbol and
  `Read` with `offset`/`limit` around the hit. `Schema.md` (~320 lines) is the
  cheap human-readable substitute for browsing `ent/**`.
- Don't run `just codegen::proto` outside the Nix shell — `buf` isn't in PATH.
  Either run it yourself or stage the proto change and ask.
- Don't skip the casbin check on a mutation handler.
- `db/schema/*.go` is the hand-written source of truth; `ent/**` and `Schema.md`
  are generated from it.
