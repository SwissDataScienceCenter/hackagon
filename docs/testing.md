# Testing

How Hackagon is tested on `sketch/04-08-26`: Go unit tests, frontend unit
tests, the CI pipeline, and — the bulk of this document — the deterministic
end-to-end system that plays the entire hackathon lifecycle as an executable
screenplay.

## 1. The test pyramid

| Layer | Where | Tool | Count | Runs in CI |
| --- | --- | --- | --- | --- |
| Backend unit/integration | `components/backend/internal/service/*_test.go` | Ginkgo v2 + Gomega, in-memory SQLite, gRPC over `bufconn` | 231 specs | yes |
| Frontend unit | `components/frontend/src/**/*.test.ts` | Vitest + jsdom | 14 tests | yes |
| End-to-end | `.claude/skills/hackathon-e2e/` | Playwright (Firefox) against the real stack | 241 recipe actions + 26 smoke + 10 mobile | **no** — run manually |

### Backend Go tests

```bash
just check::test -c backend        # inside the Nix dev shell
just ci::run just check::test -c backend   # the way CI invokes it
```

`just check::test` forwards to `just quitsh test`, which resolves the
`test-unittest` target in `components/backend/.component.yaml`. That target
runs the Go runner with build tags `test,unittest`, `-v`, `--ginkgo.v`, and
`-coverpkg` over `cmd/...` and `internal/...`.

Every backend test file carries `//go:build test && unittest`. The `lint`
target enforces this constraint mechanically: `checkBuildConstraints` requires
`test && unittest` on `**/internal/**/*_test.go` and `**/pkg/**/*_test.go`, so
a test file without the tag fails lint, not just the build.

The suite files:

| File | Specs | Describes |
| --- | --- | --- |
| `components/backend/internal/service/service_suite_test.go` | — | Ginkgo entry point (`RunSpecs`) |
| `components/backend/internal/service/hackathon_service_test.go` | 79 | 19 |
| `components/backend/internal/service/project_service_test.go` | 37 | 10 |
| `components/backend/internal/service/page_service_test.go` | 36 | 9 |
| `components/backend/internal/service/team_service_test.go` | 35 | 12 |
| `components/backend/internal/service/phase_service_test.go` | 28 | 7 |
| `components/backend/internal/service/track_service_test.go` | 16 | 6 |

Fixtures live in `components/backend/internal/testutils/`:

- `SetupFreshTestDB` opens a **non-shared in-memory SQLite** database per test
  and auto-migrates the ent schema — full isolation, no Postgres required.
- `CreateTestServer` wires that DB into the real `service.NewServer`, returning
  the ent client, a `bufconn` gRPC connection and the **real casbin enforcer**.
  RBAC is therefore exercised, not stubbed.
- JWTs are signed with a package-level RSA key pair (`GetTestRSAPrivateKey`)
  and verified through a mock `jwt.Keyfunc`, so auth middleware runs for real
  without Keycloak. `TestAdminKeycloakID` is the bootstrapped global admin.

### Frontend Vitest tests

```bash
just check::test -c frontend
# or, from components/frontend/
pnpm test          # vitest run
```

Config lives in the `test` block of `components/frontend/vite.config.ts`:
`globals: true`, `environment: "jsdom"`, `setupFiles: ["./src/setup-tests.ts"]`,
`include: ["src/**/*.{test,spec}.{js,ts}"]`, coverage into
`$QUITSH_COVERAGE_DIR/coverage/data`. The quitsh target
(`components/frontend/.component.yaml`) runs it with
`TEST_CONFIG_DIR=data/test/config`.

| File | Tests | Covers |
| --- | --- | --- |
| `components/frontend/src/auth.callback.test.ts` | 6 | Auth.js callback handling |
| `components/frontend/src/hooks.guard.test.ts` | 5 | Route guards in `hooks.server.ts` |
| `components/frontend/src/lib/server/grpc/client.test.ts` | 3 | gRPC client construction |

### CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`
(ubuntu-24.04, 30-minute timeout, in-progress runs cancelled per ref). Nix is
installed via `cachix/install-nix-action`, the `hackagon` cachix cache is
attached (read-only on fork PRs), and Go modules + the pnpm store are cached.

