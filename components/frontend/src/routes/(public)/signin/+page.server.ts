import { redirect } from "@sveltejs/kit"
import { signIn } from "../../../auth"
import type { Actions, PageServerLoad } from "./$types"
import { loginDestination } from "$lib/utils/returnTo"

// The sign-in interstitial.
//
// GET renders a page that says why the visitor is here and where they are going
// (+page.svelte). POST is the Auth.js sign-in form action — the same one
// @auth/sveltekit's own <SignIn> component posts to — so the button on that page
// starts the real OIDC flow with no JavaScript involved.
//
// It lives in the (public) group for two reasons: it must be reachable while
// anonymous (a guard that bounced you to a protected page is an infinite
// redirect), and it wears the same chrome as every other page. As a top-level
// route it rendered with no header and no footer at all.

export const load: PageServerLoad = async (event) => {
  // Resolved HERE, on the server, so the page never has to decide and the
  // <form>'s redirectTo is a value that has already been validated. An
  // unvalidated one is an open redirect off the site, and it would be handed
  // straight to Auth.js as the post-login destination.
  const destination = loginDestination(event.url.searchParams.get("returnTo"))

  // A signed-in visitor has nothing to be told and nothing to wait for. This is
  // also the landing spot when Auth.js sends someone back here (a stale link, a
  // Back press out of Keycloak), so it has to move them on rather than show a
  // countdown to a login they already completed.
  if (event.locals.session?.user?.id) {
    event.locals.logger.debug(
      { destination },
      "SIGNIN: already signed in -> forwarding to the destination.",
    )
    redirect(303, destination)
  }

  return {
    destination,
    // Whether the visitor asked for a specific page or just wants in. The page
    // says "we can't open X yet" in the first case and "you need to sign in" in
    // the second; claiming a destination nobody named would be a fabrication.
    deepLinked: destination !== loginDestination(null),
  }
}

export const actions: Actions = { default: signIn }
