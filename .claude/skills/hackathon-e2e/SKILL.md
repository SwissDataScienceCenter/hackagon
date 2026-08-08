---
name: hackathon-e2e
description: Deterministic end-to-end testing of the full hackathon lifecycle. Boots the whole stack from scratch (Keycloak, Postgres, backend, frontend), then runs Playwright (Firefox) suites with a 15-person cast — admin, organizer, a 13-strong registration wave, capacity cut-off, waitlist, dropout, day-1 no-show, and a same-day walk-in — plus generated file-upload fixtures and a 309-action recipe (recipe.jsonl) with priority/outcome/gate triage. Runs inside the devcontainer by default (see the devcontainer-up skill). Use when asked to run e2e/browser tests, verify the hackathon lifecycle (publication → registration → teams → event → voting → post-event), smoke-test the platform, or check which lifecycle RPCs the backend implements.
---

# Hackathon lifecycle e2e testing

Everything lives in this directory (`.claude/skills/hackathon-e2e/`) — scripts,
cast, Playwright config, and tests. No source file outside the skill is edited
by a run. It does write outside it: the stack's state is wiped
(`just clean::state`), the frontend is built (`components/frontend/build/`,
logs and pidfile under `.output/run/`), and the `docs` project writes
`docs/flows/` when `DOCS_SHOTS=1`.

## How to run

**Default: inside the devcontainer** (sibling skill `devcontainer-up`):

```bash
bash .claude/skills/devcontainer-up/scripts/up.sh           # once: container ready
bash .claude/skills/devcontainer-up/scripts/e2e.sh smoke    # seeded-fixture suite
bash .claude/skills/devcontainer-up/scripts/e2e.sh journey  # full lifecycle recipe
```

Direct (any Linux/WSL shell with the repo checked out — scripts re-exec inside
the Nix dev shell automatically):

```bash
bash .claude/skills/hackathon-e2e/scripts/run.sh [smoke|journey|all|mobile|openreplay] \
     [--headed] [--grep <p>] [--no-reset] [--until-act <n>]
```

**Mobile battery**: `run.sh mobile` runs every surface (public home + event
page, dashboard, all member tabs, manage/users) at a 390×844 phone viewport —
asserting no horizontal overflow and no broken images — and drops a full-page
screenshot per page into `.artifacts/mobile/` for visual review. Fresh runs
seed the fixture; `--no-reset` runs it over whatever world is live (e.g. a
journey frozen at some act).

