---
name: backend-services
description:
  Writing Go gRPC handlers in hackagon's backend — the service implementation
  pattern, ent-to-proto mappers, casbin RBAC and how roles are granted, where
  services are registered, and how to check what is actually implemented. Use for
  any work under components/backend/internal/service/ or middleware/, or when
  asked whether a backend RPC exists.
---

## Check what exists before assuming

Status docs for this repo have understated reality repeatedly — services were
found already registered and fully implemented while notes still called them
missing. Verify directly:

```bash
grep -nE "Register[A-Za-z]+ServiceServer" components/backend/internal/service/server.go
grep -nE "^func \(s \*XService\)" components/backend/internal/service/x_service.go
just rpc::unauth grpc.health.v1.Health/Check   # or: grpcurl -plaintext localhost:3000 list
```

As of 2026-08-03 all eight services are registered **and** implemented:
`Health`, `User`, `Hackathon`, `Page`, `Phase`, `Track`, `Project`, `Team`.

Genuinely absent: `VoteService` and any `SubmissionService` — submissions are
reached via `TeamService.CreateSubmission`/`FinalizeSubmission`.

`VoteService` protos and `Vote`/`VoteCategory`/`VoteResult` **DB schema** exist on
the unmerged `feat/vote-service` branch, but no handler and no `server.go` entry.
That branch also adds a `HackathonSettings` table whose two booleans overlap the
capability rows described below — reconcile before merging, and see
`.claude/plans/phase-engine.md` §2.

## Adding a service or RPC

1. Create `internal/service/<name>_service.go` following `user_service.go`:
   - `NewXService(db, enf)` constructor.
   - Per-RPC `enforcer.RequirePermission(ctx, hackathonID, object, perm)`.
   - Ent query with `With*()` to eager-load relations in `Get`.
   - A private `entryFromEnt(*ent.X) *ents.X` mapper, shared across `List`/`Get`
     — the server decides depth.
2. Register in **`internal/service/server.go`** (not `main.go`):
   `x.RegisterXServiceServer(server, xService)`.
3. Verify: `just start`, then
   `just rpc::as alice aliceandbob x.XService/List`.

## Ent-to-proto mappers

- Shared mappers (including `userEntryFromEnt`) live in `internal/service/mappers.go`
  — reuse them, same Go package.
- DB `Optional().Nillable()` → proto `optional` (pointer on the Go side).
- Timestamps → `timestamppb.New(t)`; if nillable, nil-check then
  `timestamppb.New(*t)`.
- DB enums → a short `enumFromEnt()` helper per enum.

**Eager-load every edge your mapper dereferences.** Handlers and mappers access
`.Edges.*` unconditionally, so a missing `With*()` is a nil dereference — and
there is no panic-recovery interceptor, so that kills the whole backend process
for every user, not just the request. This has already happened once:
`TeamService.Get` panicked on teams with submissions because `.WithSubmissions()`
didn't nest-load each submission's own `Team`/`Project`/`Creator`.

## Data-model facts that are easy to get wrong

- A `Team` belongs to a **`Project`**, not to a `Hackathon` — `TeamService.Create`
  takes `project_id` and has no `hackathon_id`.
- Only hackathon `Owner`s can create teams (`Team.Create` has exactly one casbin
  grant). Members can only be assigned into existing teams.
- `HackathonService.Get` eager-loads `Members`, `Tracks`, `Projects`, `Pages`,
  `Phases`, `Capabilities` — all fully populated.
- `HackathonStatus` is computed server-side from `starts_at`/`ends_at`, not stored.
- `Hackathon.capabilities` is also computed, and is returned by **`List` as well as
  `Get`** — the one place the "List is shallow" rule is broken on purpose, so a
  list can gate its own buttons. `List` therefore eager-loads `Capabilities` *and*
  `Phases`; see the capability section below for why phases are needed.
- Roles (`GlobalRole`, `HackathonRole`) come from casbin, not the DB.
- There is no pagination anywhere in the API, and no handler calls
  `.Limit()`/`.Offset()`.

## Capability gates (is this action open right now?)

Casbin answers "may this user ever do this". Capabilities answer "is it open right
now". Every gated mutation needs **both**, side by side.

- One `Capability` row per capability per hackathon, pre-created by
  `HackathonService.Create`. `enabled` is the **authoritative** gate.
