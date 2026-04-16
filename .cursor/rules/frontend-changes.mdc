---
description: Workflow and architecture for frontend data loading and testing
globs: components/frontend/**/*.ts,components/frontend/**/*.svelte
alwaysApply: false
---

# Frontend Change Workflow

Every change under `components/frontend/` must follow this workflow.

## Data Loading Pattern

Use `+page.server.ts` load functions for all data loading. Do NOT create `+server.ts` API routes -- this frontend does not expose a public API.

Authenticated gRPC calls use the `event.locals.grpc` object, which is set up per-request by `sessionSetupHandle` in `hooks.server.ts`. The Bearer token is injected by client middleware -- pages never handle tokens or metadata directly:

```typescript
import { requireGrpc } from "$lib/server/grpc/client"

export const load: PageServerLoad = async (event) => {
  const { someService } = requireGrpc(event.locals.grpc)
  const result = await someService.method({})
  return { data: result }
}
```

`requireGrpc()` throws a clear error if `event.locals.grpc` is undefined (the route is not protected).

## Session Access in Layouts

Layouts return the sanitized session from `event.locals.session` (no `accessToken`, safe for the client):

```typescript
export const load: LayoutServerLoad = async (event) => {
  return { session: event.locals.session }
}
```

## Adding a New gRPC Service

1. Import the generated `ServiceDefinition` in `src/lib/server/grpc/client.ts`.
2. Add the client type to the `AuthorizedGrpc` interface.
3. Add `factory.create(ServiceDefinition, channel)` to the `createAuthorizedGrpc` factory.

## Testing

Write tests only for **your own business logic**, not for generated gRPC stubs or proto contracts. If the proto compiles, the stubs work. The test suite is:

- `src/lib/server/grpc/client.test.ts` -- `requireGrpc`, `createAuthorizedGrpc`
- `src/hooks.guard.test.ts` -- route protection logic (`isProtectedRoute`)
- `src/auth.callback.test.ts` -- JWT/session callbacks

Add a new test file only when you introduce new business logic (data transformations, complex branching load functions, new hooks).

## Route Groups

- `(participant)` -- user-facing pages (e.g. `/welcome`)
- `(admin)` -- admin pages (e.g. `/users`)

Each group has a `+layout.server.ts` that returns `event.locals.session`. Pages within each group use `+page.server.ts` load functions to fetch data via `event.locals.grpc`.

## Authentication & Authorization

All routes are protected by default. Public routes are explicitly listed in `PUBLIC_ROUTE_PATTERNS` in `hooks.server.ts`. New routes are automatically protected unless added there. The `sessionSetupHandle` hook:

1. Calls `auth()` once per request.
2. Strips `accessToken` and stores the sanitized session on `event.locals.session`.
3. For protected routes: guards authentication, creates `event.locals.grpc` with the access token as gRPC metadata.

Role-based authorization (admin/participant) is planned -- roles will come from the backend user database (not from the Keycloak token, since they are context-dependent). See `TODO [AUTHZ]` in `hooks.server.ts`.

## Startup Health Check

The backend health check runs at server startup in `hooks.server.ts` `init()`. It logs success or failure but does not crash the frontend if the backend is unavailable.

## Verification

From `components/frontend/`, always run in order:

```bash
TEST_CONFIG_DIR=data/test/config pnpm vitest run
pnpm format
pnpm lint
```

Fix any failures before proceeding to the next step.
