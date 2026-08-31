import { error, redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import {
  createAuthorizedGrpc,
  publicHackathonClient,
} from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
// Shared and tested, because it is subtle: a session can carry a user and a
// stale accessToken at once. See $lib/server/session.
import { usableSession } from "$lib/server/session"
// The type import also pulls in the module augmentation that puts `accessToken`
// on Session — the same one hooks.server.ts relies on.
import type { CustomSession } from "../../../../auth.d"

/**
 * Whether this visitor already holds a participant row in this hackathon.
 *
 * `list({ participantId })` is the only call that answers it. Every other read
 * reports a public hackathon to everybody — `Create` and `Edit` write the
 * `*, /hackathon/<id>, hackathon, read` casbin row for a public one
 * (`hackathon_service.go:93`, `:934`) — so presence in an unfiltered list proves
 * nothing, and `Get` returns the roster without saying which member is the
 * caller. `ViewerMembership` is populated on `list` only when `participantId` is
 * supplied (`hackathon_service.go:1514`), which is the same filter.
 *
 * The filter takes the *platform* user's uuid, not Keycloak's `sub`, hence
 * `whoAmI` first: `locals.platformUser` is set by the hook for protected routes
 * only, and this route is public. Two calls, paid on a signed-in visit and never
 * on an anonymous one — the common case for this page.
 *
 * An authorized client built here rather than taken from `event.locals.grpc`,
 * which the hook only creates for protected routes.
 */
async function isParticipant(
  event: Parameters<PageServerLoad>[0],
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
    // created yet — the (app) hook does that on the first protected request, and
    // somebody who has never made one is certainly not a participant. Any other
    // failure degrades to the public page, which is the page they asked for.
    return false
  }
}

export const load: PageServerLoad = async (event) => {
  // `locals.session`, not a second `auth()` call, for "is anybody signed in":
  // the hook has already decided this, and it decides it correctly — it stores
  // only a session that can call the backend (`clientView`), so a visitor
  // holding an expired one arrives here as signed out and is offered sign-in,
  // which is the control that fixes it. Reading `session?.user` off a fresh
  // `auth()` instead sent such a visitor to the member view, whose guard sent
  // them back, leaving them unable to read even the public page.
  const signedIn = Boolean(event.locals.session?.user)

  // Members get the member view of the same hackathon. Only *members* — being
  // signed in used to be enough, and the layout below refuses anyone who is not
  // a confirmed participant, so a signed-in visitor following a link to a public
  // hackathon was answered with "You are not a confirmed member of this
  // hackathon". That is the one person this page exists for: the join CTA at the
  // foot is what they came for, so they now get the public page and its button.
  //
  // A waitlisted participant is redirected too, and lands somewhere real: they
  // hold the public read row like everybody else, so `hackathon.get` serves them
  // and the overview names them "Waitlisted".
  if (signedIn && (await isParticipant(event))) {
    redirect(302, `/my/hackathon/${event.params.id}/overview`)
  }

  // `list` filtered to public, not `get`. Both are readable anonymously for a
  // public hackathon, but `get` also returns the member roster, and an about
  // page has no business handing that to the internet. `list` carries
  // everything this page renders — name, description, dates, status.
  //
  // It takes no id filter, so the match happens here.
  const { hackathons } = await publicHackathonClient().list({
    visibilityFilter: Visibility.VISIBILITY_PUBLIC,
  })
  const hackathon = hackathons.find((h) => h.id === event.params.id)

  // One answer for "no such hackathon" and for "private": a private hackathon
  // is not something an anonymous visitor should be able to detect. Its own
  // unlisted landing page needs a backend that will serve it to a stranger
  // holding the link, which is a separate piece of work.
  if (!hackathon) error(404, "Hackathon not found")

  return {
    // What the CTA at the foot of the page switches on: register, or sign in
    // first. Not `session` itself — nothing on this page renders the visitor.
    signedIn,
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      description: hackathon.description ?? "",
      startsAt: hackathon.startsAt,
      endsAt: hackathon.endsAt,
      status: hackathon.status,
    },
  }
}
