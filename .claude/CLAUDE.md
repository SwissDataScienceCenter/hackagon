# .claude — Hackagon e2e tooling

Self-contained Claude Code skills for testing the full Hackagon hackathon
lifecycle. Everything lives under `skills/`; nothing outside this folder is
required beyond the repo itself (Nix dev shell via `just`).

## Skills

| Skill | What it does |
| --- | --- |
| `hackathon-e2e` | Deterministic end-to-end suite: boots the whole stack from scratch (Keycloak, Postgres, backend, frontend), then runs Playwright (Firefox) as a 15-person cast. Suites: `smoke` (seeded fixture), `journey` (the full lifecycle recipe on an empty DB), `mobile` (phone-viewport battery). |
| `devcontainer-up` | Spins up the docker-compose devcontainer and gets it ready (Nix, toolchain warmed). `scripts/e2e.sh` is the default entry point: runs the e2e suite inside the container. |
| `cloudflare-tunnel` | Exposes the locally running stack through a Cloudflare quick tunnel. One public hostname serves frontend and Keycloak (caddy path-mux), so `up.sh --with-auth` gives working OIDC login/registration through the tunnel; plain `up.sh` is anonymous view-only. |
| `dbml-diagrams` | Builds and validates the dbdiagram.io DBML (`docs/backend/schema.dbml`) from the ent schema; `scripts/validate.sh` runs the official parser. |
| `docs-bundle` | Builds `docs/` into ONE self-contained HTML (`out/hackagon-docs.html`): images re-encoded to webp and inlined, mermaid pre-rendered to SVG, cross-doc links anchored. No network needed to read it; prints to PDF. |
| `openreplay-stack` | Self-hosted OpenReplay (session replay) via docker compose behind a Cloudflare quick tunnel. Vendors the upstream compose into the skill, prepares secrets non-interactively, points the stack at the tunnel URL. Debug rig — needs 8 GB RAM of its own. |
| `seed-past-hackathons` | Populates a running instance with SDSC's real past hackathons — one source-cited JSON per edition under `data/` (details, phases, tracks, markdown pages, image paths). |

## The recipe = the product spec

`skills/hackathon-e2e/recipe.jsonl` — **278 actions, one JSON per line**,
covering publication → configuration → registration (13-person wave, forms,
waitlist) → proposals → teams → event days (no-show, same-day walk-in,
deadline overrides) → voting → prizes (admin final voice) → post-event
(winners, wrap-up blog, profile churn). Executed in order by
`tests/journey/recipe.spec.ts` via `helpers/recipe.ts`.

Each action carries: `priority` (P1/P2/P3 vs current dev state), `implement`
(false = deliberately deferred), `outcome` (human-readable expectation),
`todo` (placeholder note), and optional `gate` (skip until listed RPCs exist —
capability-probed at runtime by `scripts/probe.sh`, so actions wake up
automatically as the backend lands).

`recipe-player.html` — self-contained animated replay of the recipe (open in
any browser). Rebuild after recipe edits by re-splicing the JSONL between the
`<script id="recipe-data">` markers.

**Act 0 — platform setup** runs before any hackathon exists: the admin drafts
the About page, the draft stays invisible to the public, an organizer is
denied (site pages need the *global* Admin role), publish makes it
world-readable, duplicate/invalid slugs are rejected, and a `<script>` payload
pasted into the markdown must not execute (`sitePageSanitized`). Fixing a bug
that a recipe action *pins* will turn the suite red on purpose — that is the
mechanism working. Re-specify the action, do not delete it: `act2.flow.alice.users`
asserted the `/manage/users` 500 until F3 was fixed, and its own `todo` said to
flip it to 403.

## Status (2026-08-06) — bringing `origin/main` in

