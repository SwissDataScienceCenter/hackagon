import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)
  const { myHackathons } = await event.parent()

  const allResult = await hackathon.list({
    visibilityFilter: Visibility.VISIBILITY_PUBLIC,
  })

  const myIds = new Set(myHackathons.map((h) => h.id))

  return {
    otherHackathons: allResult.hackathons.filter((h) => !myIds.has(h.id)),
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
      // FAILED_PRECONDITION covers more than one refusal now — the hackathon
      // having finished, and registration being closed — and the backend already
      // phrases each for members. Reporting its message beats guessing, which
      // used to tell people a live hackathon had "already finished".
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
        return fail(400, {
          message: e.details || "You can't join this hackathon right now",
        })
      }
      throw e
    }
  },
}
