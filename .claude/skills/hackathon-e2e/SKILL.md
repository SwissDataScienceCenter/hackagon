---
name: hackathon-e2e
description: Deterministic end-to-end testing of the full hackathon lifecycle. Boots the whole stack from scratch (Keycloak, Postgres, backend, frontend), then runs Playwright (Firefox) suites with a 15-person cast — admin, organizer, a 13-strong registration wave, capacity cut-off, waitlist, dropout, day-1 no-show, and a same-day walk-in — plus generated file-upload fixtures and a 256-action recipe (recipe.jsonl) with priority/implement/outcome triage. Runs inside the devcontainer by default (see the devcontainer-up skill). Use when asked to run e2e/browser tests, verify the hackathon lifecycle (publication → registration → teams → event → voting → post-event), smoke-test the platform, or check which lifecycle RPCs the backend implements.
---

# Hackathon lifecycle e2e testing

Everything lives in this directory (`.claude/skills/hackathon-e2e/`) — scripts,
cast, Playwright config, and tests. Nothing outside the skill is modified.

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
bash .claude/skills/hackathon-e2e/scripts/run.sh [smoke|journey|all] [--headed] [--grep <p>] [--no-reset] [--until-act <n>]
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
mid-lifecycle. Acts: 1 publication, 2 registration, 3 proposals,
4 teams, 5 roster cut, 6 event days, 7 voting, 8 post-event.

**Tunnel login proof**: `tests/tunnel/login.spec.ts` (project `tunnel`)
drives a real login through the public tunnel URL — Keycloak on the same
hostname, then an authenticated dashboard load. Needs a login-capable tunnel
up first; the spec self-skips without `TUNNEL_BASE_URL`:

```bash
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth
TUNNEL_BASE_URL=https://<X>.trycloudflare.com pnpm exec playwright test --project=tunnel
```

Each run is **deterministic by default**: stop stack → wipe Postgres+Keycloak
(`just clean::state`) → boot via process-compose → wait for readiness →
seed (smoke) / provision the extras roster (journey) → probe backend
capabilities → Playwright on Firefox. The stack is left running afterwards
(`just down` to stop). `pnpm install` and the Firefox download happen
automatically on first run.

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

## The two suites

**smoke** — snapshot mode. Seeds the fixture (`just db::seed`) and verifies
what each principal can see and do: public vs private listing for anonymous
visitors, login, dashboard contents + membership badges, and the full
persona × hackathon member-view access matrix (200/403/404). Plus the
**new-user funnel** (`05-new-user-funnel.spec.ts`): Keycloak self-registration
→ auto-login → backend auto-registration → the dashboard Join button →
Waitlisted badge. Its actor is `SELF_REGISTRANT` in `personas.ts` —
deliberately outside `PERSONAS` and never provisioned by the realm import or
`roster.sh`, because walking through the signup form is the point.

**journey** — the **full lifecycle as a data-driven screenplay**:
`recipe.jsonl`, one JSON action per line, executed strictly in order by
`tests/journey/recipe.spec.ts` via the engine in `helpers/recipe.ts`. The
recipe covers the complete hackathon **including voting** — **256 actions**,
interleaving the participant story with a realistic mess of life:

- **Filled-in forms that conform to the admin's schema**: 9 registration-form
  responses use exactly the keys defined in act1.config.regform (affiliation/
  skills/diet/avatar-link + conduct/photos consents — Giulia declines photo
  consent, which must flow to act-8 publication), plus two validation
  negatives (missing required consent, unknown field) and Noor's paper form
  digitized by the admin (`onBehalfOf`). Submission payloads carry the
  subform keys (repo/demo/slides/summary); slides is `file-or-url` — link
  works today, byte upload waits for blob storage. Media decision pinned:
  people provide LINKS to their pictures (no avatar field or blob store
  exists in the platform).

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

- **Per-event configuration (act 1, all TODO-gated on a future ConfigService)**:
  custom registration form + consents, submission form, voting mechanism +
  tie-breaking, email templates, branding, and time windows — pinned as ONE
  configuration-engine design decision.
- **Time-window enforcement + manual override**: early/late registration,
  post-deadline preferences and submissions all bounce (`FailedPrecondition`,
  array-gated on ConfigService.SetWindows + the acting RPC); the admin
  extends the submission window by 30 minutes (`OverrideWindow`) and the
  grace-period submission is accepted. Note: window fields must time-travel
  together with the event dates.
- **Prize governance (PrizeService, TODO-gated)**: prize table defined at
  publication; after the vote the **admin has the final voice** — results
  are advisory until `Finalize`; prizes stay admin-editable afterwards
  (sponsor credit edit) and members are denied.

