import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageTracks } from "$lib/server/hackathon/capabilities"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { track } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageTracks(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can edit tracks")
  }

  // Fetched rather than picked out of the layout's `hackathon.get`, even
  // though that response nests the tracks: after a save this page reloads,
  // and the layout's copy can still be the pre-edit tree. Asking
  // TrackService means the form always shows what was actually stored.
  let result
  try {
    result = await track.get({ trackId: event.params.trackId })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "This track is not available")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Track not found")
    }
    throw e
  }

  if (!result.track) {
    error(404, "Track not found")
  }

  // A track id from another hackathon would otherwise render inside this
  // hackathon's shell, under its nav and header — and `Edit` would then
  // happily write to it, since it takes the hackathon from the track rather
  // than the URL.
  if (result.track.hackathonId !== event.params.id) {
    error(404, "Track not found")
  }

  return {
    hackathonId: hackathon.id,
    track: {
      id: result.track.id,
      name: result.track.name,
      description: result.track.description,
    },
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const name = form.get("name")
    const description = form.get("description")

    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Name must be at least 3 characters" })
    }
    if (typeof description !== "string" || description.trim().length < 3) {
      return fail(400, {
        message: "Description must be at least 3 characters",
      })
    }

    try {
      await track.edit({
        trackId: event.params.trackId,
        name: name.trim(),
        description: description.trim(),
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to edit this track",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Track not found" })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/tracks`))
  },

  delete: async (event) => {
    const { track } = requireGrpc(event.locals.grpc)

    try {
      await track.delete({ trackId: event.params.trackId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to delete this track",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Track not found" })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/tracks`))
  },
}
