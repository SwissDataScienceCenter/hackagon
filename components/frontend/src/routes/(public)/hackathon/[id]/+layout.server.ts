import { error, redirect } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import { createAuthorizedGrpc, publicClient } from "$lib/server/grpc/client"
import { ClientError, Status } from "nice-grpc-common"
// Shared and tested, because it is subtle: a session can carry a user and a
// stale accessToken at once. See $lib/server/session.
import { usableSession } from "$lib/server/session"
// The type import also pulls in the module augmentation that puts `accessToken`
// on Session — the same one hooks.server.ts relies on.
import type { CustomSession } from "../../../../auth.d"

/**
 * Whether this visitor already holds a participant row in this hackathon.
 *
 * `list({ participantId })` is the only call that answers it: every other read
 * reports a public hackathon to everybody, so presence in an unfiltered list
 * proves nothing. `ViewerMembership` is populated only when `participantId` is
 * supplied, which is the same filter.
 *
 * The filter takes the *platform* user's uuid, not Keycloak's `sub`, hence
 * `whoAmI` first: `locals.platformUser` is set by the hook for protected routes
 * only, and this route is public. Two calls, paid on a signed-in visit and never
 * on an anonymous one — the common case for this page.
 */
async function isParticipant(
  event: Parameters<LayoutServerLoad>[0],
): Promise<boolean> {
  const session = (await event.locals.auth()) as CustomSession | null
  if (!usableSession(session) || !session?.accessToken) return false

  const grpc = createAuthorizedGrpc(session.accessToken)
  try {
    const { user } = await grpc.user.whoAmI({})
    if (!user) return false
    const { hackathons } = await grpc.hackathon.list({ participantId: user.id })

    return hackathons.some((h) => h.id === event.params.id)
  } catch {
    // NOT_FOUND from `whoAmI` is a first sign-in whose platform row nothing has
    // created yet, and somebody who has never made a protected request is
    // certainly not a participant. Any other failure degrades to the public
    // page, which is the page they asked for.
    return false
  }
}

/**
 * One backend call for the whole public subtree.
 *
 * A layout load rather than a page load because every route under
 * /hackathon/<id> needs the same answers, and the tab strip has to be identical
 * on all of them — which it cannot be if each route fetches its own copy.
 *
 * `PublicService.GetHackathon` returns the hackathon *and* its pages with their
 * content, its tracks, phases, approved projects and teams, so the routes below
 * make no further requests: a page body is picked out of this response, not
 * fetched. Browsing the public site costs exactly one round trip.
 *
 * It also puts the member redirect in front of the whole subtree rather than
 * the landing page alone, so a participant following a link straight to a page
 * still lands in the member view.
 */
export const load: LayoutServerLoad = async (event) => {
  // `locals.session`, not a second `auth()` call, for "is anybody signed in":
  // the hook has already decided this, and it decides it correctly — it stores
  // only a session that can call the backend, so a visitor holding an expired
  // one arrives here as signed out and is offered sign-in, which is the control
  // that fixes it.
  const signedIn = Boolean(event.locals.session?.user)

  // Members get the member view of the same hackathon. Only *members* — a
  // signed-in stranger is exactly who the public page and its join button are
  // for.
  if (signedIn && (await isParticipant(event))) {
    redirect(302, `/my/hackathon/${event.params.id}/overview`)
  }

  try {
    const { hackathon } = await publicClient().getHackathon({
      hackathonId: event.params.id,
    })
    if (!hackathon) error(404, "Hackathon not found")

    return { signedIn, hackathon }
  } catch (e) {
    // One answer for "no such hackathon", "that id is not a uuid" and "that
    // hackathon is private". The backend conflates the first and last
    // deliberately — whether a private hackathon exists is not a visitor's
    // business — and this must not un-conflate them by answering differently.
    if (
      e instanceof ClientError &&
      (e.code === Status.NOT_FOUND || e.code === Status.INVALID_ARGUMENT)
    ) {
      error(404, "Hackathon not found")
    }
    throw e
  }
}
