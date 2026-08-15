# .claude — Hackagon e2e tooling

Self-contained Claude Code skills for testing the full Hackagon hackathon
lifecycle. Everything lives under `skills/`; nothing outside this folder is
required beyond the repo itself (Nix dev shell via `just`).

## Skills

| Skill                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hackathon-e2e`        | Deterministic end-to-end suite: boots the whole stack from scratch (Keycloak, Postgres, backend, frontend), then runs Playwright (Firefox) as a 15-person cast. Projects: `smoke` (seeded fixture), `journey` (the full lifecycle recipe on an empty DB), `mobile` (phone-viewport battery), `openreplay` (session-replay privacy proof), `tunnel` (login through the public URL), `docs` (documentation screenshots).                                                                                                                                     |
| `devcontainer-up`      | Spins up the docker-compose devcontainer and gets it ready (Nix, toolchain warmed). `scripts/e2e.sh` runs the e2e suite inside the container; `scripts/start.sh` is the one-command path from nothing to a running (optionally public, optionally seeded) stack.                                                                                                                                                                                                                                                                                           |
| `cloudflare-tunnel`    | Exposes the locally running stack through a Cloudflare quick tunnel. One public hostname serves frontend and Keycloak (caddy path-mux), so `up.sh --with-auth` gives working OIDC login/registration through the tunnel; plain `up.sh` is anonymous view-only.                                                                                                                                                                                                                                                                                             |
| `dbml-diagrams`        | Builds and validates the dbdiagram.io DBML (`docs/backend/schema.dbml`) from the ent schema; `scripts/validate.sh` runs the official parser.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs-bundle`          | Builds `docs/` into ONE self-contained HTML (`out/hackagon-docs.html`): images re-encoded to webp and inlined, mermaid pre-rendered to SVG, cross-doc links anchored. No network needed to read it; prints to PDF.                                                                                                                                                                                                                                                                                                                                         |
| `openreplay-stack`     | Self-hosted OpenReplay (session replay) via docker compose behind a Cloudflare quick tunnel. Vendors the upstream compose into the skill, prepares secrets non-interactively, points the stack at the tunnel URL, wires the app at it and back (`wire-frontend.sh`), and purges expired sessions (`retention.sh` — upstream has no retention setting). Debug rig — needs 8 GB RAM of its own.                                                                                                                                                              |
| `plausible-stack`      | Self-hosted Plausible Analytics (CE v3.2.1) via docker compose behind its own Cloudflare quick tunnel — Plausible plus its OWN Postgres and ClickHouse, never the app's database. Prepares secrets and the owner account non-interactively (the signup form is a LiveView, so it goes through `bin/plausible rpc`), wires the app at it and back (`wire-frontend.sh`, the THIRD writer of `config.local.yaml`), and proves a page view lands end to end with a real browser and Plausible's own Stats API. ~750 MB RSS — coexists with the openreplay rig. |
| `seed-past-hackathons` | Populates a running instance with SDSC's real past hackathons — one source-cited JSON per edition under `data/` (details, phases, tracks, markdown pages, images). Uploads the pictures into the instance's object store, sets each event's cover, rewrites page markdown to the uploaded paths, and gives every edition a prize table with drawn (not photographed) badge art.                                                                                                                                                                            |

## The recipe = the product spec

`skills/hackathon-e2e/recipe.jsonl` — **465 actions, one JSON per line**,
covering platform setup → publication → configuration → registration (13-person
wave, forms, waitlist) → the capacity pilot (a capped side sprint: FCFS seats,
queue fairness, over-capacity approval, the Join race) → proposals → teams →
event days (no-show, same-day walk-in, deadline overrides) → voting
(single-choice, ranked, points) → prizes (admin final voice) → post-event
(winners, gallery uploads, wrap-up blog, profile churn). Executed in order by
`tests/journey/recipe.spec.ts` via `helpers/recipe.ts`.

Each action carries: `priority` (P1 325 / P2 131 / P3 9), `outcome`
(human-readable expectation), an optional `todo` (placeholder note, 69 actions)
and an optional `gate` (24 actions — skip until the listed RPCs exist,
capability-probed at runtime by `scripts/probe.sh`, so actions wake up
automatically as the backend lands). `implement: false` meant "deliberately
deferred"; **no action sets it any more** — nothing in the recipe is deferred.

**The organiser's own screens (2026-08-12, +119 actions).** The manage hub
(tiles derived from `manageNav`, the Now/Next box and its ONE action in all
three cases — start the first phase, declare the live one, advance past it —
plus Review N waiting and Edit details), the Manage nav (folded then, flat now —
see the develop merge below), the capability panel, `StorageService.ListObjects`
across every scope and refusal, the markdown toolbar and its paste-a-table
converter, bulk team import, Manage Pages reordering, and the Join gate with the
sign-in interstitial. One state in that set is **unreachable from outside and
therefore not asserted end-to-end**: a WAITLISTED owner (`AddOwner` answers
`FailedPrecondition` for anyone on the waiting list, so `canEditHackathon`'s
narrower gate cannot be exercised end-to-end). It is written down in the
action's own `todo` rather than faked.

### Three manage-panel bugs, fixed 2026-08-13

All three were found by the recipe and had been left pinned as they stood.

**1. The hub offered a button that could not work.** The plan-vs-reality warning
is computed from `currentAndNextPhase`, which falls back to the DATES when no
phase is declared — while the `Enable it` button behind it posted
`applyPhaseCapabilities`, which looked the phase up by `current_phase_id` alone
and answered `400 "no current phase to take settings from"` whenever that was
empty. Declaring a phase is an explicit act nobody has to perform, so the state
where the two disagreed is the state most events are in. **The action resolves
"current" the same way the page does now** — one definition of the word across
the product. Hiding the warning instead was the alternative and is worse: it is
TRUE in that state, and gating a true, actionable warning on a marker nobody is
required to set reports the gap in fewer situations than it exists in. The 400
survives for the case that is genuinely empty under BOTH meanings.

`act5.pilot.cap.unmet.bydates` used to pin the refusal and now asserts the
switches move, with `nowBadge: "By dates"` as its positive control — without it
the action passes against a DECLARED phase, which is what `act5.pilot.cap.unmet`
already covers. **Two actions had to be ADDED with it**
(`act5.pilot.cap.bydates.reset` + `.readback`): the by-dates click now switches
team preferences on, and `act5.pilot.phase.declare.applied` asserts that
ADVANCING is what switches them on — so without putting the switch back first,
that claim would have been green whatever `AdvancePhase` did. Re-specifying an
action can quietly make its NEIGHBOURS vacuous; check what the state it leaves
behind is the premise of.

