import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import {
  createAuthorizedGrpc,
  publicHackathonClient,
} from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { resolvePhaseStatus, sortPhasesByStart } from "$lib/utils/phase"
// Shared and tested, because it is subtle: a session can carry a user and a
// stale accessToken at once. See $lib/server/session.
import { usableSession } from "$lib/server/session"
// The type import also pulls in the module augmentation that puts `accessToken`
// on Session — the same one hooks.server.ts relies on.
import type { CustomSession } from "../../../../auth.d"

/** Confirmed member, registered but unapproved, or no relationship at all. */
type Membership = "member" | "waiting" | "none"

/**
 * This visitor's standing in this hackathon: a confirmed member the member view
 * will serve, somebody still waiting on an organizer, or neither.
 *
 * The casbin role, not the participant row. Joining a public hackathon writes a
 * waitlisted row and no role at all (`hackathon_service.go:629`), and
 * `hackathon.get` — which the `/my/hackathon/[id]` layout calls first — wants
 * `hackathon:read`, which only a role carries. So "has a participant row" would
 * offer somebody still waiting a way into a page that answers 403.
 *
 * `is_waiting` would nearly do, but not quite: `grantMembership` writes the role
 * first and clears the flag second, so a confirmation that failed halfway leaves
 * a member who still shows as waiting. The role is what the backend enforces, so
 * the role is what decides.
 *
 * `list({ participantId })` answers it for somebody who joined —
 * `ViewerMembership` is populated only when `participantId` is supplied
 * (`hackathon_service.go:1514`), and its presence separates "waiting" from
 * "neither": a participant row exists either way, a role does not. An owner
 * never joined, so `list({ ownerId })` answers for them instead.
 *
 * The three cases are kept apart rather than collapsed to a boolean because the
 * foot of the page says something different to each — the member is offered the
 * way in, the waiting are told they are waiting, and everybody else is invited
 * to register.
 *
 * The filter takes the *platform* user's uuid, not Keycloak's `sub`, hence
 * `whoAmI` first: `locals.platformUser` is set by the hook for protected routes
 * only, and this route is public. Two calls, paid on a signed-in visit and never
 * on an anonymous one — the common case for this page.
 *
 * An authorized client built here rather than taken from `event.locals.grpc`,
 * which the hook only creates for protected routes.
 */
async function membership(
  event: Parameters<PageServerLoad>[0],
): Promise<Membership> {
  const session = (await event.locals.auth()) as CustomSession | null
  if (!usableSession(session) || !session?.accessToken) return "none"

  const grpc = createAuthorizedGrpc(session.accessToken)
  try {
    const { user } = await grpc.user.whoAmI({})
    if (!user) return "none"
    // Two lists, because owning a hackathon and taking part in one are separate
    // records. `Create` grants the casbin Owner role and the owners edge and
    // never writes a Participant row, so an organiser reading their own
    // hackathon's public page carries no `viewerMembership` at all — and was
    // offered "Register" for an event they run. The dashboard pairs the same two
    // calls for the same reason.
    const [mine, owned] = await Promise.all([
      grpc.hackathon.list({ participantId: user.id }),
      grpc.hackathon.list({ ownerId: user.id }),
    ])
    if (owned.hackathons.some((h) => h.id === event.params.id)) return "member"

    const entry = mine.hackathons.find((h) => h.id === event.params.id)
    if (!entry?.viewerMembership) return "none"

    return entry.viewerMembership.role !==
      HackathonRole.HACKATHON_ROLE_UNSPECIFIED
      ? "member"
      : "waiting"
  } catch {
    // NOT_FOUND from `whoAmI` is a first sign-in whose platform row nothing has
    // created yet — the (app) hook does that on the first protected request, and
    // somebody who has never made one is certainly not a participant. Any other
    // failure degrades to the public page, which is the page they asked for.
    return "none"
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

  // Nobody is redirected away from here any more, member or not. This is the
  // hackathon's one address, and what changes with your standing is the block at
  // the foot: register, wait, or go in. Bouncing a member to a different-looking
  // page the moment they signed in was the thing that made the two feel like two
  // products rather than one seen from outside and in.
  //
  // It is also what makes a link back out of the member area possible at all —
  // before, following one landed you straight back where you came from.
  const standing = signedIn ? await membership(event) : "none"

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
    // What the CTA at the foot of the page switches on: register, sign in
    // first, wait, or go in. Not `session` itself — nothing on this page renders
    // the visitor.
    signedIn,
    standing,
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      description: hackathon.description ?? "",
      logo: hackathon.logo,
      startsAt: hackathon.startsAt,
      endsAt: hackathon.endsAt,
      status: hackathon.status,
      // Resolved the same way the member layout resolves it, so the strip says
      // the same thing on both sides. No `currentPhaseId` to pass — that lives
      // on `state`, which only Get carries — so the status falls back to the
      // dates, which is the honest answer for a visitor anyway.
      phases: sortPhasesByStart(hackathon.phases).map((ph) => ({
        name: ph.name,
        status: resolvePhaseStatus(ph, undefined),
      })),
      // Omitted at zero rather than shown as "0 participants": this is the page
      // that has to make somebody want to join, and an empty count argues the
      // other way. It counts confirmed participants only, so a hackathon whose
      // sign-ups are all still waiting reads as empty here.
      participantCount: hackathon.participantCount || undefined,
    },
  }
}