| Stage | Command | Notes |
| --- | --- | --- |
| codegen-check | `just ci::codegen-check` | Uses the **`default`** Nix shell (buf and `protoc-gen-ts_proto` are not in the `ci` shell). Reinstalls frontend deps frozen, re-runs `just codegen::proto` + `just codegen::db-schema` + `go mod tidy`, then `git diff --exit-code` — generated code drifting from sources fails the build. |
| format | `just ci::run just check::format` | |
| lint | `just ci::run just check::lint -c backend` then `-c frontend` | |
| build | `just ci::run just check::build -c backend` then `-c frontend` | |
| test | `just ci::run just check::test -c backend` then `-c frontend` | |

`just ci::run <cmd>` enters the `ci` Nix shell (`just nix::develop ci`) and
refuses to nest inside an existing Nix shell. To reproduce the whole pipeline
locally in one go:

```bash
just ci::all      # runs the same five stages, prints a pass/fail summary
```

`just ci::all` temporarily disables direnv, tees each stage to a log, and on
failure prints an error digest (compiler `file:line:col` lines first, then
`ERROR` lines, then the last 10 lines).

**The e2e suite is not part of CI.** It boots Keycloak, Postgres, the backend
and the frontend and is run on demand.

## 2. The e2e system

Everything lives under `.claude/skills/hackathon-e2e/` — scripts, cast,
Playwright config, helpers and tests. Nothing outside the skill directory is
modified by a run.

### What a run does

`.claude/skills/hackathon-e2e/scripts/run.sh` is the orchestrator. Each script
sources `scripts/lib.sh`, which re-execs the caller inside the Nix dev shell
(`just nix::develop default`) when `process-compose`/`grpcurl` are not on PATH.

1. `scripts/reset.sh` — `just deploy::down`, then `just clean::state` (wipes
   `.devenv/state/postgres` and `.devenv/state/keycloak`), then deletes
   `.state/journey.json`.
2. `scripts/up.sh` — `just deploy::up` (process-compose, detached).
3. `scripts/wait-ready.sh` — polls Postgres (`pg_isready`), Keycloak's
   `/realms/hackagon/.well-known/openid-configuration`, the backend
   (`grpcurl list`) and the frontend, 300 s per service by default
   (`E2E_READY_TIMEOUT`).
4. `scripts/seed.sh` (smoke, and fresh mobile runs) **or** `scripts/roster.sh`
   (journey).
5. `scripts/probe.sh` — writes `.state/capabilities.json`.
6. `pnpm install` if `node_modules/` is absent, then
   `pnpm exec playwright install --with-deps firefox` (falls back to a plain
   install), then `pnpm exec playwright test --project=<suite>`.

The stack is **left running** afterwards; stop it with `just down`. The HTML
report is printed at the end:
`pnpm --dir .claude/skills/hackathon-e2e run report`.

### The three suites