**2. `SetCapabilities` refused a whole batch over one ungoverned row.** It
answered `NotFound` if any capability in the batch had no stored row, and the
panel posts all six on every save — so one absent row made the capability screen
unusable, with a 404 as its only explanation and no RPC anywhere that could
create the missing row. **It creates the row now.** Skipping was the dangerous
alternative: `UNGOVERNED` is ALLOWED (`capability.State.Allowed` returns true
for it), so dropping a row the caller asked to set to `false` would report a
successful save while participants kept the permission — a silent no-op on a
gate. Refusing-with-a-name is honest and still leaves the panel dead. The schema
already calls a full set the invariant ("one row per capability per hackathon,
pre-created on hackathon creation"), so a missing row is a data gap, never a
decision. The hackathon's existence is checked first, so a bogus id still
answers `NotFound` — about the HACKATHON, which is the true statement.

That state is unreachable from the API (`Create` seeds all six, nothing deletes
one), so it is pinned in Go — `hackathon_service_test.go`, "SetCapabilities with
an ungoverned capability", which deletes a row to get there.
`act5.cap.ungoverned` was re-specified to what it can actually reach and gained
`expect.errorMatches`, a new field: the same request answered the same code for
a different reason before and after, and a status code alone cannot tell those
apart. The panel's copy changed with it — it used to warn that the save would be
refused, which stopped being true.

**3. `.chip:hover` (0,2,0) beat `.chip-active` (0,1,0)**, so pointing at the tab
you were already on erased its accent tint. Fixed with a `.chip-active:hover`
rule of its own, at (0,2,0) so it also covers the `btn btn-icon btn-quiet` that
wears `chip-active` in the markdown editor — `.btn-quiet:hover` was erasing that
one the same way. It wins its tie on SOURCE ORDER and must stay last in the
layer. `tests/smoke/24-chip-states.spec.ts` asserts the **computed style**,
never the class: `chip-active` was on the element the whole time the bug
shipped, so every class-based assertion that could have been written would have
passed. It measures the pixel the browser actually paints (a 1×1 canvas
composited over the page background) because Firefox reports
`color-mix(in oklab, …)` back as `oklab(…)` and `--color-raised` as `rgb(…)` —
two syntaxes for the same kind of fact, and `fillStyle` silently keeps its old
value on a colour it cannot parse, which is why the measurement carries a
sentinel.

`recipe-player.html` — self-contained animated replay of the recipe (open in any
browser). Rebuild after recipe edits with `node scripts/splice-player.mjs`,
which re-splices the JSONL between the `<script id="recipe-data">` markers,
applies the `</` → `<\/` escape, and verifies the embedded action count against
the file.

**The file holds THREE inline script blocks now** — the recipe, a real journey
run, and the program — and the count is asserted, because a fourth appearing by
accident means a data block truncated the document. The run is what
`run outcome` colours from on open: `scripts/embed-run-report.mjs` reduces
`.artifacts/results.json` (written by the json reporter on EVERY run — do not
redirect a run's stdout, this container prints Nix and quitsh banners ahead of
it) to the three things the mode joins on, id + outcome + duration, 498 KiB → 16
KiB. It is a SNAPSHOT and every surface using it says so with its date; a report
you load by hand overrides it, and "clear" steps back one layer at a time —
loaded file → built-in snapshot → nothing at all. The `run-report` block sits
AFTER the recipe block on purpose: `splice-player.mjs` finds its terminator with
the first close tag past the recipe's opening marker, so a data block in front
of the recipe would be overwritten by the next splice.

The diagram is arrangeable — drag anything, or Tab to it and nudge with the
arrow keys — and **the drag wins over the replay by construction**: nothing in
the animation writes a position (`render()` touches opacity, text and badges
only) and `animateBeam()` reads the live `pos[]` table, which the drag updates
along with the transform. Move only the transform and the beams keep arriving at
the coordinates the item used to occupy. Positions persist through the same
wrapped `localStorage` the theme uses, and `⤺ Reset layout` in the header is the
way back. Behind the items are seven dim labelled regions whose membership is
DERIVED from the cast table and the entity keys and forms a partition of all 33
items on the stage — an invented region leaves something in two zones or in
none, which the render harness asserts. Their washes share ONE opacity group:
two regions genuinely interpenetrate (a principal's name label reaches x=164,
the upload bundle starts at x=156) and per-rect alpha would paint that overlap
twice as a visible stripe.

`? What do these mean` opens the vocabulary in plain language — the kinds,
`gate`, `todo`, `expect`, `priority`, `actor`, `save` — with every count and
every example read off the embedded recipe at open time rather than typed, and
the browse dialog's filter chips carry a one-line gloss beside the jargon. Two
people had asked what "has gate" meant, which is what a tooltip plus a paragraph
two panels away earns.

**Act 0 — platform setup** runs before any hackathon exists: the admin drafts
the About page, the draft stays invisible to the public, an organizer is denied
(site pages need the _global_ Admin role), publish makes it world-readable,
duplicate/invalid slugs are rejected, and a `<script>` payload pasted into the
markdown must not execute (`sitePageSanitized`).

Act sizes: 0 = 15, 1 = 63, 2 = 66, 3 = 13, 4 = 29, 5 = 120, 6 = 62, 7 = 40, 8
= 57. By kind: 324 `rpc`, 85 `ui.assert`, 49 `ui.flow`, 6 `rpc.race`, 1
`files.generate`.

**`rpc.race` fires its `calls` simultaneously** (Promise.all over separately
spawned grpcurl processes — the synchronous driver would serialize them) and
judges the aggregate (`race.ok` exact success count, `race.failCodesOneOf`
order-insensitive multisets). The suite stays strictly serial; the concurrency
lives inside the one action. Every race is followed by a plain rpc that reads
the END STATE back (`exportBallotCount`, `ownerCount`, `templatesOneOf`, the
roster) — "both returned OK" and "there is one row" are different claims. The
two races that reproduced real bugs before their fixes: one voter's four
simultaneous single-choice ballots double-voted in 7 of 12 hammer rounds (closed
by `VoteService.ballotMu`), and two owners demoting each other left the event
with ZERO owners on the first attempt (closed by `HackathonService.ownerMu` +
casbin `SyncedEnforcer`). Restore steps after a race may need `expect.okOr` —
which cleanup applies depends on who won.

## Where things stand (2026-08-10)

Work is on `sketch/06-08-26`, and **`.claude/` is TRACKED there** as of
`b57c9240` ("chore: track the e2e tooling on this branch") — no more editing a
live copy and syncing it into a `feat/claude` worktree. Only the generated
directories under it are ignored (`node_modules/`, `.state/`, `.artifacts/`,
`out/`, `.secrets.env`).

| Suite                                                  | Result                                                                                         | When       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------- |
| journey (465-action recipe)                            | **469 passed / 0 failed / 0 skipped**                                                          | 2026-08-15 |
| smoke                                                  | **148 passed / 0 failed / 0 did not run**                                                      | 2026-08-14 |
| mobile                                                 | **121 passed**                                                                                 | 2026-08-10 |
| backend `go test -tags "test unittest" ./internal/...` | all 6 packages ok in ~11 s — service 336/337 specs (one pending), capability 37, middleware 46 | 2026-08-15 |
| openreplay (9 tests)                                   | **13 passed / 0 skipped**                                                                      | 2026-08-11 |
| frontend units (29 files)                              | **488 passed**                                                                                 | 2026-08-14 |

Playwright totals include the 4 auth-setup tests every suite depends on, so
journey's 469 is 4 setup + 465 recipe actions.

Both e2e numbers are POST-MERGE with `origin/develop` and the recipe adapted to
its chrome (see "Bringing `origin/develop` in" below). Smoke was 22 red on the
first run after the merge, in exactly two files, and every one of them was a
label develop deliberately changed — no regression among them.

⚠ **The known `22-hackathon-pages` drag failure did not reproduce** on either
post-merge run (2026-08-14), having been deterministic on 2026-08-13. Recorded
as OPEN rather than fixed: nothing in this merge touches `dragRowTo`, and a
timing-shaped defect that stops reproducing has not been explained. The
diagnosis stands for whoever picks it up — `endY` is computed from the
DESTINATION row's bounding box **before** the drag starts, while the list
reorders live on `dragover`, so moving DOWN the pointer arrives at what has
become the middle row while moving UP still lands inside the intended one. That
asymmetry is why exactly one direction failed. Recompute the destination box
mid-drag, or aim past its far edge.

⚠ **`mode: "serial"` in `tests/journey/recipe.spec.ts` is load-bearing for
STATE, not just for stopping at the first failure.** Without it Playwright tears
the worker down after a failing test — and `vars` (hackathonId, team ids, saved
tokens) lives in that worker's module scope, so every later action self-skips
with "depends on 'hackathonId' from a step that was skipped or did not run". A
break-run with serial off therefore reports a flood of skips rather than the
failures it was looking for: 276 of 467 never ran (measured when the recipe was
463 actions long). To see several deliberate failures in one sitting, keep
serial ON and exclude the already-proven ones with `--grep-invert`
(assertion-only actions save no vars, so removing them poisons nothing).
`loadRecipe()` counts by `id`, cross-checks against a textual scan and rejects
duplicates, so an action line can no longer be silently dropped (see the traps
below).

⚠ **`just check::test -c backend` is RED, and the reason recorded here for
months is no longer the reason** (re-run 2026-08-15). It used to be the runner,
not a test: quitsh appends `--ginkgo.v` to every package's test binary, and
`internal/audit` and `internal/storage` were plain `testing` packages with no
ginkgo bootstrap, so they exited 1 on `flag provided but not defined: -ginkgo.v`
before running anything. **Both carry a bootstrap now** (`13331242`, an ancestor
of this branch) and both report `ok` under the runner.

What fails today is one SPEC, and it is the declared flake:
`Capacity > never oversells the last place under simultaneous joins`
(`capacity_test.go:326`) — the entry in the mutation runner's `KNOWN_FLAKY`,
which fails roughly one run in five under in-memory SQLite. Three consecutive
re-runs of `./internal/service/` after it went green. The rest of that run:
service 335 passed / 1 failed / 1 pending of 337, capability 37/37, middleware
46/46, config 6/6, audit and storage `ok`. CI runs this command, so **that flake
is a red CI run whenever it lands** — it is a test-side race to fix, not a
runner quirk to route around.

**API-to-UI coverage: 101 of 108 RPC declarations have a frontend caller.** The
seven without one are accounted for in `docs/testing.md` —
`HackathonService.SetCurrentPhase` aliases the `AdvancePhase` the timeline
calls, `GetVoteCategory`/`ListVotes`/`GetSubmission` are covered by the list
endpoints already driving the UI, `SuggestResults` computes a tally the UI
records by hand with `CreateVoteResult`, `CreateDownloadUrl` waits for something
private to serve, and `RemovePreference` has no un-prefer control to call it.
`PageService.SetOrder` left that list on 2026-08-12, when drag-and-drop on
Manage Pages started sending the whole sequence in one call. **The denominator
moves whenever a service gains a method** — it was 107 at `833a7388` — so the
list is the part worth keeping current, not the ratio.

### What landed most recently

**Backend.** Ranked and points ballots with per-row votes
(`{submission_id, rank}`), plus `SuggestResults` tallies for both. A
`HackathonState` façade over the existing Capability model — projection only,
**no enforcement**, because two gates that can disagree are worse than either
alone. `StorageService`: presigned uploads with hand-rolled SigV4 (~200 lines
rather than aws-sdk-go-v2 and its ~15 modules through a pinned Nix
`vendorHash`), size and content-type as conditions ON the presign so an
oversized upload is refused before a byte moves, and delete-by-prefix so
deleting a hackathon or an account purges its objects. `AddOwner`/`RemoveOwner`,
`ListRegistrationResponses`, and an RPC audit journal in `internal/audit/`.

**Frontend.** Media upload from the markdown editor, re-encoded to WebP in the
browser; an `/objects` fallback proxy; a people panel beside the team-assignment
board; centred nav; event-glyph placeholders; prize images; session replay with
default-deny masking behind a consent cookie.

**Tooling.** `scripts/prod-frontend.sh` (the harness serves the adapter-node
build itself — see container trap 2b), `journal-to-recipe`, `--refresh` /
`reseed.sh` / `prizes.sh` and real uploads in `seed-past-hackathons`, a working
`openreplay-stack` with `retention.sh`, and the new `14-nav-centering`,
`15-media-upload` and `tests/openreplay/` specs.

**`image/svg+xml` is excluded from uploads on purpose.** `/objects` is our own
origin, so a stored SVG is script running as the application.

### Three things that were switches doing nothing

Worth knowing because each looked like a feature request and was a bug:

- `VoteCategory.voting_method` had always offered ranked and points, and the
  organiser's form had always listed them, while `SubmitVote` rejected every
  ballot cast in such a category. A review weighed a schema migration against "a
  feature nobody asked for" and missed that the surface was already shipped.
- The `VOTE` and `VIEW_RESULTS` capabilities were seeded and toggleable with
  **no handler reading them**.
- `/manage/users` shipped calling `AddRole`/`RemoveRole` while both returned
  `Unimplemented`, so promoting anyone 500'd.

The ranked/points fix has a cost written down rather than left to be discovered:
the `Vote` unique index moved from `(category, voter)` to
`(category, voter, submission)`, so one-ballot-per-category is no longer the
database's rule. `writeBallot` deletes existing `(category, voter)` rows inside
the transaction and a pre-check still answers `AlreadyExists`, but two
concurrent submits from one voter could both pass the pre-check — a partial
unique index is not expressible in ent.

### Policy decisions, pinned by making a recipe action pass

Member role at Join; waitlisted may propose; **anonymous → `Unauthenticated`,
never `PermissionDenied`** (a status code is an answer, and "who are you" and
"not you" are different answers — `TeamService`'s eight mutation handlers moved
to `RequireUser` for this, because telling an anonymous caller `NotFound` let
them probe which team ids exist); organizers cannot vote; members read all
submissions hackathon-wide; public pages anonymous-readable; window enforcement
with now-anchored overrides.

Known upstream quirks: the casbin enforcer does not reload after external
seeding (the suite restarts the backend after `just db::seed`); casbin writes on
its own connection, so an ent transaction must never be held across one — it
deadlocks, and team membership uses compensating writes instead.

The `docs/` set drives bug work: `docs/TODO.md` carries the per-item status,
including deliberate non-fixes (team members may not delete their team; `Join`
still needs the public-visibility decision).

## How we got here

Three passes, in order. Kept short because the lessons outlived the numbers.

**1. Reachability (2026-08-05).** **Nothing had ever CLICKED the account menu.**
Every suite reached `/account`, `/hackathon/create` and `/manage/*` with
`page.goto`, which proves the route works and not that you can get there. Three
bugs were hiding behind "clicking my hackathons does nothing" — `/account`
redirect-looped because single-segment paths that no route owns are treated as
candidate SitePages and `account` was missing from a hand-written reserved list
(`sitePageSlug.ts` DERIVES that set from the route tree via `import.meta.glob`
now, so a new route reserves its own segment); the avatar swallowed its first
click because the menu was a `<button>` whose `onclick` only exists after
hydration; and "My hackathons" navigated to where you already were, which reads
as a dead link. _(The menu itself is gone — see pass 2 — but the reserved-slug
derivation and the "goto proves nothing" lesson are why it is written down.)_

Two editable-personal-data blockers from the same pass, neither of which was a
missing form: `WhoAmI` re-synced `display_name` from the token on EVERY request
and hooks calls it on every protected page, so any edit was reverted by the next
click — `syncFromKeycloak` now refreshes only what the IdP owns. And
`SubmitRegistrationForm` used to insert only, so a second submit hit the unique
`(hackathon, user)` constraint and returned `AlreadyExists`: **the first typo
was permanent.** It is an upsert now, and `GetRegistrationResponse` reads the
answers back as its own RPC — not part of `Get`, which denies waitlisted users,
exactly the people who still need their form.

**2. The design migration (2026-08-06, `feat/main-design`)** carried main's
design onto our backend. Almost nothing was lost as _design_; what was lost was
_wiring_, and none of it announced itself in a diff — submissions listing only
your own team, a Photos tab that no longer existed when its chain reached it, a
landing hero whose primary action was a 404. **The recipe found more product
bugs than review did.** Two mechanical audits found what neither could
(`docs/testing.md` documents both): **routes with no inbound link** (`/account`,
`/manage/pages` — the platform CMS — linked from nowhere at all) and **RPCs with
no caller** (`CreateSubmission`/`EditSubmission`/`FinalizeSubmission` had none,
so a team could not turn work in; `EditSettings` had none, so `votingEnabled` —
which gates every ballot and defaults to false — could only be opened over
grpcurl).

Three read RPCs had to be added for one reason each time — `GetWindows`,
`PrizeService.Get`, `GetEmailTemplates`: **a `Set*` that replaces a whole record
makes any form that cannot prefill destructive.** The voting policy took the
fourth slot but landed on the hackathon entity instead: those are the rules the
VOTERS are bound by, so "may I vote for my own team" is readable by whoever the
vote binds.

This design has **no account menu at all** — identity is a monogram and sign-out
is a top-bar button — so `02-login` and `07-account-menu` were re-specified
rather than repaired. Nav IA is one meaning per entry: Dashboard (yours),
Hackathons (all, searchable), About; the wordmark goes home for everyone.
"Hackathons" used to resolve to the dashboard when signed in and the browse page
when not, so the same word meant two things and the browse page was unreachable
from the chrome for exactly the people with an account.

**3. Bringing `origin/main` in (2026-08-06)** —
`docs/review-main-2026-08-06.md`: 183 commits, 746 files, reviewed from code on
both sides. **The merge is not additive everywhere** — main DELETED the
`Capability` entity our branch is built on and replaced it with flat
`HackathonState` booleans enforced through casbin policy. The two enforcement
paths cannot both run, so ours is kept. Everywhere else additive holds.
**Reviewing main mostly found bugs in OURS**, not features main had.
`AddOwner`/`RemoveOwner` went in as a casbin role write with no schema change,
because ownership is a casbin fact here while main stores it twice and syncs by
hand.

**4. Bringing `origin/develop` in (2026-08-14).** Nothing like the main merge:
the base is a day old, so develop already holds this branch's work up to it. 40
commits in, 17 out, and **every one of the 16 conflicts was in `.claude/`** —
`components/`, `helm-chart/`, `docs/` and `api/proto/` merged clean.

All 16 were the formatter against hand-written tooling. develop's `5a7b253b` ran
treefmt across the whole repo, rewriting 103 files under `.claude/` (shfmt to
4-space, prettier's trailing commas and `*em*` → `_em_`), and its `3ba79bea`
then **exempted** `.claude/**` **from treefmt** because it "carries its own
conventions (2-space shell, hand-wrapped markdown)" — without reverting the
reformat, so develop's tree contradicts develop's own rule for that directory.
Checked rather than assumed before choosing a side: normalising both sides of
all 103 files (whitespace, commas, semicolons stripped) leaves 76
byte-identical, and the other 27 differ only in quote style, a dropped
line-continuation, parentheses around an awaited import, a union's leading `|`,
and CSS reflow. **No semantic change anywhere.** So `.claude/` was taken from
this branch WHOLE — all 103 files, not only the 16 that conflicted: a directory
in two shell styles is the cost that would have outlived the merge.

**The one conflict that was not textual is the one worth remembering.**
develop's `942b60a7` makes the hackathon manage sidebar **flat** — no fold, and
its unit test now asserts "draws no fold control at all" — while `act5.nav.fold`
and `sidebarManageFold` pinned the opposite: starts folded, toggles, remembers,
self-opens inside the section. Git merged both without a murmur, because they
touch different files; only running the thing finds it. Both sides watched the
SAME behaviour (the fold force-opened on entering `/manage/*`) and disagreed on
whether it was a bug — ours called a route-derived chevron "a control that
lies", develop called a disclosure that is always open where it matters dead
weight on a fixed-height rail. develop owns the product decision, so the action
was **re-specified, not deleted**, keeping its id.

Re-specifying it needed a different claim, not an inverted one. "The entries are
there" passes against a fold as well, once open — and this fold opened itself on
exactly the pages such a check would look at, so it could never have told the
two designs apart. What it asserts now is that **the rail is identical outside
Manage and inside it**, which is what flat means and what a fold cannot satisfy
by construction, with the hub-and-entry visibility as the positive control that
keeps the "no disclosure" zero from agreeing with an empty nav.

⚠ **The problem the fold was built for is still there, and is now a UX
follow-up rather than a merge decision.** `memberNav` returns 10 entries and
`manageNav` another 10, so an organiser's rail is 20 rows in a
`sticky h-[calc(100vh-3.5rem)]` column — which is what "a second nav half again
as long as the first, on every page" meant. develop's fix is right that a
disclosure which force-opens wherever it matters is not the answer; it does not
make the column shorter. Do not reintroduce the fold to close this.

**Five more actions moved with it, and only one was about the sidebar.** The
first post-merge journey run stopped at `act2.flow.bob` — develop's
`+error.svelte` replaced one always-Home button with a context-aware way out, so
a 403 inside an event now offers "Back to this hackathon" and lands on the
PUBLIC event page, which for a waitlisted person is the page that offers Join.
That is the better answer to the question the action asks (a refusal must not be
a dead end), so both it and `act8.flow.charles` were re-specified to it — and
strengthened while being rewritten, because "a link was clicked and the URL
changed" would pass against a link back to anywhere; they now name the event
they land on. `act5.flow.reach.manage` lost its unfold click.
`act8.form.ui.edit` follows a control that MOVED rather than one that vanished:
develop's `c596683c` removed the overview's "Your registration answers → View or
edit" block and its `76037844` put the entry point on the participants roster,
where View opens your own editable form (and `?userId=` someone else's, for
organisers). The product rule is exactly the one that action exists for —
`SubmitRegistrationForm` is an upsert precisely so a first typo is not
permanent, which needs a way IN from the UI — so the locator moved and the claim
did not.

**Two stale things develop's own tree carried, found by the audit and fixed
2026-08-14.** Both were copy, and neither could be seen on screen.

`(app)/account/+page.svelte` told people to look for "Your registration answers
→ View or edit" — the block `c596683c` deleted. It names the roster now
(Participants, then View on your own row), and `smoke/07-account-menu` FOLLOWS
that sentence rather than reading it: it lifts the `<strong>` labels out of the
paragraph, clicks the destination they name, and asserts a 200. Copy that names
a control is a promise about the UI; the only way to keep one is to click it.
There is no link in that paragraph, and that is a limit — `/account` loads your
profile and no event, so an href would have to guess WHICH event you meant.

The rebuilt footer linked `datascience.ch/about` beside our own `/about`, so two
links in one region shared the accessible name "About". Nothing on screen was
wrong: the column headings tell them apart. **A screen reader's link list is a
flat list of NAMES, and headings are the first thing it discards** — which is
also why the tooling's earlier answer (scope the footer checks to a nav
landmark) made the checks correct and left the product broken. Ours reads "About
Hackagon" now, in its VISIBLE text: an `aria-label` would have fixed the list
and broken voice control ("click About"), which is the trade WCAG 2.5.3 is
about. The rule that keeps it fixed is **name the destination the way it names
itself** — "About Hackagon" is that SitePage's own `<h1>` in the seed and in act
0 — so the two names cannot re-converge through a copy edit on one side.
`expectFooterLinkNamesUnique` asserts the PROPERTY (no name identifies two links
in the footer landmark), never a list of expected names: the previous generation
of that check was really an assertion about the footer's SIZE and broke when
develop grew it to 14 links.

⚠ **Still open, and reported rather than fixed unasked:** the five
`datascience.ch` links are marked as leaving the site only by `target="_blank"`,
which nothing announces. Sighted users get no icon and screen-reader users get
no word — the nav landmark's name is context a link list discards, exactly like
the column heading above. Smallest fix: a visually-hidden suffix inside each
anchor (`<span class="sr-only"> (opens datascience.ch in a new tab)</span>`),
which APPENDS to the accessible name and so keeps the visible text contained in
it. The logo and social links already say who they lead to by name (ETH Zurich,
EPFL, SDSC on LinkedIn); these five do not.

**Guessing which labels moved does not scale — the check is mechanical.** Every
static `clickLink`/`clickButton`/`expectHeading`/`expectText` literal in
`recipe.jsonl` is greppable against `components/frontend/src`, and after the
fixes the only ones with no hit are the ones that are DATA (a hackathon name, a
persona, an `aria-label` template, organiser-authored form fields). Run that
before a journey rather than paying a full run per red.

## Ways a HANDOVER was confidently wrong

Distinct from the section below, and it cost more. Those are tests that agreed
with a broken product; these are briefs that told an agent something false with
enough confidence that it could have been taken on trust. Five in one week, all
mine, all caught only because the brief said "verify this before acting on it"
and the agent did:

- **A 44-second Nix floor that did not exist.** Handed over as fact and already
  propagated into five files as the justification for design decisions.
  Measured: 4.6-5.0 s steady state, and clean-vs-dirty is not the variable. The
  44 s had been measured during a frontend crash loop that was fixed hours
  earlier. A wrong number stated once became load-bearing in four other files
  within a day.
- **git-lfs framed as the fix for that floor.** It makes `git status` truthful,
  which is worth having; it does not change the timing at all. The agent A/B'd
  it before touching the Dockerfile and said so.
- **A vacuity guard removed on a wrong theory.** "A no-op preview lists nothing"
  — except the table renders every planned row including unchanged ones.
  Deleting the wait made the two assertions after it pass instantly against a
  page that never rendered. I introduced two silent-green assertions while
  explaining why I was right.
- **"The devcontainer can drive k3d."** It mounts no Docker socket and has no
  docker CLI. The agent found out in its first minute and rewrote that half of
  the brief.
- **A stale consequence stated as current.** "A backend outage restarts every
  frontend pod" was true before the landing page learned to catch its own gRPC
  failures. The cost is real (the probe issues up to five calls per pod every 15
  s) but the consequence had changed.

What made the difference every time was a brief that said **verify this rather
than transcribe it**, and named what would count as disproof. The failure mode
is not a lie — it is a true-once observation restated after its context moved,
which is exactly the shape nobody re-checks. Two habits follow: attribute a
number to the run that produced it, and when handing over a diagnosis, hand over
the measurement that would falsify it.

## Ways a test reported green while proving nothing

The most expensive category of bug here, because nothing turns red. All of these
are now impossible-by-construction rather than fixed case by case.

- **A locator that contains the thing it asserts about.** Three times now.
  `12-roles` checked the row, which holds a `<select>` whose options are named
  after the roles; `13-owners` checked the card, which holds a button named
  "Make organizer". Assert on the element that STATES the fact — the badge, the
  role line — never the container.
- **A gate nobody probed.** `implemented()` cannot tell "the backend returned
  Unimplemented" from "no one ever asked" — both are falsy — so six
  `act5.owner.*` actions whose RPCs were missing from `probe.sh`'s `METHODS`
  self-skipped and would have done so forever. `runRpc` now THROWS on a gate
  absent from the probe list: gating exists so an action wakes up when its RPC
  lands, and one that is never probed never wakes. It paid for itself
  immediately, catching `SuggestResults` and four more the next batch.
- **A `test.skip` on the only path.** `12-roles`'s self-demotion test clicked a
  revoke control and skipped when none rendered — but own-Admin revoke is
  deliberately hidden, so skipping was every run. It asserts the absence now,
  and grants a role to someone else to prove the control did not vanish for
  everybody.
- **A count nobody read back.** `recipe-player.html` showed 10 actions of 274.
  An inline `<script>` block ends at the first literal `</script>`, even inside
  a JSON string — and `act0.about.xss` pastes a script tag on purpose. The
  splice escapes it as `<\/script>`, which JSON parses back to the same
  character. Re-splicing the player after a recipe edit is required, not
  cosmetic; the escape is part of the splice.
- **A zero that could be vacuous.** The replay privacy proofs count BYTES ON THE
  WIRE, and a zero-hit grep reads identically whether the string was masked or
  nothing was ever captured — on the first run nothing was. `masking.spec.ts`
  therefore runs an **unmasked control first**, and `consent.spec.ts` asserts
  the positive too (the project key IS in the HTML once granted).
- **A measurement that stops at the wire.** The same replay suite was green for
  three days while **every recorded session was unplayable** — the player spun
  forever and no recording file was ever written. It could not have noticed:
  every spec in that folder measures what leaves the BROWSER, and all three
  faults were on OpenReplay's side of an ingest endpoint that answered `200` to
  every batch. Its `sink` container was not running (a compose service with no
  container looks nothing like an unhealthy one); its object store answered
  `NoSuchBucket` to every request, PUT included, for a bucket on its own disk,
  until it was restarted; and `ender` rejected one batch per session, which
  `Iterate` discards WHOLE. `tests/openreplay/playable.spec.ts` now asks the far
  end — it records a session, reads the id off the tracker's own start response,
  and waits for the mob file to come back through the player's two hops.
  Corollary worth keeping: **"the server accepted it" is not "the server can use
  it"**, and a suite that only ever asks the client cannot tell those apart.
- **An action the loader silently drops — closed.** `loadRecipe()` used to
  filter every line with a `comment` key, which is how act banners are removed,
  without checking for an `id` first — `act8.flow.bob` carried a trailing
  `comment` and had never executed. The loader now keeps every line with an
  `id`, throws on a line that is neither banner nor action, cross-checks the
  count against a textual scan of the raw file, and rejects duplicate ids.
- **An `or` whose third outcome nobody enumerated — OPEN.** `09-browse-and-join`
  asserts "either the registration form opens, or the event asks nothing and the
  dashboard just updates". The join being **REFUSED** satisfies the else-branch
  too, and that is what happens today: charles's target is `h2`, whose
  `register` capability is disabled, so the spec drives a Join that always fails
  and reports green (confirmed in the DB — charles still has exactly one
  participant row after many runs). Its else-branch must assert the
  `joinNotice`/badge, or assert the refusal explicitly. A disjunction is only a
  test if every branch is a SUCCESS; one that also accepts the failure is a
  tautology. Same file, lines 57-61, plus `05-new-user-funnel:31`: both click
  "the first Join button on the dashboard", which is the fixture's event only
  because `just db::seed` ran before the SDSC seeding (`List` orders
  `created_at ASC`).
- **A fixture constant that assumed the fixture was the whole database.**
  `03-dashboard` hard-coded `connectedCount: 3`; the instance also carries the 6
  SDSC editions, and `HackathonService.Create` enrolls its creator, so
  `hackagon-admin` is in 9. The two "lists other public hackathons" tests were
  worse: their whole assertion was the empty-state sentence, i.e. a claim about
  the fixture's SIZE rather than about the page. Replaced with self-consistent
  properties — the count the page states equals the rows it renders (a mismatch
  is a real bug class the constant could never see), and the offered set is
  checked in both directions against membership with `joined > 0` as the
  control. Populated instances are a supported state; a spec that only passes on
  an empty one is coupled to the seeder, not to the product.
- **A helper that no-ops when its subject is absent.** The mobile sweeps
  iterated `["header", "footer", BANNER]` and called
  `expectNoOverlap`/`expectNoClippedText` on each — and both helpers `return`
  early when `document.querySelector(scope)` is null. The `(app)` route group
  shipped with NO footer on 37 of 42 routes (the `5551b8d` split gave it its own
  copy of the shell, minus `AppFooter`), so two checks per route measured an
  element that did not exist and passed. Worse than a missing test, because the
  route list _named_ the thing: coverage looked complete. A guard clause for
  "not applicable here" and an assertion are the same shape from the outside —
  so a sweep over a fixed list of chrome must assert PRESENCE separately from
  geometry, and the geometry helper's early return must be reserved for scopes
  that are legitimately optional. This is the same family as the vacuous zero
  and the unprobed gate: absence agreeing with everything.
- **A field that moved out from under a check.** `usersLackNames` read `u.name`;
  the User proto has `username` and `displayName` and no `name`, so every user
  mapped to undefined and "the deleted profiles are gone" passed no matter who
  was still in the list. It reads `displayName` now and THROWS when no user in
  the list has one — absence-assertions need a positive control or they agree
  with everything.

One hole no option closes: the tracker masks TEXT NODES and input values but
sends ATTRIBUTE values verbatim. `title={userName}` was shipping the signed-in
person's name in clear next to the same name arriving as asterisks. **Personal
data goes in text nodes, never in an attribute.**

**Fixing a bug that a recipe action _pins_ will turn the suite red on purpose**
— that is the mechanism working. Re-specify the action, do not delete it:
`act2.flow.alice.users` asserted the `/manage/users` 500 until it was fixed, and
its own `todo` said to flip it to 403.

**Cast differs between suites.** In the smoke fixture alice OWNS h1; in the
journey `hackagon-admin` creates the hackathon and alice joins it and votes in
act 7 (organizers may not vote). A recipe action written with the smoke cast in
mind gets `PermissionDenied` from the right code for the wrong reason.

**Test-side locator lessons.** The dashboard's membership badge is a SIBLING of
the row link, so rows are reached as the link's grandparent (`helpers/ui.ts`) —
the badge has moved three times and the class lists changed with it, but "the
thing the link is mounted in" did not. `clickLink` falls back to the accessible
name: an icon-only link has no text content to filter on. Content assertions
scope to `<main>`, because a hidden-but-present account menu matched a page-wide
`getByText` first. `getByRole("button", {name})` is substring AND
case-insensitive, so `clickButton: "A"` also matched "Toggle light/d**a**rk
mode" — `clickButton` prefers an exact match now. And `login: true` only works
with `fresh: true`: with a persona's saved session Keycloak SSOs straight
through and the helper waits forever for a `#username` field that never renders.

## Mutation testing — making "can this test go red?" a thing that runs

The section above is the expensive one, and every entry in it was found BY HAND,
once. `.claude/skills/hackathon-e2e/mutations/` turns that hunt into a check: a
**manifest** of deliberate, reversible breakages, each paired with the exact set
of tests that MUST notice, and a **runner** that applies one, runs the tests,
and asserts exactly that set failed.

```bash
bash .claude/skills/devcontainer-up/scripts/mutate.sh run    # from the host
bash .claude/skills/hackathon-e2e/scripts/mutate.sh list     # the manifest
bash .claude/skills/hackathon-e2e/scripts/mutate.sh check    # anchors still match source
bash .claude/skills/hackathon-e2e/scripts/mutate.sh run owner   # one id, or a prefix
bash .claude/skills/hackathon-e2e/scripts/mutate.sh restore  # after a run was killed
```

**`NO REDS` is the result this exists for, and it FAILS the run.** Not a
curiosity to note and move past: it means nothing in the suite holds that
property, which is the same fact the sidebar-fold assertion turned out to be
stating and the same fact `usersLackNames` stated for months. `MISMATCH` fails
too and names the extras — an over-broad mutation, or coupling nobody knew
about. Only `EXACT` passes.

### Adding one

Append a line to `mutations/manifest.jsonl`:

```json
{
  "id": "cap.allowed.flatten",
  "property": "UNGOVERNED PERMITS. Flattening …",
  "arena": "go",
  "tier": "fast",
  "file": "components/backend/internal/capability/capability.go",
  "find": "\treturn s == StateOpen || s == StateUngoverned",
  "replace": "\treturn s == StateOpen",
  "expectReds": [
    "capability::Capability > Allowed > allows an ungoverned capability"
  ],
  "crossRef": ["act5.cap.ungoverned"]
}
```

`find` must match its file **exactly once** — a fragment of real source, tabs
and all. A manifest whose anchor has drifted is the same disease as a test that
has stopped asserting, so `apply()` throws rather than skipping, and `check`
exists to be cheap enough to run on every commit. Two edits in one mutation go
in `edits: [{file,find,replace}, …]`; that shape exists because
`markdown.script-survives` has to weaken BOTH `ALLOWED_TAGS` and `FORBID_TAGS` —
defence in depth, and a half-applied mutation would report the property as
tested when only the other half held.

Author `expectReds` with `--record`, which prints the observed reds instead of
judging them, then **read them before you freeze them**: recording is how a
manifest agrees with whatever the code happens to do. An entry with an empty
`expectReds` is rejected at load time unless it also says `"gap": true` with a
`gapReason` — because `expectReds: []` is the one value that would make every
mutation pass, and that is precisely the vacuous shape this tool is for. A gap
that later starts producing reds is reported as `GAP CLOSED`, so promoting it is
prompted rather than remembered.

### Arenas, and why the journey is the last resort

An arena is where the evidence is. Cost is why there is more than one.

| arena     | what it runs                                    | cost                                             | identity                                                        |
| --------- | ----------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `go`      | `go test -tags "test unittest"`, six packages   | **~9 s**                                         | `pkg::Describe > Context > It` (Ginkgo), `pkg::TestXxx` (plain) |
| `vitest`  | frontend units, narrowed to `arenaConfig.files` | ~10 s narrowed, 60 s full                        | `file::full test name`                                          |
| `journey` | `run.sh journey --until-act N`                  | minutes, + a backend restart or frontend rebuild | the recipe action id                                            |
| `smoke`   | `run.sh smoke`                                  | ~1.4 min against the built frontend              | `file::title`                                                   |

The **fast tier (`go` + `vitest`) needs no running stack at all** — it drives
the compilers straight from source — which is what makes 30 mutations a
five-minute check rather than an afternoon, and means it still works while the
stack is down, being rebuilt, or in use by somebody else.

Two things make that possible and neither is incidental. **The runner never
enters `nix develop`**: that shell is a repo-wide mutex, ~5 s unopposed and
serializing under contention (container trap 4), so 38 entries through it would
cost more than every test they run. `.devenv/profile/bin` already holds `go`,
`node` and `pnpm` and costs nothing to put on `PATH`. And **the journey cannot
be `--grep`ped**: it is serial with chained `vars`, so the only lever is
`--until-act N`, and a backend mutation additionally needs the running server
rebuilt against it. That is minutes per entry against seconds, so the manifest
routes a property to the journey only when nothing cheaper can witness it — and
records the journey action in `crossRef` when a cheap arena is the primary
witness, so the two are not confused for each other.

### Restoration is verified, not assumed

A mutation left in the tree that then gets committed is the worst outcome this
tool can produce, so it has three independent recoveries. The runner refuses to
start when any file it may write is already dirty; it writes the original bytes
to `.state/backup/` and fsyncs them **before** editing, journals the edit, and
restores on exit, on signal, and on `restore`. `scripts/mutate.sh` restores from
the same journal in its own `trap EXIT` and then checks `git status` itself —
because a trap cannot survive a SIGKILL or a container recreate, and the journal
on disk is what makes a later `restore` possible at all.

**That check earned its keep on the first multi-edit mutation, by finding a bug
in the runner itself.** `markdown.script-survives` edits ONE file TWICE, so it
journals two backups — and the second holds the file as it stood after edit 1,
i.e. already mutated. Replaying the journal forwards restored the original and
then overwrote it with the half-mutated copy: every backup on disk intact, the
journal reading as fully unwound, and `markdown.ts` left broken. Restore runs
**newest first** now, so each entry undoes exactly the edit that produced it.
Nothing but a post-restore `git status` could have caught that — the tool
believed it had cleaned up.

⚠ **The cleanliness check is SCOPED to the files the manifest names**, plus
`components/`, and that is deliberate. It was originally scoped for two reasons
and one of them has since been fixed: a repo-wide "git status is empty" check
could never pass while three git-lfs pointer files read as permanently modified,
and `git-lfs` in the image closed that (trap 4). The reason that remains is a
check on **other people**: the first run of this tool aborted ten mutations
because a second agent added a file elsewhere under `.claude/` while it worked.
A safety check that cries wolf on somebody else's work is a safety check that
gets deleted.

### What the first manifest found (2026-08-13, 38 mutations)

**26 caught, 12 with NO REDS** (eleven of the twelve are closed as of 2026-08-14
— see the section after this one; what they were is kept because the CLUSTERING
is the finding). Every one of the twelve is a backend property, and eleven of
them cluster into three surfaces that the 6-second Go suite did not touch at
all:

- **`requireWindowOpen` — all of it.** Deadlines never closing, the now-anchored
  override ignored, registration opening early: three mutations, zero reds. No
  Go spec exercises a window in any package.
- **`RemoveOwner` — all of it.** The last-organizer guard, the
  cannot-demote-yourself rule, and demotion leaving Member behind: three
  mutations, zero reds, and a fourth (dropping `ownerMu`) that no unit test
  could see anyway. Ownership is a casbin fact here with no column to assert
  against, which is likely why the specs were never written.
- **`Join`'s guards.** The invite requirement on a private event, the
  already-finished refusal, and the ROLE a join grants. `join.grants-member`
  hands every joiner OWNER instead of Member and not one Go spec notices.

Plus `RequireUser` admitting the anonymous subject (the change eight TeamService
handlers were made for), and `checkContentType`'s allowlist — the rule keeping
`image/svg+xml` out of an origin we serve.

**These are gaps in the FAST tier, not proof the product is unguarded**: each
one is pinned by journey actions, listed in the entry's `crossRef`. But that
means the only thing standing behind window enforcement and the last-organizer
invariant is a suite that costs minutes, needs the whole stack, and cannot be
run on a branch. **Those reds are also DEDUCED** — from each action's declared
`expect.error` — not observed, because no journey mutation has been run yet.

The frontend half came out the other way round: all 8 vitest mutations produced
reds, including a cross-file one — flattening `capabilityAllows` turns
`joinOffer`'s ungoverned case red as well, which is the two gates agreeing, in
the test suite, that UNGOVERNED permits.

### Eleven of the twelve closed (2026-08-14): 37 exact, 1 gap

28 Go specs later the manifest reads **37 EXACT, 1 GAP, 0 NO REDS**, and the
whole fast tier still runs in the same ~9.3 s — `internal/service` 312 → 337
specs (+0.06 s), `internal/middleware` 43 → 46. New files:
`config_service_test.go` (windows through Join), `hackathon_owner_test.go`,
`hackathon_join_test.go`, `require_user_test.go`,
`storage_upload_internal_test.go`, plus a `RequireUser` block in
`middleware/auth_test.go`.

Four things the work turned up that are worth more than the coverage:

- **Ownership has no column, so every owner assertion goes through the
  enforcer** `CreateTestServer` hands back — the same instance the server holds,
  not a copy. `RemoveOwner` answers with an EMPTY message, so "it returned OK"
  says nothing about who ends up holding what; `HackathonOwners` and
  `GetHackathonRole` are the facts. And `owner.demote-restores-member` is only
  visible on someone who did NOT already hold Member, so the spec writes its
  participant row directly rather than joining — a bob who joined normally would
  read as Member whether or not the demotion restored it.
- **The order of RemoveOwner's two refusals is load-bearing in the tests too.**
  The last-organizer guard runs before the self-demotion one, so a sole owner
  demoting themselves is refused by the FIRST — which is why the self-demotion
  spec promotes a co-organizer first (its recipe twin, `act5.owner.self`, says
  the same in its `todo`), and why the last-organizer spec has a SECOND global
  admin do the asking instead.
- **No clock control anywhere, and no sleep.** `requireWindowOpen` takes `now`
  as an argument but the handlers pass `time.Now()`, so the windows are written
  relative to now (−1 h closed, +1 h not yet open) and the assertions hold
  however slowly the suite runs.
- **`OverrideWindow` cannot express an expired override** — protovalidate holds
  `extend_minutes` to 1..1440, which the first draft of that spec discovered by
  failing. The expired state is written to the row directly; the alternative is
  waiting for one to run out, and a test that sleeps to cross a boundary flakes.

The one that stays open is **`owner.mutex-dropped`**, and deliberately: the
three RemoveOwner specs above are all SERIAL, so dropping `ownerMu` changes
nothing any of them can see. A test that went red under it without two calls
genuinely in flight would be pinning a coincidence. Its witness remains
`act5.race.owner.remove` in the journey.

### The baseline is not green, and that is handled rather than hidden

"Exactly the expected set failed" means nothing against a suite that is not
green to start with. `internal/service`'s **"Capacity > never oversells the last
place under simultaneous joins" fails intermittently** under in-memory SQLite
(roughly one run in five; the error is `Internal: couldn't join hackathon`).
Left alone it lands in an arbitrary mutation's extras column and reads as
coupling. So reds are diffed against a baseline taken on the clean tree, and an
unexpected red is re-checked against a FRESH clean run before it is called
coupling.

**That re-check is not sufficient on its own, and the first verification run
proved it**: `cap.gate.removed` came back MISMATCH naming exactly that spec,
while the fresh sample happened to pass — an intermittent failure that does not
reproduce in one extra sample is indistinguishable from coupling. A tool that
randomly fails one entry in five is a tool people stop reading. So the flake is
also **declared**, in `KNOWN_FLAKY` at the top of the arena section, with the
reason it is there.

Both paths report; neither drops. Every ignored red is printed **with its
reason**, because an ignored red is a claim, and a list of tests whose failures
don't count is precisely the shape that could hide a real one. Adding a line to
`KNOWN_FLAKY` is a claim about the SUITE that wants justifying — never a way to
quieten a mutation that is genuinely over-broad.

⚠ **A flaky test can still be a genuine witness, and that trap fired within the
hour.** That capacity spec hammers concurrent joins against a cap — which is
precisely what `capacity.oversell-by-one` breaks — so under THAT mutation its
failure is the evidence, and the first freeze had stripped it as noise. The
rule: when a listed test really does witness a mutation, it belongs in that
mutation's `expectReds`, where the excuse cannot reach it (the filter only ever
looks at reds that are NOT expected). Excusing an extra prints that reminder
every time.

