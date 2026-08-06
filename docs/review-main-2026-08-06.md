# Bringing `origin/main` into `sketch/06-08-26`

Reviewed 2026-08-06. Merge base `3b68f350`; main at `a334bcac` (183 commits,
746 files). Read from code on both sides, not from commit messages.

**The headline, before anything else: this merge is not additive everywhere.**
Main **deleted** the `Capability` entity our branch is built on and replaced it
with a flat boolean `HackathonState` plus casbin-policy enforcement. The two
enforcement paths cannot both run. Everywhere else, "additive" holds.

---

## 1. Core platform architecture & capability model

Both branches took the merge base's unexposed `Capability` table and went
opposite ways.

| | main | ours |
| --- | --- | --- |
| Storage | one `HackathonState` row, 6 booleans (`db/schema/hackathonstate.go:30-47`) | one row per capability, `enabled` + phase links (`db/schema/capability.go:31-53`) |
| States | boolean | `COMING / OPEN / CLOSED / UNGOVERNED` (`entities/capability.proto:30-41`) |
| Schedule | phase carries capability *tags*, informational (`db/schema/phase.go:48-58`) | capability names its opening AND closing phase (`capability.go:77-85`) |
| Audit | one modifier for the whole row | per capability (`capability.proto:46-47`) |
| Enforcement | `SetCapabilities` writes casbin rows (`hackathon_service.go:638-746`); services check permissions only | `requireCapability` in each handler (`internal/service/capability.go:474`) with an organiser bypass (`:481-489`) |
| On List | Get only | Get **and** List (`hackathon.proto:56-60`) |

The 6 enum values and their numbers are identical on both sides — the one piece
already compatible.

**Decision: keep ours, port nothing here.** Ours is a superset (four states,
closing phases, per-row audit, countdowns). Layering main's casbin writes on top
would double-gate registration and submissions.

**Two real gaps this exposed on our side:**

- `CAPABILITY_VOTE` and `CAPABILITY_VIEW_RESULTS` are declared, seeded and
  toggleable — and **no handler reads them**. The real vote gate is
  `settings.VotingEnabled` (`vote_service.go:452`). Two switches that do nothing.
- The casbin matcher lacks main's `g2(r.sub, p.sub)` (`middleware/casbin_model.conf:35`),
  and our RBAC vocabulary has no `Vote`/`VoteCategory`/`VoteResult` object types
  despite our having a vote service.

---

## 2. Participant flow

Mostly at parity — several premises in the brief were already satisfied.

- **"Not yet on a team"** — already ours, verbatim (`overview/+page.svelte:50`);
  the two `overview/+page.server.ts` files are byte-identical.
- **Proposals** — at parity, plus we have the CSV export main lacks.
- **Preferences** — *was broken on ours* (see §5).
- **Submissions** — a deliberate divergence, not a gap: main shows only your own
  teams; we show every team because members read all submissions hackathon-wide.
  Worth taking: main's message for the on-no-team case, which ours never shows.

**Worth porting (genuinely additive, frontend only):**

| From main | Why |
| --- | --- |
| `CurrentStateCard.svelte` + `capabilityLinks.ts` | "You can now: propose / vote", each a link to the page that does it |
| `OrganizerStateAlert.svelte` + `hackathonState.ts` | warns when the current phase expects a capability that is off |
| `hackathonState` derived in the hackathon layout | prerequisite for both; ours returns 3 keys and derives nothing |
| capability-gated nav (`Voting`, `Results`) | ours shows Voting unconditionally |
| `currentAndNextPhase()`, `formatPhaseRange()` | used by the above |

Each must be re-expressed against our `CapabilityStatus[]` rather than main's
`state.capabilities` — the same adaptation `phaseForm.ts` already documents.

---

## 3. Manager & admin flows

**Already identical, nothing to do:** team matching (`teams/manage/**` is
byte-identical, including drag-and-drop and multiple teams per project), tracks
(same files, same line numbers), project approve/revoke (present on both, ours
inline rather than on a `projects/manage` route).

**Ours is ahead:** deadline windows with now-anchored overrides
(`windows/**`, `ConfigService`), prizes with an explicit finalise, forms,
invitations, notifications — none exist on main.

