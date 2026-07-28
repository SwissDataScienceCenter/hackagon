# Frontend wiring status — real backend data vs. fake data

Branch: `feat/frontend-add-admin-section` · Date: 2026-07-28

Route-by-route: does this page's `load` function call a real gRPC method and
render what comes back, or is the content hardcoded in the `.svelte` file
regardless of what's in the database?

**Correction (2026-07-28, after digging into the Go handler):** `HackathonService.Get`
(`components/backend/internal/service/hackathon_service.go:112-121`) already
eager-loads `Tracks`, `Projects`, `Pages`, and `Phases` on top of `Members` —
all fully populated at runtime today, not just proto contracts. That means
`proposals`, the overview proposal preview, the timeline tab, and the fake
track-category chips are wireable **right now** with zero backend work — see
"Genuinely wireable today" below. Only `teams` and `submissions` are actually
blocked on backend work; see [[frontend-data-wiring]] skill for the wiring
pattern to use (own `+page.server.ts`, reuse via `event.parent()`, shape
server-side).

## ✅ Fully wired — real gRPC call, renders the response

| Route | File | Backend call |
|---|---|---|
| `/` (landing) | `routes/+page.server.ts` | `publicHackathonClient.list({ visibilityFilter: PUBLIC })` (unauthenticated) |
| `/(participant)/dashboard` | `routes/(participant)/dashboard/+page.server.ts` | `hackathon.list({ visibilityFilter: PUBLIC })` + `hackathon.list({ participantId })`, deduped client-side |
| `/(participant)/hackathon/[slug]` layout (hero, phase bar, badges) | `.../[slug]/+layout.server.ts` + `+layout.svelte` | `hackathon.get({ hackathonId: slug })`; handles 403 (not a confirmed member) / 404 |
| `.../participants` | `participants/+page.server.ts` + `+page.svelte` | reuses layout's `hackathon.get()` via `event.parent()`, maps `hackathon.members` server-side — no duplicate call |
| `/(admin)/users` | `routes/(admin)/users/+page.server.ts` | `user.list({})` |

## 🟡 Partially wired — real data mixed with hardcoded content

| Route | File | What's real | What's fake |
|---|---|---|---|
| `.../overview` | `overview/+page.svelte` | "About" section (`data.hackathon.description`, inherited from the layout — but this route still has **no `+page.server.ts` of its own**, unlike `participants` now) | `ParticipationCard` (team name "Bishorn", role, project name — all hardcoded props), the two listed proposals + "16 proposals" / "9" / "7" counts (real data — `hackathon.projects` — sits unused right next to it), `HackathonSidebar` `isAdmin={false}` (hardcoded, never reads the caller's real role) |

## Genuinely wireable today — real data already returned by `Get`, currently unused

| Route | Real field (from `hackathon.get()`) | Notes |
|---|---|---|
| `.../proposals` + overview's proposal preview | `hackathon.projects` — `id, title, description, status (ProjectStatus enum), image, trackId` | `ProjectService`'s own CRUD RPCs (`Propose`/`Approve`/`Edit`/`Delete`) are still unregistered, but the *read* path doesn't need them — `Get` already returns the full list. |
| `.../timeline` | `hackathon.phases` — `id, name, description, startsAt, endsAt` | The layout already derives a trimmed `{name, status}` for the phase bar from this same data; the dedicated tab could show the fuller phase info that's currently discarded. |
| overview's fake track chips ("DATA SCIENCE", "RESEARCH DATA INFRA") | `hackathon.tracks` | Currently hardcoded strings; real track names are sitting unused in the same response. |

## ❌ Not wired, and genuinely blocked on backend work

| Route | File | Notes |
|---|---|---|
| `.../teams` | `teams/+page.svelte` | `Hackathon` entity has **no `teams` field at all** (not eager-loaded in `Get`), and `TeamService` isn't registered in `main.go`. 9-team hardcoded array today. Needs real backend work (handler + embedding teams in `Get`, or a separate `team.list({hackathonId})` call once registered). |
| `.../submissions` | `submissions/+page.svelte` | Same: no `submissions` field on `Hackathon`, and no `SubmissionService` proto exists yet (only the DB table + entity). 5-line stub. |
| `.../webinars` | `webinars/+page.svelte` | No backend concept anywhere. 5-line stub. |
| `.../photos` | `photos/+page.svelte` | No "photo" concept anywhere. `hackathon.pages` (`title`, `content`, `visible`, `order` — a real lightweight CMS) exists and is unused, but that's text content, not a photo/gallery model — a conceptual mismatch, not a ready-to-wire fit. 5-line stub. |
| `/hackathon/[slug]` (public marketing page) | `routes/hackathon/[slug]/+page.server.ts` + `+page.svelte` | Makes **no gRPC call at all** — only checks session and redirects logged-in users to `/overview`. Could get real `name`/`dates`/`description`/`logo`/`status` via `publicHackathonClient.list({visibilityFilter: PUBLIC})` (find-by-id client-side — `ListRequest` has no id/slug filter). The richer sections (organizers, tracks, full page content) need `Get`, which per CLAUDE.md requires being a confirmed participant or admin — anonymous visitors can never get that data regardless of frontend wiring. |
