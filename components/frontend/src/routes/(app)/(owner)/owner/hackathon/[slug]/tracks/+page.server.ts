import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { track } = requireGrpc(event.locals.grpc)

  const result = await track.list({ hackathonId: event.params.slug })

  return { hackathonId: event.params.slug, tracks: result.tracks }
}

export const actions: Actions = {
  delete: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const trackId = form.get("trackId")
    if (typeof trackId !== "string" || trackId === "") {
      return fail(400, { message: "Missing track id" })
    }

    try {
      await track.delete({ trackId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this track" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Track not found" })
      }
      throw e
    }

    return { success: true }
  },
}
