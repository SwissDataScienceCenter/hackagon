---
name: frontend-backend-wiring
description:
  How the SvelteKit frontend talks to the Go/gRPC backend — registering gRPC
  clients, the hooks.server.ts request lifecycle, loading data in
  +page.server.ts/+layout.server.ts, translating gRPC errors to HTTP, and
  write-path form actions. Use when wiring a route to a backend service, adding
  a gRPC client, calling an RPC from a load/action, handling
  PERMISSION_DENIED/NOT_FOUND, or debugging auth/locals.grpc.
---

# Frontend ↔ Backend wiring

**The backend is authoritative for every access decision. The frontend never
duplicates permission logic — it calls the RPC and translates the gRPC error
into an HTTP response.** All gRPC calls happen **server-side only**
(`+page.server.ts`, `+layout.server.ts`, `hooks.server.ts`); a Svelte component
must never import from `$lib/server/`.

## Backend address (don't hardcode — it isn't localhost in deployment)

The backend address is **environment config**, not a constant. It lives in the
settings YAML under `backend: { hostname, port }` (schema:
`src/lib/schemas/config-schema.ts`; dev values `localhost:3000` in
`data/test/config/config.yaml`) and is loaded per environment via `--config-dir`
into `event.locals.config.backend`. A deployed frontend points at the backend's
service host, not `localhost`.

`initBackendChannel(config)` in `hooks.server.ts` (`init` / `setupHandle`)
builds the shared channel from that config into
`src/lib/server/grpc/channel.ts`. Authorized clients, `publicHackathonClient()`,
and `healthClient()` all dial through `backendChannel()` — never a hardcoded
address. Opening a channel per request would leak; only the auth interceptor is
per-request.

The channel is **plaintext** gRPC today. A cross-network deployment will likely
need TLS (`createChannel` with credentials / an `https`-style target) rather
than `-plaintext` — treat that as a follow-up wiring change.

## Request lifecycle (`src/hooks.server.ts`)

`handle` is a `sequence()` of handlers run on every request
(`hooks.server.ts:203`):

1. `setupHandle` — config + `event.locals.config`.
2. `loggerHandle` — request-scoped `event.locals.logger`.
3. `authHandle` — Auth.js/Keycloak session (`./auth`).
4. `sessionSetupHandle` — the important one:
   - Routes are **protected by default**; only `PUBLIC_ROUTE_PATTERNS`
     (`hooks.server.ts:29`) are anonymous (`/`, `/hackathon/...`, `/signin`, …).
   - For protected routes it builds
     `event.locals.grpc = createAuthorizedGrpc(accessToken)`, then calls
     `user.whoAmI({})` → `event.locals.platformUser`. On `Status.NOT_FOUND` it
     auto-registers via `user.register({})`; on `Status.UNAVAILABLE` it proceeds
     without a platform user (`hooks.server.ts:158`).
5. `redirectHandle` — logged-in user on `/` → `/dashboard`.

`event.locals` shape is declared in `src/app.d.ts`: `config`, `session`
(accessToken stripped), `logger`, `grpc?`, `platformUser?`.

## Add a gRPC client (`src/lib/server/grpc/client.ts`)

1. Import the `XServiceDefinition` and `type XServiceClient` from
   `./generated/<domain>/<name>_service`.
2. Add `x: XServiceClient` to the `AuthorizedGrpc` interface.
3. Create it inside `createAuthorizedGrpc`:
   `x: factory.create(XServiceDefinition, channel)`. The `factory` middleware
   injects `Authorization: Bearer <token>` on every call (`client.ts:44`).
4. For endpoints that also serve **anonymous** callers, add a separate
   unauthenticated client as a function (pattern: `publicHackathonClient()`,
   `client.ts`) built with a bare `createClientFactory()` over
   `backendChannel()`.

Not every service needs a client. `hackathon.get` returns tracks/projects
**nested**, so they have no client; `team` and `page` get their own because
`get` doesn't return teams and returns _unfiltered_ pages (`client.ts:32-40`).
Read those comments before adding a client "just in case."

## Load data (`+page.server.ts` / `+layout.server.ts`)

Two sources — prefer the parent when the data already arrived:

```ts
// A) Data the parent layout already fetched — no extra RPC.
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent() // from the [id] layout's hackathon.get
  const approved = hackathon.projects.filter(/* ... */)
  return { projects: approved }
}
```

(real: `(app)/my/hackathon/[id]/projects/+page.server.ts`)

```ts
// B) Its own RPC — use requireGrpc + platformUser from locals.
import { requireGrpc } from "$lib/server/grpc/client"
export const load = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser?.id
  const { hackathons } = await hackathon.list({ participantId })
  return { hackathons }
}
```

`requireGrpc` throws if `locals.grpc` is undefined (i.e. you're on a route the
hooks left public) — a loud signal you mislabeled the route.

## Translate gRPC errors (do it in the load/action)

```ts
import { ClientError, Status } from "nice-grpc-common"
import { error } from "@sveltejs/kit"

try {
  result = await hackathon.get({ hackathonId: event.params.id })
} catch (e) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
    error(403, "You are not a confirmed member of this hackathon")
  if (e instanceof ClientError && e.code === Status.NOT_FOUND)
    error(404, "Hackathon not found")
  throw e // let unexpected errors hit handleError
}
```