⚠ **And it flakes in BOTH directions, which no filter can excuse.** Observed
2026-08-14: `capacity.oversell-by-one` came back MISMATCH with that same spec
under "expected but stayed GREEN" — its witness had passed under the mutation.
Same root cause (a join that errors out under SQLite contention seats one fewer,
so the oversell never materialises), opposite symptom, and the `KNOWN_FLAKY`
list cannot help: an expected red that does not arrive is exactly what a
MISMATCH is for. Three re-runs of that one id came back EXACT. So a MISMATCH
naming ONLY a `KNOWN_FLAKY` test in the "stayed GREEN" column wants a re-run
before it is believed — the same courtesy the extras column already gets.

## Container traps (Windows/macOS hosts) — read before touching compose

These cost hours; all of them are handled in `.devcontainer/` (or, for 2b, in
the e2e harness), but the failure modes recur whenever the setup changes.

**1. Never let `node_modules` live on the bind mount.** The workspace mount is
`9p` on Windows; the volumes are `ext4`. Measured in this container:

|                                           | bind mount | named volume |
| ----------------------------------------- | ---------- | ------------ |
| `require("isomorphic-dompurify")` (jsdom) | 52,821 ms  | 331 ms       |
| `pnpm install`                            | 34 s       | 5 s          |
| `vitest run` (23 tests)                   | 104 s      | 1.06 s       |

