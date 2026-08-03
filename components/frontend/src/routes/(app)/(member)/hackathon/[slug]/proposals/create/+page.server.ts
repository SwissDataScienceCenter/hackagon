import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  return {
    slug: event.params.slug,
    // Descriptions come along so the track picker can explain each track in its
    // dialog — participants no longer have a Tracks page to read them on.
    tracks: hackathon.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
    })),
  }
}

export const actions: Actions = {
  propose: async (event) => {
    const { project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const title = form.get("title")
    const description = form.get("description")
    const trackId = form.get("trackId")

    if (typeof title !== "string" || title.trim() === "") {
      return fail(400, { message: "Title is required" })
    }
    if (typeof description !== "string" || description.trim() === "") {
      return fail(400, { message: "Description is required" })
    }

    let projectId: string
    try {
      const result = await project.propose({
        hackathonId: event.params.slug,
        title,
        description,
        trackId:
          typeof trackId === "string" && trackId !== "" ? trackId : undefined,
      })
      projectId = result.projectId
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to propose a project",
        })
      }
      throw e
    }

    redirect(303, `/hackathon/${event.params.slug}/proposals/${projectId}`)
  },
}
