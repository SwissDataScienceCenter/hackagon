# .claude — Hackagon e2e tooling

Self-contained Claude Code skills for testing the full Hackagon hackathon
lifecycle. Everything lives under `skills/`; nothing outside this folder is
required beyond the repo itself (Nix dev shell via `just`).

## Skills

| Skill | What it does |
| --- | --- |
| `hackathon-e2e` | Deterministic end-to-end suite: boots the whole stack from scratch (Keycloak, Postgres, backend, frontend), then runs Playwright (Firefox) as a 15-person cast. Projects: `smoke` (seeded fixture), `journey` (the full lifecycle recipe on an empty DB), `mobile` (phone-viewport battery), `openreplay` (session-replay privacy proof), `tunnel` (login through the public URL), `docs` (documentation screenshots). |
| `devcontainer-up` | Spins up the docker-compose devcontainer and gets it ready (Nix, toolchain warmed). `scripts/e2e.sh` runs the e2e suite inside the container; `scripts/start.sh` is the one-command path from nothing to a running (optionally public, optionally seeded) stack. |
| `cloudflare-tunnel` | Exposes the locally running stack through a Cloudflare quick tunnel. One public hostname serves frontend and Keycloak (caddy path-mux), so `up.sh --with-auth` gives working OIDC login/registration through the tunnel; plain `up.sh` is anonymous view-only. |
| `dbml-diagrams` | Builds and validates the dbdiagram.io DBML (`docs/backend/schema.dbml`) from the ent schema; `scripts/validate.sh` runs the official parser. |
| `docs-bundle` | Builds `docs/` into ONE self-contained HTML (`out/hackagon-docs.html`): images re-encoded to webp and inlined, mermaid pre-rendered to SVG, cross-doc links anchored. No network needed to read it; prints to PDF. |
| `openreplay-stack` | Self-hosted OpenReplay (session replay) via docker compose behind a Cloudflare quick tunnel. Vendors the upstream compose into the skill, prepares secrets non-interactively, points the stack at the tunnel URL, wires the app at it and back (`wire-frontend.sh`), and purges expired sessions (`retention.sh` — upstream has no retention setting). Debug rig — needs 8 GB RAM of its own. |
| `seed-past-hackathons` | Populates a running instance with SDSC's real past hackathons — one source-cited JSON per edition under `data/` (details, phases, tracks, markdown pages, images). Uploads the pictures into the instance's object store, sets each event's cover, rewrites page markdown to the uploaded paths, and gives every edition a prize table with drawn (not photographed) badge art. |

## The recipe = the product spec

`skills/hackathon-e2e/recipe.jsonl` — **344 actions, one JSON per line**,
covering platform setup → publication → configuration → registration
(13-person wave, forms, waitlist) → the capacity pilot (a capped side sprint:
FCFS seats, queue fairness, over-capacity approval, the Join race) →
proposals → teams → event days (no-show, same-day walk-in, deadline
overrides) → voting (single-choice, ranked, points) → prizes (admin final
voice) → post-event (winners, gallery uploads, wrap-up blog, profile churn).
Executed in order by `tests/journey/recipe.spec.ts` via `helpers/recipe.ts`.

Each action carries: `priority` (P1 242 / P2 93 / P3 9), `outcome`
(human-readable expectation), an optional `todo` (placeholder note, 44
actions) and an optional `gate` (24 actions — skip until the listed RPCs
exist, capability-probed at runtime by `scripts/probe.sh`, so actions wake up
automatically as the backend lands). `implement: false` meant "deliberately
deferred"; **no action sets it any more** — nothing in the recipe is deferred.

`recipe-player.html` — self-contained animated replay of the recipe (open in
any browser). Rebuild after recipe edits with
`node scripts/splice-player.mjs`, which re-splices the JSONL between the
`<script id="recipe-data">` markers, applies the `</` → `<\/` escape, and
verifies the embedded action count against the file.

**Act 0 — platform setup** runs before any hackathon exists: the admin drafts
the About page, the draft stays invisible to the public, an organizer is
denied (site pages need the *global* Admin role), publish makes it
world-readable, duplicate/invalid slugs are rejected, and a `<script>` payload
pasted into the markdown must not execute (`sitePageSanitized`).

Act sizes: 0 = 15, 1 = 46, 2 = 66, 3 = 13, 4 = 29, 5 = 58, 6 = 45, 7 = 40,
8 = 32. By kind: 266 `rpc`, 32 `ui.assert`, 39 `ui.flow`, 6 `rpc.race`,
1 `files.generate`.

