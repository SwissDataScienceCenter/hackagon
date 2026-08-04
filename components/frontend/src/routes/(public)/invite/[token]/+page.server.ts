import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { createAuthorizedGrpc, publicHackathonClient } from "$lib/server/grpc/client"
import { ClientError, Status } from "nice-grpc-common"
// Importing the type also pulls in the module augmentation that puts
// accessToken on Session — the same thing hooks.server.ts relies on.
import type { CustomSession } from "../../../../auth.d"

// Redeeming an invitation link. The route is PUBLIC so someone opening the
// link from their email sees what they were invited to before being asked to
// sign in — the token itself is the credential.
//
// Redeeming grants visibility, not membership: Join still puts the user on the
// waitlist for an organizer to approve, so a forwarded link cannot insert a
// stranger into the roster.

export const load: PageServerLoad = async (event) => {
  let preview
  try {
    preview = await publicHackathonClient().previewInvite({ token: event.params.token })
  } catch (e) {
    // Unknown, malformed and revoked tokens are all NOT_FOUND — the backend
    // deliberately does not distinguish them.
    if (e instanceof ClientError && e.code === Status.NOT_FOUND)
      error(404, "This invitation link is not valid or has been revoked")
    throw e
  }
  if (!preview.hackathon) error(404, "This invitation link is not valid")

  const session = await event.locals.auth()

  return {
    hackathon: preview.hackathon,
    alreadyParticipant: preview.alreadyParticipant,
    signedIn: Boolean(session?.user),
    token: event.params.token,
  }
}

export const actions: Actions = {
  join: async (event) => {
    const session = (await event.locals.auth()) as CustomSession | null
    // Public route, so there is no locals.grpc: build a client from the
    // session, or send them to sign in and come straight back here.
    if (!session?.accessToken) {
      redirect(302, `/?returnTo=${encodeURIComponent(`/invite/${event.params.token}`)}`)
    }

    const form = await event.request.formData()
    const hackathonId = String(form.get("hackathonId") ?? "")
    if (!hackathonId) return fail(400, { message: "Missing hackathon." })

    const grpc = createAuthorizedGrpc(session.accessToken)
    try {
      await grpc.hackathon.join({ hackathonId, inviteToken: event.params.token })
    } catch (e) {
      if (e instanceof ClientError) {
        if (e.code === Status.PERMISSION_DENIED)
          return fail(403, { message: "This invitation is no longer valid." })
        if (e.code === Status.FAILED_PRECONDITION)
          return fail(409, {
            message: "Registration is not open for this hackathon right now.",
          })
        if (e.code === Status.ALREADY_EXISTS)
          return fail(409, { message: "You have already requested to join." })
      }
      throw e
    }

    return { joined: true }
  },
}
