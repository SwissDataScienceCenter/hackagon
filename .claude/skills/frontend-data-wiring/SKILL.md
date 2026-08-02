---
name: frontend-data-wiring
description:
  How hackagon's SvelteKit frontend talks to the Go gRPC backend — registering a
  client, loading data in +page.server.ts, translating gRPC errors into HTTP
  errors, where data-shaping belongs, registering a sidebar entry, and which
  pages are still mocked. Use for any work under components/frontend/, especially
  adding a route, un-mocking a page, or wiring one to real backend data.
---

**The backend is authoritative for all access decisions.** The frontend never
duplicates permission logic — it only translates gRPC errors into HTTP responses.

## 1. Register the gRPC client

In `src/lib/server/grpc/client.ts`:

- Import the service definition and client type from
  `generated/<domain>/<name>_service`.
- Add the client to the `AuthorizedGrpc` interface.
- Create it inside `createAuthorizedGrpc` with
  `factory.create(XServiceDefinition, channel)`.
- For endpoints serving anonymous callers, create a separate unauthenticated
  client *outside* `createAuthorizedGrpc` — `publicHackathonClient` is the
  pattern.

## 2. Always give the route its own `+page.server.ts`

Even when an ancestor `+layout.server.ts` already loaded the data (SvelteKit
merges parent data into the child's `data` prop automatically). Don't let the
`.svelte` file reach into inherited layout data — make the dependency explicit
and typed via the route's own load function.

```ts
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { myService } = requireGrpc(event.locals.grpc)
  const result = await myService.list({})
  return { items: result.items }
}
```

- `event.locals.grpc` is populated by `hooks.server.ts` for protected routes.
- `event.locals.platformUser` holds the logged-in user (DB UUID in `.id`).
- Use `Promise.all([...])` for independent parallel requests.

## 3. Don't refetch what the parent already loaded

```ts
const { hackathon } = await event.parent()
```

`HackathonService.Get` eager-loads `Members`, `Tracks`, `Projects`, `Pages` and
`Phases`, all fully populated — so most per-hackathon pages need **no** second
call. Reuse it.

## 4. Translate gRPC errors

Catch `ClientError` from `nice-grpc-common` and map to SvelteKit errors:

```ts
import { ClientError, Status } from "nice-grpc-common"
import { error } from "@sveltejs/kit"

try {
  result = await myService.get({ id })
} catch (e) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
    error(403, "Access denied")
  if (e instanceof ClientError && e.code === Status.NOT_FOUND)
    error(404, "Not found")
  throw e // let unexpected errors surface
}
```

In form actions use `fail(status, { message })` instead, so the page can render
the error inline.

## 5. Shape data server-side

Mapping raw entities into display-ready rows (`HackathonMember` →
`{id, name, roleLabel}`) belongs in `load`, not in the `.svelte` file. The
component renders what `data` gives it, plus purely presentational client state
like search filtering.

## 6. Enum and status display helpers

Put them in `src/lib/utils/<domain>.ts`, never inline in a component. Use
`Partial<Record<number, string>>` (not `Record<number, string>`) so unrecognized
enum values type as `string | undefined`.

**Never import from `$lib/server/grpc/generated/` inside a Svelte component** —
`$lib/server/` is server-only. Pass raw numbers and look them up with
`Partial<Record<...>>`.

## 6b. Gating a member action on a capability

The backend decides what is open. `Hackathon.capabilities` comes back on both
`Get` and `List`, and the member layout
(`(app)/(member)/hackathon/[slug]/+layout.server.ts`) already runs it through
`readCapabilities()`, so **every page under it has `data.capabilities`** — layout
data is the accessor, no store. Don't re-read or re-derive it.

Helpers live in `src/lib/utils/capabilities.ts`: `isAvailable` / `isBlocked`,
`lockReason` (a member-facing sentence for a blocked action), `nextDeadline` +
`deadlineLabel`, `capabilitiesByPhase` + `capabilityNoun`, `primaryAction`.

- **Gate with `isAvailable(state)`, never `state === "open"`.** A capability the
  server has no row for resolves `ungoverned`, which means "no opinion — behave
  as before". Comparing against `"open"` disables it, which is how you hide a
  button on every hackathon predating that capability.
- **`primaryAction` deliberately does the opposite** and considers only `"open"`.
  Not knowing whether something is open is a reason to leave a button working,
  but not a reason to headline it. Keep that asymmetry.
- **This is UX, not enforcement.** The matching RPC re-checks and returns
  `FAILED_PRECONDITION`. Show `ClientError.details` rather than inventing copy —
  that code now covers several distinct refusals, and guessing produced "this
  hackathon has already finished" for one that had not started.
- States are resolved server-side at request time, so a page open across a
  deadline is stale until the next navigation. Same as `status`.

## 7. Keep participant pages free of viewer-role distinctions

Pages under `hackathon/[slug]/*` render the same thing for every viewer — no
admin-only fields or actions, no `isAdmin` gating. This was tried once (an
admin-only contact-details page under `participants/[userId]/`) and reverted.
Organizer concerns belong in the owner shell, platform concerns in `(admin)/*`.

## 8. If the route needs a sidebar entry

**All nav entries live in `src/lib/navigation.ts`** — nothing else builds nav
hrefs. Add to `homeNav()` (not scoped to a hackathon — currently just the
dashboard), `memberNav(slug, pages)` (participant pages), `manageNav(slug)`
(organizer tools, under `/owner/hackathon/[slug]/*`), or `platformNav()`
(platform admin).

Rules, each of which exists because breaking it broke the sidebar:

- **`NavItem.id` is the key and the active-state handle — never the label.** Page
  titles are user-supplied; two pages sharing a title is a duplicate-key crash
  that takes down the whole `<aside>`.
- **Compute active state once across all sections** via `activeNavId(pathname,
  [...allItems])`, longest match winning. Per-section computation let two
  sections highlight at the same time.
- **Derive view/manage mode from `$page.route.id`, not the pathname** — a slug or
  page title containing "owner" must not flip modes.
- **The `(app)` shell load must never throw.** It is chrome for every
  authenticated route, so a failed RPC has to degrade to `[]`, not fail the load
  — a throw there blanks the entire shell. Tradeoff: a dead backend then reads as
  "no hackathons" rather than an error.

## Shells

- `(marketing)` — public. `NavBar` + `AppFooter`. Landing page, public
  `/hackathon/[slug]`, signin/signout.
- `(app)` — authenticated, `AppSidebar` only. Three scopes: `(member)`
  participant pages, `(owner)` organizer tools at `/owner/hackathon/[slug]/*`,
  `(admin)` platform pages. Member/owner overlap is one View/Manage mode switch
  (`NavModeSwitch`), not two simultaneous menus. Navigation is settled — treat
  this as a description of how it works, not an open design question.

## Reference implementations

- **List row from parent data:**
  `routes/(app)/(member)/hackathon/[slug]/participants/+page.server.ts` — reuses
  the layout's members via `event.parent()`, maps with `membershipBadgeLabel`,
  returns just `{ participants }`.
- **Full CRUD with form actions:**
  `routes/(app)/(owner)/owner/hackathon/[slug]/tracks/` — list + new + edit,
  covering `list`/`create`/`get`/`edit`/`delete` and inline error rendering.
- **Generic list-row component:** `lib/components/hackathon/HackathonRow.svelte`
  — keep `badge`/`badgePreset` as generic strings so it works for any badge text.

## Known gaps (as of 2026-07-30)

Everything else is wired to real data. These are the exceptions:

| Where | State |
|---|---|
| `.../submissions` (member) and `/owner/.../submissions` (owner, doesn't exist yet) | Under-construction stub. **Partly backend-blocked — see "Submissions" below.** |
| `(marketing)/hackathon/[slug]` | Fully static; its `+page.server.ts` only redirects signed-in users. `name`/`dates`/`description`/`logo`/`status` are reachable via `publicHackathonClient.list()` (find-by-id client-side — no id filter on `ListRequest`). Richer content needs `Get`, which requires membership, so anonymous visitors can never receive it. |
| `hackathon/[slug]/+layout.svelte` | `HeroCompact` gets `venue=""`, `organizers={[]}`, and `participantCapacity` faked as `participantCount` — no such backend fields. |
| `ParticipationCard.svelte` | `REGISTERED` badge is a literal; member avatars are placeholder circles. Its actual data is real. |
| `(marketing)/+page.svelte` | Hackathon rows real; `carouselSlides` photos/captions hardcoded. |
| `/owner/hackathon/[slug]/+page.svelte` | Stale copy: "Managing pages, phases and tracks from here is coming soon" — all three sub-pages exist. |
| `NavBar.svelte` | "About" links to `resolve('/')` — a dead self-link, no about route exists. |

## Submissions — paused, waiting on backend (as of 2026-07-30)

Two pages are wanted: a member view (our submissions vs. other teams') and an
owner view (which teams have submitted). Both need submissions for *all* teams in
a hackathon, and that is the blocked part.

- `TeamService.Get` eager-loads submissions; **`TeamService.List` does not**, so
  `List` silently returns `submissions: []` for every team. There is no
  `ListSubmissions` RPC and no `SubmissionService` — reading goes through `Team`.
- Don't work around it with `team.list` then `team.get` per team. That's an N+1,
  and a missing eager-load is exactly what panicked the backend once before.
- **Decided: `List` should return `final` submissions only.** It is readable by any
  confirmed participant (`Hackathon.Read`), so returning drafts would disclose
  every team's in-progress work and `result` URLs — and filtering that in the
  frontend would not be enforcement. A member's own drafts still come from
  `team.get(myTeamId)`, which is already permitted and already eager-loads.
- Backend submission work is landing separately; **wait for it** rather than
  patching `List` here.
- When wiring the nav: `manage:submissions` goes at **position 5**, directly after
  Teams, so it lines up with `member:submissions`. `counterpartHref` then pairs
  them automatically by the id suffix.

## Two things that are not what they look like

- **There is no pagination in the API** — no `page_size`/`page_token`/`limit`/
  `offset` on any message, and no handler calls `.Limit()`/`.Offset()`. Any
  client-side pagination slices an already-fully-fetched list: consistent UX, no
  payload benefit.
- **Frontend gates are not security boundaries.** Nothing filters
  `members[].user.email` by caller role, so every confirmed participant already
  receives every other member's email in the raw response. Hiding a field
  client-side is UX, not enforcement.
