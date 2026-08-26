// Whether a session can be used to call the backend as its user.
//
// This is not the same question as "is somebody signed in", and the difference
// is what produced a 500 on the invitation page.
//
// Auth.js refreshes the access token in its `jwt` callback. When Keycloak
// refuses — the refresh token expired, or the session was ended server-side —
// the callback keeps the identity and marks the token `error:
// "RefreshTokenError"` (`auth.ts:94`, `:153`), which reaches the session
// (`auth.ts:165`). So the session still has a `user` and still has an
// `accessToken`; the token is simply dead.
//
// `hooks.server.ts:158` redirects on exactly that — but only inside
// `if (isProtectedRoute(...))`. Every **public** route that calls the backend as
// the user has to make the check itself, and there is no third place to put it:
// the hook cannot redirect a public route without defeating the point of it
// being public.

import type { CustomSession } from "../../auth.d"

/**
 * True when this session's access token is worth sending to the backend.
 *
 * All three conditions are load-bearing:
 *
 *   - `user` — somebody is signed in at all.
 *   - `accessToken` — there is a credential to send. Absent mid-refresh.
 *   - no `error` — the last refresh did not fail. This is the one that is easy
 *     to miss, because the session looks complete without it.
 *
 * A caller that treats a false here as "signed out" gets the right behaviour in
 * both cases: an anonymous visitor and one holding a dead session are both
 * offered sign-in, which is the control that fixes either.
 */
export function usableSession(session: CustomSession | null): boolean {
  return Boolean(session?.user && session.accessToken && !session.error)
}
