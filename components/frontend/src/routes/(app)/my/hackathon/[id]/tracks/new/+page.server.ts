import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageTracks } from "$lib/server/hackathon/capabilities"
import { resolve } from "$app/paths"
import { error, fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManageTracks(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can add tracks")
  }

  return { hackathonId: hackathon.id }
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
      await track.create({
        hackathonId: event.params.id,
        name: name.trim(),
        description: description.trim(),
      })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to add tracks here",
        })
      }
      throw e
    }

    redirect(303, resolve(`/my/hackathon/${event.params.id}/tracks`))
  },
}