`docs/review-main-2026-08-06.md` is the read: 183 commits, 746 files, reviewed
from code on both sides. **The merge is not additive everywhere** — main
DELETED the `Capability` entity our branch is built on and replaced it with
flat `HackathonState` booleans enforced through casbin policy. The two
enforcement paths cannot both run, so ours is kept and none of that is ported.
Everywhere else additive holds, and all seven items in the review's order of
work are on `sketch/06-08-26`. Since extended with the three items the review
had deferred — ranked/points ballots, the `HackathonState` façade, and the
storage upload path — so the recipe now runs **294 actions**: journey
**297 passed / 0 failed / 0 skipped**, smoke **77 passed / 0 skipped**,
`svelte-check` 0 errors, plus the tunnel login proof.

**Two of those three "features" were switches that did nothing.**
`VoteCategory.voting_method` already offered ranked and points, and the
organiser's form already listed them, while `SubmitVote` rejected every ballot
cast in such a category. The review had reasoned about a schema migration and
missed that the surface was already shipped. The façade is the opposite case —
genuinely additive, and deliberately carries **no enforcement**:
`requireCapability` is still the only gate.

**The guard paid for itself immediately.** `runRpc`'s throw-on-unprobed-gate
caught two of my own omissions in this batch (`SuggestResults`, and the four new
RPCs) — actions that would otherwise have self-skipped forever behind a growing
green number. Cross-check with: every `method`/`gate` in `recipe.jsonl` must
appear in `probe.sh`'s `METHODS`.

**Reviewing main mostly found bugs in OURS.** Five of the seven were defects
the comparison exposed rather than features main had: `/manage/users` shipped
calling `AddRole`/`RemoveRole` while both were `Unimplemented`, so promoting
anyone 500'd; "Clear current phase" submitted no id into a UUID parse; the
`VOTE` and `VIEW_RESULTS` capabilities were seeded and toggleable with **no
handler reading them**; `EditSubmission` checked the window but not the
capability; "★ Preferred" called an organizer-only RPC without the argument it
requires, so it always failed.

Two things ported as genuine additions: `SuggestResults` (single-choice tally
only — ranked/points would force the `Vote` unique index from
`(category, voter)` to `(category, voter, submission)` and destroy the
one-ballot-per-category invariant) and the "what can I do now" surfaces
(`CurrentStateCard`, `OrganizerStateAlert`, the `/manage` landing page).
`AddOwner`/`RemoveOwner` — the last B15 stub pair — went in as a casbin role
write with no schema change, because ownership is a casbin fact here while main
stores it twice and syncs by hand.

**Same test trap, third time.** A locator that contains the thing it asserts
about passes for the wrong reason: `12-roles` checked the row, which holds a
`<select>` whose options are named after the roles; `13-owners` checked the
card, which holds a button named "Make organizer". Assert on the element that
states the fact — the badge, the role line — never the container.

**Three ways a test reported green while proving nothing**, all found in this
pass and all now impossible-by-construction rather than fixed case by case:

- **A gate nobody probed.** `implemented()` cannot tell "the backend returned
  Unimplemented" from "no one ever asked" — both are falsy — so the six new
  `act5.owner.*` actions, whose RPCs were missing from `probe.sh`'s `METHODS`,
  self-skipped and would have done so forever. `runRpc` now THROWS on a gate
  absent from the probe list: gating exists so an action wakes up when its RPC
  lands, and one that is never probed never wakes.
- **A `test.skip` on the only path.** `12-roles`'s self-demotion test clicked a
  revoke control and skipped when none rendered — but own-Admin revoke is
  deliberately hidden, so skipping was every run. It asserts the absence now,
  and grants a role to someone else to prove the control did not vanish for
  everybody.
- **`recipe-player.html` showed 10 actions of 274.** An inline `<script>` block
  ends at the first literal `</script>`, even inside a JSON string — and
  `act0.about.xss` pastes a script tag on purpose. The splice escapes it as
  `<\/script>`, which JSON parses back to the same character.

Re-splicing the player after a recipe edit is required, not cosmetic; the
escape is part of the splice.