52 s exceeded vite's 60 s SSR module-transport timeout, so **every route
returned 500** with a `fetchModule` timeout on `/src/app.css` — a total outage
that looks nothing like "slow disk". Check which side you are on:
`findmnt -no TARGET,FSTYPE | grep node_modules` must say `ext4`. ⚠ Still on the
bind mount: `.claude/skills/hackathon-e2e/node_modules` (only
`components/frontend/node_modules` is volumed).

**2. Changing `dev`'s compose config recreates the container — which kills the
stack inside it** (process-compose, and therefore Postgres/Keycloak/backend/
frontend) **and wipes anything apt-installed at runtime.** That is how the e2e
suite lost Firefox's system libraries
(`libgtk-3.so.0: cannot open shared object file`); they are baked into the
Dockerfile now. After any recreate: restart the stack (`scripts/up.sh` +
`wait-ready.sh`) before anything else.

**2b. After a proto/ent regeneration, vite's first SSR can take longer than
anyone will wait — and process-compose kills it while it tries.** Regenerating
wipes and rewrites ~260 files under `src/lib/server/grpc/generated/`, which
invalidates that much of vite's transform cache. `src/` is on the 9p mount, so
each cold transform is seconds (measured: 28 s for `src/app.css` alone). The
first request to `/` then hangs, and the readiness probe (`curl`, 5 s timeout,
kills after 100 failures) terminates the process mid-warm-up — the log says
`readiness check fail - signal: killed`, which reads like a crash and is not
one.

