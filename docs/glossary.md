# Glossary

The vocabulary this documentation and the code use, alphabetized. Every entry is
verified against branch `sketch/06-08-26`; where a word means two different
things the entry says which one is which.

Four collisions are worth reading before the rest:

- **Capability** is a database row that gates an action; **capability probe** is
  an unrelated e2e technique for discovering which RPCs exist.
- **Participant** is a database row; **member** is a casbin role. Everyone who
  joins gets both, and they stop agreeing as soon as `is_waiting` matters.
- **Phase** is a segment of the real event's schedule; **act** is a grouping of
  actions in the test recipe. They are not aligned and never map onto each other.
- **Gate** means either one of the three runtime enforcement mechanisms or the
  `gate` field on a recipe action.

---

**Act** — one of the nine groupings (0-8) of the e2e recipe's 309 actions
(`.claude/skills/hackathon-e2e/recipe.jsonl`), carried as the `act` field on
every line and used by `run.sh journey --until-act <n>` to freeze the story
partway. Acts are a narrative device for the test suite only — the backend has
no notion of them, and they are unrelated to `Phase`.

**Admin** — the global casbin role `admin`, stored as a `g2` row and bootstrapped
at every enforcer construction from `cfg.Server.AdminKeycloakID`
(`defaultPolicies` in `components/backend/internal/middleware/rbac.go`). The
matcher's trailing `|| g2(r.sub, "admin")` clause is the **escape hatch**: an
admin short-circuits the entire expression and is allowed everything everywhere,
which is also the only way `user:read` (and therefore `UserService.List`/`Get`)
can ever succeed. No RPC grants it.

**Anonymous** — the subject `"anonymous"` (`mw.AnonSubject` in
`components/backend/internal/middleware/auth.go`) that the interceptor injects
when a request carries no bearer token. Casbin treats it as an ordinary
unprivileged subject, so it matches only wildcard (`p.sub == "*"`) rules —
anonymous access is a consequence of the policy set, never an exemption.

**Backfill** — moving a waitlisted registrant into a spot freed by a dropout:
`ApproveParticipant` on them, then `AssignUser` into the vacated team seat. A
lifecycle term pinned by the recipe (`act5.backfill`), not a backend concept.

**Ballot** — one `Vote` row: a `vote_type` discriminator, an optional `value`,
and edges to a category, a voter and a submission
(`components/backend/db/schema/vote.go`). The unique index on
`(category, voter)` makes it **one ballot per voter per category**, so a second
attempt returns `AlreadyExists`; that same shape is why ranked and points ballots
cannot be stored yet and `SubmitVote` accepts only `single_choice`.

**Capability** — a row in the `capabilities` table gating one member-facing
action: `register`, `propose_projects`, `set_team_preferences`,
`create_project_submissions`, `vote`, `view_results`
(`components/backend/db/schema/capability.go`). Its `enabled` boolean is the
**authoritative** enable/disable — the `open_in_phase`/`closed_in_phase` edges
are display and scheduling only and never flip it by themselves.
`HackathonService.Create` pre-creates all six rows with `enabled = true`, and
`requireCapability` (`internal/service/capability.go`) fails a blocked mutation
with `FailedPrecondition`, bypassed by anyone holding `hackathon:write`.

**Capability probe** — the e2e technique, unrelated to the database rows above:
`.claude/skills/hackathon-e2e/scripts/probe.sh` calls each of 47 tracked RPCs
anonymously with `{}` via grpcurl and writes `.state/capabilities.json`. Anything
other than `Unimplemented` or a reflection failure — including `Unauthenticated`
and `PermissionDenied` — counts as implemented, so recipe actions gated on a
method un-skip by themselves the day its handler lands.

**Capability state** — the resolved read-side answer for one capability, computed
by `capability.ResolveRow` (`components/backend/internal/capability/capability.go`):
`OPEN` when `enabled`, else `COMING` when the opening phase is still ahead, else
`CLOSED`; a capability with no row at all is `UNGOVERNED`. `States.Allowed`
treats `UNGOVERNED` as permissive, which is what lets capabilities be adopted one
at a time without bricking hackathons created before them.

**Cast** — the 15 people the e2e suites act as: 4 principals plus 11 extras, all
sharing the dev password `aliceandbob`. The capacity screenplay (`JOURNEY_CAST`
in `.claude/skills/hackathon-e2e/personas.ts`) is 13 registrations, announced
capacity 8, one dropout, one backfill, one no-show and one walk-in.

