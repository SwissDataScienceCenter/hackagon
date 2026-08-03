import type { Actions } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

async function readUserId(request: Request): Promise<string | undefined> {
  const form = await request.formData()
  const userId = form.get("userId")
  return typeof userId === "string" && userId !== "" ? userId : undefined
}

export const actions: Actions = {
  approve: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const userId = await readUserId(event.request)
    if (!userId) return fail(400, { message: "Missing user id" })

    try {
      await hackathon.approveParticipant({
        hackathonId: event.params.slug,
        userId,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to approve participants",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Participant not found" })
      }
      throw e
    }
  },

  remove: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const userId = await readUserId(event.request)
    if (!userId) return fail(400, { message: "Missing user id" })

    try {
      await hackathon.removeParticipant({
        hackathonId: event.params.slug,
        userId,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to remove participants",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Participant not found" })
      }
      throw e
    }
  },
}