How to tell this apart from a real hang, in one command:

```bash
PID=$(pgrep -f "vite.js dev"); cat /proc/$PID/task/$PID/stat | awk '{print $14, $15}'
```

Low utime/stime with the process alive means it is I/O-bound on 9p, not
deadlocked. `ss -tanp | grep $PID` showing NO outbound socket means it has not
reached the backend yet, so nothing downstream is to blame.

**The fix is not to wait — serve the built output instead.** It has no transform
step and boots in seconds:

```bash
cd components/frontend && pnpm build
PORT=8081 HOST=::1 ORIGIN=http://localhost:8081 AUTH_URL=http://localhost:8081 \
  node build/service/index.js --config-dir ./data/test/config --data-dir ./data/test
```

Smoke drops from 3.0 m to 1.4 m against it. Three traps in that one command:
`HOST=::` collides with the socat bridge already on `:8081` (EADDRINUSE);
`HOST=127.0.0.1` binds a port `localhost` does not resolve to, because
`localhost` is **`::1`** in this container; and `AUTH_URL` must be set alongside
`ORIGIN` or login completes and does nothing. Stop process-compose's `frontend`
first, and check for a leftover vite still holding `[::1]:8081`.

`E2E_BASE_URL` retargets the whole harness (`lib.sh` derives `FRONTEND_URL` from
it), but prefer serving on **:8081**: the realm export's `hackagon-frontend`
client — realm `hackagon`, not `hackagon-dev`, which is the bucket and network
name — allows exactly one redirect URI, `http://localhost:8081/*`, so :8082 dies
at login with `Invalid parameter: redirect_uri`.

