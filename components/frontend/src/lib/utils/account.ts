// Changing a password is an OIDC round trip, not a form we post.
//
// The Go backend has no password surface at all — nothing in `api/proto` names
// a credential, and it holds no Keycloak admin client — so there is no RPC to
// call here and never will be. Keycloak owns the credential, and the way to ask
// it for its own update-password screen is `kc_action` on the authorization
// endpoint.
//
// Auth.js's third `signIn` argument is what carries that: `@auth/core` merges
// the signin request's query into the authorization URL's parameters, so
// `kc_action` reaches Keycloak while state, nonce and PKCE stay Auth.js's
// business rather than ours. Hand-building the authorize URL instead would put
// us in charge of all three and fail Auth.js's own callback checks.
//
// The trip ends back at `returnTo` either way. On success Keycloak returns to
// the callback with a fresh code and `kc_action_status=success`; on Cancel it
// returns the same way with `cancelled`. Both complete the flow and mint a new
// session, so there is no error path — a cancelled password change is
// indistinguishable from a normal sign-in, which is also why the caller has
// nothing honest to show as a confirmation.

import { signIn } from "@auth/sveltekit/client"

/**
 * Keycloak's application-initiated action for setting a new password. Enabled
 * as a required action on the realm already, which is the precondition Keycloak
 * checks before honouring it — with it disabled, Keycloak logs a warning and
 * ignores the parameter, and the user would land on a plain sign-in instead.
 *
 * That it is already enabled is why this page needs no Keycloak change at all.
 */
export const UPDATE_PASSWORD_ACTION = "UPDATE_PASSWORD"

/**
 * Send the user to Keycloak to set a new password, and back to `returnTo`.
 *
 * They are asked to sign in again on the way: the provider sets
 * `prompt: "login"` (see `src/auth.ts`), so this re-authenticates before the
 * form appears. That is deliberate rather than incidental — Keycloak's form
 * asks for the new password twice and never for the old one, so the fresh login
 * is the only thing proving it is really them.
 */
export function startPasswordChange(returnTo: string): void {
  signIn(
    "keycloak",
    { callbackUrl: returnTo },
    { kc_action: UPDATE_PASSWORD_ACTION },
  )
}