**`rpc.race` fires its `calls` simultaneously** (Promise.all over separately
spawned grpcurl processes — the synchronous driver would serialize them) and
judges the aggregate (`race.ok` exact success count, `race.failCodesOneOf`
order-insensitive multisets). The suite stays strictly serial; the concurrency
lives inside the one action. Every race is followed by a plain rpc that reads
the END STATE back (`exportBallotCount`, `ownerCount`, `templatesOneOf`, the
roster) — "both returned OK" and "there is one row" are different claims. The
two races that reproduced real bugs before their fixes: one voter's four
simultaneous single-choice ballots double-voted in 7 of 12 hammer rounds
(closed by `VoteService.ballotMu`), and two owners demoting each other left
the event with ZERO owners on the first attempt (closed by
`HackathonService.ownerMu` + casbin `SyncedEnforcer`). Restore steps after a
race may need `expect.okOr` — which cleanup applies depends on who won.

## Where things stand (2026-08-10)

Work is on `sketch/06-08-26`. **`.claude/` is gitignored there** and tracked on
`feat/claude` instead (worktree `../hackagon-wt-claude`) — edit the live copy
under `.claude/` and sync it across.

| Suite | Result | When |
| --- | --- | --- |
| journey (329-action recipe) | **333 passed / 0 failed / 0 skipped** | 2026-08-10 |
| smoke (76 tests, 16 files) | **80 passed** | 2026-08-10 |
| mobile | **121 passed** | 2026-08-10 |
| backend `go test ./internal/...` | all ok (service 258 specs) | 2026-08-10 |
| openreplay (7 tests) | **11 passed** | 2026-08-08 |
| frontend units (9 files) | **154 passed** | 2026-08-08 |

Playwright totals include the 4 auth-setup tests every suite depends on, so
journey's 333 is 4 setup + 329 recipe actions. `loadRecipe()` counts by `id`,
cross-checks against a textual scan and rejects duplicates, so an action line
can no longer be silently dropped (see the traps below).

⚠ **`just check::test -c backend` is currently RED**, and not because a test
fails. The quitsh runner appends `--ginkgo.v` to every package's test binary;
`internal/audit` and `internal/storage` are plain `testing` packages with no
ginkgo bootstrap, so they exit 1 on `flag provided but not defined: -ginkgo.v`
before running anything. Both pass under a plain `go test`. The three Ginkgo
suites are green: service 258 of 259 specs (one pending), middleware 43/43,
capability 37/37. CI runs the failing command.

**API-to-UI coverage: 99 of 107 RPC declarations have a frontend caller.** The
eight without one are accounted for in `docs/testing.md` — `PageService.SetOrder`
is a bulk alternative to the MoveUp/MoveDown the CMS uses,
`HackathonService.SetCurrentPhase` aliases the `AdvancePhase` the timeline
calls, `GetVoteCategory`/`ListVotes`/`GetSubmission` are covered by the list
endpoints already driving the UI, `SuggestResults` computes a tally the UI
records by hand with `CreateVoteResult`, `CreateDownloadUrl` waits for something
private to serve, and `RemovePreference` has no un-prefer control to call it.

### What landed most recently

**Backend.** Ranked and points ballots with per-row votes (`{submission_id,
rank}`), plus `SuggestResults` tallies for both. A `HackathonState` façade over
the existing Capability model — projection only, **no enforcement**, because two
gates that can disagree are worse than either alone. `StorageService`: presigned
uploads with hand-rolled SigV4 (~200 lines rather than aws-sdk-go-v2 and its ~15
modules through a pinned Nix `vendorHash`), size and content-type as conditions
ON the presign so an oversized upload is refused before a byte moves, and
delete-by-prefix so deleting a hackathon or an account purges its objects.
`AddOwner`/`RemoveOwner`, `ListRegistrationResponses`, and an RPC audit journal
in `internal/audit/`.

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

The ranked/points fix has a cost written down rather than left to be
discovered: the `Vote` unique index moved from `(category, voter)` to
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
as a dead link. *(The menu itself is gone — see pass 2 — but the reserved-slug
derivation and the "goto proves nothing" lesson are why it is written down.)*

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
design onto our backend. Almost nothing was lost as *design*; what was lost was
*wiring*, and none of it announced itself in a diff — submissions listing only
your own team, a Photos tab that no longer existed when its chain reached it, a
landing hero whose primary action was a 404. **The recipe found more product
bugs than review did.** Two mechanical audits found what neither could
(`docs/testing.md` documents both): **routes with no inbound link** (`/account`,
`/manage/pages` — the platform CMS — linked from nowhere at all) and **RPCs
with no caller** (`CreateSubmission`/`EditSubmission`/`FinalizeSubmission` had
none, so a team could not turn work in; `EditSettings` had none, so
`votingEnabled` — which gates every ballot and defaults to false — could only be
opened over grpcurl).

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

