import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { team } = requireGrpc(event.locals.grpc)

  let result
  try {
    result = await team.get({ teamId: event.params.teamId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Team not found")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to edit this team")
    }
    throw e
  }

  if (!result.team) {
    error(404, "Team not found")
  }

  return { team: result.team }
}

export const actions: Actions = {
  edit: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = form.get("name")
    const description = form.get("description")

    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }
    if (typeof description !== "string") {
      return fail(400, { message: "Invalid description" })
    }

    try {
      await team.edit({
        id: event.params.teamId,
        name,
        description,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to edit this team" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/teams`)
  },

  delete: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)

    try {
      await team.delete({ id: event.params.teamId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this team" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/teams`)
  },
}
