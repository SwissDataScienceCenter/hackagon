# Frontend routes and authentication

The frontend is a SvelteKit app in `components/frontend`, served by
`@sveltejs/adapter-node`. All data loading happens server-side
(`+page.server.ts` / `+layout.server.ts`) over gRPC; the browser never talks to
the backend directly. See [grpc-clients.md](grpc-clients.md) for the client
layer.

Authentication is `@auth/sveltekit` (Auth.js) with a single Keycloak OIDC
provider. **The backend is authoritative for every access decision** — the
frontend only decides "signed in or not" and translates gRPC error codes into
HTTP responses.

## Route groups

`src/routes` is split into two SvelteKit route groups. The group name is not
part of the URL; it selects which shell (`+layout.svelte`) renders and which
guard applies.

| Group      | Directory              | Shell                                                                                                           | Guard                                        |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `(public)` | `src/routes/(public)/` | `NavBar` + `AppFooter`                                                                                          | none — anonymous callers allowed             |
| `(app)`    | `src/routes/(app)/`    | `NavBar` + `AppFooter` (currently identical to `(public)`, kept separate so authenticated chrome can land here) | `(app)/+layout.server.ts` requires a session |

The root `src/routes/+layout.svelte` only imports `app.css` and renders its
children, so the two groups can diverge completely.

The public and member views of a hackathon live in **disjoint path spaces**:
`/hackathon/<id>` is public, `/my/hackathon/<id>/…` is the member view.

## Route map