**3. Do not gate sidecars on `dev`'s health.** `dev` is healthy only once
someone runs `just up`, which compose does not manage, so
`depends_on: condition: service_healthy` on `dev` deadlocks: it blocks on a
stack compose cannot start, and the config change that added the healthcheck is
what killed that stack. `caddy` uses a plain `depends_on`; readiness is checked
by `cloudflare-tunnel/scripts/up.sh`, which fails fast when nothing serves on
:8081. `tunnel → caddy` keeps `service_healthy` — that race is real (cloudflared
resolves its target once) and compose owns both sides.

Optional `services` profile runs Postgres and Keycloak as their own containers
(`service-bridge.sh` maps them onto localhost inside `dev` so checked-in configs
keep working). Opt-in: `just up` still starts devenv's copies and they would
fight over ports. Note `postgres:18+` wants a single mount at
`/var/lib/postgresql`, not `/var/lib/postgresql/data`.

**4. `nix develop` is a GLOBAL MUTEX on this repo, and every service in the
stack goes through it** (fixed 2026-08-13). This is the one that poisoned
several days of test results, and it never once looked like an infrastructure
problem — it looked like product bugs, at four different places in four runs.

Every `nix develop` takes a repo-wide lock while it fetches and hashes the tree
(`waiting for another Nix process to finish fetching input 'git+file:///workspaces/hackagon'…`),
and the stack's own processes are `just develop just run` /
`just develop just serve`, so entering that shell is inside every service's
startup — while process-compose's readiness clock is already running. **The
probe budget is spent waiting for Nix, not on the server.** (The probes
themselves are fine; they are `${pkgs.grpcurl}/bin/grpcurl` and
`${pkgs.curl}/bin/curl` by store path and enter no shell.)

⚠ **THE 44 s FLOOR THIS ONCE CLAIMED WAS WRONG — corrected 2026-08-13,
re-measured 2026-08-14.** `just nix::develop default true` in this container is
**~4.6–5.0 s steady state**, and _clean versus dirty is not the variable_: one
modified tracked file measured 4.7–5.0 s, identical to a clean tree. The first
entry after a tree edit runs 4.7–10.6 s. The 44 s was almost certainly sampled
while `frontend` was crash-looping through one full `nix develop` per round —
i.e. it measured the contention, not the floor, and capping `max_restarts`
removed it.

The cost that IS real is self-inflicted and small: `tools/just/devenv.sh`
rewrites `.devenv/state/pwd` on every invocation, so the `devenv-root` flake
input gets a new `lastModified` and Nix's eval cache misses every run. Against a
fixed root file the same call drops to 3.2–4.5 s — about 1.7 s of every entry.

**`git-lfs` is in the image now** (`.devcontainer/Dockerfile`, 2026-08-13), so
the three LFS-tracked binaries (`components/frontend/static/favicon.png`,
`static/og-default.jpg`, `tools/configs/keycloak/.../img/favicon.ico`) no longer
read as permanently modified — the worktree held their real bytes, smudged by
the Windows host, while HEAD held a pointer, and a container with no
`filter.lfs.smudge` compared the two and reported ` M` forever. It was A/B'd
directly: the tree goes genuinely clean, Nix stops printing
`warning: Git tree … is dirty`, and **the time does not move.** Keep it for the
truthful `git status` — several tools read it — not for speed.

What that budget actually was: probes land ~15 s apart (process-compose's
default period), so the backend's `failure_threshold: 50` was ~12.7 min —
against a **COLD backend restart measured at 486 s on a quiet lock.** 64% of the
budget spent before one competitor is added, each competitor costing ~+36 s.

When the budget runs out process-compose **kills the service**, and both of its
two possible endings are bad. Reproduced on the real `just develop just run`
with the budget scaled down:

| how the SIGTERM lands       | exit    | `restart: on_failure` does   | result                                                   |
| --------------------------- | ------- | ---------------------------- | -------------------------------------------------------- |
| the Go signal handler is up | **0**   | nothing — 0 is not a failure | **down forever**, recorded as `Completed`                |
| it lands before the handler | **143** | restarts, uncapped           | **149 restarts in 151 s** = one `nix develop` per second |

The first is what the logs showed in the wild: `grpc server listening`, then
`received shutdown signal`, then `exit_code=0` — which reads like a clean stop
and is a kill. Downstream it was mid-run `NS_ERROR_CONNECTION_REFUSED`, a
`reset.sh` that printed "State wiped" while data survived, and a stack needing
manual restarts.

**What generated the contention was a crash loop nobody could see.** Found live:
process-compose's `frontend` at **54 restarts in 50 minutes**, exit 1,
`Error: Port 8081 is already in use` — because the harness's own adapter-node
server holds `[::1]:8081` (that is its job, trap 2b) and nothing had put vite
down. `prod-frontend.sh ensure`'s fast path ("the built frontend already serves
:8081 — leaving it alone") returned without touching process-compose, so the
loop ran forever, one full `nix develop` per round.

⚠ **And `process list` said `frontend Running Ready` throughout.** Its
readiness probe is `curl http://localhost:8081`, which the OTHER server was
answering. **A probe on a PORT cannot tell you which PROCESS holds it** — this
is the infrastructure member of the silent-green family above, and the same trap
bit the reproduction rig itself (a leftover scratch backend on :3001 made a run
report Ready in 10 s having tested nothing). The `RESTARTS` column said 54 the
whole time and nothing read it.

Four changes, no compose change and no rule to remember:

- `prod-frontend.sh`'s `ensure` calls `stop_vite` **unconditionally** — it is
  the built server that gets left alone, never vite.
- `toolchain.nix` frontend: `max_restarts = 3`, so a port conflict costs three
  shell entries rather than one an hour.