## Ways a test reported green while proving nothing

The most expensive category of bug here, because nothing turns red. All of
these are now impossible-by-construction rather than fixed case by case.

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
  therefore runs an **unmasked control first**, and `consent.spec.ts` asserts the
  positive too (the project key IS in the HTML once granted).
- **An action the loader silently drops — closed.** `loadRecipe()` used to
  filter every line with a `comment` key, which is how act banners are removed,
  without checking for an `id` first — `act8.flow.bob` carried a trailing
  `comment` and had never executed. The loader now keeps every line with an
  `id`, throws on a line that is neither banner nor action, cross-checks the
  count against a textual scan of the raw file, and rejects duplicate ids.
- **A field that moved out from under a check.** `usersLackNames` read
  `u.name`; the User proto has `username` and `displayName` and no `name`, so
  every user mapped to undefined and "the deleted profiles are gone" passed no
  matter who was still in the list. It reads `displayName` now and THROWS when
  no user in the list has one — absence-assertions need a positive control or
  they agree with everything.

One hole no option closes: the tracker masks TEXT NODES and input values but
sends ATTRIBUTE values verbatim. `title={userName}` was shipping the signed-in
person's name in clear next to the same name arriving as asterisks. **Personal
data goes in text nodes, never in an attribute.**

**Fixing a bug that a recipe action *pins* will turn the suite red on purpose** —
that is the mechanism working. Re-specify the action, do not delete it:
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

## Container traps (Windows/macOS hosts) — read before touching compose

These cost hours; all of them are handled in `.devcontainer/` (or, for 2b, in
the e2e harness), but the failure modes recur whenever the setup changes.

**1. Never let `node_modules` live on the bind mount.** The workspace mount is
`9p` on Windows; the volumes are `ext4`. Measured in this container:

| | bind mount | named volume |
| --- | --- | --- |
| `require("isomorphic-dompurify")` (jsdom) | 52,821 ms | 331 ms |
| `pnpm install` | 34 s | 5 s |
| `vitest run` (23 tests) | 104 s | 1.06 s |

52 s exceeded vite's 60 s SSR module-transport timeout, so **every route
returned 500** with a `fetchModule` timeout on `/src/app.css` — a total
outage that looks nothing like "slow disk". Check which side you are on:
`findmnt -no TARGET,FSTYPE | grep node_modules` must say `ext4`.
⚠ Still on the bind mount: `.claude/skills/hackathon-e2e/node_modules` (only
`components/frontend/node_modules` is volumed).

