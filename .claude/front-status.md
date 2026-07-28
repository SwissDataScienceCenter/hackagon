# Frontend wiring status — real backend data vs. fake data

Branch: `feat/frontend-add-admin-section` · Date: 2026-07-28

Route-by-route: does this page's `load` function call a real gRPC method and
render what comes back, or is the content hardcoded in the `.svelte` file
regardless of what's in the database?

## ✅ Fully wired — real gRPC call, renders the response

| Route | File | Backend call |
|---|---|---|
| `/` (landing) | `routes/+page.server.ts` | `publicHackathonClient.list({ visibilityFilter: PUBLIC })` (unauthenticated) |
| `/(participant)/dashboard` | `routes/(participant)/dashboard/+page.server.ts` | `hackathon.list({ visibilityFilter: PUBLIC })` + `hackathon.list({ participantId })`, deduped client-side |
| `/(participant)/hackathon/[slug]` layout (hero, phase bar, badges) | `.../[slug]/+layout.server.ts` + `+layout.svelte` | `hackathon.get({ hackathonId: slug })`; handles 403 (not a confirmed member) / 404 |
| `/(admin)/users` | `routes/(admin)/users/+page.server.ts` | `user.list({})` |

## 🟡 Partially wired — real data mixed with hardcoded content

| Route | File | What's real | What's fake |
|---|---|---|---|
| `.../overview` | `overview/+page.svelte` | "About" section (`data.hackathon.description`, from the layout's `hackathon.get`) | Everything else: `ParticipationCard` (team name "Bishorn", role, project name — all hardcoded props), the two listed proposals + "16 proposals" / "9" / "7" counts, `HackathonSidebar` `isAdmin={false}` (hardcoded, never reads the caller's real role) |

## ❌ Not wired — fully hardcoded, ignores real data (or has none to use)

| Route | File | Notes |
|---|---|---|
| `/hackathon/[slug]` (public marketing page) | `routes/hackathon/[slug]/+page.server.ts` + `+page.svelte` | `+page.server.ts` does **no gRPC call at all** — it only checks session and redirects logged-in users to `/overview`. The rendered page (`HeroSection`, `OrganizersSection`, `MarkdownSection`, `EventsSection`, `HighlightsSection`, `VideoSection`, `CtaSection`) is 100% hardcoded copy about "ORD Hackathon 2026" — completely independent of the `[slug]` param. Visiting any slug shows the same fake content. |
| `.../participants` | `participants/+page.svelte` | No `+page.server.ts` for this route at all. 12-person `DemoParticipant[]` array hardcoded in the component. Doesn't read the `data` prop — real member data is already fetched by the layout (`hackathon.get`'s `members` edge) and sits unused. |
| `.../proposals` | `proposals/+page.svelte` | No server load. 16-item hardcoded array. "Propose a Project" button links to dead anchor `#propose`. |
| `.../teams` | `teams/+page.svelte` | No server load. 9-team hardcoded array (incl. `isOwn` flag). "Create Team" links to dead anchor `#create-team`. |
| `.../submissions` | `submissions/+page.svelte` | 5-line stub: `<HackathonUnderConstruction title="Submissions" />`. |
| `.../timeline` | `timeline/+page.svelte` | Same stub pattern. Note: the *layout* above it already renders a real `PhaseTimeline` from `hackathon.phases` — this dedicated tab is a placeholder duplicate. |
| `.../webinars` | `webinars/+page.svelte` | Same stub pattern. |
| `.../photos` | `photos/+page.svelte` | Same stub pattern. |

## Backend readiness behind the "not wired" pages

Wiring these up isn't purely a frontend task for most of them — `ProjectService`,
`TeamService`, and `PhaseService` have proto contracts and DB tables but **no
Go handler is registered in `main.go` yet** (see priority list in CLAUDE.md).
Only `participants` is a pure frontend fix today — the real data already
flows through the layout's `hackathon.get` call and just isn't used.

| Needed for | Proto | DB table | Runtime handler |
|---|---|---|---|
| participants | `HackathonMember` (via `HackathonService.Get`) | `Participant` | ✅ live already |
| proposals / overview proposal preview | `ProjectService` | `Project` | ❌ unregistered |
| teams | `TeamService` | `Team` + `TeamParticipant` | ❌ unregistered |
| timeline (dedicated tab) | `Phase` | `Phase` | ❌ `PhaseService` unregistered |
| submissions | `Submission` entity exists, no `SubmissionService` proto yet | `Submission` | ❌ n/a |
| webinars / photos | no backend concept at all | none | n/a |
| public marketing page `/hackathon/[slug]` | `HackathonService.Get`/`List` already cover this data | `Hackathon` | ✅ live — page just doesn't call it |