**Confirmed participant** — a `participants` row with `is_waiting = false`. It is
what actually gates the sensitive paths — `viewerMayOpenMemberView` in
`HackathonService.Get` and the confirmed check in `VoteService.SubmitVote` —
because the casbin `member` role alone does not distinguish confirmed from
waitlisted. `ApproveParticipant` sets it; `HackathonService.Create` inserts the
creator already confirmed.

**Consent** — a checkbox declared in the registration form schema as
`{key, label, required}` and answered in `FormResponse.consents`
(`map[string]bool`). `SubmitRegistrationForm` rejects an unknown consent key and
an unticked **required** consent with `InvalidArgument`; optional consents are
recorded as given or declined and are expected to be honoured downstream (the
recipe has a registrant decline photo consent in act 2 and checks it still holds
when photos are published in act 8).

**Deferred** — a recipe action carrying `"implement": false`: documentation of a
flow that deliberately will not be built now (6 actions — email templates,
branding, structured-submission validation and the three account-deletion
lines). Note that the field is pure triage metadata: the runner never reads it,
and those actions skip because their `method`/`gate` probes as unimplemented.

**Domain** — the hierarchical path a casbin check is scoped to, built by
`hackathonIdToPath` / `projectDomainPath` / `teamDomainPath` in `rbac.go`:
`/hackathon/<id>`, `/hackathon/<id>/project/<pid>`, `/hackathon/<id>/team/<tid>`.
Only the `p` side globs — a `g` grant is an exact string compare, so a role row
written against the literal `/hackathon/*` cannot satisfy a concrete hackathon.

**Dropout** — a confirmed participant removed with
`HackathonService.RemoveParticipant`, which deletes the row and revokes the
casbin `member` grant. It does **not** cascade to their team seat; that must be
cleared separately with `TeamService.RemoveUser`.

**Extra** — one of the 11 additional cast members in
`.claude/skills/hackathon-e2e/cast.json`, provisioned idempotently into Keycloak
by `scripts/roster.sh`. Extras are API-only — no browser session — and
self-register through the same `user.UserService/Register` RPC the frontend
calls, so RBAC is exercised for them as for anyone else.

**Finalize (prizes)** — `PrizeService.Finalize`, which writes the `awards` JSON
and sets `finalized = true` on the prize row (`hackathon:write` required). Votes
are advisory up to this point: the tally does not assign prizes, a human reviews
it and finalizes, and the table stays editable afterwards via `PrizeService.Edit`.

**Finalized submission** — a `Submission` whose `status` has been moved from
`draft` to `final` by `TeamService.FinalizeSubmission`. Finalized submissions are
frozen — `EditSubmission` refuses to touch one.

**Form response** — one `form_responses` row: a registrant's answers
(`responses` JSON keyed by field key) and consents. Unique on
`(hackathon, user)`, so a second submission is `AlreadyExists`. It carries both a
`user` edge (whom the response is *about*) and a `submitted_by` edge (who typed
it in), which is what makes the organizer's `on_behalf_of` path possible.

**Form schema** — the organizer-defined shape a form response must conform to,
stored as JSON on the single `hackathon_forms` row: `registration_fields`
(`{key,label,type,required,maxMb}`), `registration_consents`
(`{key,label,required}`), `submission_fields` and `voting_policy`. Only the two
registration columns are enforced — `SubmitRegistrationForm` validates against
them; `submission_fields` and `voting_policy` are stored and echoed back but read
by no enforcement path.

**Gate** — (1) one of the three independent runtime mechanisms that compose to
decide whether a call succeeds: **casbin** (`PermissionDenied`, no bypass beyond
the admin escape hatch), **capabilities** (`FailedPrecondition`, bypassed by
`hackathon:write`) and **time windows** (`FailedPrecondition`, bypassed by
nobody). (2) The `gate` field on a recipe action, which replaces `method` for
capability-probe purposes so an action can wait on an RPC it does not itself
call.

**Global role** — a role meaningful outside any one hackathon: `admin` and
`hackathon_organizer` (`Role.IsGlobal()` rejects `owner`/`member`). `AddGlobalRole`
deliberately writes both a `g2` row — what `WhoAmI` reports — and a
`g (user, role, "/hackathon/*")` row, because the model consults `g2` only
through the hard-coded `admin` clause and a `g2` row alone would be
unenforceable.

**Hackathon status** — `PENDING` / `ACTIVE` / `FINISHED`, computed server-side at
read time from `starts_at` and `ends_at` by `computeHackathonStatus`
(`components/backend/internal/service/mappers.go`). **There is no status column**;
that is why `HackathonService.List` applies `status_filter` after the query
rather than in SQL, and why the e2e suite time-travels by editing dates.