- `toolchain.nix` backend: `restart = "always"` **plus `max_restarts = 3`**
  (`always` alone converts a permanent outage into an unbounded loop — that is
  the 149-restarts row), and `failure_threshold` 50 → 150 (~37 min). A generous
  budget costs nothing when healthy, because probing stops at the first success,
  and **the thing that should decide "the backend did not come up" is
  `wait-ready.sh`'s own 300 s timeout, which names the service** — not a
  supervisor whose only move is to kill a server that was merely slow.
- `wait-ready.sh` now **reads the restart counters back** and warns, with the
  exit code, when any service is ≥3. The number was always there.

**5. Two concurrent `pnpm build`s corrupt `components/frontend/build/service`**
(fixed 2026-08-13; hit by three agents in one day). `pnpm build` is
`vite build -m production`, `svelte.config.js` sends adapter-node's output to
`${QUITSH_BUILD_DIR:-build}/service`, and there were **two independent callers
that both build AND SERVE that one tree** — `hackathon-e2e/prod-frontend.sh` on
:8081 and `cloudflare-tunnel/prod-serve.sh` on :8082. So they do not merely race
to build it, they race to replace it while the other is serving it. Symptoms:
`Unexpected end of JSON input`, then a missing `build/service/server/index.js`
at boot.

Both callers now go through **`.claude/skills/lib/frontend-build.sh`**, which
does two things for two different holes: an **exclusive `flock`**, so two builds
cannot interleave and the second caller waits and then finds the first one's
fresh output (staleness is re-checked INSIDE the lock — checking it outside is
how both callers decide to build); and a **build into a temp dir + atomic
swap**, so `build/service` only ever contains a complete tree. The lock cannot
help with the second: an interrupted build's writer is gone, not concurrent, and
what it had written so far stays there looking like a build. `if-stale` is the
entry point for the harness, `build` for an unconditional rebuild.

Two things measured while building that, both worth keeping:

- **Two concurrent bare builds did NOT reliably corrupt anything** — one attempt
  with a 5 s stagger left an intact tree, because adapter-node's copy phase is
  short and the two missed each other. That is consistent with it taking three
  people in one day to hit; it is a narrow window, not a certainty. The
  _interrupted_ build reproduces every time, which is why the atomic swap is the
  half with a deterministic proof: killed at the instant
  `build/service/index.js` was gone, the tree was left with no entry point;
  through the helper that window **never opens at all**, and a build killed 40 s
  in leaves `build/service` with the same inode it had before.
- ⚠ **A directory rename on the 9p bind mount intermittently answers EPERM**
  (`mv: cannot move '…/build/service' to '…/build/.service-old-352884': Permission denied`),
  and it is NOT open descriptors — the same rename succeeded a minute later with
  the same servers running and nothing open under the tree. The swap therefore
  retries, and rolls the old tree back if the second rename fails, so
  `build/service` is never left missing. Anything else here that renames a
  directory on this mount needs the same treatment.

**6. An empty list is not an answer — say "I could not ask"** (fixed
2026-08-13). The built :8081 server keeps ONE module-scope gRPC channel
(`lib/server/grpc/client.ts`) for its whole life. grpc-js does reconnect, but on
a backoff that grows to a **120 s cap**, and every RPC issued while it waits
fails immediately — so a backend that was down for a few minutes leaves the app
serving errors for up to two more minutes AFTER the backend is demonstrably
healthy. The browse page then rendered **0 events while `grpcurl` returned 8
from the same database.**

That alone was survivable; what cost the hours was the page's own load doing
`.catch(() => ({ hackathons: [] }))`, with a comment calling an empty list "a
calm and truthful thing for a visitor to read during an outage". Calm, yes;
truthful, no — **"the database is empty" and "I cannot reach the backend" became
the same page**, and in a container where every run wipes and reseeds the
database, that is the most expensive confusion available.

Both halves fixed: the channel caps its reconnect backoff at 2 s (a failed
connect on loopback costs nothing), and the load carries `listUnavailable` so
the page says which of the two it is. The regression test is
**`hackathon-e2e/scripts/check-reconnect.sh`** — restart the backend under a
running :8081, assert the browse page lists its events again, _and_ assert that
while the backend is down the page says unavailable rather than empty. Without
that second assertion half the script passes against a page that is lying.

## Named tunnels — the churn above has a root cause, and this removes it

Everything in the next section exists to survive a hostname that changes on
every restart. **A named tunnel is a hostname on a zone you own**, and all three
rigs support one now (`.claude/skills/lib/cf-named-tunnel.sh`, driven by a
gitignored `.claude/skills/cloudflare-tunnel/.env`):

| rig        | hostname var          | tunnel                | origin                  |
| ---------- | --------------------- | --------------------- | ----------------------- |
| the app    | `HACKAGON_HOSTNAME`   | `hackagon`            | `http://caddy:80`       |
| Plausible  | `PLAUSIBLE_HOSTNAME`  | `hackagon-plausible`  | `http://plausible:8000` |
| OpenReplay | `OPENREPLAY_HOSTNAME` | `hackagon-openreplay` | `http://caddy:80`       |

`up.sh` picks named when those credentials exist and quick otherwise, prints
which mode it is in, and **stops the other mode's tunnel** — the OIDC issuer
names ONE hostname, so a second public URL would serve every page and fail every
login, which is the failure that only surfaces when somebody signs in. **Quick
tunnels are untouched and remain the zero-setup path**; `--quick` forces them
and needs no account.

**The re-wiring dance is gone in named mode, and it is the far end that says
so.** A stable hostname makes the second `up.sh --with-auth` write a
byte-identical overlay, so `config-overlay.sh` answers `unchanged` — but an
unchanged FILE is not a correct PROCESS (that stale-process trap has cost three
debugging sessions). `auth-wire.sh` therefore mints a token from the issuer it
just wired and asks the running backend whether it accepts it; only then does it
skip the restart. "Could not ask" restarts, because a skip has to be earned.

**Nothing tracked carries the hostname**, exactly as before: the issuer lives in
`config.local.yaml` through `config-overlay.sh`, and `config_test.go` still
asserts both tracked configs say `localhost`. Caddy needed no change at all —
`Caddyfile.tunnel` binds `:80` for any Host, so the path mux and the `/objects`
Host rewrite apply identically.

⚠ **A Cloudflare API token scopes to a ZONE, not to a hostname.** There is no
per-subdomain grant and no combination of settings that produces one: the
narrowest token for this job can edit **any DNS record in the whole zone**. Do
not describe it as limited to the three subdomains. The tooling supplies the
guard Cloudflare cannot — `cf_dns_point` refuses to replace a record that is not
already a `*.cfargotunnel.com` CNAME (`CF_FORCE_DNS=1` overrides). Minting
steps, permissions, rotation and leak response are in the skill's SKILL.md.

**The token is a SETUP credential.** After the tunnels exist, cloudflared runs
from a per-tunnel credentials file that cannot touch DNS, cannot enumerate the
zone and cannot create anything. A machine that only RUNS a tunnel should hold
`.state/named/<name>/` and no token.

**One local trap worth knowing, because it looks like a broken tunnel.** The LAN
resolver here answers **AAAA-only** for these names on a network with no IPv6
route out: every lookup succeeds, every connection fails in milliseconds.
`auth-wire.sh`'s `/etc/hosts` pin used to be gated on `getent hosts`, which says
YES about a name nothing can reach — it tests REACHABILITY now, and the
readiness probe retries against a DoH-resolved IPv4 edge and, when that works,
says "the tunnel is fine, this machine's resolver is not" instead of reporting a
failure. `curl --resolve <host>:443:<a-cloudflare-v4>` is the manual check.

## The tunnel's auth wiring (why login kept breaking)

`run.sh` unwires the tunnel before a suite — every persona logs in over
localhost, and tokens carrying the tunnel issuer fail every auth setup. It now
**re-wires on EXIT**, so a test run no longer silently logs out the public URL.
The failure was invisible in the worst way: the tunnel kept serving pages, so
only someone actually signing in found out.

**Wiring writes `config.local.yaml`, never the tracked `config.yaml`.** Both
loaders read an optional, gitignored overlay beside the base file — backend
`defaults < config.yaml < config.local.yaml < HACKAGON_* env`, frontend
`config.yaml < config.local.yaml`, deep-merged and validated by the same schema
— so `auth-wire.sh` writes one key and `--restore` is an `rm`. It used to `sed`
the two tracked files and keep `.pretunnel` backups: while wired the working
tree differed from HEAD, and a `git add -A` committed a hostname that dies with
the tunnel. That happened — a dead issuer sat committed for several commits, and
a fresh clone pointed at a tunnel that no longer existed. The guard against a
repeat is a spec in `internal/config/config_test.go` asserting BOTH tracked
configs still say `localhost`; `run.sh` reads the wired URL out of the overlay,
so the overlay's absence is now the "no tunnel" signal.

**That overlay has THREE writers now, and none of them may `rm` it.**
`auth-wire.sh` owns `oidc`; `openreplay-stack/scripts/wire-frontend.sh` owns
`replay` (moved there for the same reason — a wired dev machine used to carry a
`*.trycloudflare.com` ingest hostname in the tracked `config.yaml`);
`plausible-stack/scripts/wire-frontend.sh` owns `plausible`. All go through
`.claude/skills/lib/config-overlay.sh`, which adds and removes ONE top-level key
and deletes the file only when the last key leaves it. A whole-file `rm` is
invisible in both directions: dropping `replay` stops recording, and an empty
OpenReplay UI already looks like the correct default; dropping `oidc` leaves the
tunnel serving every page and breaks only login. The second is not hypothetical
— `run.sh` calls `auth-wire.sh --restore` on the way into every suite run, so an
`rm` there would unwire replay before the openreplay suite could read it.
**Anything that READS the replay config must read the merged view**
(`tests/openreplay/capture.ts` does): a reader looking only at `config.yaml`
finds `enabled` absent on a well-wired machine, every spec in that folder
self-skips, and the suite reports green having tested nothing.

**The consent banner used to be a lid on the bottom of every page — fixed
2026-08-10, and the workaround it forced is gone with it.** It was
`fixed bottom-0 z-[60]`, which takes NO space in the document, so it sat on
whatever was at the bottom of the viewport and swallowed clicks aimed at it with
nowhere to scroll them to: `act0.about.publish` clicks the CMS `visible`
checkbox, Playwright retried for the full 60 s against
`<div role="region" aria-label="Session recording"> intercepts pointer events`,
and the journey died on its 10th action with 338 not run. **Smoke passed the
same wiring** — whether a page trips over a banner drawn on top of it depends
entirely on where that page's controls sit.

