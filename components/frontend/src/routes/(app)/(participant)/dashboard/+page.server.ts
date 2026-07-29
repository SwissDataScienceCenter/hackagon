import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const participantId = event.locals.platformUser!.id

  const [allResult, myResult] = await Promise.all([
    hackathon.list({ visibilityFilter: Visibility.VISIBILITY_PUBLIC }),
    hackathon.list({ participantId }),
  ])

  const myIds = new Set(myResult.hackathons.map((h) => h.id))

  return {
    session: event.locals.session,
    myHackathons: myResult.hackathons,
    otherHackathons: allResult.hackathons.filter((h) => !myIds.has(h.id)),
    isGlobalAdmin:
      event.locals.platformUser?.roles.includes(GlobalRole.GLOBAL_ROLE_ADMIN) ??
      false,
  }
}

export const actions: Actions = {
  join: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const hackathonId = (await event.request.formData()).get("hackathonId")

    if (typeof hackathonId !== "string" || hackathonId === "") {
      return fail(400, { message: "Missing hackathon id" })
    }

    try {
      await hackathon.join({ hackathonId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Hackathon not found" })
      }
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
        return fail(400, { message: "This hackathon has already finished" })
      }
      throw e
    }
  },
}
