import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id
  const { isGlobalAdmin } = await event.parent()

  // TODO(backend: enroll creator as participant): myResult is participation, not
  // ownership, so a hackathon the viewer created never reaches myHackathons. A
  // public one lands under "other" as though it belonged to someone else; a
  // private one appears nowhere, since the other list is filtered to public.
  // Resolves itself once Create writes the Participant row — no change needed
  // on this side.
  const [allResult, myResult] = await Promise.all([
    hackathon.list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC }),
    hackathon.list({ participantId }),
  ])

  const myIds = new Set(myResult.hackathons.map((h) => h.id))

  return {
    session: event.locals.session,
    myHackathons: myResult.hackathons,
    otherHackathons: allResult.hackathons.filter((h) => !myIds.has(h.id)),
    isGlobalAdmin,
  }
}

export const actions: Actions = {
  join: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)

    const form = await event.request.formData()
    const hackathonId = form.get("hackathonId")
    if (typeof hackathonId !== "string" || hackathonId === "")
      return fail(400, { message: "No hackathon was given" })

    try {
      await hackathon.join({ hackathonId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
        return fail(403, { message: "You can't join this hackathon" })
      if (e instanceof ClientError && e.code === Status.NOT_FOUND)
        return fail(404, { message: "This hackathon no longer exists" })
      throw e
    }

    // No redirect: SvelteKit re-runs `load` after an action, so the hackathon
    // moves from "Other hackathons" into "Your hackathons" with a Waitlisted
    // badge on its own.
    return {}
  },
}