**Cast differs between suites.** In the smoke fixture alice OWNS h1; in the
journey `hackagon-admin` creates the hackathon and alice joins it and votes in
act 7 (organizers may not vote). A recipe action written with the smoke cast in
mind gets `PermissionDenied` from the right code for the wrong reason.

## Status (2026-08-06) — design migration

Branch `feat/main-design` carries main's design onto our backend. Journey
**271 passed / 0 failed**, frontend units **154/154** (23 markdown-sanitiser
cases restored with the renderer), `svelte-check` **0 errors**.

Getting there took nine runs, one failure at a time — the story is
`mode: "serial"`, so a failure skips the tail and each run surfaces exactly
one. Worth knowing for the next migration: **the recipe found more product
bugs than review did.** Submissions listing only your own team, the Photos tab
that no longer existed when its chain reached it, a landing hero whose primary
action was a 404 — none of those look wrong in a diff.

**What the migration actually cost.** Almost nothing was lost as *design*; what
was lost was *wiring*, and none of it announced itself. Two mechanical audits
found what the suites could not (`docs/testing.md` documents both):

- **Routes with no inbound link.** `/account` (the link lived in `AppSidebar`,
  which no route mounts), `/manage/pages` — the platform CMS — linked from
  nowhere at all, and the preferences CSV endpoint under a path with no page.
- **RPCs with no caller.** 95 of 102 have one now. The gaps were not small:
  `CreateSubmission`/`EditSubmission`/`FinalizeSubmission` had none, so a team
  could not turn work in; `EditSettings` had none, so `votingEnabled` — which
  gates every ballot and defaults to false — could only be opened over grpcurl;
  `SetVotingPolicy` had none, and `SubmitVote` ignored the stored policy anyway.

**Three read RPCs had to be added** — `ConfigService.GetWindows`,
`PrizeService.Get`, `ConfigService.GetEmailTemplates` — for one reason each
time: a `Set*` that replaces a whole record makes any form that cannot prefill
destructive. The voting policy took the fourth slot but landed on the hackathon
entity instead: those are the rules the VOTERS are bound by, so "may I vote for
my own team" is readable by whoever the vote binds.

**Mock pages that shipped as real ones.** `/hackathon/[id]` had a literal
title, venue, speaker list and "42 of 100 spots taken", identical for every
event, and redirected signed-in visitors into the member view — which assumes
signed in ⇒ member and answers 403 to anyone who had not joined. The landing
hero's "Get Started" pointed at `/hackathon/ord-2026`, a slug and not an id, so
the front page's primary action was a 404.

**Nav IA.** One meaning per entry: Dashboard (yours), Hackathons (all,
searchable), About; the wordmark goes home for everyone. "Hackathons" used to
resolve to the dashboard when signed in and the browse page when not, so the
same word meant two things and the browse page was unreachable from the chrome
for exactly the people with an account.

**Test-side lessons.** The dashboard's membership badge is a SIBLING of the row
link, so rows are reached as the link's grandparent (`helpers/ui.ts`) — the
badge has moved three times and the class lists changed with it, but "the thing
the link is mounted in" did not. `clickLink` falls back to the accessible name:
an icon-only link (the account control) has no text content to filter on. And
`02-login`/`07-account-menu` are re-specified rather than repaired — this
design has no account menu at all; identity is a monogram and sign-out is a
top-bar button.

## Status (2026-08-05)

On branch `sketch/04-08-26` **every recipe action runs**: journey
**271 passed / 0 failed / 0 skipped** — nothing deferred, nothing gated —
plus smoke **45/45**, mobile **14/14**, frontend units **39/39**, the theme
screenshots **35/35** and the tunnel login proof.

**Nothing had ever CLICKED the account menu** — every suite reached
`/account`, `/hackathon/create` and `/manage/*` with `page.goto`, which proves
the route works and not that you can get there. Three separate bugs were
hiding behind "clicking my hackathons does nothing", all now pinned by
`tests/smoke/07-account-menu.spec.ts` and `act8.menu.*`:

