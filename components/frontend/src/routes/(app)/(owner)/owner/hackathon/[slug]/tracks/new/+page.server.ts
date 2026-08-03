import type { Actions } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const actions: Actions = {
  create: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = form.get("name")
    const description = form.get("description")

    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }
    if (typeof description !== "string" || description.trim().length < 3) {
      return fail(400, { message: "Description must be at least 3 characters" })
    }

    try {
      await track.create({
        hackathonId: event.params.slug,
        name,
        description,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to create tracks",
        })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/tracks`)
  },
}