**Freeze the world at a phase**: `run.sh journey --until-act 4` plays the
story up to (and including) act 4 and leaves the stack in exactly that state
— browse it at http://localhost:8081, or publicly via the sibling
`cloudflare-tunnel` skill (`up.sh` for anonymous viewing, `up.sh --with-auth`
for logged-in browsing through the tunnel) to inspect any page
mid-lifecycle. Acts: 0 platform setup, 1 publication, 2 registration,
3 proposals, 4 teams, 5 roster cut, 6 event days, 7 voting, 8 post-event.
(`--until-act` compares against each action's `act`, so act 0 always plays.)

**Tunnel login proof**: `tests/tunnel/login.spec.ts` (project `tunnel`)
drives a real login through the public tunnel URL — Keycloak on the same
hostname, then an authenticated dashboard load. Needs a login-capable tunnel
up first; the spec self-skips without `TUNNEL_BASE_URL`:

```bash
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth
TUNNEL_BASE_URL=https://<X>.trycloudflare.com pnpm exec playwright test --project=tunnel
```

**Session-replay privacy proof**: `run.sh openreplay` seeds the same fixture as
smoke and runs `tests/openreplay/` — 7 tests that count BYTES ON THE WIRE
rather than reading a flag back. It needs a live OpenReplay (sibling skill
`openreplay-stack`) and `replay.enabled: true` in the frontend config; it
self-skips otherwise, and it is deliberately not part of `all`.

Each run is **deterministic by default**: stop stack → wipe Postgres+Keycloak
(`just clean::state`) → boot via process-compose → wait for readiness →
seed (smoke/openreplay) / provision the extras roster (journey) → probe backend
capabilities → Playwright on Firefox. The stack is left running afterwards
(`just down` to stop). `pnpm install` and the Firefox download happen
automatically on first run.

**The harness serves the frontend itself.** `wait-ready.sh` unconditionally
stops process-compose's `vite dev` and starts the adapter-node build on
`:8081` (`scripts/prod-frontend.sh`). Regenerating protos rewrites ~260 files
under `src/lib/server/grpc/generated/`, which invalidates that much of vite's
transform cache; `src/` is on the 9p bind mount, so the first SSR request took
**five minutes** (measured 2026-08-08) and process-compose's readiness probe
killed the process mid-warm-up — the log says
`readiness check fail - signal: killed`, which reads like a crash and is not
one. The built output has no transform step: smoke drops from 3.0 m to 1.4 m.

"Unconditionally" is the load-bearing word. The earlier guard — *leave it alone
if anything answers within 5 s* — handed the run to a cold vite whenever it
happened to reply in time, and left vite holding `[::1]:8081` against the built
server whenever it did not, so the identical command passed for one suite and
failed for the next. `:8081` and not `:8082` because Keycloak's `hackagon-dev`
client only allows redirect URIs on 8081; `:8082` belongs to the
cloudflare-tunnel skill's own built server, which is why everything here is
scoped to servers launched with `PORT=8081` — a blanket
`pkill -f build/service/index.js` also killed the tunnel's upstream, and nothing
ever restarted it.

## The cast (15 people)

Four **principals** (checked-in dev realm, browser sessions + API):

| Persona | Role in the story |
| --- | --- |
| `hackagon-admin` | Global admin/organizer — publishes, approves, removes, edits dates |
| `alice` | Organizer-to-be; approved participant in the journey |
| `bob` | The spotlight participant — every UI outcome is asserted through his eyes |
| `charles` | The unlucky one — registers, never gets off the waitlist |

Eleven **extras** (`cast.json` — Dana Moser, Erik Lindqvist, Fatima Khoury,
Giulia Ricci, Hiro Tanaka, Ines Duarte, Jonas Weber, Katya Volkova, Liam
O'Brien, Mei Chen, and **Noor Haddad, the same-day walk-in** who skips the
act-2 wave and registers at the door in act 6), provisioned idempotently into
Keycloak by `scripts/roster.sh` (admin REST API). They self-register through
the same `UserService.Register` RPC the frontend uses and act via the API with
real tokens, so RBAC is exercised for all of them. The capacity screenplay
lives in `personas.ts` (`JOURNEY_CAST`): **13 registrations, capacity 8, one
dropout, one backfill, one no-show, one walk-in — final roster 13 (9
confirmed, 4 waitlisted), 8 of 9 confirmed in teams.**

## The suites

Playwright projects, all Firefox, all serial (`workers: 1`, `retries: 0`).
`setup` is a dependency of every suite except `tunnel`; it logs each principal
in through the real Keycloak flow and saves a storage state.

| Project | Database | Size (last green run) |
| --- | --- | --- |
| `smoke` | seed fixture (`just db::seed`) | 76 tests across 16 spec files — **80 passed** with setup (2026-08-08) |
| `journey` | **empty**, never seeded | 308 recipe actions — **312 passed / 0 failed / 0 skipped** with setup (2026-08-08) |
| `mobile` | seed fixture (fresh runs) | 14 tests at 390×844 (2026-08-05) |
| `openreplay` | seed fixture | 7 tests — **11 passed** with setup (2026-08-08); self-skips without a live rig |
| `tunnel` | whatever is live | 5 tests; self-skip without `TUNNEL_BASE_URL` |
| `docs` | seed fixture | 1 test; self-skips without `DOCS_SHOTS=1` (writes `docs/flows/`) |

**smoke** — snapshot mode. Verifies what each principal can see and do: public
vs private listing for anonymous visitors, login, dashboard contents +
membership badges, the full persona × hackathon member-view access matrix
(200/403/404), list views, the CMS pages, global-role and co-organizer grants,
nav centring, and a media upload that is read back. Plus the **new-user
funnel** (`05-new-user-funnel.spec.ts`): Keycloak self-registration →
auto-login → backend auto-registration → the dashboard Join button →
Waitlisted badge. Its actor is `SELF_REGISTRANT` in `personas.ts` —
deliberately outside `PERSONAS` and never provisioned by the realm import or
`roster.sh`, because walking through the signup form is the point.

**journey** — the **full lifecycle as a data-driven screenplay**:
`recipe.jsonl`, one JSON action per line, executed strictly in order by
`tests/journey/recipe.spec.ts` via the engine in `helpers/recipe.ts`. The
recipe covers the complete hackathon **including voting** — **309 action
lines** across acts 0–8 — interleaving the participant story with a realistic
mess of life:

- **Filled-in forms that conform to the admin's schema**: 9 registration-form
  responses use exactly the keys defined in act1.config.regform (affiliation/
  skills/diet/avatar-link + conduct/photos consents — Giulia declines photo
  consent, which must flow to act-8 publication), plus two validation
  negatives (missing required consent, unknown field) and Noor's paper form
  digitized by the admin (`onBehalfOf`). Submission payloads carry the
  subform keys (repo/demo/slides/summary); slides is `file-or-url`, and the
  recipe exercises the link form. A blob store exists now (`StorageService`),
  but the registration form still asks people for a LINK to their picture —
  there is no avatar upload field.

- **Everyone confirmed gets a team seat** (act 4): Matterhorn = bob, alice,
  hiro, ines; Bernina = dana, erik, giulia, fatima — and team composition
  cascades with the roster: fatima's dropout clears her Bernina seat, backfill
  jonas takes it.
- **Day-1 check-in reality** (act 6): hiro is a NO-SHOW ("see you there!" and
  never appears) — his Matterhorn seat is cleared but he stays a confirmed
  participant; **walk-in** Noor Haddad (cast.json's 11th extra, not in the
  act-2 wave) creates an account at the door, admin overrides the closed
  registration window, approves her on the spot and slots her into the
  no-show's seat. Roster: 13 on the list, 9 confirmed, 4 waitlisted.

- **Per-event configuration (act 1, `ConfigService`)**: custom registration
  form + consents, submission form, voting policy, email templates, branding,
  and time windows — pinned as ONE configuration-engine design decision.
- **Time-window enforcement + manual override**: early/late registration,
  post-deadline preferences and submissions all bounce (`FailedPrecondition`,
  array-gated on ConfigService.SetWindows + the acting RPC); the admin
  extends the submission window by 30 minutes (`OverrideWindow`) and the
  grace-period submission is accepted. Note: window fields must time-travel
  together with the event dates.
- **Ballots that are not just a tick** (act 7): five categories — three
  single-choice, one RANKED, one POINTS with a 10-point budget. The negatives
  are the point: a ranked ballot that skips rank 2 or names one project twice
  is refused, a single-choice ballot cast into the ranked category is refused,
  and a points ballot over budget is refused. `SuggestResults` computes the
  Borda and points tallies.
- **Co-organizers** (act 5): the admin promotes Alice with `AddOwner`; a mere
  member and a waitlisted person are both denied; an organizer cannot demote
  themselves and the LAST organizer cannot be demoted at all.
- **The `HackathonState` façade** (act 5): the organizer flips capabilities
  through main's boolean contract, a member cannot, and the switch goes back.
- **Media, uploaded for real** (act 8): the organizer presigns a gallery photo
  upload, a member is denied one, and an SVG is refused outright.
- **Prize governance (`PrizeService`)**: prize table defined at publication;
  after the vote the **admin has the final voice** — results are advisory until
  `Finalize`; prizes stay admin-editable afterwards (sponsor credit edit) and
  members are denied.
- **Admin "meanwhile" actions throughout** (138 of the 309 are the admin's):
  identity checks, watching registrations arrive mid-wave, user-management
  chains, a maintenance unlist/relist cycle, audit snapshots, live
  announcements, logo refresh, post-event cleanup.
- **Edit cycles**: name typo published → noticed → fixed; reschedule; venue
  change; description announcements; proposal/preference/team/submission edits.
- **Deletions & churn**: withdrawn proposal, created-then-deleted placeholder
  team, participant removal (dropout), obsolete page cleanup, draft-event
  deletion, and two never-approved registrants deleting their platform
  profiles post-event (`UserService.DeleteAccount`).
- **Finale**: winners announced, photos page, and a final wrap-up blog entry
  published by the admin.
- **Abandoned/incomplete actions**: a login form filled halfway and left, a
  wrong-password recovery chain, a participant search typed and abandoned,
  an unfinalized scratch submission.
- **Malformed/ghost negatives**: bad UUIDs → InvalidArgument, ghosts →
  NotFound, double-approve idempotency, and permission negatives for every
  privileged mutation. Anonymous callers get `Unauthenticated`, not
  `PermissionDenied` — a status code is an answer, and "who are you" and "not
  you" are different answers.

| Act | Timeline | Actions | What it covers |
| --- | --- | --- | --- |
| 0 | before any event | 15 | platform setup: the admin drafts the About site page, the draft stays invisible, an organizer is denied (site pages need the *global* Admin role), publish makes it world-readable, duplicate/invalid slugs rejected, a pasted `<script>` must not execute |
| 1 | T-4mo publication | 42 | publish (generated PNG logo, capacity announcement), round-trip check, config block (forms/consents/voting policy/emails/branding/windows), prize table, typo-edit-fix cycle, reschedule, venue change, private draft, browse + abandoned-login + wrong-password chains, rogue create/edit denied, pages + tracks |
| 2 | T-3mo registration | 51 | 13 named sign-ups → all waitlisted, 9 schema-conformant form responses + 2 validation negatives, read-back / correction / privacy-snoop on the answers, mid-wave admin roster check, unlist/relist cycle, manage-users chains, malformed/ghost joins, anxious-recheck chain |
| 3 | T-2mo proposals | 13 | 5 proposals across tracks, 2 approved, withdrawal, edit, anonymous/rogue/ghost negatives, projects-page check |
| 4 | T-1.5/1mo teams + webinars | 29 | preferences (+re-rank), export, 2 teams + placeholder create/delete, assignments incl. rebalancing, full seating (everyone confirmed), teams-page check, webinar page |
| 5 | T-1wk registration closes | 48 | approve 8 of 13 (+idempotent double), member tours, dropout loses access + team seat cleared, backfill takes the seat, co-organizer promote/demote, the state façade, window-closed and ghost/malformed negatives, audit snapshot |
| 6 | T0/T+1 event days | 43 | status → Active, **no-show seat cleared**, **walk-in Noor: register→override→join→approve→team**, phases, day-boundary sign-out/return, announcements, logo refresh, fixtures + submissions (draft→edit→final), deadline negatives + 30-min admin override, roster 13/9/4 |
| 7 | T+1 voting & awards | 37 | 5 categories (single-choice, ranked, points), 13 member ballots incl. the walk-in, waitlisted/organizer denied, malformed-ballot negatives, double-vote + late-vote rejected, close, tallies, **admin finalizes prizes (final voice)** |
| 8 | T+1wk post-event | 31 | status → Finished, late join rejected, member/waitlisted archive chains, thanks + winners edit, prize edit + rogue denied, gallery uploads, photos page + **wrap-up blog**, page/draft cleanup, **profile churn (2 account deletions + verification)** |

**Triage fields.** Every action carries `priority` (`P1` runs today — 215
actions; `P2` next wave — 85; `P3` later — 9) and `outcome`, a human-readable
expected outcome derived from that action's machine assertions. `implement`
still exists in the schema but **no action currently sets it to `false`**:
nothing in the recipe is deferred any more. 24 actions carry an explicit
`gate`, 24 carry a `todo`.

**Recipe semantics**: an action with a `todo` is a placeholder — it **skips**
while its `method` (or `gate`) probes as unimplemented and starts running the
day the backend lands it, with the `todo` text as the skip reason. Steps that
`save` response values (ids) feed later steps via `{{var:NAME}}`; if a producer
skipped, dependents cascade-skip cleanly. Other tokens: `{{hackathonId}}`,
`{{userId:username}}`, `{{now±Nd}}`, `{{logoDataUri}}`. Action types: `rpc`
(254 — gRPC as any cast member), `ui.assert` (27 — named browser assertion),
`ui.flow` (27 — chained navigation: home → click → member view → tab → back,
including fresh-login chains), and `files.generate` (1 — upload fixture
bundle).

⚠ **`loadRecipe()` drops any line with a `comment` key**, which is how act
banners are filtered out — and it does not check for an `id` first. One action
(`act8.flow.bob`) carries a trailing `comment` explaining its position and is
therefore silently never executed: 309 lines in the file, 308 tests in a run.
Put explanatory prose in `outcome` or `todo`, never in `comment`, on a line
that has an `id`.

## File-upload fixtures

`helpers/files.ts` generates **deterministic files on the fly, dependency-free
and offline**: a PNG team-logo identicon (hand-rolled encoder: IHDR/IDAT/IEND
+ CRC32 + node:zlib), an SVG poster, a single-page PDF report (hand-assembled
xref), a CSV sensor-data sample, and a README — same seed ⇒ byte-identical
output. Act 6 pins magic bytes and determinism and writes the bundle to
`.state/uploads/team-matterhorn/`. Act 1 pushes a generated PNG through the API
as the hackathon logo (data URI) and asserts the round-trip.

Real object-store uploads are proved elsewhere, and deliberately not with these
fixtures: `tests/smoke/15-media-upload.spec.ts` drives the page editor's upload
control with an inline 1×1 PNG and then **fetches the URL back**. A presign that
returns a URL proves nothing — a bug in this exact path once stored images as
`application/x-www-form-urlencoded` and uploaded no bytes at all while
reporting success.

Optional garnish: `scripts/fetch-cc-assets.sh` pulls two well-known
Creative-Commons/PD files from Wikimedia Commons (checksums recorded
trust-on-first-use, attribution written to
`.state/uploads/cc/ATTRIBUTION.md`). Never a test dependency — generated
fixtures are the default because they need no network and cannot drift.

## Key design decisions (read before changing things)

- **Reset-to-zero**: realm re-imports from the checked-in JSON; the casbin
  admin role re-bootstraps from backend config — `hackagon-admin` works on an
  empty DB.
- **Time travel by moving the event, not the clock**: `HackathonStatus` is
  computed server-side from `starts_at`/`ends_at`, so acts 6/8 shift the dates
  via the Edit RPC (clock faking would fight JWTs/Keycloak).
  `scripts/timeshift.sh <uuid> <days>` does it manually.
- **Capability gating**: `scripts/probe.sh` probes 64 lifecycle RPCs and writes
  `.state/capabilities.json` via **unauthenticated** calls (enforce-first
  handlers reject before touching the DB; missing ones return
  `Unimplemented`). Gated acts self-skip; when an RPC lands they un-skip and
  **fail on purpose** with scripting instructions — test-with-feature,
  enforced mechanically. `runRpc` **throws** on a gate that is not in `METHODS`:
  `implemented()` cannot tell "the backend returned Unimplemented" from "nobody
  ever asked" — both are falsy — so an action gated on an unprobed RPC would
  self-skip forever behind a growing green number.
- **API-driven acts, UI-asserted outcomes**: mutations without UI run through
  `helpers/api.ts` (grpcurl + real Keycloak tokens); outcomes are asserted in
  Firefox where the UI is real (badges, listings, 403s, the About text).
- **Serial, no retries** (`workers: 1`, `retries: 0`): a stateful recipe can't
  retry mid-way; the retry unit is a whole run. Acts share state through
  `.state/journey.json` (user ids keyed by username).

## Layout

```
recipe.jsonl              THE SCREENPLAY: one action per line, full lifecycle incl. voting,
                          each with priority/outcome/gate triage fields
recipe-player.html        self-contained animated replay of the recipe (also published
                          as an artifact); rebuild after recipe edits by re-splicing the
                          JSONL between the <script id="recipe-data"> markers
personas.ts               principals + seed matrix + JOURNEY_CAST constants
cast.json                 the 11 extras (incl. the walk-in) (names, emails, shared dev password)
playwright.config.ts      Firefox-only; setup/smoke/journey/mobile/docs/tunnel/openreplay projects
helpers/recipe.ts         the recipe engine (rpc / ui.assert / ui.flow / files.generate)
helpers/                  api, capabilities, discover, files, login, state, ui
tests/auth.setup.ts       per-principal Keycloak login -> .state/<persona>.json
tests/smoke/              01-anonymous … 15-media-upload (16 files, 76 tests)
tests/journey/recipe.spec.ts  executes recipe.jsonl in order
tests/mobile/             phone-viewport battery (overflow + broken-image checks, screenshots)
tests/openreplay/         session-replay privacy: consent, masking, Do Not Track
tests/tunnel/             login proof + admin/theme screenshots through a --with-auth tunnel
tests/docs/flows.spec.ts  writes docs/flows/*.webp (needs DOCS_SHOTS=1)

scripts/run.sh            orchestrator (reset -> up -> ready -> seed|roster -> probe -> test)
scripts/reset.sh          stop the stack, wipe Postgres+Keycloak state, drop .state/journey.json
scripts/up.sh             just deploy::up (process-compose, detached)
scripts/wait-ready.sh     block until pg/keycloak/backend answer, then serve the BUILT frontend
scripts/prod-frontend.sh  start|stop|ensure the adapter-node build on :8081 (replaces vite)
scripts/seed.sh           just db::seed + restart the backend (casbin does not reload)
scripts/roster.sh         provision extras into Keycloak (idempotent)
scripts/probe.sh          backend capability probe (64 methods) -> .state/capabilities.json
scripts/timeshift.sh      shift a hackathon's dates by N days (manual time travel)
scripts/fetch-cc-assets.sh  optional CC sample photos (Wikimedia Commons + attribution)
scripts/journal-to-recipe.sh  captured RPC journal -> DRAFT recipe actions (.mjs does the work)
scripts/lib.sh            shared: re-exec inside the Nix dev shell, URLs, wait_for
.state/                   gitignored: storage states, capabilities, uploads
.artifacts/               gitignored: HTML report, results.json, screenshots, run logs
```

## Seeding the recipe from real traffic

The backend can journal every gRPC call in this recipe's own shape — actor,
method, params, expect — so actions can be derived from what people actually
do. It is OFF by default; `docs/backend/rpc-journal.md` states exactly what it
records (allowlisted structural params only; no IP, no user agent, no free
text, no Keycloak ID) and how to turn it on.

```bash
bash .claude/skills/hackathon-e2e/scripts/journal-to-recipe.sh --dedupe --out draft.jsonl
```

It templates ids the way the recipe does ({{hackathonId}}, {{var:NAME}},
{{userId:alice}}) and leaves `id`/`title`/`outcome`/`priority`/`act`/`t`
blank on purpose — a generated outcome that reads plausible but was never
thought about is worse than a blank one. **A journal seeds a recipe; it does
not write one.** It captures traffic, not intent: the deliberate denials this
recipe is largely made of look like ordinary failures in a log.

## Extending

- **Add/modify lifecycle steps**: edit `recipe.jsonl` — never this repo's
  code. Keep placeholder actions (with their `todo`) instead of deleting
  them; the recipe is meant to describe the FULL hackathon at all times.
- **A TODO action woke up and fails**: the backend landed its RPC — align the
  guessed field names in that line's `params` with the final proto (the
  `todo` says what to check), then delete the `todo`.
- **A UI check skips as "not implemented"**: the page now renders real data —
  add the named assertion to `UI_ASSERTS` in `helpers/recipe.ts` (and result
  checks to `CHECKS`).
- **New lifecycle RPC to track**: add to `METHODS` in `scripts/probe.sh` and
  reference it from the recipe line's `method`. Not optional: an action whose
  `gate` is missing from `METHODS` now throws instead of skipping. Cross-check
  with — every `method`/`gate` in `recipe.jsonl` must appear in `METHODS`.
- **Bigger crowd**: append to `cast.json`, add join/approve/vote lines to
  `recipe.jsonl`, and keep the roster-check numbers in sync.
- **Seed changed**: update `SEED_HACKATHONS`/`SEED_EXPECTATIONS` in
  `personas.ts` (smoke suite only).
- **UI landed for a mutation** (e.g. a real Join button or an upload form):
  convert that `rpc` action into a `ui.flow` (clicks / `setInputFiles` with
  the generated bundle); keep the expectations.

## Troubleshooting

- **Firefox: `libgtk-3.so.0: cannot open shared object file`** → the dev
  container was recreated and lost the apt packages
  `playwright install --with-deps` had added at runtime. They are baked into
  `.devcontainer/Dockerfile` now, so rebuild the image; to unblock without a
  rebuild run `pnpm exec playwright install --with-deps firefox` **from
  `.claude/skills/hackathon-e2e`** (Playwright is a dependency of this skill,
  not of `components/frontend`).
- **Everything 500s / vite hangs on `/src/app.css`** → `node_modules` is on
  the host bind mount. See the container traps in `.claude/CLAUDE.md`;
  `findmnt -no TARGET,FSTYPE | grep node_modules` must say `ext4`.
- **The stack vanished mid-session** → a `docker compose` change to `dev`
  recreates the container, which kills process-compose inside it. Restart with
  `scripts/up.sh` + `scripts/wait-ready.sh`.
- **All journey acts skip** → `.state/capabilities.json` missing/stale: run
  `scripts/probe.sh` (backend must be up).
- **Extras fail to get tokens** → `scripts/roster.sh` didn't run (run.sh runs
  it for the journey suite automatically; it needs Keycloak up).
- **Firefox fails to launch** → `pnpm exec playwright install --with-deps
  firefox` (sudo/apt — fine in the devcontainer; on NixOS use
  `playwright-driver.browsers`).
- **frontend never ready**, or `EADDRINUSE: address already in use ::1:8081`
  → a `vite dev` is still holding the port against the built server. Note that
  `just deploy::down` only frees :8180 and :3000, so vite can outlive its
  supervisor; `scripts/prod-frontend.sh stop` then `ensure` is the fix, and
  `reset.sh` already does the stop.
- **The openreplay suite skips everything** → `replay.enabled` is false in the
  frontend config. Wire it with
  `openreplay-stack/scripts/wire-frontend.sh`, which bounces BOTH the
  process-compose frontend and this skill's built server (the built one reads
  `config.yaml` once at boot, so restarting only the other prints "restarted"
  and changes nothing).
- **A recipe action self-skips forever** → its `gate` is not in `probe.sh`'s
  `METHODS`. This throws now rather than skipping; if you see the skip, the
  probe file is stale — re-run `scripts/probe.sh`.
- **Windows host** → use the devcontainer-up skill; don't run the stack
  natively. If git checks out scripts with CRLF: `git config core.autocrlf
  input` and re-checkout.