- **Admin "meanwhile" actions throughout** (80 of them): identity checks,
  watching registrations arrive mid-wave, user-management chains, a
  maintenance unlist/relist cycle, audit snapshots, live announcements, logo
  refresh, post-event cleanup.
- **Edit cycles**: name typo published → noticed → fixed; reschedule; venue
  change; description announcements; proposal/preference/team/submission
  edits (gated).
- **Deletions & churn**: withdrawn proposal, created-then-deleted placeholder
  team, participant removal (dropout), obsolete page cleanup, draft-event
  deletion, and two never-approved registrants deleting their platform
  profiles post-event (`UserService.DeleteAccount`, proto TBD — verification
  gated via the recipe's `gate` field).
- **Finale**: winners announced, photos page, and a final wrap-up blog entry
  published by the admin (PageService, gated).
- **Abandoned/incomplete actions**: a login form filled halfway and left, a
  wrong-password recovery chain, a participant search typed and abandoned,
  the stub Join button dead end, an unfinalized scratch submission.
- **Malformed/ghost negatives**: bad UUIDs → InvalidArgument, ghosts →
  NotFound, double-approve idempotency, and permission negatives for every
  privileged mutation.
- **One pinned UX gap** (marked `TODO(ux)`): signed-in non-members clicking a
  public event land on a 403 (F1/B2 — awaiting the public-visibility
  decision). The /manage/users untranslated 500 is fixed: that action now
  asserts a 403, and the dashboard Join button is real (was an alert stub),
  so acts 1 and 2 exercise the true join flow.

| Act | Timeline | Actions | Status (vs sketch/04-08-26) |
| --- | --- | --- | --- |
| 1 | T-4mo publication | publish (generated PNG logo, capacity announcement), round-trip check, config block (forms/consents/voting policy/emails/branding/windows), prize table, typo-edit-fix cycle, reschedule, venue change, private draft, browse + abandoned-login + wrong-password chains, rogue create/edit denied; pages + tracks | ✅ runs; pages/tracks **landed — unskip**; config/prizes gated |
| 2 | T-3mo registration | 13 named sign-ups → all waitlisted, 9 schema-conformant form responses + 2 validation negatives, mid-wave admin roster check, unlist/relist cycle, manage-users chains, malformed/ghost joins, anxious-recheck chain | ✅ runs; forms gated (P2) |
| 3 | T-2mo proposals | 5 proposals across tracks, 2 approved, withdrawal, edit, anonymous/rogue/ghost negatives, proposals-page check | 🟡 **ProjectService landed — align params & unskip** |
| 4 | T-1.5/1mo teams + webinars | preferences (+re-rank), export, 2 teams + placeholder create/delete, 7 assignments incl. rebalancing, full seating (everyone confirmed), teams-page check, webinar page | 🟡 **TeamService landed — align & unskip**; prefs gated |
| 5 | T-1wk registration closes | approve 8 of 13 (+idempotent double), member tours, dropout loses access + team seat cleared, backfill takes the seat, window-closed negative, ghost/malformed negatives, audit snapshot | ✅ runs; team-seat cascade landed — unskip |
| 6 | T0/T+1 event days | status → Active, **no-show seat cleared**, **walk-in Noor: register→override→join→approve→team**, phases, day-boundary sign-out/return, announcements, logo refresh, fixtures + submissions (draft→edit→final, link+upload cases), deadline negatives + 30-min admin override, roster 13/9/4 | ✅ partly; Phase/Team **landed — unskip**; windows gated |
| 7 | T+1 voting & awards | 3 categories, 13 member ballots incl. walk-in, waitlisted/organizer denied, double-vote + late-vote rejected, close, results → Matterhorn, **admin finalizes prizes (final voice)** | 🟡 **protos + DB tables landed on sketch; handler pending — ⚠ align method names (see below)** |
| 8 | T+1wk post-event | status → Finished, late join rejected, member/waitlisted archive chains, thanks + winners edit, prize edit + rogue denied, photos page + **wrap-up blog**, page/draft cleanup, **profile churn (2 deletions + gated verification)** | ✅ partly; pages landed — unskip; churn deferred |

**Triage fields** (assessed against `sketch/04-08-26`, where Page/Phase/
Track/Project/Team services are implemented + registered, vote protos and
tables landed, and HackathonSettings gates registrations): every action
carries `priority` (`P1` = runs today or its backend just landed — unskip and
align now: 171 actions; `P2` = next wave: vote handler, window enforcement,
forms — 61; `P3` = later — 9), `implement` (`false` = deliberately deferred:
email templates, branding, GDPR deletion verification — 5 actions kept as
documentation only), and `outcome` — a human-readable expected outcome
derived from each action's machine assertions. ⚠ Act 7's vote method names
were guessed before the real proto landed — align them: package is
`vote.VoteService` with `SubmitVote` / `CreateVoteCategory` /
`ListVoteResults` / `ExportVotes`, and there is **no Close RPC** — closing
voting is the `voting_enabled` toggle in HackathonSettings.

**Recipe semantics**: actions with a `todo` are placeholders — they **skip**
while their `method` probes as unimplemented and start running the day the
backend lands it (the `todo` text carries what to verify, e.g. guessed proto
field names). Steps that `save` response values (ids) feed later steps via
`{{var:NAME}}`; if a producer skipped, dependents cascade-skip cleanly. Other
tokens: `{{hackathonId}}`, `{{userId:username}}`, `{{now±Nd}}`,
`{{logoDataUri}}`. Action types: `rpc` (gRPC as any cast member),
`ui.assert` (named browser assertion), `ui.flow` (chained navigation:
home → click → member view → tab → back, including fresh-login chains), and
`files.generate` (upload fixture bundle).

## File-upload fixtures

`helpers/files.ts` generates **deterministic files on the fly, dependency-free
and offline**: a PNG team-logo identicon (hand-rolled encoder: IHDR/IDAT/IEND
+ CRC32 + node:zlib), an SVG poster, a single-page PDF report (hand-assembled
xref), a CSV sensor-data sample, and a README — same seed ⇒ byte-identical
output. Act 6 pins magic bytes and determinism today and writes the bundle to
`.state/uploads/team-matterhorn/`, ready for the gated upload act. Act 1
already pushes a generated PNG through the API as the hackathon logo (data
URI) and asserts the round-trip.

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
- **Capability gating**: `scripts/probe.sh` writes
  `.state/capabilities.json` via **unauthenticated** probes (enforce-first
  handlers reject before touching the DB; missing ones return
  `Unimplemented`). Gated acts self-skip; when an RPC lands they un-skip and
  **fail on purpose** with scripting instructions — test-with-feature,
  enforced mechanically.
- **API-driven acts, UI-asserted outcomes**: mutations without UI run through
  `helpers/api.ts` (grpcurl + real Keycloak tokens); outcomes are asserted in
  Firefox where the UI is real (badges, listings, 403s, the About text).
  Roster counts are asserted via the API because the participants page still
  renders mock data.
- **Serial, no retries** (`workers: 1`, `retries: 0`): a stateful recipe can't
  retry mid-way; the retry unit is a whole run. Acts share state through
  `.state/journey.json` (user ids keyed by username).

## Layout

```
recipe.jsonl              THE SCREENPLAY: one action per line, full lifecycle incl. voting,
                          each with priority/implement/outcome triage fields
recipe-player.html        self-contained animated replay of the recipe (also published
                          as an artifact); rebuild after recipe edits by re-splicing the
                          JSONL between the <script id="recipe-data"> markers
personas.ts               principals + seed matrix + JOURNEY_CAST constants
cast.json                 the 11 extras (incl. the walk-in) (names, emails, shared dev password)
playwright.config.ts      Firefox-only; setup/smoke/journey/mobile/tunnel projects
helpers/recipe.ts         the recipe engine (rpc / ui.assert / ui.flow / files.generate)
helpers/                  login, grpc api, capability gates, file generators, ui locators
tests/auth.setup.ts       per-principal Keycloak login -> .state/<persona>.json
tests/smoke/              01-anonymous 02-login 03-dashboard 04-access-control
tests/journey/recipe.spec.ts  executes recipe.jsonl in order
tests/mobile/             phone-viewport battery (overflow + broken-image checks, screenshots)
tests/tunnel/login.spec.ts    login proof through a --with-auth quick tunnel
scripts/run.sh            orchestrator (reset -> up -> ready -> seed|roster -> probe -> test)
scripts/roster.sh         provision extras into Keycloak (idempotent)
scripts/probe.sh          backend capability probe -> .state/capabilities.json
scripts/timeshift.sh      shift a hackathon's dates by N days (manual time travel)
scripts/fetch-cc-assets.sh  optional CC sample photos (Wikimedia Commons + attribution)
scripts/journal-to-recipe.sh  captured RPC journal -> DRAFT recipe actions
.state/                   gitignored: storage states, capabilities, uploads
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
  reference it from the recipe line's `method`.
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
- **frontend never ready** → not in the process-compose shell? Start it
  manually: `cd components/frontend && just serve`.
- **Windows host** → use the devcontainer-up skill; don't run the stack
  natively. If git checks out scripts with CRLF: `git config core.autocrlf
  input` and re-checkout.
