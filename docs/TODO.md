# TODO — known bugs, open decisions, cleanup checklist

Compiled 2026-08-04 from a full code audit of branch `sketch/04-08-26` (done
while generating this documentation set). Line references are to that branch.
Policy-level open questions live in [lifecycle.md](lifecycle.md) ("open
decisions"); this page is the engineering list.

**Work continued on `sketch/06-08-26`**, which is where every entry dated
2026-08-05 or later was fixed. The two branch names below are kept as written:
they record where a finding was made, not where to look now.

**Update 2026-08-04 (later the same day):** B1, B5, B6, B8, B10, B11, B12
(partial), B14 and F2, F3, F4, F5, F7, F8 are fixed on `sketch/04-08-26` — see
the checklist below for the per-item notes, including two deliberate non-fixes.
The tables keep the original audit text as the record of what was found; the
checklist is the live status.

## Known bugs — backend

| #   | Severity          | What                                                                                                                                                                                                                                            | Where                                           |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| B1  | **crash**         | `Join` nil-derefs on any hackathon without an end date: `h.EndsAt.Before(...)` on a nillable `*time.Time`                                                                                                                                       | `internal/service/hackathon_service.go` (~L326) |
| B2  | **access**        | `AllowPublicHackathonAccess` is dead code — never called by any handler, so a public hackathon is listable anonymously but `Get` still requires membership (backend half of the F1 dead end)                                                    | `internal/middleware/rbac.go`                   |
| B3  | **conflict**      | Two contradictory registration gates: `settings.registrations_enabled` is stored/editable but enforced nowhere; the `register` capability governs (see the MERGE NOTE re #78/#87 — opposite defaults)                                           | `hackathon_service.go` (~L330)                  |
| B4  | data loss         | `PhaseService.Create` accepts `starts_at`/`ends_at` in the proto but silently drops them — phases are always created undated                                                                                                                    | `phase_service.go`                              |
| B5  | drift             | `TeamService.AssignUser`/`RemoveUser` only log casbin failures and still return success — join table and policy table can diverge                                                                                                               | `team_service.go`                               |
| B6  | race              | `CreateSubmission` computes `version = count+1`; concurrent creates hit the unique index and surface as `Internal` instead of a retry                                                                                                           | `team_service.go`                               |
| B7  | policy            | `ownTeamVoting` is persisted via `SetVotingPolicy` but never read by `SubmitVote`; `organizerVoting` is enforced but hard-coded rather than read from the policy                                                                                | `vote_service.go`                               |
| B8  | auth gap          | `ProjectService.SetPreference` is the only mutation with **no casbin check** (participant lookup + capability + window only)                                                                                                                    | `project_service.go`                            |
| B9  | access            | Private hackathons are joinable by anyone authenticated who has the UUID — `Join` never checks visibility; privacy is discovery-only                                                                                                            | `hackathon_service.go`                          |
| B10 | contract          | `TeamService.Edit` / `ProjectService.Edit` (`track_id`) treat empty string as "unchanged" although the protos declare `optional` — a description can never be cleared                                                                           | `team_service.go`, `project_service.go`         |
| B11 | audit             | `ProjectService.Edit` and `setApproval` never `SetModifier` (every other Edit handler does)                                                                                                                                                     | `project_service.go`                            |
| B12 | dx                | `TeamService.List`/`Get` collapse every failure to `PermissionDenied` with message `"cann't get teams"` (typo, twice); `Delete` lacks the team-scoped fallback that `Edit` has                                                                  | `team_service.go`                               |
| B13 | ~~api~~ FIXED     | Vote proto declares `created_at`/`modified_at` but the ent schema has no timestamp columns — always zero on the wire. Columns added to `Vote` **and** `VoteCategory` (whose proto declares them too) 2026-08-07, alongside ranked/points voting | `db/schema/vote.go` vs `api/proto/vote/**`      |
| B14 | minor             | `PageService.List` public fallback masks `NotFound` behind the permission error; stray `"...for reordering2"` in a `SetOrder` error                                                                                                             | `page_service.go` (~L624)                       |
| B15 | ~~missing~~ FIXED | `UserService.AddRole/RemoveRole` and `HackathonService.AddOwner/RemoveOwner` were proto-only → `Unimplemented`; the only Owner grant was the `Create` side effect. All four implemented 2026-08-06, each with a caller                          | protos vs handlers                              |

## Known bugs / gaps — frontend

| #   | Severity        | What                                                                                                                                                                                                         | Where                                     |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| F1  | **UX dead end** | Signed-in non-members opening `/hackathon/[id]` are unconditionally redirected to the member view → 403, with no Join affordance (pairs with B2)                                                             | `(public)/hackathon/[id]/+page.server.ts` |
| F2  | **stub**        | Dashboard "Other hackathons" links straight into F1, and its Join button is `alert('Join: not yet implemented')` although `HackathonService.Join` exists                                                     | `DashboardView.svelte`                    |
| F3  | error           | `/manage/users` returns **500** (untranslated `PERMISSION_DENIED`) to non-admins; also unreachable from any nav                                                                                              | `(app)/manage/users/+page.server.ts`      |
| F4  | UX              | `returnTo` is written by both guards but never consumed — deep links always land on `/dashboard`                                                                                                             | `hooks.server.ts`, `NavBar.svelte`        |
| F5  | 404             | `/my/hackathon/[id]` has a layout but no `+page.*` → 404 on the bare URL                                                                                                                                     | `(app)/my/hackathon/[id]/`                |
| F6  | **security**    | `MarkdownSection.svelte` renders `{@html content}` with no parser and no sanitizer (no markdown dep in `package.json`). Currently fed a literal only — wiring it to `Page.content` as-is would be stored XSS | `MarkdownSection.svelte`                  |
| F7  | config          | gRPC channel hard-codes `localhost:3000`; the validated `config.backend.hostname/port` is loaded but read by nothing                                                                                         | `lib/server/grpc/client.ts`               |
| F8  | stale           | `pnpm proto:generate` covers only health/user/hackathon — a strict subset of what the app imports; `just codegen::proto` is the real pipeline                                                                | `package.json`                            |
| F9  | minor           | `idToken` dropped on initial sign-in (cookie size) but written back by the refresh branch                                                                                                                    | `auth.ts`                                 |
| F10 | stubs           | Static placeholders: participants page (hard-coded demo array), overview (only `description` real), webinars/photos, home "Get Started" → non-UUID `/hackathon/ord-2026`                                     | various                                   |

## Checklist

### Correctness first

- [x] B1 — nil-check `EndsAt` in `Join` (crash on undated hackathons) — matches
      `computeHackathonStatus`: no end date ⇒ never FINISHED ⇒ still joinable
- [x] F1 — the 403 dead end is gone. `/hackathon/[id]` no longer redirects
      signed-in visitors into the member view (that assumed signed in ⇒ member);
      it renders the event and offers the right ask: open your view, you're
      waitlisted, join, or log in and come back. Joining from the event's own
      page works at all now, which it never did.
- [ ] B2 — still open, and now scoped: the page reads the entity from `List`,
      whose shallow entry carries name/description/dates/logo/status. That is
      enough for a public event page, so `Get` stays the member view. Decide the
      public-visibility matrix (see `backend/rbac.md`) only if a non-member
      needs the deep tree — tracks, pages, the project list.
- [x] F2 — real Join button: `?/join` form action on the dashboard calling
      `HackathonService.Join`, backend verdicts translated to messages
- [x] B3 — DECIDED: the `register` **capability** governs;
      `settings.registrations_enabled` is vestigial and is deliberately not
      enforced and not exposed in the UI. Reasons, in order: the capability is
      the gate that is actually enforced and it is phase-aware, which is the
      schedule organisers already maintain; the setting defaults to FALSE, so
      enforcing it would make every existing hackathon unjoinable for no gain;
      and "registration is closed" is already expressible by closing the
      capability window. The proto field stays until there is a reason to make a
      breaking change — nothing reads it. The voting page wires up
      `EditSettings` for `voting_enabled` ONLY, with a comment saying why its
      neighbour is left alone.
- [x] B4 — persist phase dates on create. Caught end-to-end by the new
      `act6.phase.current` flow: the recipe created phases WITH dates, every
      phase rendered undated/"Upcoming", and clearing the current phase could
      never show "In progress". (`act6.ui.timeline` only asserted names, so it
      stayed green for months — the assertion has to be on the state, not the
      list.)
- [x] B5 — casbin write errors no longer swallowed in team membership ops. NOTE:
      the two stores cannot share a transaction (casbin writes on its own
      connection; an ent tx held across it deadlocks) — compensating writes are
      used instead, ordered so a partial failure is always inert-not-privileged
- [x] B8 — added the missing casbin check to `SetPreference` (`project`/`read`,
      chosen so waitlisted participants may still mark preferences)
- [x] B7 — `SubmitVote` reads the stored voting policy instead of hard-coding
      it: `organizerVoting` was a constant and `ownTeamVoting` was enforced
      nowhere. Both default to the previous behaviour (organisers do not vote,
      own-team voting allowed), so an event with no policy is unaffected, and
      the policy now has a UI (voting page) and a read path (on the hackathon
      entity, because these are the rules the voters are bound by).
- [x] B9 — `Join` now requires a live invitation link for private hackathons,
      checked BEFORE any state check so a guessed UUID cannot confirm that a
      private event exists or what state it is in. See `HackathonInvite`.

### Preferences and submissions (2026-08-05)

Pinned policy: **a participant's project preference is final.** `SetPreference`
adds only; there is no self-service unset, because team formation reads these
choices and letting people churn them mid-allocation keeps moving the ground
under it. The UI therefore confirms before submitting ("this cannot be undone").

- [x] Organizer override —
      `ProjectService.RemovePreference(project_id, user_id)` requires
      `project:write`, so someone who picked in error asks an organizer.
      Removing a preference nobody expressed is a no-op, not an error.
- [ ] Participants still cannot SEE their own preferences: the only read is the
      organizer-only `ExportPreferences`. A `ListMyPreferences` (or preferences
      on the project entity for the calling user) would close it.
- [x] `EditSubmission` accepts a `form` map — answers were frozen at create
      time, so a mistyped repo URL could never be corrected. An absent map
      leaves stored answers alone; a present one replaces them wholesale and
      must satisfy the organizer's schema, since a partial map would silently
      drop required fields.
- [x] **Submission answers are now persisted.** `Submission` gained a `form`
      JSON column: `CreateSubmission` previously validated the map against the
      schema and then discarded it, so nothing was stored to edit or judge.

### Personal data people can change (2026-08-05)

Pinned policy: **Keycloak owns the identity, the platform owns the profile.**
`username` and `email` arrive on every token and are re-synced from it, so the
platform must not offer to edit them — the next request would revert it. The
display name is the platform's own field and is editable.

- [x] `UserService.EditProfile` (display name, self-only — no user id in the
      request, so it cannot reach another account). The reason the account page
      was read-only was not a missing form: `WhoAmI` re-synced `display_name`
      from the token on every request, and hooks calls it on every protected
      page load. `syncFromKeycloak` now refreshes only the IdP-owned fields and
      backfills an empty display name, so a nameless profile still gets one.
- [x] `SubmitRegistrationForm` is an upsert. It inserted only, so a second
      submit hit the unique (hackathon, user) index and came back
      `AlreadyExists` — a typo in your affiliation was permanent. One row per
      person is the current state of the answers, not an append-only log;
      `submitted_by` is re-stamped so an organizer correcting a walk-in's paper
      form is recorded as the author of THOSE answers.
- [x] `GetRegistrationResponse` reads the answers back. Deliberately its own RPC
      rather than a field on `Get`: `Get` denies waitlisted users, who are
      exactly the people who still need to review their form. Own answers need
      no casbin check; someone else's needs hackathon `Write`.
- [ ] Changing email/password still means leaving for Keycloak's account console
      (`/account` links to it). Proxying those through a backend Keycloak Admin
      API client would keep people in the app, at the cost of giving the backend
      admin credentials it does not have today.
- [ ] Consent withdrawal is only as granular as the form: unticking the photo
      consent updates the row, but nothing propagates that to photos already
      published.

### Security

- [ ] F6 — markdown pipeline: parser + sanitizer (no raw HTML, allowlisted video
      embeds) **before** rendering `Page.content`/`description`
- [x] F3 — `PERMISSION_DENIED` → 403 on `/manage/users`; audit found and fixed
      two more unguarded loads (dashboard, submissions fan-out)
- [ ] Votes/ballot privacy: keep individual ballots non-listable except
      voter+admin (see rbac matrix)
- [ ] **Content Security Policy** — none configured today (`svelte.config.js`
      has no `kit.csp`). It is the second line of defence behind F6: if the
      markdown sanitizer ever has a hole, a strict `script-src 'self'` still
      stops the injected script from executing. Sequence it right after F6,
      since both defend the same page. Directives it must cover: `script-src`
      (self only), `frame-src` (allowlisted video providers, for the pasted-URL
      embeds), `img-src` (self + `data:` + the image hosts the seeded editions
      use — Firebase Storage, SDSC CDN), `connect-src` (self; plus the ingest
      endpoint if session replay is ever adopted), `object-src 'none'`,
      `base-uri 'self'`. Roll out with `Content-Security-Policy-Report-Only`
      first, watch the violations for a week, then enforce.

### Contracts & polish

- [x] B10/B11/B12 — Edit-optional semantics (team + project), modifier edges,
      team error messages (+ typo). `Delete`'s missing team-scoped fallback was
      deliberately NOT added: team members deleting their own team is a policy
      change, guarded by a green test and documented in rbac.md
- [x] B14 — `PageService.List` no longer masks NotFound behind the permission
      error; "reordering2" typo gone
- [x] B6 — `CreateSubmission` version race: retries once on constraint
      violation, then `Aborted` instead of `Internal`
- [x] B13 — added, not dropped: `created_at`/`modified_at` on `Vote` and on
      `VoteCategory` (its proto declared them too and they were equally zero).
      Landed with ranked/points voting, which touched the same two schemas

### Ranked and points ballots (2026-08-07)

`VoteCategory.voting_method` had offered all three methods since the schema was
written, and the organiser's `<select>` listed all three — while `SubmitVote`
answered every non-single_choice ballot with `InvalidArgument`. A ranked
category was therefore creatable and unvotable. Now implemented end to end:
`RankedVote`/`PointsVote` carry per-submission ranks/awards, `VoteCategory`
gained `max_points`, and `SuggestResults` scores Borda (rank 1 = N-1, N = the
number of distinct submissions that received votes) and points (sum of `value`).

**The unique index moved and that is a real migration.**
`index.Edges("category","voter")` became
`index.Edges("category","voter","submission")` because a ranked ballot is
several rows sharing a (category, voter). On a database that already holds
votes, building the new index FAILS if duplicate (category, voter, submission)
rows exist — none can exist under the old index, so the only hazard is a
database where the old index was already absent or dropped by hand. The dev flow
(`just schema-change`) wipes state and is unaffected.

**One ballot per category is now the handler's job, not the DB's.** The index no
longer says anything about a second ballot, so `SubmitVote` checks for existing
(category, voter) rows and answers `AlreadyExists` itself, then clears and
rewrites inside one transaction. That check was not race-proof the way a unique
index was — and it was not theoretical: hammering four concurrent single-choice
submits from one voter (different submissions, so the new index never fires)
double-voted in **7 of 12 rounds**. `writeBallot` now serializes behind
`VoteService.ballotMu` — pre-check through commit under one in-process lock —
which closes it for a single-instance deployment (post-fix: 12 of 12 rounds,
exactly one row); the journey pins it with `act7.race.doublevote` +
`act7.race.check`. A partial unique index on
`(category, voter) WHERE vote_type = 'single_choice'` remains the multi-instance
fix, but ent cannot express one, so it would have to be hand-written SQL outside
the schema.

**The last-organizer guard raced the same way** — `RemoveOwner` read the owner
list, checked it, then removed, so two organizers demoting each other
concurrently both counted two owners, both passed, and the event was left with
ZERO owners (reproduced live on the first attempt). `HackathonService.ownerMu`
now serializes owner-role writes (AddOwner shares it, which also stops a
double-click promotion slipping a duplicate grouping row between casbin's own
check and insert), and the casbin enforcer itself became a `SyncedEnforcer` so a
policy write can no longer race an `Enforce` read on the shared in-memory model.
Pinned by `act5.race.owner.*` (mutual demotion → exactly one owner survives).

- [x] B15 — implemented, not deleted, and all four now have a caller.
      `AddRole`/`RemoveRole` were the urgent half: `/manage/users` already
      shipped calling them, and its error handler does not catch
      `Unimplemented`, so every promotion rendered a 500. `AddOwner`/
      `RemoveOwner` were dormant instead — nothing called them — and are a
      casbin role write here rather than main's parallel `owners` edge.
      Refusals: last organizer, self-demotion, and a target who is not a
      confirmed participant (the member list is built from that table, so a role
      granted outside it makes an owner absent from the roster)
- [x] F4 — `returnTo` consumed (with an open-redirect guard; the old ping-pong
      protection replaced by an explicit `sessionUsable` flag). **Reopened and
      closed properly 2026-08-12**: only the SERVER half had been built.
      `redirectHandle` forwarded a logged-in caller from `/?returnTo=X` to X,
      but nothing ever put a logged-in caller back on `/` carrying the query —
      `NavBar`'s "Log in" button computed its own `callbackUrl` from the
      pathname and never read `returnTo`, so the one control the visitor was
      being asked to press is what dropped the deep link. Both guards now park
      on `/signin?returnTo=…` (an interstitial that says what happened before it
      goes), the destination is resolved once by `loginDestination`, and the
      button reads the same query. `tests/smoke/23-login-destination.spec.ts`
      follows an anonymous deep link through Keycloak and asserts the final URL
      is that link, with the dashboard default asserted as its own case
- [x] F5 — `/my/hackathon/[id]` redirects to `/overview`
- [x] F7 — gRPC channel address read from config (lazy, memoized)
- [x] F8 — stale `proto:generate` npm script deleted

### Product decisions to pin (details in lifecycle.md)

- [ ] Private-hackathon membership: `AddParticipant` primitive + invitation
      links (agreed direction; not yet in code)
- [ ] Public landing page: description-as-markdown hero + ordered Pages as
      panels (PageService is ready; blocked on F6)
- [ ] Own-team voting: enforce the stored policy or remove the knob (B7)
- [ ] Aggregation rule for results (sum vs mean) — decides the winner; admin
      Finalize exists either way
- [~] **Session replay (OpenReplay) — wired, OFF by default, masking proved
  (2026-08-08).** The rig runs (`.claude/skills/openreplay-stack`, booted for
  real; five host-specific bugs fixed there), the tracker is mounted in the root
  layout behind `replay.enabled`, and
  `hackathon-e2e/tests/openreplay/masking.spec.ts` proves a sentinel typed into
  the registration form never reaches the wire — with an **unmasked control run
  first**, because a zero-hit grep is also what "nothing was captured" looks
  like, and on the first attempt that is exactly what it was. Both e2e suites
  are unaffected with the flag off.

      Settled while doing it:
      - GDPR / `diet`: not per-field opt-in. `privateMode` + `defaultInputMode:
        Hidden` mask every text node and every input value by default, and
        nothing is un-masked. Verified against the captured ingest bytes and
        against what the OpenReplay backend stored, not against the replay UI.
      - **New finding, not in the original list:** masking covers text nodes
        and input values but NOT attribute values — the tracker stars only
        `alt`/`placeholder` and blanks `href`. `title={userName}` on the NavBar
        monogram was shipping the signed-in person's full name in clear. The
        attribute is gone and the spec asserts it stays gone; the general rule
        (personal data in text nodes, never in attributes) is a review rule, as
        no option enforces it.
      - Correlation with the RPC journal is deliberately impossible:
        `setUserID` is never called and `network.sessionTokenHeader: false`, or
        the tracker would stamp its session id onto every request the page
        makes and the Go backend would receive it.
      - Kill switch: an absent `replay:` block parses to `{enabled:false}`, so
        the suites need no opt-out.

      Closed since (2026-08-08) — full statement in
      `docs/frontend/session-replay.md`:
      - **Consent — done, but NOT as planned.** The plan said "reuse the
        registration-consent mechanism (a `replay` key alongside
        `conduct`/`photos`)". That does not fit, and the reasons are already
        written down elsewhere in this codebase: a registration consent is an
        agreement with ONE EVENT recorded against `(hackathon, user)`, while
        the tracker runs on the landing page and on invite links — before an
        event is chosen, and for people with no `User` row at all. `/account`
        and `user.proto` both already say that agreeing to one event's terms is
        not a standing agreement with the platform. Storing it server-side
        would also create exactly the person↔recording link the design avoids.
        It is a first-party `httpOnly` cookie read in `+layout.server.ts`, so
        an unconsented browser is never sent an ingest endpoint or a project
        key — "off by default" is a property of what was transmitted, not of
        what a script chose to do. Banner to ask, `/account` to withdraw.
      - **Do Not Track — verified, not trusted.** `respectDoNotTrack` was
        already set; the component now checks DNT *and* Global Privacy Control
        (which the SDK ignores) before the dynamic import, so the tracker
        bundle is not even fetched. Asserted with a real Firefox pref and
        consent deliberately granted, so DNT is the only thing left that can
        suppress it.
      - **URLs — masked.** `privateMode` does wipe the page LOCATION, so the
        replay UI already showed `****`. The leak was elsewhere: the tracker
        stamps `document.baseURI` onto every URL-based DOM message, unsanitized
        — a capture held `/register/<uuid>` dozens of times. Ids would have
        been arguable; `/invite/<token>` is not, because that token IS the
        credential. `resourceBaseHref` is pinned to the origin.
      - **Retention — scripted.** OpenReplay's compose distribution has no
        retention setting at all (checked in `docker-envs/` and
        `init_ch_schema.sql`; it is an EE feature), so
        `openreplay-stack/scripts/retention.sh` purges the recording, the
        Postgres rows and the ClickHouse rows together, with an optional
        declarative ClickHouse TTL. Dry run by default; run it from cron.

      Still open before this is offered to real participants:
      - **Hosting.** A quick tunnel mints a new hostname on every restart, so
        `ingestPoint` goes stale silently; anything lasting needs a NAMED
        tunnel and a stable `COMMON_DOMAIN_NAME`. Upstream still documents the
        Compose path as experimental (k3s is supported). The box is real:
        2 vCPU / 8 GB RAM / 50 GB disk, on top of whatever else runs.
      - The consent banner's copy has not been through anyone who writes
        privacy notices for a living, and there is no link from it to a privacy
        page (the platform's own SitePages are admin-authored, so there is no
        fixed slug to point at).

### Found while fixing (new)

- [ ] The dev seeder creates participant rows without granting the hackathon
      `Member` role (`cmd/seed/main.go` — charles is a waitlisted participant of
      h1 but gets no role), which contradicts `Join`, where everyone on the
      roster holds Member and `is_waiting` carries the waitlist. Harmless today
      (no suite exercises a seeded user's `SetPreference`) but the fixture no
      longer matches production behaviour.
- [ ] Docs drift from these fixes: `docs/frontend/routes-and-auth.md` still
      describes `publicHackathonClient` as a const (now an accessor). (The
      "redirect to /dashboard unless returnTo" rule is corrected — the guards
      park on `/signin?returnTo=…` and the auth-flow section describes both
      entry points.)

### Housekeeping

- [ ] Refresh the root `CLAUDE.md` — stale `just` command names, "runtime
      status" claims 3 services (11 registered), casbin description predates
      path domains/globMatch
- [ ] Add a `LICENSE` file (open-source requirement; repo has none)
- [ ] Commit `docs/` (this set) once reviewed
- [ ] Notification service (emails) — deliberately deferred; unblocks
      confirmations, reminders, invites (Mailpit sidecar sketched in
      `.devcontainer/README.md`)
- [ ] GDPR: `DeleteAccount` + data access/export — deferred, tracked as recipe
      placeholders

### Testing follow-through

- [ ] Keep `.claude/skills/hackathon-e2e/recipe.jsonl` in lockstep — every fix
      above that changes behaviour should flip a recipe action from red/yellow
      toward blue (the timeline in `recipe-player.html` is the burn-down chart)
- [ ] Add invitation-flow actions once the mechanism lands (the private "Winter
      draft" event is the ready fixture)

## See also

- [roadmap.md](roadmap.md) — what is MVP vs Core, so this list can be ordered.
- [lifecycle.md](lifecycle.md) — the open decisions here, with the behaviour
  they would change.
- [requirements.md](requirements.md) — the requirement each item maps back to.
- [testing.md](testing.md) — how a fix is proved by flipping a recipe action.