Real reference: `(app)/my/hackathon/[id]/+layout.server.ts:11`. For **chrome**
(sidebar nav, lists that decorate the shell), swallow the error and render an
empty fallback instead of failing the whole load — see the `try/catch` around
`hackathon.list`/`page.list` in `(app)/+layout.server.ts:31-68`.

## Two lines of defence for auth

- `hooks.server.ts` guards by **path pattern** (`PUBLIC_ROUTE_PATTERNS`).
- `(app)/+layout.server.ts` guards by **route group** — a redirect if
  `!event.locals.grpc`, so a new `(app)` route can't leak through a gap in the
  pattern list.

## Write path — form actions

Backend stays authoritative; the frontend does cheap up-front checks + input
validation, then calls the mutation. Pattern from
`(app)/hackathons/create/+page.server.ts`:

```ts
import { error, fail, redirect } from "@sveltejs/kit"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"

export const actions: Actions = {
  create: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    // validate → fail(400, { message }) on bad input (no throw)
    if (typeof name !== "string" || name.trim().length < 3)
      return fail(400, { message: "Name must be at least 3 characters" })
    // map form → RPC, using generated enums; optional fields as undefined
    const { id } = await hackathon.create({
      name: name.trim(),
      visibility:
        v === "public"
          ? Visibility.VISIBILITY_PUBLIC
          : Visibility.VISIBILITY_PRIVATE,
      description: desc?.trim() || undefined,
    })
    redirect(303, `/my/hackathon/${id}/overview`)
  },
}
```

Courtesy pre-checks (e.g. `mayCreate(roles)` reading `platformUser.roles` from
casbin/WhoAmI) only decide whether to _offer_ a page — they never replace the
backend's `Enforce`. Roles live on `platformUser.roles` (sourced from casbin,
not the DB). Server-only helpers of this kind live in
`src/lib/server/hackathon/` (`capabilities.ts`, `projectEdit.ts`) — they read
generated types, so a `.svelte` file must never import them.

## Capability-gated mutations depend on the hackathon — read the set first

Several backend mutations are gated on a **capability**, not just a role:
`SetPreference`/`RemovePreference` need `SET_TEAM_PREFERENCES`, `Propose` needs
`PROPOSE_PROJECTS`, submissions need `CREATE_PROJECT_SUBMISSIONS`. A capability
is "on" only when both a `HackathonState` boolean and a casbin policy row exist.
Two things write the pair: `HackathonService.SetCapabilities`, which the manage
hub's capability panel calls from the frontend
(`src/lib/server/hackathon/stateActions.ts`), and `cmd/seed` directly
(`seedCapabilities`), with a **different set per hackathon**.

So the same call succeeds in one hackathon and returns `PERMISSION_DENIED` in
the next, **by configuration, not by a bug in your wiring** — and an organizer
can change the set under you. The set is already loaded: the `[id]` layout
passes `hackathon.state` through `enabledCapabilities` into
`hackathonState.enabled`. Read it before debugging. Two consequences:

- Don't "fix" it frontend-side. Translate the error into something a user can
  read and move on.
- Don't mirror the capability into a courtesy check unless you want the control
  hidden everywhere. `mayPreferProjects`
  (`src/lib/server/hackathon/capabilities.ts`) deliberately checks only
  "confirmed, non-waitlisted participant" and lets the backend refuse — the
  reasoning, and what to restore once the backend lands, is in the doc comment
  and in `mydocs/docs/backend-tickets/project-preferences-capability.md`.

Note also that the casbin model has **no role inheritance**: a hackathon _owner_
does not hold `Member`, and most capability grants target `Member` — so an owner
is refused even where a member succeeds.

## Regenerating clients (don't hand-edit `generated/`)

`src/lib/server/grpc/generated/**` is codegen. After changing `*.proto`,
regenerate from the repo root (needs the Nix shell + `buf`):
`just codegen::proto` (or `just api-change` to regen + restart). The
`pnpm run proto:generate` script exists but only covers health/user/hackathon —
prefer the root `just` target for the full set.

## Verify a wiring end-to-end

The backend is the source of truth, so test it directly. From the repo root — as
**one** tool call, since each separate call re-bills the whole context window
(see the context budget in `CLAUDE.md`):

```bash
just start && \
  just rpc::unauth hackathon.HackathonService/List | jq -r '.hackathons[].id' && \
  just rpc::as alice aliceandbob hackathon.HackathonService/Get '{"hackathonId":"…"}' \
    | jq '{name: .hackathon.name, projects: (.hackathon.projects|length)}'
```

`Get` returns the full tree (projects, tracks, pages, phases, members), so pipe
it through `jq` to keep only the fields you're verifying instead of dropping the
whole payload into the window.

Dev users all share the password `aliceandbob`: `hackagon-admin` (global admin),
`alice` (organizer), `bob`, `charles`. A `PERMISSION_DENIED` here is the backend
speaking — reproduce it with `rpc::as` before changing any frontend code, and
check the capability section above.

For the full toolkit — enumerating services via reflection, reading request
shapes, telling an unimplemented RPC apart from a refused one — use the
**backend-api-explore** skill (repo root `.claude/skills/`). Don't assume an RPC
exists or works from a written list; ask the running server. For UI rendering
see the `frontend-dev` skill.
