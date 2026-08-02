# Phase & capability engine

The single source of truth for "where is this hackathon in its lifecycle, and what
is unlocked right now." Members see a hackathon that knows what time it is:
CTAs that explain why they are closed, a timeline that says what each phase
enables, and eventually a countdown to the next thing that opens.

This replaces the original speculative version of this document. That version was
written before the repo was surveyed and assumed a greenfield build; most of what
it specified already exists, and `feat/vote-service` had already made a different
storage decision. What follows is grounded in the actual code.

---

## 1. What already exists

### On `main`

| Concept | Where |
|---|---|
| `Phase` model — `name`, `description`, `starts_at`, `ends_at` (both nillable), optional linked `Page` | `components/backend/db/schema/phase.go` |
| Phase CRUD, casbin-gated, ordered by `starts_at` | `components/backend/internal/service/phase_service.go` |
| Organizer phase editing UI (the original plan's "Step 5") | `src/routes/(app)/(owner)/owner/hackathon/[slug]/timeline/**` |
| `HackathonStatus` PENDING/ACTIVE/FINISHED — **already computed server-side** | `internal/service/mappers.go` → `computeHackathonStatus` |
| `currentPhase()` — pure, injectable `now`, handles overlap by latest-start-wins | `src/lib/utils/phase.ts` (+ `phase.test.ts`) |
| Timeline "you are here" | member `timeline/+page.server.ts`, Overview "Now:/Next:" line |

Consequences: **do not build a `lifecycle` enum** (it exists as `HackathonStatus`),
**do not rewrite `currentPhase`** (it exists and is tested, including the
overlapping-phases edge case), and **do not build organizer phase editing** (it
exists).

Keep `Phase.ends_at`. The original plan said to derive it from the next phase's
start. The repo stores it, CEL-validates it, indexes it, and the owner UI edits
it. Unpicking that buys nothing.

### On `feat/vote-service` (4 commits, **not merged**, diverged from `main`)

- **`HackathonSettings` table** — `registrations_enabled`, `voting_enabled`, both
  `Default(false)`; `modifier` edge; one row per hackathon via a `Unique()` edge.
- **`EditSettings` RPC** — casbin `Hackathon`/`Write`, partial update.
- **`Hackathon.settings = 19`** — `.WithSettings()`, Get-only.
- **Enforcement in `Join`** — `FailedPrecondition, "registrations are closed"`.
- **Voting schema + protos** — `VoteCategory`, `Vote`, `VoteResult`, a 15-RPC
  `VoteService`. **No implementation**: no `vote_service.go`, not in `server.go`.

Two things this branch establishes that we should keep:

1. **Manual toggles, not date windows**, as the gate.
2. **Server-side enforcement returning `FailedPrecondition`**, next to the casbin
   check. This is the right pattern and is already in `Join`.

### Capabilities that have a backend today

| Capability | RPC | Gated today? |
|---|---|---|
| `register` | `HackathonService.Join` | yes — `settings.registrations_enabled` |
| `submit_proposal` | `ProjectService.Propose` | no |
| `set_team_preferences` | `ProjectService.SetPreference` | no |
| `submit_project` | `TeamService.CreateSubmission` / `FinalizeSubmission` | no |
| `vote` | `VoteService.SubmitVote` | service not implemented |
| `view_results` | `VoteService.ListVoteResults` | service not implemented |

`check_in` and `view_program` from the original plan have **no backend at all** and
are deliberately out of scope. Under the model below, adding them later is a
one-line enum change.

---

## 2. Design decision

> **The toggle decides *whether* a capability is open. The phase describes *when*
> it is expected to change, for display only.**

Dates never open anything. The worst a wrong date can do is show a wrong
countdown — never authorize a mutation. This is what makes it safe to let
organizers keep manual control while still showing members a schedule.

### Two regimes, one table

Capabilities split into two kinds, and the split is why the phase link must be
**nullable per capability** rather than required:

| | Dates are… | Gate | Example |
|---|---|---|---|
| **Pre-event / async** | real, published, planned around | scheduled, phase-linked | "Registration opens 12 Aug" |
| **Live event** | aspirational | manual, unlinked | judging starts when the last team finishes, not at 16:00 |

`vote` is firmly the second kind — voting opens when an organizer says so, often
abruptly and rarely on schedule. It should leave `opens_phase` / `closes_phase`
null and be flipped by hand. `register` is firmly the first. The same table serves
both because the link is optional; nothing special-cases voting.

### Why a capabilities table rather than more booleans on settings

The obvious path is to keep adding `*_enabled` booleans to `HackathonSettings`. It
is simpler at step one and worse at every step after:

- Each new capability costs a schema migration, a proto field, an `EditSettings`
  field and a frontend field — four files.
- The vocabulary ends up spelled three ways — `registrations_enabled` (bool field
  name), `CAPABILITY_REGISTER` (proto enum), `"register"` (string in a
  `Phase.unlocks` JSON array) — hand-mapped between them.

One table with an enum column collapses that: **adding a capability is adding an
enum value.** The upsert objection disappears by pre-creating rows at hackathon
creation, mirroring how the branch already pre-creates the settings row.

It also keeps the door open cheaply: adding `opens_at` / `closes_at` columns to a
capability row later gives you the original plan's window model with no
restructuring. The table subsumes both designs.

### Cost, stated honestly

This asks the `feat/vote-service` author to swap `registrations_enabled` /
`voting_enabled` for capability rows before that branch merges. Code-wise that is
small — `Join` is the only reader of the first, and the second has no reader at
all yet. But those two booleans are `HackathonSettings`' only functional fields,
so it likely retires that table, which is a real ask of someone else's unmerged
work.

**Fallback if that coordination is not affordable:** ship v1 (below) unchanged —
it needs no backend at all — and **stop the branch at its two existing booleans**.
Do not add four more. Revisit the table before v2. The expensive-to-undo move is
widening the settings row, not deferring the decision.

---

## 3. Data model

```go
// components/backend/db/schema/capability.go
field.Enum("capability").Values(
    "register", "submit_proposal", "set_team_preferences",
    "submit_project", "vote", "view_results",
)
field.Bool("enabled").Default(false).
    Comment("Authoritative gate. Phases never open a capability; only this does.")

// Edges
edge.From("hackathon", Hackathon.Type).Ref("capabilities").Unique().Required()
edge.From("opens_phase", Phase.Type).Ref("opens_capabilities").Unique().
    Annotations(entsql.OnDelete(entsql.SetNull)).
    Comment("Optional: phase from which this is expected open. Null = manually driven.")
edge.From("closes_phase", Phase.Type).Ref("closes_capabilities").Unique().
    Annotations(entsql.OnDelete(entsql.SetNull)).
    Comment("Optional: phase at whose start this is expected to close. Null = stays open.")

// Index
index.Fields("capability").Edges("hackathon").Unique()
```

Two links, not one: capabilities routinely span several phases. Registration runs
from "registration opens" through "registration closes" — four phases in the SDSC
template. A single link cannot express that.

`SET NULL` matters: the owner UI can delete phases, and that must not cascade into
deleting capabilities.

Rows are **pre-created for every capability** when a hackathon is created, so
editing is a plain update and reads never have to handle a missing row.

### Manual phase advancement (the "slider")

Live events do not follow the clock. Organizers need one control that says "we are
in Judging now", not six checkboxes to remember at the moment they are busiest.

**Implement it as a bulk action, not as new authority.** `enabled` stays the single
gate. Advancing to phase `X` is one transactional write:

```
for each capability of this hackathon:
    if opens_phase == null: leave untouched      # manually driven, e.g. vote
    else: enabled = (opens_phase <= X) && (closes_phase == null || X < closes_phase)
set hackathon.current_phase = X
```

Why not make a phase pointer the authority and derive `enabled` from it:

- Every gated mutation would need a join plus phase-ordering logic instead of a
  single boolean read. `Join` is currently `if !enabled` — keep it that way.
- Overrides are needed regardless ("we are in Judging, but let team 7 submit
  late"). A pure pointer cannot express them without bolting on the very override
  mechanism the flags already are.
- The DB shows what is actually open, rather than something you must recompute to
  know.

The cost is that flags can drift from what the current phase implies. That drift
is the override feature — but it must be **visible**, so the owner UI shows
"2 capabilities differ from what Judging implies" rather than hiding it.

### `Hackathon.current_phase` (nullable FK to Phase)

Needed because "you are here" cannot come from dates at a live event: if judging
runs two hours late, the clock says Hacking and the member UI would lie — exactly
the failure manual advancement exists to prevent.

- **null** → fall back to the existing date-derived `currentPhase()` in
  `src/lib/utils/phase.ts`. Correct for the pre-event stretch, and it means
  existing hackathons keep today's behavior with no backfill.
- **set** → authoritative for display; the organizer has taken the wheel.

### Proto

```protobuf
// vote/../hackathon/entities/capability.proto
enum Capability {
  CAPABILITY_UNSPECIFIED = 0;
  CAPABILITY_REGISTER = 1;
  CAPABILITY_SUBMIT_PROPOSAL = 2;
  CAPABILITY_SET_TEAM_PREFERENCES = 3;
  CAPABILITY_SUBMIT_PROJECT = 4;
  CAPABILITY_VOTE = 5;
  CAPABILITY_VIEW_RESULTS = 6;
}

enum CapabilityState {
  CAPABILITY_STATE_UNSPECIFIED = 0;
  CAPABILITY_STATE_COMING = 1;
  CAPABILITY_STATE_OPEN = 2;
  CAPABILITY_STATE_CLOSED = 3;
}

message CapabilityStatus {
  Capability capability = 1;
  CapabilityState state = 2;
  optional google.protobuf.Timestamp opens_at = 3;   // from the linked phase
  optional google.protobuf.Timestamp closes_at = 4;
  optional string phase_id = 5;
}
```

On `Hackathon`: `repeated CapabilityStatus capabilities = 20;`
**Field 19 is taken by `settings` on `feat/vote-service`.**

Proto3 map keys cannot be enums, hence a repeated message rather than a map.

---

## 4. Resolution rules

| Condition | State | `opens_at` |
|---|---|---|
| `enabled == true` | `OPEN` | — |
| `false`, `opens_phase` starts in the future | `COMING` | `opens_phase.starts_at` |
| `false`, `opens_phase` has passed | `CLOSED` | — |
| `false`, no `opens_phase` (manually driven) | `CLOSED` | — |

`closes_at` for display is `closes_phase.starts_at` when linked. The last row is
where `vote` lives: no schedule, so members see "not open yet" with no countdown,
which is the truth.

Two capabilities need more than the row:

**`vote` is viewer-dependent.** `VoteCategory` carries `voter_type`
(`ALL_PARTICIPANTS` | `JURY`) plus a `jury_members` M2M, so:

```
vote == OPEN  ⟺  capability.enabled
              ∧  ∃ category where voter_type == ALL_PARTICIPANTS
                                ∨ viewer ∈ category.jury_members
```

This means **capability results must never be cached across users.** `Get` already
resolves `viewer_membership` per caller, so that is the right home — but say so in
a comment on the mapper, because it is not obvious.

**`view_results` needs an explicit publish moment.** `VoteResult` rows are created
one at a time by organizers via `CreateVoteResult`, so inferring "published" from
"rows exist" leaks partial standings between 1st and 3rd place being entered. The
`enabled` flag on the `view_results` row *is* the publish switch — this is a case
where the table's uniformity pays off immediately.

---

## 5. Backend changes

**v2a**

1. `api/proto/hackathon/entities/capability.proto` — the enums and
   `CapabilityStatus` above.
2. `entities/hackathon.proto` — `repeated CapabilityStatus capabilities = 20;`,
   commented Get-only and per-viewer, matching how `status` is documented.
3. `hackathon_service.proto` — `EditCapability` RPC (or extend `EditSettings` if
   that table survives), casbin `Hackathon`/`Write`.
4. `db/schema/capability.go` — `capability` enum + `enabled`, plus the
   `capabilities` back-edge on `Hackathon`.
5. `HackathonService.Create` — pre-create one row per capability, alongside the
   existing settings creation.
6. **Backfill** for existing hackathons — see §8, this is needed regardless.
7. New pure package `internal/capability/resolve.go` — no ent imports, takes
   `(rows, phases, viewer, now)`, returns states. Table-driven tests.
8. `mappers.go` — call it from the `Get` path. `List` does **not** eager-load
   phases or capabilities; either add `.WithCapabilities()` or document it as
   Get-only like `tracks`/`projects`.
9. Enforcement, mirroring `Join` — `FailedPrecondition` in `Propose`,
   `SetPreference`, `CreateSubmission`, `FinalizeSubmission`. **Owners and admins
   bypass**, so organizers can fix things outside a window.

**v2b**

10. `db/schema/capability.go` — add the `opens_phase` / `closes_phase` edges;
    `db/schema/hackathon.go` — add `current_phase`; `Phase` gains the
    `opens_capabilities` / `closes_capabilities` back-edges.
11. `AdvancePhase` RPC — casbin `Hackathon`/`Write`, one transaction over the
    capability rows plus `current_phase`. Must be idempotent: advancing to the
    phase you are already in is a no-op, so a double-click at a live event is
    harmless. Returns the updated capability set so the owner UI can show what
    changed.
12. Resolver gains the `COMING` branch and `opens_at` / `closes_at`.

---

## 6. Frontend changes

Per `CLAUDE.md`, frontend work goes in small single-focus steps driven by the
user; this is the intended shape, not a batch to implement in one go.

1. `src/lib/utils/capabilities.ts` — pure resolver over
   `{capabilities, phases, viewer}`; `nextDeadline()`; `primaryActionFor(role, state)`;
   label and lock-reason copy. `now` injected. Vitest alongside `phase.test.ts`.
   Must treat missing data as all-closed.
2. `(member)/hackathon/[slug]/+layout.server.ts` — pass capabilities through.
   **Layout data is the shared accessor** — no store, no hook. The original plan's
   `useHackathonState()` is React-shaped and does not apply.
3. Gate the one real CTA — *Propose a Project* in `proposals/+page.svelte` —
   with a visible reason rather than a silent hide.
4. Later: Timeline showing what each phase unlocks; Overview "what now" line;
   nav badges on gated tabs.

Labels, priorities and target tabs stay in the frontend. They are product copy,
not domain truth, and do not belong in proto.

---

## 7. Staging

**v1 — toggle-aware members. Zero backend changes.**
Once `feat/vote-service` merges, `hackathon.settings` is already on the Get
response the member layout already calls. Frontend only: the resolver module, the
layout wiring, the one CTA. Honest limit: open/closed only, no countdowns.

**v2a — the capabilities table + enforcement + per-capability toggles.**
Schema (`enabled` only — leave the phase links for v2b), backfill, resolver, the
four enforcement call sites, and a toggle screen under `(owner)` (none exists
yet). Complete and useful on its own.

**This is the whole of what voting needs.** A manual toggle is exactly the right
control for a capability that opens abruptly, so `vote` and `view_results` are
done at v2a and need nothing from the phase machinery.

**v2b — phase links + the advance action.**
Add `opens_phase` / `closes_phase` / `current_phase`, the `AdvancePhase` RPC, and
the organizer's "we are in Judging now" control. Compute `COMING` with `opens_at`.
This buys "Registration opens in 3 days", the Timeline explaining each phase, and
a live-event control surface that is one click instead of six.

**v3 — close the loop (optional, and possibly never).**
A scheduled job advances phases automatically when their `starts_at` passes —
the same bulk write `AdvancePhase` performs, on a timer. Only worth it for the
pre-event stretch; live-event phases should stay manual. Needs a per-hackathon or
per-phase `auto` flag so the scheduler cannot stomp a deliberate override, and
must never advance past a phase an organizer has manually set. Given v2b already
makes advancing one click, this may not be worth building at all — decide after
watching one real event.

Voting UI slots in after `VoteService` is actually implemented. Until then `vote`
resolves `CLOSED` and nothing renders.

---

## 8. Gaps in `feat/vote-service` to raise with its author

Both affect how the frontend must be written, so they are not incidental.

1. **No settings backfill.** Only `Create` inserts a settings row — there is no
   migration and `cmd/seed/main.go` does not create one. Every pre-existing
   hackathon, including all seeded ones, therefore fails `Join` with
   `NotFound "hackathon settings not found"`. The same gap will exist for
   capability rows, so whichever storage wins needs a backfill.
2. **Dead error check in `EditSettings`.** It uses `Update().Where(...)`, not
   `UpdateOne` — `Save` returns `(int, error)`, so the `ent.IsNotFound(err)` check
   after it can never fire. Editing settings for a hackathon with no settings row
   silently succeeds against zero rows. Check the returned count instead.

---

## 9. Tests

Backend, table-driven at fixed `now`, one seeded hackathon:

- before anything is enabled → all `CLOSED`, or `COMING` where a future phase is
  linked
- `enabled` true → `OPEN` regardless of phase dates (proves toggle authority)
- `enabled` false with a past `opens_phase` → `CLOSED`
- phase deleted → capability survives with null links, resolves `CLOSED`,
  nothing panics

`AdvancePhase`:

- advancing to a mid-template phase → a capability spanning it (`register`, opens
  before, closes after) stays `enabled`; one whose `closes_phase` has been reached
  flips off
- a capability with no `opens_phase` (`vote`) is **left untouched** in both
  directions — this is the test that protects the manual regime
- advancing to the current phase is a no-op (idempotent under a double-click)
- advancing backwards restores the earlier flag set
- a failure mid-write leaves no partial state (transactional)
- `vote` with `voter_type=JURY` → `OPEN` for a jury member, `CLOSED` for a
  non-jury participant **in the same hackathon at the same instant**

Frontend, vitest: `nextDeadline` picks the soonest `opens_at`; `primaryActionFor`
considers only `OPEN`; missing capabilities data degrades to all-closed.

---

## 10. Open coordination questions

- Does the `feat/vote-service` author accept swapping the two booleans for
  capability rows before merge? If not, take the §2 fallback.
- v3 touches `hackathon.proto`, `mappers.go` and `db/schema/hackathon.go` — all
  files that branch edits. v1 is deliberately conflict-free (new files only).