**Journey suite** — the Playwright project that plays `recipe.jsonl` in order on
a completely **empty** database: 309 actions across 9 acts, single worker, no
retries. `--no-reset` is ignored for it, because the recipe asserts on a world it
built itself.

**Jury** — a `VoteCategory` with `voter_type = jury`, whose eligible voters are
the users on its `jury_members` M2M edge. `SubmitVote` checks that list for jury
categories; for `all_participants` categories it instead requires a confirmed
participant who is neither the hackathon owner nor a global admin.

**Keycloak ID** — the JWT `sub` claim, stored as `users.keycloak_id` and used as
the casbin subject everywhere. It is deliberately not the platform UUID: `sub`
is already in the token, so the interceptor can answer an authorization question
without a database lookup. Proto/DB payloads carry the platform UUID instead, so
handlers that need both resolve one from the other explicitly.

**Member** — the per-hackathon casbin role `member`, granted by
`HackathonService.Join` (and re-granted by `ApproveParticipant`, revoked by
`RemoveParticipant`). On this branch it is granted at join time, *before*
approval, so waitlisted registrants can propose projects, set preferences and see
the private hackathon they signed up for. Also granted at team scope by
`TeamService.AssignUser`, which is what unlocks that team's submissions.

**Member view** — the signed-in event UI under
`components/frontend/src/routes/(app)/my/hackathon/[id]/` (overview,
participants, teams, proposals, timeline, submissions, …). It is backed by
`HackathonService.Get`, which requires a **confirmed** participant row, owner, or
admin — so waitlisted registrants get a 403 here while still holding `member`.

**Mobile suite** — the 10-test Playwright project that walks every surface at a
390×844 viewport, asserting no horizontal overflow (1 px slack) and no broken
images, and writing a full-page screenshot per page into `.artifacts/mobile/`.

**No-show** — a confirmed participant who never turns up. The organizer clears
their team seat (`TeamService.RemoveUser`) and leaves the participant row alone:
a no-show is off the team, not out of the event, and still passes
`HackathonService.Get`.

**Organizer** — the person running an event. In authorization terms that is the
casbin `owner` role on that hackathon (granted to whoever calls
`HackathonService.Create`), plus global admins via the escape hatch. Do not
confuse it with the global role **`hackathon_organizer`**, which grants only
`hackathon:create` on `/hackathon/*` and says nothing about standing in any
particular event.

**Owner** — the per-hackathon casbin role granted by `HackathonService.Create`,
and separately the per-project role granted by `ProjectService.Propose` on
`/hackathon/<id>/project/<pid>` (revoked by `ProjectService.Delete`). The project
grant is what lets a proposer edit or withdraw their own proposal without
touching anyone else's.

**Participant** — a row in the `participants` join table linking one user to one
hackathon, carrying `is_waiting` (default `true`) and `created_at`, surfaced in
protos as `HackathonMember.joined_at`
(`components/backend/db/schema/participant.go`). It is the roster; whether a
participant is confirmed or waitlisted is `is_waiting`, not casbin.

**Phase** — a named, optionally dated segment of the event's schedule
(`components/backend/db/schema/phase.go`), ordered by `starts_at` with the ID as
tiebreaker and undated phases last (`phaseOrderFrom`). `HackathonService.AdvancePhase`
declares which phase is current — writing `hackathons.current_phase_id` — and
flips the capabilities linked to phases, leaving unscheduled ones (voting,
registration) alone. Distinct from **Act**.

**Preference** — a participant's interest in a project, stored as a plain M2M
edge (`preferred_by_users` / `preferred_projects`) written by
`ProjectService.SetPreference` and read back by `ExportPreferences`. It is
**unordered and add-only** — `SetPreferenceRequest` carries only `project_id`,
there is no rank column and no unset path, so despite the recipe's "ranks her
preferences" wording a preference set is a bag, not a ranking. The handler runs
no casbin check at all: it needs a participant row (waitlisted counts), the
`set_team_preferences` capability, and an open preferences window.

**Principal** — one of the four cast members checked into the dev Keycloak realm
and defined in `personas.ts`: `hackagon-admin`, `alice`, `bob`, `charles`. Unlike
extras they get browser sessions — `tests/auth.setup.ts` drives a real login and
saves storage state to `.state/<persona>.json`, and visiting `/dashboard` is what
auto-registers them in the backend.