It is `sticky bottom-0` now: last in the document, so it pins to the viewport
while there is page below it and settles into its own space at the end. That
makes the reserved space exactly its own height at every width and however many
lines the sentence wraps to — no hard-coded spacer, no measuring script (it
still works with JS off). `helpers/reflow.ts:expectConsentBannerClearsContent`
pins BOTH halves at 8 widths across every route: fully on screen at the top of
the page, and covering nothing operable with the document scrolled to its end.
Against the `fixed` version it failed at all six chrome widths, naming the
footer's Privacy/Terms/About/GitHub links.

**The new assertion immediately found a SECOND instance, on 21 routes.**
Reserving space in the document does nothing for chrome anchored to the
VIEWPORT: `HackathonSidebar` is `sticky top-14 h-[calc(100vh-3.5rem)]`, so it
reaches the bottom of the screen at every scroll position and its last four
entries — Manage Pages, Prizes, Deadlines, Manage Forms — sat under the banner
with **no scroll position that freed them**. Scrolling frees page content; it
can never free a viewport-pinned column. That one cannot be solved in CSS alone
(no element can ask another how tall it is), so the banner publishes its
measured height as `--consent-banner-h` and the sidebar takes
`pb-[var(--consent-banner-h,0px)]` — padding, not a shorter box, so the nav's
own `overflow-y-auto` scrollport is what shrinks. Measured, never hard-coded:
`bind:offsetHeight` is a ResizeObserver, so a resize or a copy edit moves it
(`offsetHeight`, because `clientHeight` omits the 1px `border-t` — and a 1px
overlap sits inside the check's rounding tolerance, i.e. it would be wrong in
the one way nothing would report). With no JS the fallback is `0px` — the ask
still works and the document still scrolls clear; only that inset needs a
script.

`run.sh` therefore **no longer borrows the `replay` block away** for other
suites — do not reintroduce that. The tracker is consent-gated (the server
withholds the ingest endpoint and the project key until a browser clicks "Allow
recording", which no suite but `openreplay` does), so a wired block changes
exactly one thing for the others: the ask is on screen, exactly as it is for
every first-time visitor. What run.sh does now is the OPPOSITE for the `mobile`
suite — it ADDS a no-ingest `replay` block when none is wired, because that
sweep asserts about the banner and an assertion whose subject is absent verifies
nothing.

**The tunnel has its own upstream port.** `--prod` used to park the adapter-node
build on **:8081**, vite's port, so `run.sh` had to evict it for the duration of
a suite and put it back on exit — and during each handover nothing was
listening, so caddy answered the public link with **502 for ~40s on every test
run**. The built server lives on **:8082** now and `Caddyfile.tunnel` tries
`dev:8082` then falls back to `dev:8081` (`lb_policy first` + passive health
check), so prod and vite coexist, plain non-prod tunnels still work, and
`run.sh` has no prod-mode guard at all — only the auth re-wire trap. Reload that
config with
`docker compose … exec caddy caddy reload --config /etc/caddy/Caddyfile`;
`up -d` would recreate `dev` and kill the stack. The remaining trade: the built
server reads `config.yaml` once at boot, so during a run the public URL keeps
SERVING but new logins through it fail until the exit re-wire restarts it.

**That fallback is only correct when :8081 is vite, and caddy cannot tell**
(fixed 2026-08-10). vite derives the request origin from the Host header, so it
answers a tunnel hostname correctly. The adapter-node build does not — it is
launched with a FIXED `ORIGIN`, and the harness always uses
`http://localhost:8081` (`prod-frontend.sh`, which **`wait-ready.sh` starts on
every run**, so every machine that has ever run a suite or `start.sh` is in this
state). Caddy served it happily under the tunnel hostname; SvelteKit then 403s
every form POST whose `Origin` is not its `ORIGIN`, so the public URL rendered
every page and **"Log in" did nothing**, and `start.sh --tunnel`'s login proof
timed out with nothing in any log naming the cause. That server had also read
its OIDC issuer once at boot, before the tunnel was wired, so it was stale twice
over.

`cloudflare-tunnel/scripts/up.sh` now calls **`prod-serve.sh ensure <url>`** on
every hackagon-stack tunnel (not just `--prod`): it starts a correct-origin
:8082 only when a fixed-origin server holds :8081, leaves a vite fallback alone
— it is the reason the fallback exists — and **exits non-zero rather than hand
over a link it knows is broken**. `prod-serve.sh status` names :8081's `ORIGIN`
for the same reason. The alternatives were worse: unsetting `ORIGIN` on the
harness's server makes adapter-node default the protocol to `https`, which fails
the same CSRF check from the other side on `http://localhost:8081` (caddy
deliberately does not forward `X-Forwarded-Proto` to the frontend, so there is
no header to read), leaves `AUTH_URL` on localhost, and does nothing about the
stale issuer; and dropping the fallback from `Caddyfile.tunnel` would break the
plain vite tunnel, which is a supported mode.

`devcontainer-up/scripts/start.sh` is the one-command path — container → stack →
(optionally) tunnel with auth — and it finishes by driving a real login
round-trip, because serving HTML proves nothing about OIDC.

**A container keeps its boot-time config forever, and the file on disk lies
about what is running.** `caddy` reads `Caddyfile.tunnel` once, when its
container starts. `docker compose up -d caddy` does not re-read it for a running
container, and recreating it is not available here (trap 2 — it can take `dev`
and the whole stack with it). So a correct, committed Caddyfile can sit next to
a running config that does not match it, for as long as that container lives.

That shipped a real outage. The `/objects` route's
`header_up Host {upstream_hostport}` — REQUIRED, because SigV4 signs the Host
and the store recomputes the signature over whatever arrives — was present and
correct in the file and **absent from the running config**. Every presigned
UPLOAD through the public URL answered `403 SignatureDoesNotMatch`; nothing else
did, because public reads are unsigned. The symptom reaching a person was
"Storage rejected the upload (403)" on an app whose every page and image worked.

`cloudflare-tunnel/scripts/up.sh` now calls `ensure_caddy_config`: reload, then
**ask the admin API what is live** (`localhost:2019/config/`) and warn when the
`/objects` route has no Host rewrite. Checking the file would have proven
nothing — the file was already right. (`MSYS_NO_PATHCONV=1` on that reload: from
Git Bash, `/etc/caddy/Caddyfile` is rewritten to
`C:/Program Files/Git/etc/caddy/Caddyfile` before docker sees it.)

`tests/tunnel/upload.spec.ts` is the independent check, and its existence is the
lesson: **`smoke/16-image-upload` passed throughout, because it uploads over
localhost.** A suite that only ever exercises the local path cannot see a fault
that lives in a proxy only the public path traverses. The spec was verified by
stripping the rewrite from the running config and watching it fail with the
user's exact 403.

Two hypotheses were wrong on the way, both worth not re-running: signed
`content-length` being re-chunked away by a proxy (it survives caddy AND
Cloudflare — measured), and the browser converting to WebP after presigning
(`uploadImage` converts first). A 403 from the store is a signed header being
rewritten in flight, and it has always been the Host.

⚠ **Do not forward `X-Forwarded-Proto: https` to the frontend** in
`Caddyfile.tunnel` (Keycloak's route needs it; the frontend's must not have it).
Auth.js picks its cookie NAMES from the scheme it believes it is on, and the
vite dev server does not apply the header to `event.url` — so it wrote the
session as `authjs.session-token`, then looked for
`__Secure-authjs.session-token` and found nothing. Login dead-ended back on the
public page with tokens successfully issued. The frontend infers the public
scheme itself in `src/routes/+layout.server.ts` for the absolute URLs link
previews need.

## Quick start

```bash
bash .claude/skills/devcontainer-up/scripts/up.sh      # container up + ready
bash .claude/skills/devcontainer-up/scripts/e2e.sh smoke
bash .claude/skills/devcontainer-up/scripts/e2e.sh journey
bash .claude/skills/hackathon-e2e/scripts/run.sh journey --until-act 5   # freeze mid-story
```

Session-replay privacy proof (needs the openreplay rig up and the app wired at
it — the suite self-skips otherwise, so running it without the rig costs nothing
and claims nothing):

```bash
bash .claude/skills/openreplay-stack/scripts/up.sh   # creates the admin account itself (.secrets.env)
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh
bash .claude/skills/hackathon-e2e/scripts/run.sh openreplay
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh --restore
```

Audience measurement (page views per SCREEN, cookieless, no URL ever sent — the
privacy decisions are in `docs/frontend/analytics.md`):

```bash
bash .claude/skills/plausible-stack/scripts/up.sh              # instance + its own tunnel, no prompts
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh
bash .claude/skills/plausible-stack/scripts/verify.sh          # real browser → Plausible's own Stats API
bash .claude/skills/plausible-stack/scripts/wire-frontend.sh --restore
```

Public URL with working login (see the cloudflare-tunnel skill):

```bash
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth   # stack must be up first
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth --quick   # force an ephemeral URL
bash .claude/skills/cloudflare-tunnel/scripts/down.sh             # also un-wires OIDC
bash .claude/skills/lib/cf-named-tunnel.sh check                  # credentials + zone only
bash .claude/skills/lib/cf-named-tunnel.sh status                 # which named tunnels run
```

Quick-tunnel URLs are ephemeral, so `--with-auth` re-points the frontend and
backend issuers at each new URL. **While wired, localhost logins fail** (their
tokens carry the wrong issuer) — that is expected, `down.sh` restores it. Suite
runs restore it too, so re-run `--with-auth` after any smoke/journey run. With a
NAMED hostname that re-run is a no-op: same hostname, same overlay, no restart.

`tests/tunnel/*.spec.ts` derive the public host from `TUNNEL_BASE_URL`
(`tests/tunnel/host.ts`) rather than matching `trycloudflare.com`. The literal
was correct while quick tunnels were the only public path and became a lie the
day a named hostname worked — every wait would have timed out against a URL that
was serving perfectly, reading as "login is broken through the tunnel".

Dev credentials: all cast members use password `aliceandbob`; Keycloak admin is
`admin`/`admin`. The extras crowd (`cast.json`) is provisioned by
`scripts/roster.sh`.

Not included in this archive: `node_modules/` (pnpm install), `.state/` (storage
states / capabilities — regenerated per run), `.artifacts/` (reports).