**2. Changing `dev`'s compose config recreates the container — which kills
the stack inside it** (process-compose, and therefore Postgres/Keycloak/backend/
frontend) **and wipes anything apt-installed at runtime.** That is how the e2e
suite lost Firefox's system libraries (`libgtk-3.so.0: cannot open shared
object file`); they are baked into the Dockerfile now. After any recreate:
restart the stack (`scripts/up.sh` + `wait-ready.sh`) before anything else.

**2b. After a proto/ent regeneration, vite's first SSR can take longer than
anyone will wait — and process-compose kills it while it tries.** Regenerating
wipes and rewrites ~260 files under `src/lib/server/grpc/generated/`, which
invalidates that much of vite's transform cache. `src/` is on the 9p mount, so
each cold transform is seconds (measured: 28 s for `src/app.css` alone). The
first request to `/` then hangs, and the readiness probe (`curl`, 5 s timeout,
kills after 100 failures) terminates the process mid-warm-up — the log says
`readiness check fail - signal: killed`, which reads like a crash and is not one.

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
it), but prefer serving on **:8081**: Keycloak's `hackagon-dev` client only
allows `localhost:8081/*` redirect URIs, so :8082 dies at login with
`Invalid parameter: redirect_uri`.

**3. Do not gate sidecars on `dev`'s health.** `dev` is healthy only once
someone runs `just up`, which compose does not manage, so
`depends_on: condition: service_healthy` on `dev` deadlocks: it blocks on a
stack compose cannot start, and the config change that added the healthcheck
is what killed that stack. `caddy` uses a plain `depends_on`; readiness is
checked by `cloudflare-tunnel/scripts/up.sh`, which fails fast when nothing
serves on :8081. `tunnel → caddy` keeps `service_healthy` — that race is real
(cloudflared resolves its target once) and compose owns both sides.

Optional `services` profile runs Postgres and Keycloak as their own
containers (`service-bridge.sh` maps them onto localhost inside `dev` so
checked-in configs keep working). Opt-in: `just up` still starts devenv's
copies and they would fight over ports. Note `postgres:18+` wants a single
mount at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.

## The tunnel's auth wiring (why login kept breaking)

`run.sh` unwires the tunnel before a suite — every persona logs in over
localhost, and tokens carrying the tunnel issuer fail every auth setup. It now
**re-wires on EXIT**, so a test run no longer silently logs out the public URL.
The failure was invisible in the worst way: the tunnel kept serving pages, so
only someone actually signing in found out.

**Wiring writes `config.local.yaml`, never the tracked `config.yaml`.** Both
loaders read an optional, gitignored overlay beside the base file — backend
`defaults < config.yaml < config.local.yaml < HACKAGON_* env`, frontend
`config.yaml < config.local.yaml`, deep-merged and validated by the same
schema — so `auth-wire.sh` writes one key and `--restore` is an `rm`. It used
to `sed` the two tracked files and keep `.pretunnel` backups: while wired the
working tree differed from HEAD, and a `git add -A` committed a hostname that
dies with the tunnel. That happened — a dead issuer sat committed for several
commits, and a fresh clone pointed at a tunnel that no longer existed. The
guard against a repeat is a spec in `internal/config/config_test.go` asserting
BOTH tracked configs still say `localhost`; `run.sh` reads the wired URL out of
the overlay, so the overlay's absence is now the "no tunnel" signal.

**The tunnel has its own upstream port.** `--prod` used to park the
adapter-node build on **:8081**, vite's port, so `run.sh` had to evict it for
the duration of a suite and put it back on exit — and during each handover
nothing was listening, so caddy answered the public link with **502 for ~40s
on every test run**. The built server lives on **:8082** now and
`Caddyfile.tunnel` tries `dev:8082` then falls back to `dev:8081`
(`lb_policy first` + passive health check), so prod and vite coexist, plain
non-prod tunnels still work, and `run.sh` has no prod-mode guard at all — only
the auth re-wire trap. Reload that config with
`docker compose … exec caddy caddy reload --config /etc/caddy/Caddyfile`;
`up -d` would recreate `dev` and kill the stack. The remaining trade: the built
server reads `config.yaml` once at boot, so during a run the public URL keeps
SERVING but new logins through it fail until the exit re-wire restarts it.

`devcontainer-up/scripts/start.sh` is the one-command path — container → stack
→ (optionally) tunnel with auth — and it finishes by driving a real login
round-trip, because serving HTML proves nothing about OIDC.

⚠ **Do not forward `X-Forwarded-Proto: https` to the frontend** in
`Caddyfile.tunnel` (Keycloak's route needs it; the frontend's must not have
it). Auth.js picks its cookie NAMES from the scheme it believes it is on, and
the vite dev server does not apply the header to `event.url` — so it wrote the
session as `authjs.session-token`, then looked for `__Secure-authjs.session-token`
and found nothing. Login dead-ended back on the public page with tokens
successfully issued. The frontend infers the public scheme itself in
`src/routes/+layout.server.ts` for the absolute URLs link previews need.

## Quick start

```bash
bash .claude/skills/devcontainer-up/scripts/up.sh      # container up + ready
bash .claude/skills/devcontainer-up/scripts/e2e.sh smoke
bash .claude/skills/devcontainer-up/scripts/e2e.sh journey
bash .claude/skills/hackathon-e2e/scripts/run.sh journey --until-act 5   # freeze mid-story
```

Session-replay privacy proof (needs the openreplay rig up and the app wired at
it — the suite self-skips otherwise, so running it without the rig costs
nothing and claims nothing):

```bash
bash .claude/skills/openreplay-stack/scripts/up.sh   # creates the admin account itself (.secrets.env)
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh
bash .claude/skills/hackathon-e2e/scripts/run.sh openreplay
bash .claude/skills/openreplay-stack/scripts/wire-frontend.sh --restore
```

Public URL with working login (see the cloudflare-tunnel skill):

```bash
bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth   # stack must be up first
bash .claude/skills/cloudflare-tunnel/scripts/down.sh             # also un-wires OIDC
```

Quick-tunnel URLs are ephemeral, so `--with-auth` re-points the frontend and
backend issuers at each new URL. **While wired, localhost logins fail** (their
tokens carry the wrong issuer) — that is expected, `down.sh` restores it. Suite
runs restore it too, so re-run `--with-auth` after any smoke/journey run.

Dev credentials: all cast members use password `aliceandbob`; Keycloak admin
is `admin`/`admin`. The extras crowd (`cast.json`) is provisioned by
`scripts/roster.sh`.

Not included in this archive: `node_modules/` (pnpm install), `.state/`
(storage states / capabilities — regenerated per run), `.artifacts/` (reports).
