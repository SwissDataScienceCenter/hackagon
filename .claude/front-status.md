# Frontend wiring status — real backend data vs. fake data

Branch: `feat/frontend` · Last checked: 2026-07-28

Route-by-route: does this page's `load` function call a real gRPC method and
render what comes back, or is the content hardcoded in the `.svelte` file?
See the [[frontend-data-wiring]] skill for the pattern to use when wiring a
new one (own `+page.server.ts`, reuse parent data via `event.parent()`, shape
server-side, no viewer-role distinctions in participant-facing pages).

## Recent changes (newest first)

- Admin section given a first-draft UI: `AdminSubNav` component (Home /
  Administrate Projects / Administrate Users / Administrate Teams / General
  Settings — only the first two are real links, the rest are disabled
  placeholders since no backend/route exists yet), `(admin)/+layout.svelte`
  now renders it, `(admin)/users` redesigned with a working search box and a
  table matching the team's reference mockup. Only `Photo` (initials
  fallback), `Display Name`, and `Email` are real — `SurName`, `Name`,
  `Status`, `Employer's Category`, `Employer` render `—`; the `User` backend
  model has no such fields (`id, username, keycloakId, createdAt,
  displayName, email, roles, modifiedAt`). `Actions` has a disabled "Edit"
  placeholder — no edit/delete RPC exists for users yet.
- `ParticipantCard`'s "View" button/prop removed entirely (not just hidden) —
  it had no real destination.
- Guideline adopted: per-hackathon `participants` list stays free of any
  viewer-role distinction (no admin-only fields/actions) — admin/user
  management belongs in `/(admin)/*`, not nested under
  `hackathon/[slug]/participants/`. An admin-gated contact-details detail
  page was tried there and reverted for this reason.
- `.../proposals` wired (own `+page.server.ts`, reuses the layout's
  `hackathon.get()` via `event.parent()`, maps `hackathon.projects`
  server-side). `overview`'s proposal preview card updated in the same
  pass — real project count/preview, and track chips now derive from real
  `hackathon.tracks` grouped by `trackId` instead of two hardcoded strings.
- `participants` given the same client-side pagination pattern as
  `teams`/`proposals` (`pageSize = 8`, page-number nav).
- `page` and `phase` gRPC clients added to `AuthorizedGrpc` in `client.ts`
  (infrastructure only — no route calls them yet).
- Post-rebase discovery: `PageService` and `PhaseService` are now registered
  and fully implemented at runtime, `HackathonService` gained `Join` /
  `ApproveParticipant` / `RemoveParticipant`, and `TrackService` is also
  fully implemented + registered (contradicts a stale CLAUDE.md note claiming
  "List/Get only" — trust `track_service.go` over the doc). `ProjectService`
  and `TeamService` are still not registered anywhere.
- `HackathonService.Get` was found to eager-load `Tracks`, `Projects`,
  `Pages`, and `Phases` alongside `Members` — all fully populated today, not
  just proto contracts. This is why `proposals`/`timeline`/track-chips turned
  out to be wireable without any backend work.

## Standing notes

- **No pagination anywhere in the API** — no `page_size`/`page_token`/`limit`/
  `offset`/`cursor` field on any `List`/`Get` message across `api/proto/`, and
  no backend handler calls `.Limit()`/`.Offset()`. `HackathonService.Get`
  returns *all* projects/phases/tracks/pages/members every load. The
  client-side pagination in `proposals`/`teams`/`participants` slices an
  already-fully-fetched list — consistent UX, but no payload/query benefit.
  Real pagination would need proto + DB changes if data volume ever warrants it.
- **Frontend-only access gates are not real security boundaries.** Nothing in
  `HackathonService.Get` filters `members[].user.email` by the caller's role —
  any confirmed participant already receives every other member's email in
  the raw response. Hiding a field or gating a route client-side is a UX
  convenience, not enforcement; real enforcement needs a backend change.

## Recommended next quick win

**Wire the Dashboard "Join" button.** `HackathonService.Join({hackathonId})`
is live, takes only `hackathonId` (caller resolved from the JWT), and today
it's just `alert('Join: not yet implemented')` in
`DashboardView.svelte:54-56,129-134`. This is the one remaining case where a
real, fully-live *mutation* is sitting behind a fake stub — needs a SvelteKit
form action in `routes/(participant)/dashboard/+page.server.ts` (matching the
`signin`/`signout` action pattern) rather than a plain `load` change.