- `/account` **redirect-looped** on a full page load. Single-segment paths that
  no route owns are treated as candidate SitePages (public), and `account` was
  missing from the hand-written reserved list — same bug as `/hackathon/create`
  a day earlier. `sitePageSlug.ts` now DERIVES the reserved set from the route
  tree via `import.meta.glob`, so a new route reserves its own segment.
- The avatar swallowed its first click: the menu was a `<button>` whose
  `onclick` only exists after hydration. It is a native `<details>` now, and
  `menuOpen` mirrors the DOM instead of driving it — a two-way `bind:open`
  re-closed a menu that was opened before hydration.
- "My hackathons" from the dashboard navigates to where you already are, which
  reads as a dead link. Entries carry `aria-current="page"` and a dot.

Two traps this created for the suite itself, both fixed in the helpers:
the account menu now lives in the DOM at all times (hidden), so a page-wide
`getByText("Bob Henderson")` matched the menu first — content assertions scope
to `<main>` (`helpers/ui.ts:content`); and `getByRole("button", {name})` is
substring + case-insensitive, so `clickButton: "A"` also matched "Toggle
light/d**a**rk mode" and clicked the theme switch. `clickButton` prefers an
exact match now. `login: true` only works with `fresh: true` — with a persona's
saved session Keycloak SSOs straight through and the helper waits forever for
a `#username` field that never renders.

Getting the last six actions to run meant building what they referenced:
`ConfigService.SetEmailTemplates` / `SetBranding`, structured submission
validation, and `UserService.DeleteAccount`. **API-to-UI coverage: 57 of 64
RPCs have a frontend caller.** The other seven are four proto-only stubs
returning `Unimplemented` (audit B15: AddRole/RemoveRole,
AddOwner/RemoveOwner) and three readers whose `List*` equivalents already
drive the UI. *(All four B15 stubs are implemented and called as of
2026-08-06 — see the main-merge section below.)*

**Editable personal data (2026-08-05).** Two things people could not change
about themselves, both now `act2.form.*` / `act8.profile.*` in the recipe:

- `UserService.EditProfile` (display name). The blocker was not a missing form
  — `WhoAmI` re-synced `username`, `display_name` and `email` from the token on
  EVERY request, and hooks calls it on every protected page, so any edit was
  reverted by the next click. `syncFromKeycloak` now refreshes only what the
  IdP owns; the display name is the platform's, seeded on Register and
  backfilled only when empty. Username/email/password stay in Keycloak's own
  account console, which `/account` links to.
- `SubmitRegistrationForm` is an UPSERT. It used to insert only, so a second
  submit hit the unique (hackathon, user) constraint and returned
  `AlreadyExists` — the first typo was permanent. `GetRegistrationResponse`
  reads the answers back (its own RPC, not part of `Get`, which denies
  waitlisted users — exactly who still needs their form); organizers may read
  another person's with hackathon `Write`, and `act2.form.bob.snoop` pins that
  a fellow member may not. The form had no link anywhere in the UI either — the
  member overview now has one.

Policy decisions were pinned by making recipe actions pass
(Member role at Join, waitlisted may propose, anonymous → UNAUTHENTICATED,
organizers cannot vote, members read all submissions hackathon-wide, public
pages anonymous-readable, window enforcement with now-anchored overrides).
Known upstream quirks: casbin enforcer does not reload after external seeding
(the suite restarts the backend after `just db::seed`); casbin writes on its
own connection, so an ent transaction must never be held across one (it
deadlocks — team membership uses compensating writes instead).

The `docs/` set (2026-08-04 audit) drives bug work: `docs/TODO.md` carries the
per-item status, including two deliberate non-fixes (team members may not
delete their team; `Join` still needs the public-visibility decision).

## Container traps (Windows/macOS hosts) — read before touching compose

These cost hours; all three are now fixed in `.devcontainer/`, but the failure
modes recur whenever the setup changes.

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
