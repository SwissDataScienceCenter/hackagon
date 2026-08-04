import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id

  let results
  try {
    results = await Promise.all([
      hackathon.list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC }),
      hackathon.list({ participantId }),
    ])
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Access denied")
    throw e
  }

  const [allResult, myResult] = results
  const myIds = new Set(myResult.hackathons.map((h) => h.id))

  return {
    session: event.locals.session,
    myHackathons: myResult.hackathons,
    otherHackathons: allResult.hackathons.filter((h) => !myIds.has(h.id)),
  }
}

export const actions: Actions = {
  // The dashboard Join button. The backend is authoritative (window,
  // capability and role checks) — this action only translates its verdicts
  // into user-readable messages.
  join: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const formData = await event.request.formData()
    const hackathonId = String(formData.get("hackathonId") ?? "")
    if (!hackathonId) return fail(400, { message: "Missing hackathon id." })

    try {
      await hackathon.join({ hackathonId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION)
        return fail(409, { message: "Registration is not open for this hackathon." })
      if (e instanceof ClientError && e.code === Status.ALREADY_EXISTS)
        return fail(409, { message: "You have already joined this hackathon." })
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
        return fail(403, { message: "You are not allowed to join this hackathon." })
      if (e instanceof ClientError && e.code === Status.NOT_FOUND)
        return fail(404, { message: "This hackathon no longer exists." })
      throw e
    }
    return { joined: hackathonId }
  },
}
