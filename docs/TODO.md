# TODO — known bugs, open decisions, cleanup checklist

Compiled 2026-08-04 from a full code audit of branch `sketch/04-08-26` (done
while generating this documentation set). Line references are to that branch.
Policy-level open questions live in [lifecycle.md](lifecycle.md) ("open
decisions"); this page is the engineering list.

**Update 2026-08-04 (later the same day):** B1, B5, B6, B8, B10, B11, B12
(partial), B14 and F2, F3, F4, F5, F7, F8 are fixed on `sketch/04-08-26` —
see the checklist below for the per-item notes, including two deliberate
non-fixes. The tables keep the original audit text as the record of what was
found; the checklist is the live status.

## Known bugs — backend

| # | Severity | What | Where |
| --- | --- | --- | --- |
| B1 | **crash** | `Join` nil-derefs on any hackathon without an end date: `h.EndsAt.Before(...)` on a nillable `*time.Time` | `internal/service/hackathon_service.go` (~L326) |
| B2 | **access** | `AllowPublicHackathonAccess` is dead code — never called by any handler, so a public hackathon is listable anonymously but `Get` still requires membership (backend half of the F1 dead end) | `internal/middleware/rbac.go` |
| B3 | **conflict** | Two contradictory registration gates: `settings.registrations_enabled` is stored/editable but enforced nowhere; the `register` capability governs (see the MERGE NOTE re #78/#87 — opposite defaults) | `hackathon_service.go` (~L330) |
| B4 | data loss | `PhaseService.Create` accepts `starts_at`/`ends_at` in the proto but silently drops them — phases are always created undated | `phase_service.go` |
| B5 | drift | `TeamService.AssignUser`/`RemoveUser` only log casbin failures and still return success — join table and policy table can diverge | `team_service.go` |
| B6 | race | `CreateSubmission` computes `version = count+1`; concurrent creates hit the unique index and surface as `Internal` instead of a retry | `team_service.go` |
| B7 | policy | `ownTeamVoting` is persisted via `SetVotingPolicy` but never read by `SubmitVote`; `organizerVoting` is enforced but hard-coded rather than read from the policy | `vote_service.go` |
| B8 | auth gap | `ProjectService.SetPreference` is the only mutation with **no casbin check** (participant lookup + capability + window only) | `project_service.go` |
| B9 | access | Private hackathons are joinable by anyone authenticated who has the UUID — `Join` never checks visibility; privacy is discovery-only | `hackathon_service.go` |
| B10 | contract | `TeamService.Edit` / `ProjectService.Edit` (`track_id`) treat empty string as "unchanged" although the protos declare `optional` — a description can never be cleared | `team_service.go`, `project_service.go` |
| B11 | audit | `ProjectService.Edit` and `setApproval` never `SetModifier` (every other Edit handler does) | `project_service.go` |
| B12 | dx | `TeamService.List`/`Get` collapse every failure to `PermissionDenied` with message `"cann't get teams"` (typo, twice); `Delete` lacks the team-scoped fallback that `Edit` has | `team_service.go` |
| B13 | api | Vote proto declares `created_at`/`modified_at` but the ent schema has no timestamp columns — always zero on the wire | `db/schema/vote.go` vs `api/proto/vote/**` |
| B14 | minor | `PageService.List` public fallback masks `NotFound` behind the permission error; stray `"...for reordering2"` in a `SetOrder` error | `page_service.go` (~L624) |
| B15 | missing | `UserService.AddRole/RemoveRole` and `HackathonService.AddOwner/RemoveOwner` are proto-only → `Unimplemented`; the only Owner grant is the `Create` side effect | protos vs handlers |

## Known bugs / gaps — frontend

| # | Severity | What | Where |
| --- | --- | --- | --- |
| F1 | **UX dead end** | Signed-in non-members opening `/hackathon/[id]` are unconditionally redirected to the member view → 403, with no Join affordance (pairs with B2) | `(public)/hackathon/[id]/+page.server.ts` |
| F2 | **stub** | Dashboard "Other hackathons" links straight into F1, and its Join button is `alert('Join: not yet implemented')` although `HackathonService.Join` exists | `DashboardView.svelte` |
| F3 | error | `/manage/users` returns **500** (untranslated `PERMISSION_DENIED`) to non-admins; also unreachable from any nav | `(app)/manage/users/+page.server.ts` |
| F4 | UX | `returnTo` is written by both guards but never consumed — deep links always land on `/dashboard` | `hooks.server.ts`, `NavBar.svelte` |
| F5 | 404 | `/my/hackathon/[id]` has a layout but no `+page.*` → 404 on the bare URL | `(app)/my/hackathon/[id]/` |
| F6 | **security** | `MarkdownSection.svelte` renders `{@html content}` with no parser and no sanitizer (no markdown dep in `package.json`). Currently fed a literal only — wiring it to `Page.content` as-is would be stored XSS | `MarkdownSection.svelte` |
| F7 | config | gRPC channel hard-codes `localhost:3000`; the validated `config.backend.hostname/port` is loaded but read by nothing | `lib/server/grpc/client.ts` |
| F8 | stale | `pnpm proto:generate` covers only health/user/hackathon — a strict subset of what the app imports; `just codegen::proto` is the real pipeline | `package.json` |
| F9 | minor | `idToken` dropped on initial sign-in (cookie size) but written back by the refresh branch | `auth.ts` |
| F10 | stubs | Static placeholders: participants page (hard-coded demo array), overview (only `description` real), webinars/photos, home "Get Started" → non-UUID `/hackathon/ord-2026` | various |

## Checklist

### Correctness first
- [x] B1 — nil-check `EndsAt` in `Join` (crash on undated hackathons) — matches
      `computeHackathonStatus`: no end date ⇒ never FINISHED ⇒ still joinable
- [ ] B2 + F1 — decide the public-visibility matrix (see `backend/rbac.md`),
      wire `Get`/section reads for non-members, kill the 403 dead end
- [x] F2 — real Join button: `?/join` form action on the dashboard calling
      `HackathonService.Join`, backend verdicts translated to messages
- [ ] B3 — pick ONE registration gate (capability vs setting) and delete the loser (#78/#87)
- [ ] B4 — persist phase dates on create
- [x] B5 — casbin write errors no longer swallowed in team membership ops.
      NOTE: the two stores cannot share a transaction (casbin writes on its own
      connection; an ent tx held across it deadlocks) — compensating writes are
      used instead, ordered so a partial failure is always inert-not-privileged
- [x] B8 — added the missing casbin check to `SetPreference` (`project`/`read`,
      chosen so waitlisted participants may still mark preferences)
- [x] B9 — `Join` now requires a live invitation link for private hackathons,
      checked BEFORE any state check so a guessed UUID cannot confirm that a
      private event exists or what state it is in. See `HackathonInvite`.

### Preferences and submissions (2026-08-05)

Pinned policy: **a participant's project preference is final.** `SetPreference`
adds only; there is no self-service unset, because team formation reads these
choices and letting people churn them mid-allocation keeps moving the ground
under it. The UI therefore confirms before submitting ("this cannot be undone").

- [x] Organizer override — `ProjectService.RemovePreference(project_id, user_id)`
      requires `project:write`, so someone who picked in error asks an organizer.
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

### Security
- [ ] F6 — markdown pipeline: parser + sanitizer (no raw HTML, allowlisted video embeds) **before** rendering `Page.content`/`description`
- [x] F3 — `PERMISSION_DENIED` → 403 on `/manage/users`; audit found and fixed
      two more unguarded loads (dashboard, submissions fan-out)
- [ ] Votes/ballot privacy: keep individual ballots non-listable except voter+admin (see rbac matrix)
- [ ] **Content Security Policy** — none configured today (`svelte.config.js` has no
      `kit.csp`). It is the second line of defence behind F6: if the markdown
      sanitizer ever has a hole, a strict `script-src 'self'` still stops the
      injected script from executing. Sequence it right after F6, since both
      defend the same page. Directives it must cover:
      `script-src` (self only), `frame-src` (allowlisted video providers, for
      the pasted-URL embeds), `img-src` (self + `data:` + the image hosts the
      seeded editions use — Firebase Storage, SDSC CDN), `connect-src` (self;
      plus the ingest endpoint if session replay is ever adopted),
      `object-src 'none'`, `base-uri 'self'`.
      Roll out with `Content-Security-Policy-Report-Only` first, watch the
      violations for a week, then enforce.

### Contracts & polish
- [x] B10/B11/B12 — Edit-optional semantics (team + project), modifier edges,
      team error messages (+ typo). `Delete`'s missing team-scoped fallback was
      deliberately NOT added: team members deleting their own team is a policy
      change, guarded by a green test and documented in rbac.md
- [x] B14 — `PageService.List` no longer masks NotFound behind the permission
      error; "reordering2" typo gone
- [x] B6 — `CreateSubmission` version race: retries once on constraint
      violation, then `Aborted` instead of `Internal`
- [ ] B13 — either add timestamps to `Vote` or drop them from the proto
- [ ] B15 — implement or delete the proto-only role RPCs
- [x] F4 — `returnTo` consumed (with an open-redirect guard; the old ping-pong
      protection replaced by an explicit `sessionUsable` flag)
- [x] F5 — `/my/hackathon/[id]` redirects to `/overview`
- [x] F7 — gRPC channel address read from config (lazy, memoized)
- [x] F8 — stale `proto:generate` npm script deleted

### Product decisions to pin (details in lifecycle.md)
- [ ] Private-hackathon membership: `AddParticipant` primitive + invitation links (agreed direction; not yet in code)
- [ ] Public landing page: description-as-markdown hero + ordered Pages as panels (PageService is ready; blocked on F6)
- [ ] Own-team voting: enforce the stored policy or remove the knob (B7)
- [ ] Aggregation rule for results (sum vs mean) — decides the winner; admin Finalize exists either way

### Found while fixing (new)
- [ ] The dev seeder creates participant rows without granting the hackathon
      `Member` role (`cmd/seed/main.go` — charles is a waitlisted participant of
      h1 but gets no role), which contradicts `Join`, where everyone on the
      roster holds Member and `is_waiting` carries the waitlist. Harmless today
      (no suite exercises a seeded user's `SetPreference`) but the fixture no
      longer matches production behaviour.
- [ ] Docs drift from these fixes: `docs/frontend/routes-and-auth.md` still
      describes `publicHackathonClient` as a const (now an accessor) and the old
      "redirect to /dashboard unless returnTo" rule.

### Housekeeping
- [ ] Refresh the root `CLAUDE.md` — stale `just` command names, "runtime status" claims 3 services (11 registered), casbin description predates path domains/globMatch
- [ ] Add a `LICENSE` file (open-source requirement; repo has none)
- [ ] Commit `docs/` (this set) once reviewed
- [ ] Notification service (emails) — deliberately deferred; unblocks confirmations, reminders, invites (Mailpit sidecar sketched in `.devcontainer/README.md`)
- [ ] GDPR: `DeleteAccount` + data access/export — deferred, tracked as recipe placeholders

### Testing follow-through
- [ ] Keep `.claude/skills/hackathon-e2e/recipe.jsonl` in lockstep — every fix above that changes behaviour should flip a recipe action from red/yellow toward blue (the timeline in `recipe-player.html` is the burn-down chart)
- [ ] Add invitation-flow actions once the mechanism lands (the private "Winter draft" event is the ready fixture)

## See also

- [roadmap.md](roadmap.md) — what is MVP vs Core, so this list can be ordered.
- [lifecycle.md](lifecycle.md) — the open decisions here, with the behaviour
  they would change.
- [requirements.md](requirements.md) — the requirement each item maps back to.
- [testing.md](testing.md) — how a fix is proved by flipping a recipe action.