| Route                         | Purpose                                                                      | Data loaded (server)                                                                                                             | Access                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/`                           | Marketing home: hero, trending hackathon list, winners, carousel, features   | `(public)/+page.server.ts` — `publicHackathonClient.list({ visibilityFilter: VISIBILITY_PUBLIC })` + `locals.session`            | Public, signed in or not. A logged-in caller carrying a legacy `?returnTo=` is forwarded to it |
| `/hackathon/[id]`             | Public hackathon landing page; "News & Pages" section from backend pages     | `(public)/hackathon/[id]/+page.server.ts` — `publicPageClient.list({ hackathonId })`, failures swallowed to `[]`                 | Anonymous only in practice: any signed-in visitor is 302'd to `/my/hackathon/[id]/overview`  |
| `/signin`                     | Sign-in interstitial (GET) + the Auth.js `signIn` form action (POST)         | `(public)/signin/+page.server.ts` — resolves `?returnTo=` to a validated destination; forwards a signed-in caller straight to it  | Public (matches `PUBLIC_ROUTE_PATTERNS`) — it is where the guards SEND anonymous visitors     |
| `/signout`                    | POST-only form action wrapping Auth.js `signOut`                             | none                                                                                                                             | Public                                                                                       |
| `/auth/*`                     | Auth.js endpoints (signin, callback, csrf, session), mounted by `authHandle` | n/a                                                                                                                              | Public                                                                                       |
| `/dashboard`                  | "Your hackathons" / "Other hackathons" + notification sidebar                | `(app)/dashboard/+page.server.ts` — `Promise.all([hackathon.list({visibilityFilter: PUBLIC}), hackathon.list({participantId})])` | Signed in                                                                                    |
| `/manage/users`               | Platform user table (name, Keycloak ID, created)                             | `(app)/manage/users/+page.server.ts` — `user.list({})`                                                                           | Signed in **and** global `Admin` on the backend (see gaps below)                             |
| `/my/hackathon/[id]` (layout) | Member shell: sub-nav, compact hero, phase timeline                          | `(app)/my/hackathon/[id]/+layout.server.ts` — `hackathon.get({ hackathonId })`, derives `myMembership` from `members`            | Confirmed participant, hackathon owner, or global admin (enforced by `HackathonService.Get`) |
| `…/overview`                  | Participation card, hackathon description, proposal preview                  | Layout data only; cards are still hard-coded placeholders                                                                        | as layout                                                                                    |
| `…/participants`              | Searchable participant list                                                  | none — a hard-coded demo array in the component                                                                                  | as layout                                                                                    |
| `…/proposals`                 | Project proposals with status label                                          | `parent().hackathon.projects`, mapped to `{id,title,description,status}`                                                         | as layout                                                                                    |
| `…/teams`                     | Team cards with members and project title                                    | `team.list({ hackathonId })` + project titles from `parent()`                                                                    | as layout                                                                                    |
| `…/submissions`               | Submission table (team, project, status, result)                             | `team.list` then `Promise.all(teams.map(t => team.listSubmissions({teamId: t.id})))`                                             | as layout                                                                                    |
| `…/timeline`                  | Phases sorted by `startsAt`                                                  | `parent().hackathon.phases`                                                                                                      | as layout                                                                                    |
| `…/webinars`, `…/photos`      | Placeholders (`HackathonUnderConstruction`)                                  | none                                                                                                                             | as layout                                                                                    |

`src/routes/+layout.server.ts` returns `{ session: locals.session }` for every
route, which is what `NavBar` uses to decide between "Log in" and the avatar
button.

## Auth flow, end to end

1. **Where the flow starts.** Two entry points, and they agree on the
   destination because they call the same helper:

   - **The "Log in" button** — `NavBar.svelte` calls the client helper
     `signIn('keycloak', { callbackUrl: loginReturn })` from
     `@auth/sveltekit/client`, which POSTs to Auth.js at
     `/auth/signin/keycloak`. `loginReturn` is
     `loginDestination(?returnTo ?? current path)`: a parked destination wins,
     `/` means "the dashboard", and everything is validated by `safeReturnTo`.
   - **The `/signin` interstitial** — where both guards send an anonymous
     visitor. Its page renders a plain `<form method="POST" action="/signin">`
     carrying `providerId=keycloak` and `redirectTo=<validated destination>`,
     which is the whole feature with script off. `redirectTo` is not optional:
     `@auth/sveltekit` falls back to the `Referer` header, which here is the
     interstitial itself. Once hydrated the page calls the same client helper as
     the button above (after ~2 s, or immediately on click) rather than
     submitting the form — SvelteKit 403s a form POST whose `Origin` differs
     from the server's `ORIGIN`, and a built server on a public hostname with a
     fixed localhost origin is a state this repo has shipped twice.

   `/signout` still exposes only the form action.

2. **Keycloak authorize** — the provider in `src/auth.ts` sends
   `scope: "openid profile email"`, `audience: config.oidc.audience` (so the
   access token is accepted by the Go backend) and `prompt: "login"`.
   `prompt=login` forces an interactive Keycloak login on every sign-in —
   existing Keycloak SSO sessions are deliberately not reused.

3. **Callback → JWT session** — `session.strategy` is `"jwt"`, so there is no
   database session. On initial sign-in the `jwt` callback stores:

   ```ts
   return {
     ...token,
     accessToken: account.access_token,
     refreshToken: account.refresh_token,
     expiresAt: account.expires_at, // seconds, from Keycloak
     userId: (profile.sub as string | undefined) ?? token.sub,
     error: undefined,
   }
   ```

   Keycloak realm roles are intentionally **not** read from the token — roles
   are per-hackathon and are resolved by the backend via casbin.

4. **Proactive refresh with a 30 s buffer** — on every later request the `jwt`
   callback checks:

   ```ts
   const REFRESH_BUFFER_SECONDS = 30
   const nowSeconds = Math.floor(Date.now() / 1000)
   if (nowSeconds < (token.expiresAt ?? 0) - REFRESH_BUFFER_SECONDS)
     return token
   ```

   Otherwise it POSTs `grant_type=refresh_token` to
   `${config.oidc.issuer}/protocol/openid-connect/token`, honours a rotated
   `refresh_token`, and recomputes `expiresAt`. Any failure (or a missing
   refresh token) sets `token.error = "RefreshTokenError"` instead of throwing.
   This is what keeps a gRPC call from racing a token that expires mid-flight.
   Covered by `src/auth.callback.test.ts`.

5. **Session callback** — copies `accessToken` and `error` onto the session and
   sets `session.user.id` to the Keycloak `sub`.

6. **Sanitized session in locals** — `sessionSetupHandle` strips the token
   before anything can serialize it to the browser:

   ```ts
   const { accessToken, ...clientSession } = session
   event.locals.session = clientSession
   ```

   `App.Locals.session` is typed `Omit<Session, "accessToken">`
   (`src/app.d.ts`). The raw token stays inside the encrypted Auth.js cookie and
   is only read to build the gRPC clients.

Two different identities are in play, and they are not interchangeable:

| Value                    | Meaning                                          |
| ------------------------ | ------------------------------------------------ |
| `locals.session.user.id` | Keycloak `sub` — the casbin subject              |
| `locals.platformUser.id` | Hackagon DB UUID — used for `participantId` etc. |

## `hooks.server.ts` handle chain

`src/hooks.server.ts` composes five handles with `sequence()`, run in this order
on every request:

| #   | Handle               | Responsibility                                                                                                                                                     |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `setupHandle`        | Lazily builds the `ConfigLoader` singleton (config dir from `--config-dir`), sets up the pino logger, and puts `AppConfig` on `locals.config`.                     |
| 2   | `loggerHandle`       | Per-request child logger with `requestId`/`method`/`path` on `locals.logger`; logs start/finish with duration, at `warn` when status ≥ 400.                        |
| 3   | `authHandle`         | The Auth.js handle re-exported from `src/auth.ts`. Mounts `/auth/*` and makes `locals.auth()` available.                                                           |
| 4   | `sessionSetupHandle` | One `locals.auth()` call per request → sanitized `locals.session`; then, for protected routes only: guard, build `locals.grpc`, and resolve `locals.platformUser`. |
| 5   | `redirectHandle`     | A logged-in user landing on `/?returnTo=X` is forwarded (303) to the validated `X`. Nothing produces that shape any more — the guards park on `/signin` — so this is a backstop for pasted or bookmarked legacy links. |

Outside the chain: `init` runs once at server startup and pings the backend with
the unauthenticated `healthClient`; `handleError` logs unhandled errors with a
generated `errorId` and returns a generic
`{ message: "An unexpected error occurred.", errorId }` to the client.

### `PUBLIC_ROUTE_PATTERNS`

Routes are **protected by default**. Only these patterns are open:

```ts
const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/hackathon(\/|$)/,
  /^\/signin($|\/)/,
  /^\/signout($|\/)/,
  /^\/auth($|\/)/,
  /^\/error($|\/)/,
]

export function isProtectedRoute(pathname: string): boolean {
  return !PUBLIC_ROUTE_PATTERNS.some((p) => p.test(pathname))
}
```

`isProtectedRoute` is exported specifically so `src/hooks.guard.test.ts` can pin
the behaviour (`/manage/users` protected, `/my/hackathon/abc` protected,
`/hackathon/abc` public, unknown routes protected).

### What `sessionSetupHandle` does on a protected route

1. No `session.user.id` → `redirect(303, loginUrlFor(path + search))`, i.e.
   `/signin?returnTo=<encoded path>`.
2. `session.error === "RefreshTokenError"` → same redirect (re-auth required).
3. No `session.accessToken` → same redirect.
4. `locals.grpc = createAuthorizedGrpc(session.accessToken)`.
5. `user.whoAmI({})` → `locals.platformUser`. On `NOT_FOUND` it auto-registers
   the caller with `user.register({})` (first login provisions the DB row from
   the JWT claims). On `UNAVAILABLE` it logs a warning and continues without a
   platform user. Anything else is rethrown and surfaces as a 500.

There is no per-endpoint "optional auth" mode. Endpoints that must serve
anonymous callers use the unauthenticated clients instead (see
[grpc-clients.md](grpc-clients.md)).

## Guard layering

Two independent guards protect `(app)`:

- **Path patterns** (`hooks.server.ts`) — cheap, runs before anything loads, and
  is what actually creates `locals.grpc`.
- **Route group** (`src/routes/(app)/+layout.server.ts`) — the second line of
  defence. It keys off the presence of `locals.grpc` rather than the path:

  ```ts
  export const load: LayoutServerLoad = async (event) => {
    if (!event.locals.grpc) {
      redirect(303, loginUrlFor(event.url.pathname + event.url.search))
    }
    return { session: event.locals.session }
  }
  ```

  `loginUrlFor` (`$lib/utils/returnTo.ts`) is shared with
  `hooks.server.ts:redirectToLogin` on purpose: two guards with private ideas of
  where login lives is how a deep link ends up surviving one path and not the
  other.

  A new route added under `(app)` therefore cannot leak through a gap in
  `PUBLIC_ROUTE_PATTERNS`, and every page load below it can rely on
  `event.locals.grpc` being set (which is what `requireGrpc` asserts).

Neither guard does authorization. Role checks happen in the backend's casbin
enforcer; the frontend sees the result as a gRPC status code.

## Error translation convention

Load functions catch `ClientError` from `nice-grpc-common` and re-throw
SvelteKit HTTP errors. The canonical form, from
`src/routes/(app)/my/hackathon/[id]/+layout.server.ts`:

```ts
try {
  result = await hackathon.get({ hackathonId: event.params.id })
} catch (e) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    error(403, "You are not a confirmed member of this hackathon")
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    error(404, "Hackathon not found")
  }
  throw e
}
```

| gRPC status         | HTTP | Notes                                                             |
| ------------------- | ---- | ----------------------------------------------------------------- |
| `PERMISSION_DENIED` | 403  | Message is written per route and shown verbatim on the error page |
| `NOT_FOUND`         | 404  | Also raised locally when the response body is empty               |
| anything else       | 500  | Rethrown, caught by `handleError`, logged with an `errorId`       |

`src/routes/+error.svelte` is the single error page for both groups. It renders
`page.status` as a heading and `page.error?.message`, falling back to "An
unexpected error occurred." — so a `PERMISSION_DENIED` reads as a real
explanation, while an untranslated error reads as a generic 500. The `errorId`
is logged server-side only; it is not shown to the user.

## Verified UX gaps on this branch

These are all reproducible from the code as it stands on `sketch/06-08-26`.

- **A signed-in non-member cannot open a public hackathon page.**
  `(public)/hackathon/[id]/+page.server.ts` redirects _any_ session holder to
  `/my/hackathon/[id]/overview`; that layout calls `HackathonService.Get`, which
  returns `PERMISSION_DENIED` unless the caller is a non-waiting participant,
  hackathon owner, or global admin. Net result: a 403 error page, with no route
  back to the marketing page and no Join affordance. This branch did **not** fix
  it — the redirect is unconditional on `session?.user`.
- **The dashboard links straight into that 403.** `DashboardView.svelte` renders
  "Other hackathons" (by construction, hackathons the viewer is _not_ in) with
  `href="/hackathon/{h.id}"` — which redirects to the member view and 403s. The
  adjacent Join button is `alert('Join: not yet implemented')`, even though
  `HackathonService.Join` exists on the backend.
- **`/manage/users` shows a 500, not a 403, to non-admins.** `UserService.List`
  calls `RequirePermission(ctx, "", m.User, m.Read)`, and no `p` policy in
  `defaultPolicies` grants `User`/`Read` to any role — only the
  `g2(r.sub, "admin")` escape hatch in `casbin_model.conf` passes. The load
  function has no try/catch, so the `PERMISSION_DENIED` escapes to `handleError`
  and renders "500 — An unexpected error occurred." Nothing in the UI links to
  `/manage/users`, so it is reachable only by typing the URL.
- ~~**`returnTo` is written but never honoured.**~~ **Fixed.** Both guards used
  to redirect to `/?returnTo=<path>`, and no code read it as a destination — the
  only consumer was `redirectHandle`, which merely used its _presence_ to
  suppress the `/` → `/dashboard` redirect. `NavBar` then signed in with
  `callbackUrl: $page.url.pathname`, which for `/?returnTo=…` is just `/`, so a
  deep link followed while logged out always ended at `/dashboard`. The guards
  now park on `/signin?returnTo=…`; that page resolves the value once
  (`loginDestination`) and hands it to Auth.js as `redirectTo`, and the NavBar
  button reads the same query. Pinned end to end by
  `tests/smoke/23-login-destination.spec.ts`, which follows an anonymous deep
  link through Keycloak and asserts the final URL is that link — and asserts the
  dashboard default separately, so an implementation that always chose one of
  the two fails the other.
- **`/my/hackathon/[id]` has no index page.** There is a `+layout.server.ts` and
  `+layout.svelte` but no `+page.*`, so the bare URL 404s. All navigation goes
  through `HackathonSubNav`, which always appends a tab segment.
- **Several member tabs are still static.** `participants` renders a hard-coded
  array of twelve demo people; `overview` hard-codes the participation card and
  proposal preview (only `hackathon.description` is real); `webinars` and
  `photos` are `HackathonUnderConstruction` placeholders.
- **The home page "Get Started" button points at `/hackathon/ord-2026`**, which
  is not a UUID. `PageService.List` rejects it with `INVALID_ARGUMENT`, the load
  swallows the error, and the fully hard-coded ORD 2026 marketing shell renders
  for a hackathon that does not exist.
- **`idToken` handling is asymmetric.** Initial sign-in deliberately drops
  `id_token` to keep the session cookie under 4096 bytes (asserted in
  `src/auth.callback.test.ts`), but the refresh branch writes
  `idToken: refreshedTokens.id_token` back into the JWT — so the cookie grows
  again after the first refresh.

## See also

- [grpc-clients.md](grpc-clients.md) — what a load function does once the guard
  has let it through.
- [../backend/rbac.md](../backend/rbac.md) — the decisions these routes only
  translate; the persona matrix says who gets a 403.
- [../backend/services.md](../backend/services.md) — the RPCs behind each
  route's load.
- [../TODO.md](../TODO.md) — the UX gaps listed above, tracked as work items.