- Rules live in `internal/capability` — no ent, no proto imports, so the read path
  (what to show) and the write path (what to allow) cannot disagree. Don't
  reimplement them in a handler.
- Enforce with `requireCapability(ctx, db, enf, hackathonID, capability.X)` from
  `internal/service/capability.go`. It returns `FailedPrecondition`, and **anyone
  who can write the hackathon bypasses it** — organizers must be able to fix
  things outside a window.
- Currently gated: `Join`, `ProjectService.Propose`, `SetPreference`,
  `TeamService.CreateSubmission`, `FinalizeSubmission`.
- **A capability with no row resolves `UNGOVERNED` and is not enforced.** Use
  `States.Allowed`, never `== StateOpen`, or every hackathon predating a capability
  starts rejecting that mutation.
- `defaultCapabilityEnabled` (in `internal/service/capability.go`) is why a new
  hackathon starts permissive. Flipping it is a product decision, not a cleanup.

Phases only *describe* when a capability is expected to change; they never change
it. But once an organizer calls `AdvancePhase`, `COMING` is decided by phase
**position** rather than by dates — they advance precisely when the schedule has
stopped matching reality, so comparing dates then contradicts them. That is why
anything resolving states for display must build a `capabilityClock` from the
hackathon's phase order plus `current_phase_id`. Enforcement does not need one:
`COMING` and `CLOSED` are both blocked.

## RBAC (casbin)

See `internal/middleware/rbac.go` and `casbin_model.conf`. The subject is the JWT
`sub` claim (Keycloak ID, not DB UUID) — it's present directly in the JWT, so
using the DB UUID would force a DB lookup before casbin could check anything.

Policy table row types (stored in generic `v0`–`v5` columns; `v4`/`v5` are always
null — the adapter schema is fixed regardless of how many fields the model uses):

- `ptype=p` — permission rules: v0=role, v1=hackathon domain, v2=object type,
  v3=action
- `ptype=g` — per-hackathon role assignment: v0=Keycloak user ID, v1=role,
  v2=hackathon UUID
- `ptype=g2` — global role assignment: v0=Keycloak user ID, v1=global role

Roles:

- Per-hackathon (`g`): `Owner`, `Member`, scoped to a hackathon UUID.
- Global (`g2`): `Admin`, `HackathonOrganizer`.
- `Admin` always passes via the `g2(r.sub, "admin")` escape hatch in the matcher.

**Role granting is live** — three handlers call `enforcer.AddRole`
(`grep -n AddRole internal/service/` finds them; line numbers are deliberately not
quoted here, they drift on every edit):
`HackathonService.Create` grants the creator `Owner`, `ApproveParticipant` grants
`Member`, and `TeamService.AssignUser` grants a team-scoped `Member` via
`m.WithTeam(teamID)`. That last option produces the `/hackathon/*/team/*` domain
the submission and team-edit policies match on.

`defaultPolicies()` grants `g2 admin` to `cfg.Server.AdminKeycloakID`
(`hackagon-admin`) on every enforcer startup — not seed-driven. If a global admin
appears to lack a role, check whether it's being *read back* correctly (the
`WhoAmI`-vs-`Get` bug) before concluding the grant is missing.

## Auth middleware

One interceptor for all endpoints (`middleware/auth.go`), chained as
`auth → validation` in `server.go`. There are no per-endpoint skip or optional
modes.

- No bearer token → anonymous claims `{sub: "anonymous"}`; request proceeds.
- Invalid/expired token → `Unauthenticated`.
- Valid token → real Keycloak claims in context.

Endpoints serving anonymous callers work because casbin evaluates `"anonymous"` as
an unprivileged subject that passes only wildcard rules. Health works because it
never reads claims.

**Access rules — backend is authoritative, the frontend only translates errors:**

- `HackathonService.Get`: caller must appear in `h.Edges.Participants` with
  `!p.IsWaiting`, or hold global `Admin`. Waitlisted users get `PermissionDenied`.
- `HackathonService.List`: public hackathons always visible; private ones filtered
  by casbin `Enforce` (anonymous always fails, so they see only public).

## Don't

- Don't edit generated code: `internal/proto/**`, `ent/**`. Regenerate instead —
  see the `api-proto` skill.
- Don't skip the casbin check on a mutation handler.
- Don't skip the capability gate on a mutation that has one. Casbin and
  capabilities answer different questions; passing one is not passing the other.