**The one consequential gap — and it is a live bug.** `UserService.AddRole` /
`RemoveRole` are implemented on main (`user_service.go:143,192`, with a
self-demotion guard at `:225`) and are **`Unimplemented` stubs on ours** — while
our `/manage/users` page, taken from main, already calls them
(`+page.server.ts:40,70`) and renders the controls. The error handler catches
`PERMISSION_DENIED`, `NOT_FOUND`, `INVALID_ARGUMENT` — not `Unimplemented` — so
promoting someone to Hackathon Organizer **500s**. Port: `AddRole`, `RemoveRole`,
`protoRoleToCasbin`, `RemoveGlobalRole`, `GetAllGlobalRoles`.

Same family, dormant rather than broken: `AddOwner`/`RemoveOwner` are proto-only
on ours with no caller; main implements them plus a `Hackathon.owners` field and
promote/demote UI.

---

## 4. Voting & results

**Ours is ahead on policy:** the event-level voting policy (organiser
neutrality, own-team voting) exists only here, and is enforced in `SubmitVote`.
Also `PrizeService` — an organiser records the *actual* awards and freezes them,
deliberately separate from the tally. Main writes `SuggestResults` straight into
`VoteResult` with no equivalent.

**Main is ahead on the count:**

| | main | ours |
| --- | --- | --- |
| Ballot types | single choice, ranked (Borda), points | single choice only (`vote_service.go:419-427` rejects the rest) |
| `max_points` per category | yes (`vote_category.proto:20`) | absent |
| **Tally RPC** | `SuggestResults` + `computeResults` (`vote_service.go:1183,1295`) | **absent** — placements are entered by hand |
| Results page | member-only route `/results` (**not public**, contrary to the brief) | inline on `/voting` |

**Port `SuggestResults`** — its single-choice branch works against our schema
unchanged, and "compute the tally" is the missing step between voting and
prizes. **Do not port ranked/points ballots**: they require changing the `Vote`
unique index from `(category, voter)` to `(category, voter, submission)`, which
destroys our one-ballot-per-category invariant and needs a data migration.
`max_points` also collides with our field numbering (tag 6 is `jury_member_ids`).

---

## 5. Discrepancies — verified against code

| Reported | Verdict | Action |
| --- | --- | --- |
| Submission controls usable with the capability off | **Main only.** Ours hides all three controls and refuses create *and* finalise server-side. Main's Finalise is deliberately un-gated (`capabilities.ts:197-204`) and its `team_service.go` has no capability checks at all | Nothing to port. Fixed a residual gap of ours: `EditSubmission` checked the window but not the capability |
| Phase plan vs live toggles is confusing | **Real, and worse than reported.** Advancing a phase *does* rewrite capability state on our branch, while four surfaces promised it never does — inherited from main, where phases really are inert | Behaviour kept (it is our design); all four surfaces now say what actually happens |
| Direct management links are an improvement | **Main only.** `/manage` landing page with 7 tiles, plus clickable capability links on the member overview | Worth porting — our capability switches are three clicks deep on `/timeline` |

**Two further defects found while checking, both ours:**

- **"★ Preferred" was a button that always failed** — it called the
  organiser-only `RemovePreference` without the `user_id` it requires. Now a
  badge, since our pinned policy is that a preference is final.
- **"Clear current phase" cannot succeed** — it submits no `phaseId`, and
  `AdvancePhase` parses it as a UUID (`hackathon_service.go:1007`) →
  `InvalidArgument`. Main has a `SetCurrentPhase` that reads `""` as "clear";
  ours does not. **Still open.**

---

## Order of work

1. **`AddRole`/`RemoveRole`** — a shipped 500 on a page we already ship.
2. **"Clear current phase"** — a dead button, small fix.
3. **Wire `VOTE` / `VIEW_RESULTS`** into `requireCapability` — two switches that
   currently do nothing.
4. **`SuggestResults`** — the missing step between voting and prizes.
5. **`CurrentStateCard` / `OrganizerStateAlert` / `hackathonState`** — the
   participant and organiser "what now?" surfaces.
6. **`/manage` landing page** — presentation, but it is the fix for switches
   buried three clicks deep.

Explicitly **not** doing: main's `HackathonState` model, its casbin-based
capability enforcement, ranked/points ballots.