| Suite | Database | What it does | Playwright project |
| --- | --- | --- | --- |
| `smoke` | seeded fixture (`just db::seed`) | Snapshot mode: what each principal can see and do — public vs private listing for anonymous visitors, the login flow, dashboard contents and membership badges, and the full persona × hackathon member-view access matrix (200/403/404). 26 assertions across `tests/smoke/01-anonymous` `02-login` `03-dashboard` `04-access-control`, plus 4 auth-setup tests = **30**. | `smoke` |
| `journey` | **empty** (reset, never seeded) | The full lifecycle as a data-driven screenplay: `recipe.jsonl` executed strictly in order by `tests/journey/recipe.spec.ts`. **241 actions** across 8 acts. With the 4 setup tests: 245 total — currently **239 passed / 0 failed / 6 deferred-by-design**. | `journey` |
| `mobile` | seeded fixture on a fresh run; whatever is live with `--no-reset` | Phone-viewport battery at 390×844 over every surface: public home, public event page, dashboard, the six member tabs (overview, teams, proposals, timeline, submissions, participants) and `/manage/users`. Asserts no horizontal overflow (1 px slack, naming the widest offenders) and no broken images (`naturalWidth === 0`), and writes a full-page screenshot per page into `.artifacts/mobile/`. 10 tests. | `mobile` |
| `openreplay` | seeded fixture (same as `smoke`) | The session-replay privacy proof, and the only suite that measures **bytes on the wire**: nothing is recorded before consent (and the tracker's project key is not even sent to the page), the real banner starts it, `/account` stops it, Do Not Track suppresses it, and what does get recorded contains neither typed text, nor the signed-in name, nor any URL path. 7 tests. Needs a live OpenReplay (`.claude/skills/openreplay-stack`) and `replay.enabled: true`; **self-skips otherwise**, so it never runs as part of smoke or journey. See [frontend/session-replay.md](frontend/session-replay.md). | `openreplay` |

Act sizes in the journey recipe: act 1 = 36, act 2 = 45, act 3 = 13,
act 4 = 24, act 5 = 35, act 6 = 40, act 7 = 26, act 8 = 22.

By action type: 195 `rpc`, 26 `ui.assert`, 19 `ui.flow`, 1 `files.generate`.

### Running it

Default — inside the devcontainer (sibling skill
`.claude/skills/devcontainer-up/`):

```bash
bash .claude/skills/devcontainer-up/scripts/up.sh            # container up + ready (idempotent)
bash .claude/skills/devcontainer-up/scripts/e2e.sh           # smoke (the default suite)
bash .claude/skills/devcontainer-up/scripts/e2e.sh journey
bash .claude/skills/devcontainer-up/scripts/e2e.sh mobile
```

`e2e.sh` ensures the container is running (calling `up.sh` if not) and then
forwards **all** arguments verbatim to `run.sh` inside the container. Ports
3000 / 8081 / 8180 / 5432 are published to the host, so the frontend is
browsable at http://localhost:8081 while tests run.

Direct — any Linux/WSL shell with the repo checked out (scripts re-exec inside
the Nix dev shell automatically):

```bash
bash .claude/skills/hackathon-e2e/scripts/run.sh [smoke|journey|all|mobile] [options]
```

| Flag | Effect |
| --- | --- |
| *(positional)* `smoke` | Default. Reset, boot, seed, probe, run the smoke project. |
| *(positional)* `journey` | Reset, boot, provision the extras roster, probe, run the journey project. |
| *(positional)* `mobile` | Reset + seed (unless `--no-reset`), probe, run the mobile project. |
| *(positional)* `all` | Two independent runs: `smoke`, then a fresh reset, then `journey`. Does **not** include `mobile`. |
| `--no-reset` | Reuse the running stack and its data. **Ignored for `journey`** — it prints a note and resets anyway, because the recipe requires an empty database. |
| `--headed` | Run Firefox headed (`playwright test --headed`). |
| `--grep <p>` | Forwarded to `playwright test --grep`; filters by test title, which for recipe actions is `[<id>] <title>` — so `--grep act5` selects a whole act, `--grep act6.walkin` a single action. |
| `--until-act <n>` | Journey only. Exports `JOURNEY_UNTIL_ACT=<n>`; `recipe.spec.ts` skips every action with `act > n`. |
| `-h` / `--help` | Prints the usage header. |

Environment overrides read by `lib.sh` / `personas.ts` / `playwright.config.ts`:
`E2E_GRPC_ADDR` (default `localhost:3000`), `E2E_KEYCLOAK_URL` (default
`http://localhost:8180`), `E2E_BASE_URL` (default `http://localhost:8081`),
`E2E_READY_TIMEOUT` (default `300`).

### Freezing the world mid-story

```bash
bash .claude/skills/hackathon-e2e/scripts/run.sh journey --until-act 4
```

plays the story up to and including act 4 and leaves the stack in exactly that
state — browse it at http://localhost:8081 to inspect any page mid-lifecycle
(or publicly via the devcontainer's optional Cloudflare tunnel, see
`.devcontainer/README.md`).

| Act | Timeline | Theme |
| --- | --- | --- |
| 1 | T-4mo | Publication & announcement |
| 2 | T-3mo | Registration opens |
| 3 | T-2mo | Project proposals |
| 4 | T-1.5/1mo | Teams & webinars |
| 5 | T-1wk | Registration closes |
| 6 | T0/T+1 | Hackathon days |
| 7 | T+1 | Voting & awards |
| 8 | T+1wk | Post-event |

To take mobile screenshots of a frozen world:

```bash
bash .claude/skills/hackathon-e2e/scripts/run.sh mobile --no-reset
```

## 3. The recipe as executable spec

`.claude/skills/hackathon-e2e/recipe.jsonl` is **the screenplay and the product
spec at once**: 250 lines, of which 9 are `{"comment": ...}` section banners
(dropped by `loadRecipe()`) and 241 are actions. `tests/journey/recipe.spec.ts`
does nothing but emit one Playwright test per line, in file order, under
`test.describe.configure({ mode: "serial" })`. All the semantics live in
`helpers/recipe.ts`.

**Extend the lifecycle by editing `recipe.jsonl`, never the spec file.**

### Action shape

```jsonc
{"id":"act1.publish","priority":"P1","implement":true,
 "outcome":"Succeeds. Returns hackathonId for later steps.",
 "act":1,"t":"T-4mo","title":"admin publishes the hackathon",
 "actor":"hackagon-admin","action":"rpc",
 "method":"hackathon.HackathonService/Create",
 "params":{"name":"…","visibility":"VISIBILITY_PUBLIC",
           "logo":"{{logoDataUri}}","startsAt":"{{now+120d}}","endsAt":"{{now+122d}}"},
 "save":{"hackathonId":"hackathonId"},
 "expect":{"ok":true}}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier, `act<N>.<slug>`. Part of the test title, so `--grep` targets it. |
| `act` / `t` | Act number (drives `--until-act`) and the story timestamp label. |
| `title` | Human sentence; the rest of the Playwright test title. |
| `actor` | Username from `personas.ts` or `cast.json`; omitted or `"anonymous"` means an unauthenticated call / a cookie-less browser context. |
| `action` | `rpc` \| `ui.assert` \| `ui.flow` \| `files.generate`. |
| `method` | Fully-qualified gRPC method, e.g. `hackathon.TeamService/AssignUser`. Also the default capability gate. |
| `params` | Request body (`rpc`), assertion arguments (`ui.assert`), or fixture parameters (`files.generate`). Template tokens are resolved recursively through objects and arrays. |
| `expect` | `{ok}`, `{error: "<StatusName>"}` (matched against grpcurl's `Code: …`), and optionally `{check, checkArgs}` naming a post-condition in `CHECKS`. |
| `save` | `{varName: "dot.path.in.response"}` — see chaining below. |
| `gate` | Override capability gate; see below. |
| `priority` / `implement` / `outcome` / `todo` | Triage metadata; see below. |
| `fresh` | `ui.flow` only: use a clean anonymous context instead of the saved storage state (for fresh-login chains). |
| `steps` | `ui.flow` only: the navigation chain. |

### Action types

| Type | Executor | Behaviour |
| --- | --- | --- |
| `rpc` | `runRpc` | Shells out to `grpcurl` via `helpers/api.ts` with a real Keycloak password-grant token for `actor` (or no token when anonymous). Extras are lazily self-registered first through `user.UserService/Register` — the same RPC the frontend hooks call. Gated on the capability probe. |
| `ui.assert` | `runUiAssert` | Looks the `assert` name up in `UI_ASSERTS` in `helpers/recipe.ts` (`worldEmpty`, `homeStatus`, `homeAbsent`, `dashboardOthersShows`, `dashboardBadge`, `memberViewStatus`, `aboutVisible`, `proposalsPage`, `timelinePhases`, `publicWinnersPage`, `publicBlogEntry`, `submissionsPage`, `teamsPage`). An **unknown name skips** with the action's `todo` — that is the signal to implement it once the page renders real data. |
| `ui.flow` | `runFlow` | A chained browsing session. Step keys: `goto` (+ optional `status`), `login`, `clickLink`, `clickButton`, `clickSelector`, `fill{selector,value}`, `back`, `expectUrl`, `expectText`, `expectHeading`. After every `goto` the engine waits for `networkidle` — SvelteKit attaches `onclick` handlers only after hydration, so clicking earlier is a silent no-op. |
| `files.generate` | `runFilesGenerate` | Builds the deterministic upload bundle via `helpers/files.ts` into `.state/uploads/<slug>/`: `logo.png`, `poster.svg`, `final-report.pdf`, `data-sample.csv`, `README.md`. Asserts byte-identical regeneration for the same seed and pins the PNG magic bytes. Dependency-free and offline — hand-rolled PNG encoder (IHDR/IDAT/IEND + CRC32 + `node:zlib`) and a hand-assembled single-page PDF xref. |

### Template tokens

Resolved by `resolveToken` in `helpers/recipe.ts`, recursively over every string
in `params`, `checkArgs` and `steps`:

| Token | Resolves to |
| --- | --- |
| `{{hackathonId}}` | The journey hackathon's UUID (saved by `act1.publish`). |
| `{{var:NAME}}` | Any value stored by an earlier action's `save`. |
| `{{userId:username}}` | The backend **DB UUID** for that username, resolved via `WhoAmI` (registering the user first if needed) and memoized. |
| `{{now+Nd}}` / `{{now-Nd}}` | ISO timestamp N days from now — how the story places event dates. |
| `{{logoDataUri}}` | Data URI of a deterministic generated PNG identicon (seed 2027). `{{logoDataUri:<seed>}}` picks another seed. |

An unknown token is a hard error, not a skip.

### Chaining and cascade-skip

`save` pulls a dot-path out of the gRPC response into a variable
(`"save":{"trackDS":"trackId"}`); later actions reference it as
`{{var:trackDS}}`. If the response has no non-empty string at that path, the
action fails loudly with the raw grpcurl output.

When an action is skipped, `skipAction` **poisons its saved variable names**.
Any later action that resolves a poisoned variable (or `hackathonId`) raises
`MissingVar`, which `runAction` converts into a skip with the reason
`depends on '<name>' from a step that was skipped or did not run`. A
partially-implemented backend therefore produces a clean skipped tail rather
than a wall of unrelated failures.

### `gate` — multi-capability gating

By default an `rpc` action gates on its own `method`. `gate` (a string or an
array of strings) **fully replaces** `method` for gating purposes. Two uses:

- The action's own RPC exists but its **precondition** does not — e.g.
  `act8.account.check` calls `user.UserService/List` but is gated on
  `user.UserService/DeleteAccount`, because there is nothing to verify until
  deletion exists.
- The action needs **several capabilities at once** — e.g. the registration-form
  actions gate on `["hackathon.ConfigService/SetRegistrationForm",
  "hackathon.HackathonService/SubmitRegistrationForm"]`, and window-enforcement
  negatives gate on `hackathon.ConfigService/SetWindows` while calling
  `hackathon.HackathonService/Join`.

19 actions currently carry a `gate`.

### Triage fields

Every action is triaged against the current state of development.

| Field | Values | Current distribution |
| --- | --- | --- |
| `priority` | `P1` runs today or its backend just landed; `P2` next wave (vote handler, window enforcement, forms); `P3` later | P1 = 171, P2 = 61, P3 = 9 |
| `implement` | `false` = deliberately deferred; the action stays as documentation only | 6 actions: `act1.config.emails`, `act1.config.branding`, `act6.submit.invalid`, `act8.account.liam`, `act8.account.mei`, `act8.account.check` |
| `outcome` | Human-readable expected outcome derived from the machine assertions | on every action |
| `todo` | Placeholder note carrying what to verify (typically guessed proto field names) | 18 actions |

The 6 `implement: false` actions are exactly the 6 currently reported as
deferred-by-design in a green journey run.

### `todo` placeholders

An action with a `todo` is a placeholder for a feature the backend does not
have yet. It **skips** with the `todo` text as the skip reason while its
`method` (or `gate`) probes as unimplemented, and starts running the day the
RPC lands. Keep placeholders — never delete them; the recipe is meant to
describe the *full* hackathon at all times, including the parts not built yet.

When a placeholder wakes up and fails, that is the design working: align the
guessed field names in that line's `params` with the real proto (the `todo`
says what to check), then delete the `todo`.

### Capability probing

`scripts/probe.sh` holds a `METHODS` list of 47 lifecycle RPCs — from
`hackathon.HackathonService/Get` through `hackathon.ConfigService/*`,
`hackathon.PrizeService/*` and `user.UserService/DeleteAccount`, several of
which have no proto at all yet. For each it runs:

```bash
grpcurl -plaintext -d '{}' localhost:3000 <package.Service/Method>
```

and classifies the result into `.state/capabilities.json`:

```json
{ "generatedAt": "…", "grpcAddr": "localhost:3000",
  "methods": { "hackathon.HackathonService/Create": true, … } }
```

A method counts as **not implemented** when the output contains
`Code: Unimplemented` / `code = Unimplemented`, or a reflection error
(`does not expose service`, `does not include a method`,
`Failed to resolve symbol`, `unknown service`, `no such service`). Anything
else — including `Unauthenticated`, `PermissionDenied` and `InvalidArgument` —
counts as implemented. Losing the connection mid-probe aborts the run.

**Why unauthenticated probes are safe:** implemented mutation handlers follow
the enforce-first pattern (`RequireSubject` / casbin check before any DB
write), so an anonymous `{}` call is rejected before touching the database. The
rejection itself is the proof that the handler exists. No side effects, no
cleanup.

**Why actions wake up automatically:** `helpers/capabilities.ts` reads that
file and `runRpc` skips when any gate is `false`. Nothing in the test code
enumerates which features exist — the moment your coworker registers a handler
and the probe stops seeing `Unimplemented`, the corresponding recipe actions
un-skip on the next run and are executed for real. Test-with-feature, enforced
mechanically rather than by convention.

To register a new RPC for tracking: add it to `METHODS` in `scripts/probe.sh`
and reference it from the recipe line's `method` or `gate`.

## 4. The cast and the determinism pillars

### 15 people

**Four principals** — checked into the dev realm
(`tools/configs/keycloak/realm-hackagon.json`), defined in `personas.ts`. They
get **browser sessions** as well as API access.

| Persona | Username | Role in the story |
| --- | --- | --- |
| admin | `hackagon-admin` | Global admin/organizer — publishes, approves, removes, edits dates |
| alice | `alice` | Organizer-to-be; approved participant in the journey |
| bob | `bob` | The spotlight participant — every UI outcome is asserted through his eyes |
| charles | `charles` | The unlucky one — registers, never gets off the waitlist |

`tests/auth.setup.ts` runs as a Playwright **project dependency** for all three
suites. For each principal it drives the real login flow
(`helpers/login.ts`: frontend "Log in" → Auth.js → Keycloak form → back), then
visits `/dashboard`, then saves the browser storage state to
`.state/<persona>.json`. Two things matter here:

- Visiting `/dashboard` is what **auto-registers** the user in the backend
  (`hooks.server.ts`: `WhoAmI` → `NOT_FOUND` → `Register`) — this is why the
  journey suite works on a completely empty database.
- Later tests reuse the saved storage state via `contextFor(browser, key)`
  instead of logging in again; `fresh: true` on a `ui.flow` opts back into a
  cookie-less context when the story needs a real login.

**Eleven extras** — `cast.json` (Dana Moser, Erik Lindqvist, Fatima Khoury,
Giulia Ricci, Hiro Tanaka, Ines Duarte, Jonas Weber, Katya Volkova, Liam
O'Brien, Mei Chen, and **Noor Haddad**, the same-day walk-in who skips the
act-2 wave and registers at the door in act 6). `scripts/roster.sh` provisions
them **idempotently** into the `hackagon` realm through the Keycloak admin REST
API (master realm, `admin`/`admin`, `admin-cli` client): existing usernames are
left untouched, so the checked-in realm export stays the source of truth for
the principals and re-runs are no-ops.

Extras are **API-only** — no browser sessions. They self-register through the
same `user.UserService/Register` RPC the frontend uses and act with real
Keycloak tokens, so RBAC is exercised for every one of them.

The capacity screenplay is `JOURNEY_CAST` in `personas.ts`: **13 registrations,
capacity 8, one dropout, one backfill, one no-show, one walk-in — final roster
13 (9 confirmed, 4 waitlisted), 8 of 9 confirmed seated in teams.** All cast
members share the dev password `aliceandbob`.

### Determinism pillars

**Reset to zero.** `scripts/reset.sh` stops the stack and runs
`just clean::state`, which deletes `.devenv/state/postgres` and
`.devenv/state/keycloak`. The next boot re-imports the realm from the
checked-in JSON and re-bootstraps the casbin admin role from backend config, so
`hackagon-admin` works on a completely empty database. `.state/journey.json` is
deleted too — cross-act state is only meaningful for the DB it was created on.

**Time travel by moving the event, not the clock.** `HackathonStatus` is
computed server-side from `starts_at` / `ends_at`, so the story shifts *dates*
via the Edit RPC (`{{now±Nd}}` tokens; acts 6 and 8 move the event into the
present and the past). Faking the system clock would fight JWT validity and
Keycloak. `scripts/timeshift.sh <hackathon-uuid> <days>` does the same thing
manually — it `Get`s the hackathon as `hackagon-admin`, adds N days to both
timestamps and `Edit`s them back. Caveat recorded in the script: phases carry
their own dates and `PhaseService` has no `Edit` yet, so it shifts only the
hackathon-level window (which is what drives the status badge and Join
cut-offs). Window fields must be time-travelled together with the event dates.

**Single worker, no retries.** `playwright.config.ts` sets `fullyParallel:
false`, `workers: 1`, `retries: 0`, `timeout: 60_000`, `expect.timeout:
10_000`, Firefox only. A stateful recipe cannot be retried mid-way — the retry
unit is a whole run after `scripts/reset.sh`. Failure artefacts (trace, video,
screenshot) are retained on failure into `.artifacts/test-results`; the HTML
report lands in `.artifacts/report`.

**API-driven acts, UI-asserted outcomes.** Mutations that have no UI yet run
through `helpers/api.ts` (grpcurl + real tokens); outcomes are asserted in
Firefox wherever the UI is real (badges, listings, 403s, the About text).
Roster counts are asserted through the API because the participants page still
renders mock data.

`.state/` and `.artifacts/` are gitignored
(`.claude/skills/hackathon-e2e/.gitignore`) and regenerated per run.

## 5. The recipe player

`.claude/skills/hackathon-e2e/recipe-player.html` is a **self-contained
animated replay** of the recipe — a single ~177 KB file with no external
assets, openable in any browser (and publishable as an artifact). It shows the
story act by act, colour-coded by action kind (create / join / approve / edit /
remove / vote / check / browse / files), and honours
`prefers-reduced-motion`.

The recipe is embedded verbatim:

```html
<script id="recipe-data" type="application/jsonl">
… recipe.jsonl, one JSON per line …
</script>
```

and parsed at load time with
`$("recipe-data").textContent.split("\n")…map(JSON.parse).filter(a => a.id)` —
the same comment-dropping rule as `loadRecipe()`.

**To rebuild after editing the recipe**: re-splice the current contents of
`recipe.jsonl` between the `<script id="recipe-data" type="application/jsonl">`
marker and its closing `</script>`. Nothing else in the file needs to change —
act names and colours are derived from the data.

## 6. Operational gotchas

**The casbin enforcer does not reload after external seeding.** The backend
loads the casbin policy table at startup and never re-reads it, so roles that
`just db::seed` writes straight into Postgres are invisible to a
already-running backend — membership badges render wrong and private
hackathons vanish from listings. `scripts/seed.sh` handles this by restarting
the process after seeding:

```bash
just db::seed
just deploy::proc-comp process restart backend
# then wait for health.HealthService/Check to answer again
```

If you seed by hand outside the e2e scripts, restart the backend yourself.

**`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`.** Inside the Nix dev shell
`ldd` is Nix's glibc `ldd`, whose linker does not search `/usr/lib`.
Playwright's host validation then reports every system library as missing even
though Firefox launches fine. `run.sh` exports this variable before invoking
Playwright; keep it if you invoke `playwright test` directly from the Nix
shell.

Relatedly, `run.sh` runs `playwright install --with-deps firefox` **first** and
only falls back to a plain `playwright install firefox`. A plain install
"succeeds" without the system libraries and Firefox then fails at *launch*
time, which the fallback cannot catch.

**Keycloak warm-up retry on the first login after a reset.** Right after a
state wipe the first redirect into a freshly imported realm can exceed the
normal timeout. `loginViaKeycloak` in `helpers/login.ts` retries the whole
entry sequence once with a 45 s `waitForURL` window before giving up. The realm
serves a two-step login (username → Sign In → password); the helper falls
through to the single-step form when `#password` is already present.

**Other symptoms and fixes**

| Symptom | Cause / fix |
| --- | --- |
| All journey acts skip | `.state/capabilities.json` missing or stale — run `scripts/probe.sh` with the backend up. |
| Extras cannot get tokens | `scripts/roster.sh` did not run (needs Keycloak up). `run.sh journey` runs it automatically. |
| Firefox fails to launch | `pnpm exec playwright install --with-deps firefox` (needs sudo/apt — fine in the devcontainer; on NixOS use `playwright-driver.browsers`). |
| Frontend never ready | Not in the process-compose shell: `cd components/frontend && just serve`. |
| Windows host | Use the `devcontainer-up` skill; do not run the stack natively. If git checks scripts out with CRLF: `git config core.autocrlf input` and re-checkout. |
| Journey fails at `act1.guard` ("hackathon already exists") | The database was not empty — the journey needs a reset; do not pass `--no-reset`. |

## 7. Extending

- **Lifecycle steps** — edit `recipe.jsonl`, never `tests/journey/recipe.spec.ts`.
- **A woken-up `todo` fails** — align the guessed `params` with the landed
  proto, then delete the `todo`.
- **A `ui.assert` skips as "not implemented"** — the page now renders real
  data: add the named assertion to `UI_ASSERTS` in `helpers/recipe.ts` (and any
  result check to `CHECKS`).
- **A new lifecycle RPC to track** — add it to `METHODS` in `scripts/probe.sh`.
- **A bigger crowd** — append to `cast.json`, add join/approve/vote lines to
  `recipe.jsonl`, and keep the roster-count assertions in sync.
- **The seed fixture changed** — update `SEED_HACKATHONS` and
  `SEED_EXPECTATIONS` in `personas.ts` (smoke suite only).
- **A mutation gets a UI** — convert that `rpc` action into a `ui.flow`
  (clicks, `setInputFiles` with the generated bundle) and keep the
  expectations.

## Two audits the suites cannot run for you

Both suites answer "does this work when you drive it?". Neither answers "can
anyone GET here?" — a passing test that reached the page with `page.goto` proves
the route works, not that the product offers a way in. Every bug of this shape
found so far was invisible to a green suite, so the checks are mechanical on
purpose.

**Routes with no inbound link.** List every route, then look for its last static
segment in any href, `goto` or redirect in `src/`:

```bash
# routes
find components/frontend/src/routes -name '+page.svelte' -o -name '+server.ts'
# links
rg -o '(href|goto|redirect\(\d+,)[^)"]*' components/frontend/src
```

Found: `/account` reachable only by URL (the link lived in a component no route
mounts), `/manage/pages` — the platform CMS — linked from nowhere at all, and
the preferences CSV endpoint sitting under a path with no page.

**RPCs with no caller.** Every `rpc Name(` in `api/proto/**/*_service.proto`
against `.name(` in the frontend:

```bash
rg -o 'rpc (\w+)' -r '$1' api/proto --no-filename | sort -u
rg -o '\.\s*(\w+)\s*\(' -r '$1' components/frontend/src --no-filename | sort -u
```

Currently 97 of 102 RPCs have a frontend caller. The gaps this found were not
small: **CreateSubmission / EditSubmission / FinalizeSubmission** had none, so a
team could not turn work in; **EditSettings** had none, so `votingEnabled` —
which gates every ballot and defaults to false — could only be opened over
grpcurl; **SetVotingPolicy** had none, so an event could not state its own
rules, and `SubmitVote` ignored them anyway.

What is left without a caller is deliberate: `PageService.SetOrder` is a bulk alternative
to the MoveUp/MoveDown the CMS already uses, `GetVoteCategory` and `ListVotes`
have `List*` equivalents that drive the UI, and `registrationsEnabled` on
`EditSettings` is enforced nowhere (audit B3 — the `register` capability
governs, and a switch that does nothing is worse than no switch).

## See also

- [requirements.md](requirements.md) — the same recipe read as a requirement
  list.
- [lifecycle.md](lifecycle.md) — the story the journey suite plays, act by act.
- [getting-started.md](getting-started.md) — bringing up the stack the suites
  run against.
- [TODO.md](TODO.md) — the failures these suites currently pin as known.