**Prize table** — the single `hackathon_prizes` row: `prizes` JSON
(`[{rank, title}]`, rank 0 meaning a special prize), `awards` JSON
(`[{rank|special, submissionId}]`) and a `finalized` boolean. Set up front by
`PrizeService.Set`, filled in by `Finalize`, still editable afterwards by `Edit`
— all `hackathon:write`.

**Recipe** — `.claude/skills/hackathon-e2e/recipe.jsonl`: one JSON action per
line, 309 actions plus 10 comment banners, played strictly in order by
`tests/journey/recipe.spec.ts`. It is both the screenplay and the product spec —
**policy questions are settled by making a recipe action pass** — so extend the
lifecycle by editing the JSONL, never the spec file.

**Smoke suite** — the Playwright project that runs against the seeded dev fixture
(`just db::seed`) and snapshots what each principal can see and do: public vs
private listings for anonymous visitors, the login flow, dashboard contents and
membership badges, and the persona × hackathon access matrix (200/403/404).

**Subject** — the casbin `r.sub`: always the Keycloak ID from the JWT, or the
literal `"anonymous"`. Handlers reach it via `GetSubject` / `RequireSubject`
(`middleware/auth.go`), the latter returning `Unauthenticated` when claims are
missing.

**Submission** — a team's deliverable for a project: `result` (typically a URL),
`status` (`draft` | `final`) and `version`, unique on `(version, project, team)`.
Versions are computed per project-and-team as `count(existing) + 1` by
`TeamService.CreateSubmission`, and the unique index is what stops two concurrent
creates sharing a number. Every hackathon `member` can read every team's
submissions; only the owning team can write them.

**Time travel** — the e2e technique of moving the **event**, not the clock: since
`HackathonStatus` is derived from `starts_at`/`ends_at`, the story shifts those
dates through `HackathonService.Edit` (`{{now±Nd}}` tokens, or
`scripts/timeshift.sh <uuid> <days>`) rather than faking system time, which would
fight Keycloak and JWT expiry. Window fields must be moved together with the
event dates.

**Time window** — one of the deadlines on the `hackathon_windows` row
(`registration_opens`/`_closes`, `proposals_close`, `preferences_close`,
`submissions_close`), enforced by `requireWindowOpen` in
`components/backend/internal/service/config_service.go`. A missing row or an
unset instant means no enforcement, failure is `FailedPrecondition`, and — unlike
capabilities — **organizers get no bypass**; they must call `OverrideWindow`.

**Track** — a thematic grouping of projects inside a hackathon: a name and a
required description, unique on `(name, hackathon)`. A project's track is
optional.

**Ungoverned** — see **Capability state**.

**Visibility** — the `public` | `private` enum on `hackathons`. It is
**discovery-level only**: `HackathonService.List` always returns public
hackathons and filters private ones per-row by a casbin check, and
`PageService.List` falls back to serving a public hackathon's visible pages
anonymously — but `Get` and every detail read still require a real grant, and
`Join` performs **no visibility check at all**, so anyone authenticated who knows
the UUID can join a private event. Flipping the field changes public listing
immediately, with no casbin write.

**Vote category** — one dimension of evaluation within a hackathon: a name, a
`voting_method` (`single_choice` | `ranked` | `points`) and a `voter_type`
(`all_participants` | `jury`). Created by organizers; voting as a whole is opened
and closed by `EditSettings{voting_enabled}`, not by any RPC on `VoteService`.

**Vote result** — a placement within a category (`position`, 1 = first, **not**
unique so ties are allowed, plus an optional `title` for a named award). Written
by organizers through `CreateVoteResult`/`EditVoteResult` — it is not computed
from the ballots.

**Waitlist / waitlisted** — a participant row with `is_waiting = true`, which is
where `HackathonService.Join` puts everyone. A waitlisted registrant holds the
casbin `member` role and may propose projects, set preferences and submit the
registration form; what they cannot do is open the member view or vote.

**Walk-in** — someone who registers on the day of the event. The pinned flow is
`Register` → organizer `OverrideWindow{window: "registration"}` → `Join` →
`ApproveParticipant` → `SubmitRegistrationForm{on_behalf_of}` → `AssignUser`,
which is the only `on_behalf_of` path that exists anywhere in the API.

**Window override** — a one-shot extension of a closed window, written by
`ConfigService.OverrideWindow` into `registration_override_until` or
`submissions_override_until`. It exists for those two windows only — proposals
and preferences close hard — and is anchored at **now**, so "extend by N minutes"
always means N minutes from the moment the organizer says it.
