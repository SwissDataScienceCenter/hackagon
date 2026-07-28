# Frontend wiring status — real backend data vs. fake data

Branch: `feat/frontend` · Last checked: 2026-07-28 (after rebase on `main`)

Route-by-route: does this page's `load` function call a real gRPC method and
render what comes back, or is the content hardcoded in the `.svelte` file
regardless of what's in the database?

**Update after rebase:** `main` picked up two new PRs since this doc was last
written — `feat/hackathon-join-pages-svc` and `feat/phase-svc`. Backend runtime
now registers `PageService` and `PhaseService` in addition to
`Health`/`User`/`Hackathon`
(`components/backend/internal/service/server.go:64-75`), and `HackathonService`
gained `Join`, `ApproveParticipant`, `RemoveParticipant` handlers
(`hackathon_service.go`). `ProjectService`, `TeamService`, and `TrackService`
are still **not** registered — no handler files exist for them under
`internal/service/`. See [[frontend-data-wiring]] skill for the wiring pattern
to use (own `+page.server.ts`, reuse parent data via `event.parent()`, shape
server-side).

**Frontend gap introduced by this:** `src/lib/server/grpc/client.ts`'s
`AuthorizedGrpc` still only exposes `user`, `health`, `hackathon` — `page` and
`phase` clients need to be added there before any route can call them, even
though the backend is ready.

**Update:** `page` and `phase` clients both added to `AuthorizedGrpc` in
`client.ts` — any route can now call
`page.list`/`.get`/`.create`/`.edit`/`.delete`/`.moveUp`/`.moveDown`/`.setOrder`
and `phase.list`/`.get`/`.create`/`.edit`/`.delete` via
`requireGrpc(event.locals.grpc).page`/`.phase`. No route calls either yet — this
was infrastructure only, no visible feature change.

**Update:** `TrackService` is now also fully implemented and registered in
`server.go` (`List`/`Get`/`Create`/`Edit`/`Delete`, confirmed by reading
`track_service.go` directly — note this contradicts the just-added CLAUDE.md
runtime-status note, which claims "List/Get only, no Create/Edit/Delete protos
yet"; the proto messages and handler bodies for all three exist, so that note is
stale the moment it landed). `AuthorizedGrpc` doesn't have a `track` client yet,
but for read purposes it's moot — `hackathon.tracks` is already embedded in
`Get` and flows through today. Still not registered: `ProjectService`,
`TeamService`.

**Update:** `.../proposals` now wired — new `proposals/+page.server.ts` reuses
the layout's `hackathon.get()` via `event.parent()` and maps
`hackathon.projects` server-side
(`{num: index+1, title, description, imageUrl}`), same pattern as
`participants`. `overview`'s proposal preview card also updated in the same
pass: real project count, real preview (first 2 `hackathon.projects`), and the
track-category chips now derive from real `hackathon.tracks` grouped by
`project.trackId` instead of two hardcoded "DATA SCIENCE"/"RESEARCH DATA INFRA"
strings. `overview` still has no `+page.server.ts` of its own — this fix read
`data.hackathon.projects`/`.tracks` via the layout's cascaded `data`, same as
the description field already did.

**Note on pagination:** there is no pagination anywhere in the API — no
`page_size`/`page_token`/`limit`/`offset`/`cursor` field on any `List`/`Get`
message across `api/proto/`, and no backend handler calls `.Limit()`/`.Offset()`
on an ent query. `HackathonService.Get` returns _all_
projects/phases/tracks/pages/members for a hackathon in one unbounded call,
every load. The `pageSize = 8` + page-number-button pattern in
`proposals`/`teams`/now `participants` is client-side array slicing of that
fully-fetched list — consistent UX across these tabs, by design, but it doesn't
reduce payload size or query cost. A real fix (proto pagination fields + DB
query limits) would be a larger, cross-cutting change if the data volume ever
warrants it.

**Recommended next quick win: wire the Dashboard "Join" button.**
`HackathonService.Join({hackathonId})` is live, takes only `hackathonId` (caller
resolved from the JWT), and today it's just `alert('Join: not yet implemented')`
in `DashboardView.svelte:54-56,129-134`. This is the one remaining case where a
real, fully-live mutation is sitting behind a fake stub instead of a fake _read_
— wiring it turns a dead button into working functionality end-to-end, not just
another data-shaping exercise. Needs a SvelteKit form action in
`routes/(participant)/dashboard/+page.server.ts` (matching the
`signin`/`signout` action pattern already used elsewhere) rather than a plain
`load` change, since it's a write.

## ✅ Fully wired — real gRPC call, renders the response

