# Roadmap

What is needed to run the next hackathon on this platform, and what is needed
for the platform to be what it is meant to be. Written against branch
`sketch/06-08-26` (first drafted 2026-08-04, counts re-measured 2026-08-08).

This page is the product-level view. Its three companions carry the detail:

- [requirements.md](requirements.md) — the 309-requirement scoreboard
  summarising the executable spec; the source of truth for "is this behaviour
  built".
- [TODO.md](TODO.md) — the engineering list: bug ids (`B*`, `F*`) and the
  ordered checklist.
- [lifecycle.md](lifecycle.md) — how the flow behaves today, the pinned policy
  decisions, and the 14 open decisions.

## Definitions

| Term | Meaning |
| ---- | ------- |
| **MVP** | Enough to run the *next real hackathon* end to end. Organizers may compensate manually (send emails by hand, decide capacity by not approving, assemble teams from an exported spreadsheet). Nothing in the critical path may require a developer. |
| **Core** | The platform's full identity as the reusable SDSC hackathon platform: an organizer can stand up an event, run it, and archive it without manual compensation, and can do it again next year from a template. |

Everything outside both lists is [explicitly unscheduled](#explicitly-unscheduled)
— named so it is a decision, not an oversight.

## The designed user flow

This is the product's reason to exist. Everything below is scored against it.

> (1) A participant registers → (2) is automatically added to the current
> active hackathon → (3) can propose projects (editable) and submit preferences
> on approved projects → (4) teams are assigned semi-automatically → (5) a
> confirmation email goes out → (6) the event runs, teams are edited by
> attendance → (7) one participant submits per team → (8) participants vote →
> (9) winners are announced on the main page.

| # | Step | MVP? | State on this branch |
| - | ---- | ---- | -------------------- |
| 1 | Participant registers | **MVP** | Built. `UserService.Register` from Keycloak claims, then `HackathonService.Join` → waitlist ([lifecycle act 2](lifecycle.md#act-2--t-3-months-registration)). |
| 2 | Automatically added to the current active hackathon | **MVP**, small addition | Join exists but must be called explicitly; there is no "current active hackathon" concept and no auto-join on first sign-in. Needs a small addition on top of built primitives. Assumes **a single active event** — the multi-event picker is this step's add-on twin. |
| 3 | Propose projects (editable) + preferences on approved projects | **MVP** | Built. `ProjectService.Propose`/`Edit`/`Delete`/`Approve`, `SetPreference` with re-ranking ([acts 3–4](lifecycle.md#act-3--t-2-months-proposals)). Waitlisted registrants may do both — pinned. |
| 4 | Teams assigned semi-automatically | **MVP** (manual half only) | The manual half is built: `ExportPreferences`, `TeamService.Create`/`AssignUser`/`RemoveUser`, rebalancing. **The matching algorithm is an add-on** — for MVP the organizer seats people from the export. |
| 5 | Confirmation email | **add-on** | Not built and deliberately deferred: no notification service exists (`act1.config.emails`, [open decision 9](lifecycle.md#open-decisions)). MVP organizers mail by hand. |
| 6 | Event runs; teams edited by attendance | **MVP** | Built. Status computed from dates, phases, `AdvancePhase`, the no-show and walk-in flows including `OverrideWindow` ([act 6](lifecycle.md#act-6--t0--t1-event-days)). |
| 7 | One participant submits per team | **MVP** | Built. `CreateSubmission`/`EditSubmission`/`FinalizeSubmission` at the team domain, window-gated, finalized submissions frozen. Submissions are **links**, not uploads. |
| 8 | Participants vote | **MVP** | Built for `single_choice`: categories, one ballot per voter per category, organizers neutral, open/close via `EditSettings{voting_enabled}`. **Ranked ballots and the jury channel are add-ons** ([open decision 5](lifecycle.md#open-decisions)). |
| 9 | Winners announced on the main page | **MVP** | Built. `CreateVoteResult` + `PrizeService.Finalize` (votes are advisory), published as public `PageService` pages readable anonymously ([act 8](lifecycle.md#act-8--t1-week-post-event)). |

Read together: **steps 1, 3, 4 (manual half), 6, 7, 8 and 9 are MVP and already
built on the backend**; step 2 is MVP but needs a small auto-Join addition;
step 5 is entirely an add-on.

## MVP

| Feature | State |
| ------- | ----- |
| Hackathon create / edit / delete, visibility, dates, logo | **Backend green.** Act 1: 25 ✓ / 2 deferred ([requirements](requirements.md#part-i--backend-requirements-195)). Private drafts invisible to anonymous `List`. |
| Authentication and anonymous access | **Green.** Keycloak + Auth.js; a single interceptor injects anonymous claims so public reads work without a token ([rbac.md](backend/rbac.md), [routes-and-auth.md](frontend/routes-and-auth.md)). |
| Join → waitlist → approve, dropout, backfill | **Backend green.** Acts 2 and 5: 37 ✓ and 26 ✓. Idempotent; capacity is organizer-enforced by not approving. Carries **B1** (crash on undated events) and **B9** (private events joinable with the UUID). |
| Organizer-defined registration forms | **Backend green.** `ConfigService.SetRegistrationForm` + `SubmitRegistrationForm`, strict schema validation, required consents, `on_behalf_of` for walk-ins. No UI. |
| Pages / public landing content | **Backend green.** `PageService` full CRUD, ordering, hidden pages, anonymous read on public events. Frontend renders only a "News & Pages" strip, and **F6** (unsanitized `{@html}`) blocks feeding it real page content. |
| Tracks and project proposals | **Backend green.** Act 3: 12 ✓. Proposer owns their proposal; organizer approves. Frontend list is read-only. |
| Preferences and manual team formation | **Backend green.** Act 4: 23 ✓, every confirmed participant seated. Carries **B8** (`SetPreference` has no casbin check). |
| Submissions (links) | **Backend green.** Act 6 submission chain draft → edit → final, deadline + grace override. Structured/validated submission fields are [open decision 6](lifecycle.md#open-decisions); uploads wait on blob storage. |
| Voting and prize finalize | **Backend green.** Act 7: 26 ✓. `single_choice` only. Carries **B7** (`ownTeamVoting` stored but unenforced) and the unsettled sum-vs-mean aggregation rule. |
| Time windows, overrides, capabilities | **Backend green.** Three composing gates with distinct failure codes ([the three gates](lifecycle.md#the-three-gates)). `late_policy` is inert. |

### The MVP gap

Two buckets, both already itemised in [TODO.md](TODO.md).

**1. Frontend wiring** — the backend is ahead of the UI everywhere that matters:

| Missing UI | Backend it would call | Blocked by |
| ---------- | --------------------- | ---------- |
| Real Join button (dashboard says `alert('Join: not yet implemented')`) | `HackathonService.Join` | **F2**, and **F1**/**B2** — signed-in non-members are redirected into the member view and hit a 403 with no Join affordance |
| Registration form rendering + submit | `SetRegistrationForm` / `SubmitRegistrationForm` | nothing but the work |
| Proposal + preference forms | `Propose`, `Edit`, `SetPreference` | nothing but the work |
| Submission form | `CreateSubmission` / `Finalize` | nothing but the work |
| Voting UI | `VoteService` | nothing but the work — act 7 has **0** frontend requirements today ([Part II](requirements.md#part-ii--frontend-requirements-45)) |
| Public landing driven by real `Page` content | `PageService.List` (public fallback) | **F6** — needs a markdown parser + sanitizer first |
| Organizer console for the calls above | `ConfigService`, `PrizeService`, approvals | nothing but the work |

**2. "Correctness first" bugs** — the [TODO checklist](TODO.md#correctness-first)
in its stated order: **B1** (nil-deref crash), **B2 + F1 + F2** (public
visibility matrix, non-member reads, real Join), **B3** (two contradictory
registration gates), **B4** (phase dates dropped), **B5** (casbin write failures
swallowed), **B8** (missing casbin check), **B9** (visibility check on `Join`),
plus **F6** from the [security section](TODO.md#security) and **F3**
(untranslated `PERMISSION_DENIED` → 500).

## Core (beyond MVP)

The reusable-platform features. Roughly ordered by how often their absence
forces manual compensation.

| Capability | Why it is Core | Today |
| ---------- | -------------- | ----- |
| **Email notifications** | Confirmations, reminders, deadline warnings, invites. Every MVP event pays for this by hand. | No service. `SetEmailTemplates` is documentation only ([open decision 9](lifecycle.md#open-decisions)); a Mailpit sidecar is sketched in `.devcontainer/README.md`. |
| **Invitation links + `AddParticipant`** | The only real answer for private events; today privacy is discovery-only. | Agreed direction, not in code ([open decision 4](lifecycle.md#open-decisions), **B9**). The private "Winter draft" fixture is ready for the tests. |
| **Jury channel with weighted criteria** | Most SDSC events judge with a panel, not only a popular vote. | `VoteCategory` already carries a `JURY` voter type; weights and per-criterion scoring do not exist. |
| **Configurable voting mechanisms end to end + tie-breaking** | `SetVotingPolicy` already advertises mechanisms the tally cannot honour. | Ranked/points ballots return `InvalidArgument`; the `Vote` row shape cannot hold a ranking ([open decision 5](lifecycle.md#open-decisions)). Aggregation rule (sum vs mean) unpinned. |
| **Reporting / export + external leaderboard integration** | Post-event reporting and publishing results outside the platform. | `ExportPreferences`, `ExportVotes`, `ExportResults` exist as raw exports; no report format, no outbound integration. |
| **Event cloning / templates + config export** | "Run it again next year" is the difference between a platform and a one-off. | Nothing. Every event is configured from scratch through `ConfigService`. |
| **Organizer console** | Stats, bulk operations, team status tracking, audit log. | Approvals are one RPC at a time; audit snapshots exist only in the recipe's assertions; no admin UI beyond `/manage/users`. |
| **Per-event branding + richer CMS** | Events want their own look; pages want more than one markdown blob. | Logo only ([open decision 10](lifecycle.md#open-decisions), `act1.config.branding` deferred). |
| **GDPR deletion / data access** | Legal requirement for a hosted platform. | `UserService.DeleteAccount` has no proto; semantics unpinned ([open decision 7](lifecycle.md#open-decisions)); tracked as three deferred recipe actions. |
| **Media uploads (blob storage)** | Logos are data URIs, submissions and photos are links. | Links-first until blob storage lands; the byte-stable upload fixture bundle is already built ([Part III](requirements.md#part-iii--test-infrastructure-1)). |
| **`LICENSE` / open-source hygiene** | The repo is meant to be open source and has no license file. | [TODO housekeeping](TODO.md#housekeeping). |

## Explicitly unscheduled

Not on the MVP list, not on the Core list. Named here so that "we chose not to"
is on the record.

| Item | Note |
| ---- | ---- |
| Magic-link login | Keycloak is the identity provider; a second login path is a support burden, not a feature. |
| Mentors role | No role beyond `Owner` / `Member` (per-hackathon) and `Admin` / `HackathonOrganizer` (global) — see [rbac.md](backend/rbac.md). Adding one is cheap when a real event asks for it. |
| In-app notification center | The dashboard sidebar is a placeholder. Email first; in-app second, if ever. |
| Semi-automatic matching | The *algorithm*. `ExportPreferences` plus manual seating is the intended MVP answer, and it is the answer that has actually run events. |
| Analytics dashboards | Organizer stats belong to the Core organizer console; standalone analytics do not have a customer yet. |

## Where each list is tracked

| List | Tracked in |
| ---- | ---------- |
| Requirement-level truth | `.claude/skills/hackathon-e2e/recipe.jsonl` (309 actions), summarised in [requirements.md](requirements.md) |
| Bugs and cleanup order | [TODO.md](TODO.md) |
| Policy questions blocking design | [lifecycle.md § open decisions](lifecycle.md#open-decisions) |
| Burn-down | the availability heatmap in `recipe-player.html` |
