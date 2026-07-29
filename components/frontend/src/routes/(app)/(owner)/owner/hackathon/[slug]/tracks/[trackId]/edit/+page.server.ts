import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { track } = requireGrpc(event.locals.grpc)

  let result
  try {
    result = await track.get({ trackId: event.params.trackId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Track not found")
    }
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to edit this track")
    }
    throw e
  }

  if (!result.track) {
    error(404, "Track not found")
  }

  return { track: result.track }
}

export const actions: Actions = {
  edit: async (event) => {
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
      await track.edit({
        trackId: event.params.trackId,
        name,
        description,
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to edit this track" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Track not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/tracks`)
  },

  delete: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)

    try {
      await track.delete({ trackId: event.params.trackId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, { message: "You don't have permission to delete this track" })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Track not found" })
      }
      throw e
    }

    redirect(303, `/owner/hackathon/${event.params.slug}/tracks`)
  },
}