## ✅ Fully wired — real gRPC call, renders the response

| Route | File | Backend call |
|---|---|---|
| `/` (landing) | `routes/+page.server.ts` | `publicHackathonClient.list({ visibilityFilter: PUBLIC })` (unauthenticated) |
| `/(participant)/dashboard` | `routes/(participant)/dashboard/+page.server.ts` | `hackathon.list({ visibilityFilter: PUBLIC })` + `hackathon.list({ participantId })`, deduped client-side |
| `/(participant)/hackathon/[slug]` layout (hero, phase bar, badges) | `.../[slug]/+layout.server.ts` + `+layout.svelte` | `hackathon.get({ hackathonId: slug })`; handles 403 (not a confirmed member) / 404 |
| `.../participants` | `participants/+page.server.ts` + `+page.svelte` | reuses layout's `hackathon.get()` via `event.parent()`, maps `hackathon.members` server-side — no duplicate call |
| `.../proposals` | `proposals/+page.server.ts` + `+page.svelte` | reuses layout's `hackathon.get()` via `event.parent()`, maps `hackathon.projects` server-side — no duplicate call |
| `/(admin)/users` | `routes/(admin)/users/+page.server.ts` | `user.list({})` |

## 🟡 Partially wired — real data mixed with hardcoded content

| Route | File | What's real | What's fake |
|---|---|---|---|
| `.../overview` | `overview/+page.svelte` | "About" section, proposal preview (count/list), track chips — all real, read via cascaded layout `data`, but this route still has **no `+page.server.ts` of its own**, unlike `participants`/`proposals` | `ParticipationCard` (team name "Bishorn", role, project name — all hardcoded props), `HackathonSidebar` `isAdmin={false}` (hardcoded, never reads the caller's real role) |

## Genuinely wireable today — no backend work needed

| Route/feature | Real data available | Notes |
|---|---|---|
| Dashboard "Join" button | `HackathonService.Join({hackathonId})` — live | See "Recommended next quick win" above. |
| `.../timeline` | `hackathon.phases` (embedded in `Get`) — `id, name, description, startsAt, endsAt`; or `PhaseService.List`/`Get` directly | The layout already derives a trimmed `{name, status}` for the phase bar; the dedicated tab could show the fuller info that's currently discarded. |
| A real "Pages"/CMS feature | `PageService` full CRUD — live; `hackathon.pages` (`title`, `content`, `visible`, `order`) also embedded in `Get` | `page` client now added to `AuthorizedGrpc`. Text/content model, not photos — see below. |
| Admin: approve/remove waitlisted participants | `HackathonService.ApproveParticipant({hackathonId, userId})` / `RemoveParticipant` — live | No frontend surface at all yet. Per the participants guideline above, this belongs under `/(admin)/*`, not the hackathon-scoped participants page. |

## ❌ Not wired, and genuinely blocked on backend work

| Route | File | Notes |
|---|---|---|
| `.../teams` | `teams/+page.svelte` | `Hackathon` entity has **no `teams` field at all** (not eager-loaded in `Get`), and `TeamService` isn't registered. 9-team hardcoded array today. |
| `.../submissions` | `submissions/+page.svelte` | Same: no `submissions` field on `Hackathon`, no `SubmissionService` proto (only the DB table + entity exist). 5-line stub. |
| `.../webinars` | `webinars/+page.svelte` | No backend concept anywhere. 5-line stub. |
| `.../photos` | `photos/+page.svelte` | No "photo"/image-gallery concept anywhere. `hackathon.pages` is real but is a title+text-content model, not images — conceptual mismatch. 5-line stub. |
| `/hackathon/[slug]` (public marketing page) | `routes/hackathon/[slug]/+page.server.ts` + `+page.svelte` | Makes **no gRPC call at all**. Could get real `name`/`dates`/`description`/`logo`/`status` via `publicHackathonClient.list()` (find-by-id client-side — no id/slug filter on `ListRequest`). Richer sections need `Get`, which requires being a confirmed participant/admin — anonymous visitors can never get that data regardless of frontend wiring. |
