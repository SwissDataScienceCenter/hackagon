# Frontend wiring status — real backend data vs. fake data

Branch: `feat/frontend` · Last audited: 2026-07-30 (full route sweep after the
sidebar/nav redesign)

Route-by-route: does this page's `load` call a real gRPC method and render what
comes back, or is the content hardcoded in the `.svelte` file? See the
[[frontend-data-wiring]] skill for the pattern when wiring a new one (own
`+page.server.ts`, reuse parent data via `event.parent()`, shape server-side, no
viewer-role distinctions in participant-facing pages).

**This doc deliberately has no changelog.** Earlier versions kept a "Recent
changes (newest first)" log that duplicated `git log` and went stale faster than
the inventory below. Use `git log` for history; keep this file a snapshot of
*current* state only.

**Backend is further along than docs tend to claim.** All eight services are
registered and implemented (see Runtime status in `CLAUDE.md`). Before assuming
something is blocked on backend work, check
`components/backend/internal/service/server.go` and the handler file.

## ✅ Fully wired — real gRPC data end to end

| Route | Backend call |
|---|---|
| `/dashboard` | `hackathon.list({ visibilityFilter: PUBLIC })` + parent's `myHackathons`; `join` action → `hackathon.join` |
| `/hackathon/[slug]` layout | `hackathon.get({ hackathonId })`; handles 403 (not a confirmed member) / 404 |
| `.../overview` | own `+page.server.ts`: `event.parent()` for the hackathon + `team.list({ hackathonId })` to find the viewer's team |
| `.../participants` | `event.parent()` → maps `hackathon.members`, no second call |
| `.../proposals` | `event.parent()` → maps `hackathon.projects` |
| `.../proposals/[projectId]` | `event.parent()` → finds project + track |
| `.../proposals/create` | `propose` action → `project.propose` |
| `.../teams` | `team.list({ hackathonId })` + `event.parent()` for project titles |
| `.../teams/[teamId]` | `team.get({ teamId })` |
| `.../timeline` | `event.parent()` → sorts `hackathon.phases` |
| `.../pages/[pageId]` | `event.parent()` → finds the visible page |
| `/owner/hackathon/[slug]` layout | `hackathon.get`; UI gate to Owner / global Admin (403 otherwise) |
| `/owner/hackathon/[slug]` (index) | stats + pending list from layout data; `approve`/`remove` → `hackathon.approveParticipant`/`removeParticipant` |
| `.../participants` (owner) | same two RPCs, via `event.parent()` |
| `.../pages` + `new` + `[pageId]/edit` | `page.list`/`create`/`get`/`edit`/`delete` |
| `.../phases` + `new` + `[phaseId]/edit` | `phase.list`/`create`/`get`/`edit`/`delete`; `new`/`edit` also call `page.list` for the linked-page select |
| `.../tracks` + `new` + `[trackId]/edit` | `track.list`/`create`/`get`/`edit`/`delete` |
| `.../teams` + `new` + `[teamId]/edit` | `team.list`/`create`/`get`/`edit`/`delete` |
| `/hackathons` (admin) | `hackathon.list({})` |
| `/hackathons/new` | `create` action → `hackathon.create`, redirects to `/owner/hackathon/<id>` |
| `/hackathons/[slug]` + `/edit` | `hackathon.get`, `hackathon.edit` |
| `/users` (admin) | `user.list({})` |
| `/` (landing) | `publicHackathonClient.list({ visibilityFilter: PUBLIC })` — unauthenticated client |

## 🟡 Real data with hardcoded remnants

| Where | What's still fake |
|---|---|
| `hackathon/[slug]/+layout.svelte` | `HeroCompact` gets `venue=""`, `organizers={[]}`, and `participantCapacity={participantCount}` — capacity is a stand-in; no such backend field exists |
| `ParticipationCard.svelte` | `REGISTERED` badge is a literal; member avatars are grey circles generated from `Array.from({length: teamMemberCount})`. The card's actual data is real |
| `(marketing)/+page.svelte` | hackathon rows are real; `carouselSlides` (photo paths + captions) and the gradient palette are hardcoded |
| `/owner/hackathon/[slug]/+page.svelte` | stale copy: "Managing pages, phases and tracks from here is coming soon" — all three sub-pages now exist |

## ❌ Not wired

| Route | State | Blocked on? |
|---|---|---|
| `.../submissions` | `<HackathonUnderConstruction />`, no `+page.server.ts` | **Nothing.** `TeamService.CreateSubmission`/`FinalizeSubmission` are implemented, and `team.get` already returns a team's submissions |
| `(marketing)/hackathon/[slug]` | `+page.server.ts` makes zero gRPC calls — it only redirects signed-in users to `/hackathon/<slug>/overview`, else `return {}`. Page hardcodes title, dates, venue, organizers, webinar speakers, `42 of 100 spots` | Partly. `name`/`dates`/`description`/`logo`/`status` are reachable via `publicHackathonClient.list()` (find-by-id client-side — `ListRequest` has no id/slug filter). Richer content needs `Get`, which requires confirmed membership, so anonymous visitors can never receive it |

## Next quick win

**Wire `.../submissions`.** It is the last participant-facing stub, and unlike
when this doc was first written it is *not* blocked — `TeamService` has
`CreateSubmission`/`FinalizeSubmission` implemented and `team.get` already
returns submissions for a team. Note the data model: submissions hang off a
`Team`, which hangs off a `Project`, not off the hackathon directly.

Second option: give `(marketing)/hackathon/[slug]` its real name/dates/logo from
`publicHackathonClient.list()`, accepting that the richer sections stay static
because anonymous callers cannot access `Get`.

## Standing notes

- **No pagination anywhere in the API** — no `page_size`/`page_token`/`limit`/
  `offset`/`cursor` on any `List`/`Get` message, and no handler calls
  `.Limit()`/`.Offset()`. `HackathonService.Get` returns *all*
  projects/phases/tracks/pages/members every load. Client-side pagination slices
  an already-fetched list: consistent UX, no payload benefit.
- **Frontend-only access gates are not security boundaries.** Nothing in
  `HackathonService.Get` filters `members[].user.email` by caller role — every
  confirmed participant already receives every other member's email. Hiding a
  field or gating a route client-side is UX, not enforcement.
- **Deleted, don't go looking for them:** the `webinars` and `photos` route
  stubs, and the `AdminSubNav`, `HackathonSubNav`, `HackathonSidebar`,
  `UserSidebar` components plus the whole `lib/components/admin/` folder. Nav now
  lives in `AppSidebar` + `$lib/navigation.ts` (see the navigation section of
  `CLAUDE.md`).