| Route                                                              | File                                              | Backend call                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/` (landing)                                                      | `routes/+page.server.ts`                          | `publicHackathonClient.list({ visibilityFilter: PUBLIC })` (unauthenticated)                                      |
| `/(participant)/dashboard`                                         | `routes/(participant)/dashboard/+page.server.ts`  | `hackathon.list({ visibilityFilter: PUBLIC })` + `hackathon.list({ participantId })`, deduped client-side         |
| `/(participant)/hackathon/[slug]` layout (hero, phase bar, badges) | `.../[slug]/+layout.server.ts` + `+layout.svelte` | `hackathon.get({ hackathonId: slug })`; handles 403 (not a confirmed member) / 404                                |
| `.../participants`                                                 | `participants/+page.server.ts` + `+page.svelte`   | reuses layout's `hackathon.get()` via `event.parent()`, maps `hackathon.members` server-side — no duplicate call  |
| `.../proposals`                                                    | `proposals/+page.server.ts` + `+page.svelte`      | reuses layout's `hackathon.get()` via `event.parent()`, maps `hackathon.projects` server-side — no duplicate call |
| `/(admin)/users`                                                   | `routes/(admin)/users/+page.server.ts`            | `user.list({})`                                                                                                   |

## 🟡 Partially wired — real data mixed with hardcoded content

| Route          | File                    | What's real                                                                                                                                                                                                                                                                               | What's fake                                                                                                                                                               |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.../overview` | `overview/+page.svelte` | "About" section, proposal preview (count/list from `hackathon.projects`), track chips (from `hackathon.tracks` grouped by `trackId`) — all real now, read via cascaded layout `data`, but this route still has **no `+page.server.ts` of its own**, unlike `participants`/`proposals` now | `ParticipationCard` (team name "Bishorn", role, project name — all hardcoded props), `HackathonSidebar` `isAdmin={false}` (hardcoded, never reads the caller's real role) |

## Genuinely wireable today — no backend work needed

| Route/feature                                                                                                       | Real data available                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard "Join" button                                                                                             | `HackathonService.Join({hackathonId})` — **live now**                                                                                                                                                    | Currently `alert('Join: not yet implemented')` in `DashboardView.svelte`. Trivial wire — request only needs `hackathonId`, caller resolved from JWT server-side.                                                                                                                                 |
| `.../timeline`                                                                                                      | `hackathon.phases` (embedded in `Get`) — `id, name, description, startsAt, endsAt`; alternatively the now-live `PhaseService.List`/`Get` directly                                                        | The layout already derives a trimmed `{name, status}` for the phase bar from the embedded data; the dedicated tab could show the fuller phase info that's currently discarded. `PhaseService` being registered also means phase CRUD (not just read) is now possible if an editing UI is wanted. |
| A real "Pages"/CMS-style feature (could replace `photos` conceptually, or back the public marketing page's content) | `PageService` full CRUD — **live now** (`List`/`Get`/`Create`/`Edit`/`Delete`/`MoveUp`/`MoveDown`/`SetOrder`); `hackathon.pages` (`title`, `content`, `visible`, `order`) also already embedded in `Get` | Needs the `page` client added to `AuthorizedGrpc` first (done). Note: this is a text/content model, not photos — see below.                                                                                                                                                                      |
| Admin: approve/remove waitlisted participants                                                                       | `HackathonService.ApproveParticipant({hackathonId, userId})` / `RemoveParticipant` — **live now**                                                                                                        | No frontend surface exists for this at all yet (not even mocked) — this is a net-new capability the backend just gained, worth a decision on whether/where to expose it (e.g. an admin tab on the hackathon layout, or the `/(admin)` section).                                                  |

## ❌ Not wired, and genuinely blocked on backend work

| Route                                       | File                                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.../teams`                                 | `teams/+page.svelte`                                       | `Hackathon` entity has **no `teams` field at all** (not eager-loaded in `Get`), and `TeamService` isn't registered in `main.go` — confirmed still true after rebase. 9-team hardcoded array today.                                                                                                                                                                                                                                                                                                                 |
| `.../submissions`                           | `submissions/+page.svelte`                                 | Same: no `submissions` field on `Hackathon`, and no `SubmissionService` proto exists yet (only the DB table + entity). 5-line stub.                                                                                                                                                                                                                                                                                                                                                                                |
| `.../webinars`                              | `webinars/+page.svelte`                                    | No backend concept anywhere. 5-line stub.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `.../photos`                                | `photos/+page.svelte`                                      | No "photo"/image-gallery concept anywhere. `PageService`/`hackathon.pages` is real and now fully live, but it's a title+text-content model, not images — a conceptual mismatch, not a ready-to-wire fit as-is. 5-line stub.                                                                                                                                                                                                                                                                                        |
| `/hackathon/[slug]` (public marketing page) | `routes/hackathon/[slug]/+page.server.ts` + `+page.svelte` | Makes **no gRPC call at all** — only checks session and redirects logged-in users to `/overview`. Could get real `name`/`dates`/`description`/`logo`/`status` via `publicHackathonClient.list({visibilityFilter: PUBLIC})` (find-by-id client-side — `ListRequest` has no id/slug filter). The richer sections (organizers, tracks, full page content) need `Get`, which per CLAUDE.md requires being a confirmed participant or admin — anonymous visitors can never get that data regardless of frontend wiring. |
