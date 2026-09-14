import { error, redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import {
  createAuthorizedGrpc,
  publicHackathonClient,
} from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
// Shared and tested, because it is subtle: a session can carry a user and a
// stale accessToken at once. See $lib/server/session.
import { usableSession } from "$lib/server/session"
// The type import also pulls in the module augmentation that puts `accessToken`
// on Session — the same one hooks.server.ts relies on.
import type { CustomSession } from "../../../../auth.d"

/**
 * Whether this visitor is a *confirmed* member of this hackathon — one the
 * member view will actually serve.
 *
 * The casbin role, not the participant row. Joining a public hackathon writes a
 * waitlisted row and no role at all (`hackathon_service.go:629`), and
 * `hackathon.get` — which the `/my/hackathon/[id]` layout calls first — wants
 * `hackathon:read`, which only a role carries. So "has a participant row" sends
 * somebody still waiting to a page that answers 403, and this page has just
 * redirected them away from the one page they can read.
 *
 * `is_waiting` would nearly do, but not quite: `grantMembership` writes the role
 * first and clears the flag second, so a confirmation that failed halfway leaves
 * a member who still shows as waiting. The role is what the backend enforces, so
 * the role is what decides.
 *
 * `list({ participantId })` is the only call that answers it — `ViewerMembership`
 * is populated only when `participantId` is supplied
 * (`hackathon_service.go:1514`).
 *
 * The filter takes the *platform* user's uuid, not Keycloak's `sub`, hence
 * `whoAmI` first: `locals.platformUser` is set by the hook for protected routes
 * only, and this route is public. Two calls, paid on a signed-in visit and never
 * on an anonymous one — the common case for this page.
 *
 * An authorized client built here rather than taken from `event.locals.grpc`,
 * which the hook only creates for protected routes.
 */
async function isConfirmedMember(
  event: Parameters<PageServerLoad>[0],
): Promise<boolean> {
  const session = (await event.locals.auth()) as CustomSession | null
  if (!usableSession(session) || !session?.accessToken) return false

  const grpc = createAuthorizedGrpc(session.accessToken)
  try {
    const { user } = await grpc.user.whoAmI({})
    if (!user) return false
    const { hackathons } = await grpc.hackathon.list({ participantId: user.id })
    const mine = hackathons.find((h) => h.id === event.params.id)

    return (
      mine?.viewerMembership?.role !== undefined &&
      mine.viewerMembership.role !== HackathonRole.HACKATHON_ROLE_UNSPECIFIED
    )
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

  // Confirmed members get the member view of the same hackathon. Only confirmed
  // ones — being signed in used to be enough, and the layout below refuses
  // anyone who is not a confirmed member, so a signed-in visitor following a
  // link to a public hackathon was answered with "You are not a confirmed member
  // of this hackathon". That is the one person this page exists for: the join
  // CTA at the foot is what they came for, so they get the public page and its
  // button.
  //
  // A waitlisted visitor stays here too, and that is the fix rather than a
  // shortfall: the public page is genuinely everything they may read until an
  // organizer approves them.
  if (signedIn && (await isConfirmedMember(event))) {
    redirect(302, `/my/hackathon/${event.params.id}/overview`)
  }

  // `list` filtered to public, not `get`. `get` is closed to anybody who has not
  // joined, because it returns the member roster and an about page has no
  // business handing that to the internet. `list` carries everything this page
  // renders — name, description, dates, status.
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
      logo: hackathon.logo,
      startsAt: hackathon.startsAt,
      endsAt: hackathon.endsAt,
      status: hackathon.status,
    },
  }
}
